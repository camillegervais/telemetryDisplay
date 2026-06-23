"""TelData COM bridge — wraps TelDataX4.TelRun3 / TelRun5 via win32com.

Each API call re-opens the archive so COM objects never cross thread boundaries.
Session state (archive path + flat run list as plain data) lives in a simple dict.
"""

import datetime
import re
import tempfile
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import numpy as np
import logging

import pythoncom
import win32com.client
_COM_AVAILABLE = True


# ---------------------------------------------------------------------------
# Plain-data structs (no COM references)
# ---------------------------------------------------------------------------

@dataclass
class RunInfo:
    id: int
    label: str
    level: int
    lap_count: int = 0


@dataclass
class LapInfo:
    id: int
    label: str           # Le label contiendra le nom du driver par défaut
    driver_name: str = ""
    lap_time_ms: Optional[int] = None
    run_id: int = 0
    track_name: str = ""
    session_name: str = ""


@dataclass
class _SessionData:
    archive_path: str
    runs: List[RunInfo] = field(default_factory=list)


# ---------------------------------------------------------------------------
# In-memory session store
# ---------------------------------------------------------------------------

_sessions: Dict[str, _SessionData] = {}


# ---------------------------------------------------------------------------
# COM helpers (inspirés du script MATLAB get_data_Wintax_TelDataX_Lap.m)
# ---------------------------------------------------------------------------

def _require_com() -> None:
    if not _COM_AVAILABLE:
        raise RuntimeError("win32com is not available — TelData import requires Windows + TelDataX4.")


def _get_property_safe(obj, prop_type: str, prop_name: str) -> Optional[str]:
    """Récupère proprement une propriété d'un objet COM (Lap ou Run)
    en gérant les différentes versions d'API de TelData (PropertyIndex vs GetPropertyIndex).
    """
    try:
        idx = -1
        if hasattr(obj, "PropertyIndex"):
            idx = obj.PropertyIndex(prop_type, prop_name)
        elif hasattr(obj, "GetPropertyIndex"):
            idx = obj.GetPropertyIndex(prop_type, prop_name)
            
        if idx >= 0:
            if hasattr(obj, "PropertyData"):
                return obj.PropertyData(idx)
            elif hasattr(obj, "GetPropertyData"):
                return obj.GetPropertyData(idx)
    except Exception:
        pass
    return None


def _get_run_label(run) -> str:  # type: ignore[type-arg]
    """Extrait proprement le nom de la session ou du run."""
    name = _get_property_safe(run, "Text", "SessionName") or _get_property_safe(run, "Text", "RunName")
    driver_name = _get_property_safe(run, "Text", "DriverName")
    track_name = _get_property_safe(run, "Text", "TrackName")
    if name:
        if driver_name:
            if track_name:
                return str(name) + ' - ' + str(driver_name) + ' - ' + str(track_name)
            return str(name) + ' - ' + str(driver_name)
        return str(name)
    
    # Fallback par balayage de propriétés si la méthode par index échoue
    try:
        prop_count = run.GetPropertyCount(1)  # 1 = Text
        for p in range(prop_count):
            pname = run.GetPropertyName(p)
            if re.search(r"name|description|label|title", pname, re.IGNORECASE):
                val = run.GetPropertyData(p)
                if val:
                    return str(val)
    except Exception:
        pass
    return "(no name)"


def _get_lap_label_fallback(lap) -> str:  # type: ignore[type-arg]
    """Ancienne méthode de construction d'étiquette au cas où aucune info n'est dispo."""
    local_prop = 1
    parts: List[str] = []
    try:
        prop_count = lap.GetPropertyCount(local_prop)
        for p in range(prop_count):
            pname = lap.GetPropertyName(p)
            if re.search(r"name|lap|time|number", pname, re.IGNORECASE):
                parts.append(f"{pname}={lap.GetPropertyData(p)}")
    except Exception:
        pass
    return "  ".join(parts) if parts else "(no info)"


def _get_lap_advanced_info(lap) -> Tuple[str, Optional[int], str, str]:
    """Extrait proprement les métadonnées d'un tour (Driver, Chrono, Circuit, Session)

    en se calquant sur l'utilisation des propriétés du script MATLAB.
    """
    driver_name = str(_get_property_safe(lap, "Text", "DriverName") or "").strip()
    
    # Gestion du chrono (CronoTime en secondes ou millisecondes)
    lap_time_ms = None
    crono_time = _get_property_safe(lap, "Value", "CronoTime")
    if crono_time is not None:
        try:
            val = float(crono_time)
            # Si la valeur brute est petite, c'est probablement des secondes (ex: 92.4 -> 92400 ms)
            lap_time_ms = int(val * 1000) if val < 100000 else int(val)
        except (TypeError, ValueError):
            pass

    # Fallback pour le temps si CronoTime n'est pas renseigné
    if lap_time_ms is None:
        try:
            prop_count = lap.GetPropertyCount(0)  # 0 = Value
            for p in range(prop_count):
                pname = lap.GetPropertyName(p)
                if re.search(r"laptime|crono|time", pname, re.IGNORECASE):
                    val = lap.GetPropertyData(p)
                    lap_time_ms = int(float(val) * 1000) if float(val) < 100000 else int(val)
                    break
        except Exception:
            pass

    track_name = str(_get_property_safe(lap, "Text", "TrackName") or "")
    session_name = str(_get_property_safe(lap, "Text", "SessionName") or "")

    return driver_name, lap_time_ms, track_name, session_name


def _collect_runs(main_obj, flat_list: List[RunInfo]) -> None:
    """Détermine et liste les runs disponibles dans l'archive.
    
    Si des sous-runs existent (GetRunCount), on les parcourt, sinon 
    on crée un run virtuel englobant tous les laps à plat de l'archive (comme MATLAB).
    """
    try:
        run_count = main_obj.GetRunCount()
        if run_count > 0:
            for r in range(run_count):
                child = main_obj.GetRun(r)
                child = win32com.client.Dispatch(child.QueryInterface(pythoncom.IID_IDispatch))
                label = _get_run_label(child)
                try:
                    lap_count = child.GetLapCount()
                except Exception:
                    lap_count = 0
                flat_list.append(RunInfo(id=r, label=label, level=0, lap_count=lap_count))
            return
    except Exception:
        pass

    # Approche à plat similaire au script MATLAB (laps accessibles directement via l'Archive)
    try:
        total_laps = main_obj.GetLapCount(0)
        if total_laps > 0:
            flat_list.append(RunInfo(id=0, label="Main Archive", level=0, lap_count=total_laps))
    except Exception:
        flat_list.append(RunInfo(id=0, label="Default Run", level=0, lap_count=0))


def _navigate_to_run(main_obj, target_run_id: int):
    """Retourne l'objet cible (Run) correspondant à target_run_id."""
    try:
        return win32com.client.Dispatch(main_obj.GetRun(target_run_id).QueryInterface(pythoncom.IID_IDispatch))
    except Exception:
        # Si la navigation par sous-runs échoue, l'archive fait office de container parent
        return main_obj


def _name_to_mat_var(name: str) -> str:
    """Convertit un nom de canal en variable MATLAB valide."""
    safe = re.sub(r"[^A-Za-z0-9_]", "_", name)
    if safe and safe[0].isdigit():
        safe = "ch_" + safe
    return safe[:63]


def _open_archive(archive_path: str):
    """Ouvre l'archive de données avec gestion dynamique des versions du serveur COM."""
    for prog_id in ["TelDataX4.TelRun5", "TelDataX4.TelRun3"]:
        try:
            main_obj = win32com.client.Dispatch(prog_id)
            result = main_obj.Open2(archive_path, 0)
            if result == 0:
                return main_obj
        except Exception:
            continue
            
    # Fallback
    main_obj = win32com.client.Dispatch("TelDataX4.TelRun3")
    result = main_obj.Open2(archive_path, 0)
    if result != 0:
        raise RuntimeError(f"Cannot open archive (error {result}): {archive_path}")
    return main_obj


logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# VCH merging
# ---------------------------------------------------------------------------

def _collect_vch_files(vch_path: str) -> List[Path]:
    p = Path(vch_path)
    if p.is_file() and p.suffix.lower() == ".vch":
        return [p]
    if p.is_dir():
        return sorted(p.glob("*.vch"))
    return []


def _merge_vch(vch_path: str) -> Tuple[Optional[str], Optional[Path]]:
    files = _collect_vch_files(vch_path)
    if not files:
        return None, None

    seen: set = set()
    unique: List[Path] = []
    for f in files:
        key = f.name.lower()
        if key not in seen:
            seen.add(key)
            unique.append(f)

    if len(unique) == 1:
        return str(unique[0]), None

    contents: List[str] = []
    for f in unique:
        try:
            text = f.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        if "</VirtualChannels>" in text:
            contents.append(text)

    if not contents:
        return None, None
    if len(contents) == 1:
        return str(unique[0]), None

    merged = contents[0]
    for extra in contents[1:]:
        m = re.search(r"<VirtualChannels>(.*?)</VirtualChannels>", extra, re.DOTALL)
        if not m:
            continue
        inner = m.group(1)
        idx = merged.rfind("</VirtualChannels>")
        if idx == -1:
            continue
        merged = merged[: max(idx - 2, 0)] + inner + merged[idx:]

    timestamp = datetime.datetime.now().strftime("%y%m%d_%H-%M-%S")
    tmp_dir = Path(tempfile.gettempdir())
    tmp_path = tmp_dir / f"vchMerged_{timestamp}.vch"
    tmp_path.write_text(merged, encoding="utf-8")
    logger.debug("Merged %d VCH files into %s", len(contents), str(tmp_path))
    return str(tmp_path), tmp_path


def _apply_vch(main_obj, vch_path: str) -> Optional[Path]:
    """Applique le fichier de canaux virtuels (.vch) à l'archive COM active."""
    resolved, tmp_file = _merge_vch(vch_path)
    if resolved is None:
        return None
    
    logger.debug("Applying VCH resolved=%s tmp_file=%s", resolved, str(tmp_file) if tmp_file else "None")
    
    # Résolution dynamique des fonctions COM
    idx_fn = getattr(main_obj, "PropertyIndex", getattr(main_obj, "GetPropertyIndex", None))
    data_fn = getattr(main_obj, "SetPropertyData", None)
    
    if idx_fn and data_fn:
        try:
            mat_lib_idx = idx_fn("Text", "MatLibrary1")
            if mat_lib_idx >= 0:
                data_fn(mat_lib_idx, resolved)
                
            status_idx = idx_fn("Value", "TDXGlobalStatus")
            if status_idx >= 0:
                data_fn(status_idx, 1)
        except Exception as e:
            logger.warning(f"Failed to set VCH properties: {e}")
            
    return tmp_file


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def open_session(archive_path: str) -> Tuple[str, List[RunInfo]]:
    """Ouvre l'archive, collecte l'arbre de runs et instancie une session."""
    _require_com()
    pythoncom.CoInitialize()
    try:
        main_obj = _open_archive(archive_path)
        runs: List[RunInfo] = []
        _collect_runs(main_obj, runs)
        session_id = str(uuid.uuid4())
        _sessions[session_id] = _SessionData(archive_path=archive_path, runs=runs)
        return session_id, runs
    finally:
        pythoncom.CoUninitialize()


def get_laps(session_id: str, run_id: int) -> List[LapInfo]:
    """Navigue au run ciblé et extrait la liste des tours (Laps).
    
    Le champ `label` prendra prioritairement le nom du pilote (Driver) identifié.
    """
    _require_com()
    session = _sessions.get(session_id)
    if session is None:
        raise KeyError(f"Session not found: {session_id}")

    pythoncom.CoInitialize()
    try:
        main_obj = _open_archive(session.archive_path)
        container = _navigate_to_run(main_obj, run_id)
        if container is None:
            raise ValueError(f"Run id {run_id} not found in archive")

        # Extraction robuste du nombre de laps
        try:
            lap_count = container.GetLapCount()
        except Exception:
            try:
                lap_count = container.GetLapCount(0)
            except Exception:
                lap_count = 0

        laps: List[LapInfo] = []
        for l in range(lap_count):
            try:
                lap = container.GetLap(l)
                lap = win32com.client.Dispatch(lap.QueryInterface(pythoncom.IID_IDispatch))
                
                # Récupération avancée
                driver_name, lap_time_ms, track, session_name = _get_lap_advanced_info(lap)
                
                # Utilise le Driver en guise de label, avec fallback si vide
                lap_label = driver_name if driver_name else _get_lap_label_fallback(lap)
                
                laps.append(LapInfo(
                    id=l,
                    label=lap_label,
                    driver_name=driver_name,
                    lap_time_ms=lap_time_ms,
                    run_id=run_id,
                    track_name=track,
                    session_name=session_name
                ))
            except Exception as e:
                logger.warning(f"Error reading lap index {l} in run {run_id}: {e}")
                
        return laps
    finally:
        pythoncom.CoUninitialize()


def get_channels(session_id: str, run_id: int, lap_id: int, vch_path: Optional[str] = None) -> List[str]:
    """Retourne la liste des canaux disponibles pour le tour spécifié."""
    _require_com()
    session = _sessions.get(session_id)
    if session is None:
        raise KeyError(f"Session not found: {session_id}")

    pythoncom.CoInitialize()
    tmp_vch: Optional[Path] = None
    try:
        main_obj = _open_archive(session.archive_path)

        if vch_path:
            tmp_vch = _apply_vch(main_obj, vch_path)

        container = _navigate_to_run(main_obj, run_id)
        if container is None:
            raise ValueError(f"Run id {run_id} not found in archive")

        lap = container.GetLap(lap_id)
        lap = win32com.client.Dispatch(lap.QueryInterface(pythoncom.IID_IDispatch))

        chan_count = lap.GetChanCount()
        channels: List[str] = []
        for c in range(chan_count):
            try:
                chan = lap.GetChan(c)
                chan = win32com.client.Dispatch(chan.QueryInterface(pythoncom.IID_IDispatch))
                name = getattr(chan, "Name", None)
                if not name:
                    try:
                        name = chan.GetPropertyName(0)
                    except Exception:
                        name = f"chan_{c}"
                channels.append(str(name))
            except Exception:
                continue

        return channels
    finally:
        if tmp_vch is not None:
            try:
                tmp_vch.unlink(missing_ok=True)
            except OSError:
                pass
        pythoncom.CoUninitialize()


def export_lap(
    session_id: str,
    run_id: int,
    lap_id: int,
    channels: List[str],
    target_frequency_hz: float,
    output_dir: Path,
    vch_path: Optional[str] = None,
) -> Path:
    """Resample les canaux demandés sur un axe temporel commun et exporte en .mat."""
    _require_com()
    session = _sessions.get(session_id)
    if session is None:
        raise KeyError(f"Session not found: {session_id}")

    pythoncom.CoInitialize()
    tmp_vch: Optional[Path] = None
    try:
        from scipy.interpolate import interp1d
        from scipy.io import savemat

        main_obj = _open_archive(session.archive_path)

        if vch_path:
            tmp_vch = _apply_vch(main_obj, vch_path)

        container = _navigate_to_run(main_obj, run_id)
        if container is None:
            raise ValueError(f"Run id {run_id} not found")

        lap = container.GetLap(lap_id)
        lap = win32com.client.Dispatch(lap.QueryInterface(pythoncom.IID_IDispatch))

        # Récupération du nom du circuit et formatage d'un nom de fichier propre
        _, _, track_name, _ = _get_lap_advanced_info(lap)
        safe_track = re.sub(r"[^A-Za-z0-9_\-]", "_", track_name).strip("_")
        if not safe_track:
            safe_track = "unknown_track"

        chan_count = lap.GetChanCount()
        chan_map: Dict[str, object] = {}

        def _chan_has_valid_samples(ch) -> bool:
            try:
                sc = int(getattr(ch, "SampleCount", 0))
                sr = int(getattr(ch, "SampleRate", 0))
                return sc > 0 and sr > 0
            except Exception:
                return False

        for c in range(chan_count):
            try:
                chan = lap.GetChan(c)
                chan = win32com.client.Dispatch(chan.QueryInterface(pythoncom.IID_IDispatch))
                name = getattr(chan, "Name", None)
                if not name:
                    try:
                        name = chan.GetPropertyName(0)
                    except Exception:
                        name = f"chan_{c}"
                key = str(name).lower()
                if key in chan_map:
                    existing = chan_map[key]
                    if _chan_has_valid_samples(existing):
                        pass
                    elif _chan_has_valid_samples(chan):
                        chan_map[key] = chan
                else:
                    chan_map[key] = chan
            except Exception:
                continue

        channel_data: List[Tuple[str, np.ndarray, np.ndarray]] = []
        for ch_name in channels:
            matched_key = ch_name.lower()
            if matched_key not in chan_map:
                continue
            chan = chan_map[matched_key]
            try:
                sample_count = int(getattr(chan, "SampleCount", 0))
                sample_rate = int(getattr(chan, "SampleRate", 0))
                if sample_count <= 0 or sample_rate <= 0:
                    continue

                buffer = win32com.client.VARIANT(
                    pythoncom.VT_ARRAY | pythoncom.VT_R8,
                    [0.0] * sample_count,
                )
                data = chan.GetValues(0, buffer, sample_count, sample_count)
                raw_values = data[0] if isinstance(data, (list, tuple)) and len(data) > 0 else data
                values = np.array(raw_values, dtype=np.float64)
                t_orig = np.arange(len(values)) / sample_rate
                channel_data.append((ch_name, t_orig, values))
            except Exception:
                continue

        if not channel_data:
            raise ValueError("No valid channels could be read from the COM server.")

        max_duration = max(t[-1] for _, t, _ in channel_data if len(t) > 0)
        n_samples = int(np.ceil(max_duration * target_frequency_hz)) + 1
        t_common = np.linspace(0.0, max_duration, n_samples)

        mat_data: Dict[str, object] = {
            "sLap": t_common,
            "sample_rate_hz": np.array([target_frequency_hz]),
        }

        name_collision_count: Dict[str, int] = {}
        for ch_name, t_orig, values in channel_data:
            if len(t_orig) > 1:
                f_interp = interp1d(
                    t_orig, values,
                    kind="linear",
                    bounds_error=False,
                    fill_value=(values[0], values[-1]),
                )
                resampled = f_interp(t_common)
            else:
                resampled = np.full(len(t_common), values[0] if len(values) > 0 else 0.0)

            var = _name_to_mat_var(ch_name)
            if var in name_collision_count:
                name_collision_count[var] += 1
                var = f"{var}_{name_collision_count[var]}"
            else:
                name_collision_count[var] = 0

            mat_data[var] = resampled

        output_dir.mkdir(parents=True, exist_ok=True)
        filename = f"teldata_{safe_track}_{session_id[:8]}_{run_id}_{lap_id}.mat"
        mat_path = output_dir / filename
        savemat(str(mat_path), mat_data)
        return mat_path

    finally:
        if tmp_vch is not None:
            try:
                tmp_vch.unlink(missing_ok=True)
            except OSError:
                pass
        pythoncom.CoUninitialize()


def close_session(session_id: str) -> None:
    _sessions.pop(session_id, None)