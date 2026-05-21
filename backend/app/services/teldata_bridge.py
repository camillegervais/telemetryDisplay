"""TelData COM bridge — wraps TelDataX4.TelRun3 via win32com.

Each API call re-opens the archive so COM objects never cross thread boundaries.
Session state (archive path + flat run list as plain data) lives in a simple dict.
"""

import re
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import numpy as np

# win32com is only available on Windows with TelDataX4 installed.
# Import errors surface at call time, not at module import, so the backend
# can still start on machines without the COM server.

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
    label: str
    driver_name: str = ""
    lap_time_ms: Optional[int] = None


@dataclass
class _SessionData:
    archive_path: str
    runs: List[RunInfo] = field(default_factory=list)


# ---------------------------------------------------------------------------
# In-memory session store
# ---------------------------------------------------------------------------

_sessions: Dict[str, _SessionData] = {}


# ---------------------------------------------------------------------------
# COM helpers
# ---------------------------------------------------------------------------

def _require_com() -> None:
    if not _COM_AVAILABLE:
        raise RuntimeError("win32com is not available — TelData import requires Windows + TelDataX4.")


def _get_run_label(run) -> str:  # type: ignore[type-arg]
    local_prop = 1
    prop_count = run.GetPropertyCount(local_prop)
    for p in range(prop_count):
        name = run.GetPropertyName(p)
        if re.search(r"name|description|label|title", name, re.IGNORECASE):
            val = run.GetPropertyData(p)
            if val:
                return str(val)
    return "(no name)"


def _get_lap_label(lap) -> str:  # type: ignore[type-arg]
    local_prop = 1
    parts: List[str] = []
    prop_count = lap.GetPropertyCount(local_prop)
    for p in range(prop_count):
        pname = lap.GetPropertyName(p)
        if re.search(r"name|lap|time|number", pname, re.IGNORECASE):
            parts.append(f"{pname}={lap.GetPropertyData(p)}")
    return "  ".join(parts) if parts else "(no info)"


def _get_lap_info(lap) -> Tuple[str, Optional[int]]:
    """Extract driver name and lap time (ms) from a lap COM object.

    Returns (driver_name, lap_time_ms). Either may be empty/None if the
    corresponding properties are absent.
    """
    local_prop = 1
    driver_name = ""
    lap_time_ms: Optional[int] = None
    prop_count = lap.GetPropertyCount(local_prop)
    for p in range(prop_count):
        pname = lap.GetPropertyName(p)
        pval = lap.GetPropertyData(p)
        if not driver_name and re.search(r"driver|pilot", pname, re.IGNORECASE):
            driver_name = str(pval) if pval else ""
        if lap_time_ms is None and re.search(r"laptime|lap.*time", pname, re.IGNORECASE):
            try:
                lap_time_ms = int(pval)
            except (TypeError, ValueError):
                pass
    # Fallback: accept any property with bare "time" if still nothing found
    if lap_time_ms is None:
        for p in range(prop_count):
            pname = lap.GetPropertyName(p)
            if re.search(r"\btime\b", pname, re.IGNORECASE):
                try:
                    lap_time_ms = int(lap.GetPropertyData(p))
                    break
                except (TypeError, ValueError):
                    pass
    return driver_name, lap_time_ms


def _collect_runs(run, flat_list: List[RunInfo], level: int = 0) -> None:
    """Recursively append child RunInfo entries (no COM refs stored)."""
    run_count = run.GetRunCount()
    for r in range(run_count):
        child = run.GetRun(r)
        child = win32com.client.Dispatch(child.QueryInterface(pythoncom.IID_IDispatch))
        label = _get_run_label(child)
        try:
            lap_count = child.GetLapCount()
        except Exception:
            lap_count = 0
        idx = len(flat_list)
        flat_list.append(RunInfo(id=idx, label=label, level=level, lap_count=lap_count))
        _collect_runs(child, flat_list, level + 1)


def _navigate_to_run(main_obj, target_run_id: int):  # type: ignore[return]
    """Re-traverse the run tree to reach child run at index *target_run_id*."""
    counter = [0]

    def _recurse(run):
        run_count = run.GetRunCount()
        for r in range(run_count):
            child = run.GetRun(r)
            child = win32com.client.Dispatch(child.QueryInterface(pythoncom.IID_IDispatch))
            if counter[0] == target_run_id:
                return child
            counter[0] += 1
            found = _recurse(child)
            if found is not None:
                return found
        return None

    return _recurse(main_obj)


def _name_to_mat_var(name: str) -> str:
    """Convert an arbitrary channel name to a valid MATLAB variable name."""
    safe = re.sub(r"[^A-Za-z0-9_]", "_", name)
    if safe and safe[0].isdigit():
        safe = "ch_" + safe
    return safe[:63]


def _open_archive(archive_path: str):  # type: ignore[return]
    main_obj = win32com.client.Dispatch("TelDataX4.TelRun3")
    result = main_obj.Open2(archive_path, 0)
    if result != 0:
        raise RuntimeError(f"Cannot open archive (error {result}): {archive_path}")
    return main_obj


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def open_session(archive_path: str) -> Tuple[str, List[RunInfo]]:
    """Open the archive, collect the run tree, cache as session, return session_id + runs."""
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
    """Re-open archive, navigate to run, return its laps as plain data."""
    _require_com()
    session = _sessions.get(session_id)
    if session is None:
        raise KeyError(f"Session not found: {session_id}")

    pythoncom.CoInitialize()
    try:
        main_obj = _open_archive(session.archive_path)
        run = _navigate_to_run(main_obj, run_id)
        if run is None:
            raise ValueError(f"Run id {run_id} not found in archive")

        lap_count = run.GetLapCount()
        laps: List[LapInfo] = []
        for l in range(lap_count):
            lap = run.GetLap(l)
            lap = win32com.client.Dispatch(lap.QueryInterface(pythoncom.IID_IDispatch))
            driver_name, lap_time_ms = _get_lap_info(lap)
            laps.append(LapInfo(
                id=l,
                label=_get_lap_label(lap),
                driver_name=driver_name,
                lap_time_ms=lap_time_ms,
            ))
        return laps
    finally:
        pythoncom.CoUninitialize()


def get_channels(session_id: str, run_id: int, lap_id: int) -> List[str]:
    """Return available channel names (original casing) for the specified run/lap."""
    _require_com()
    session = _sessions.get(session_id)
    if session is None:
        raise KeyError(f"Session not found: {session_id}")

    pythoncom.CoInitialize()
    try:
        main_obj = _open_archive(session.archive_path)
        run = _navigate_to_run(main_obj, run_id)
        if run is None:
            raise ValueError(f"Run id {run_id} not found in archive")

        lap_count = run.GetLapCount()
        if lap_id < 0 or lap_id >= lap_count:
            raise ValueError(f"Lap id {lap_id} out of range [0, {lap_count - 1}]")

        lap = run.GetLap(lap_id)
        lap = win32com.client.Dispatch(lap.QueryInterface(pythoncom.IID_IDispatch))

        chan_count = lap.GetChanCount()
        channels: List[str] = []
        for c in range(chan_count):
            chan = lap.GetChan(c)
            chan = win32com.client.Dispatch(chan.QueryInterface(pythoncom.IID_IDispatch))
            # prefer .Name property when available
            try:
                name = getattr(chan, "Name", None)
            except Exception:
                name = None
            if not name:
                # fallback to reading a property if Name missing
                try:
                    name = chan.GetPropertyName(0)
                except Exception:
                    name = f"chan_{c}"
            channels.append(str(name))

        return channels
    finally:
        pythoncom.CoUninitialize()


def export_lap(
    session_id: str,
    run_id: int,
    lap_id: int,
    channels: List[str],
    target_frequency_hz: float,
    output_dir: Path,
) -> Path:
    """
    Read requested channels from the given run/lap, resample to a uniform time
    axis, and write a .mat file that MatLoader can ingest directly.

    .mat layout
    -----------
    sLap             : 1-D float64 — time vector in seconds (used as lap_distance
                       by MatLoader; has_time_axis will be True)
    sample_rate_hz   : scalar — detected by MatLoader._detect_sample_rate_hz
    <channel_name>   : 1-D float64 for every requested channel
    """
    _require_com()
    session = _sessions.get(session_id)
    if session is None:
        raise KeyError(f"Session not found: {session_id}")

    pythoncom.CoInitialize()
    try:
        from scipy.interpolate import interp1d
        from scipy.io import savemat

        main_obj = _open_archive(session.archive_path)
        run = _navigate_to_run(main_obj, run_id)
        if run is None:
            raise ValueError(f"Run id {run_id} not found")

        lap_count = run.GetLapCount()
        if lap_id < 0 or lap_id >= lap_count:
            raise ValueError(f"Lap id {lap_id} out of range [0, {lap_count - 1}]")

        lap = run.GetLap(lap_id)
        lap = win32com.client.Dispatch(lap.QueryInterface(pythoncom.IID_IDispatch))

        # Build name → COM object map (case-insensitive lookup)
        chan_count = lap.GetChanCount()
        chan_map: Dict[str, object] = {}
        for c in range(chan_count):
            chan = lap.GetChan(c)
            chan = win32com.client.Dispatch(chan.QueryInterface(pythoncom.IID_IDispatch))
            chan_map[chan.Name.lower()] = chan

        # Read requested channels
        channel_data: List[Tuple[str, np.ndarray, np.ndarray]] = []
        not_found: List[str] = []

        for ch_name in channels:
            matched_key = ch_name.lower()
            if matched_key not in chan_map:
                not_found.append(ch_name)
                continue
            chan = chan_map[matched_key]
            sample_count = chan.SampleCount
            sample_rate = int(chan.SampleRate)
            buffer = win32com.client.VARIANT(
                pythoncom.VT_ARRAY | pythoncom.VT_R8,
                [0.0] * sample_count,
            )
            data = chan.GetValues(0, buffer, sample_count, sample_count)
            values = np.array(data[0], dtype=np.float64)
            t_orig = np.arange(len(values)) / sample_rate
            channel_data.append((ch_name, t_orig, values))

        if not channel_data:
            raise ValueError(f"No valid channels found. Missing: {not_found}")

        # Build common time axis
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
        filename = f"teldata_{session_id[:8]}_{run_id}_{lap_id}.mat"
        mat_path = output_dir / filename
        savemat(str(mat_path), mat_data)
        return mat_path

    finally:
        pythoncom.CoUninitialize()


def close_session(session_id: str) -> None:
    _sessions.pop(session_id, None)
