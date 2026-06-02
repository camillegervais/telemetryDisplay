"""TelData COM bridge — STUB VERSION (pywin32 removed).

This is a stub implementation that returns dummy data instead of connecting to TelDataX4.
The public API remains unchanged for compatibility with the rest of the backend.
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

# Stub: COM is not available (pywin32 removed)
_COM_AVAILABLE = False


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
        # In stub mode, we allow calls but return dummy data
        logging.debug("Note: Running in stub mode (pywin32 removed) — returning dummy data instead of TelData")


def _get_run_label(run) -> str:  # type: ignore[type-arg]
    """Stub: Return a dummy run label."""
    return "(stub run)"


def _get_lap_label(lap) -> str:  # type: ignore[type-arg]
    """Stub: Return a dummy lap label."""
    return "Lap (stub)"


def _get_lap_info(lap) -> Tuple[str, Optional[int]]:
    """Stub: Return dummy driver name and lap time."""
    return "Stub Driver", 120000


def _collect_runs(run, flat_list: List[RunInfo], level: int = 0) -> None:
    """Stub: Return a few dummy runs."""
    if level == 0:
        # Only populate at root level (avoid deep recursion)
        flat_list.append(RunInfo(id=0, label="Run 1 (stub)", level=0, lap_count=3))
        flat_list.append(RunInfo(id=1, label="Run 2 (stub)", level=0, lap_count=2))


def _navigate_to_run(main_obj, target_run_id: int):  # type: ignore[return]
    """Stub: Return a dummy run object."""
    return {"id": target_run_id}  # type: ignore[return-value]


def _name_to_mat_var(name: str) -> str:
    """Convert an arbitrary channel name to a valid MATLAB variable name."""
    safe = re.sub(r"[^A-Za-z0-9_]", "_", name)
    if safe and safe[0].isdigit():
        safe = "ch_" + safe
    return safe[:63]


def _open_archive(archive_path: str):  # type: ignore[return]
    """Stub: Return a dummy archive object."""
    logging.debug("Stub: open_archive called with %s", archive_path)
    return {"archive_path": archive_path}  # type: ignore[return-value]


logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# VCH merging (mirrors codVCHMerger.m logic)
# ---------------------------------------------------------------------------

def _collect_vch_files(vch_path: str) -> List[Path]:
    """Return all .vch files reachable from *vch_path* (file or folder)."""
    p = Path(vch_path)
    if p.is_file() and p.suffix.lower() == ".vch":
        return [p]
    if p.is_dir():
        return sorted(p.glob("*.vch"))
    return []


def _merge_vch(vch_path: str) -> Tuple[Optional[str], Optional[Path]]:
    """Collect, deduplicate and merge .vch files from *vch_path*.

    Returns ``(resolved_path, temp_file)`` where:
    - *resolved_path*: path to pass to COM ``MatLibrary1`` (str).
    - *temp_file*: ``Path`` of the temp merged file to delete after use,
      or ``None`` if no temp file was created (single .vch used as-is).

    Returns ``(None, None)`` if no .vch files are found.
    """
    files = _collect_vch_files(vch_path)
    if not files:
        return None, None

    # --- Deduplicate by filename (case-insensitive, keep first) ---
    seen: set = set()
    unique: List[Path] = []
    for f in files:
        key = f.name.lower()
        if key not in seen:
            seen.add(key)
            unique.append(f)

    # --- Single file: use directly, no temp file needed ---
    if len(unique) == 1:
        return str(unique[0]), None

    # --- Read files; skip those without a <VirtualChannels> section ---
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
        # Only one valid file after filtering
        return str(unique[0]), None

    # --- Merge: inject subsequent files' <VirtualChannels> blocks into the first ---
    # Mirrors the MATLAB logic:
    #   vchMerged = [vchMerged(1:NVirtualChannelsIdx-2)       <-- up to 2 chars before </VirtualChannels>
    #                extractBetween(next, '<VirtualChannels>', '</VirtualChannels>')  <-- inner block
    #                vchMerged(NVirtualChannelsIdx:end)]       <-- from </VirtualChannels> onwards
    merged = contents[0]
    for extra in contents[1:]:
        m = re.search(r"<VirtualChannels>(.*?)</VirtualChannels>", extra, re.DOTALL)
        if not m:
            continue
        inner = m.group(1)
        idx = merged.rfind("</VirtualChannels>")
        if idx == -1:
            continue
        # Strip the \r\n (or \n) before </VirtualChannels> to avoid double blank line
        merged = merged[: max(idx - 2, 0)] + inner + merged[idx:]

    # --- Write to temp file ---
    timestamp = datetime.datetime.now().strftime("%y%m%d_%H-%M-%S")
    tmp_dir = Path(tempfile.gettempdir())
    tmp_path = tmp_dir / f"vchMerged_{timestamp}.vch"
    tmp_path.write_text(merged, encoding="utf-8")
    logger.debug("Merged %d VCH files into %s", len(contents), str(tmp_path))
    return str(tmp_path), tmp_path


def _apply_vch(main_obj, vch_path: str) -> Optional[Path]:
    """Stub: Pretend to apply VCH file."""
    logging.debug("Stub: _apply_vch called with vch_path=%s", vch_path)
    return None


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def open_session(archive_path: str) -> Tuple[str, List[RunInfo]]:
    """Stub: Open a session and return dummy runs."""
    _require_com()
    # Generate dummy runs
    runs = [
        RunInfo(id=0, label="Run 1 (stub)", level=0, lap_count=3),
        RunInfo(id=1, label="Run 2 (stub)", level=0, lap_count=2),
    ]
    session_id = str(uuid.uuid4())
    _sessions[session_id] = _SessionData(archive_path=archive_path, runs=runs)
    logging.info("Stub: Opened session %s for archive %s with %d dummy runs", session_id[:8], archive_path, len(runs))
    return session_id, runs


def get_laps(session_id: str, run_id: int) -> List[LapInfo]:
    """Stub: Return dummy laps."""
    _require_com()
    session = _sessions.get(session_id)
    if session is None:
        raise KeyError(f"Session not found: {session_id}")
    
    # Return dummy laps
    laps = [
        LapInfo(id=0, label=f"Lap 1 (stub)", driver_name="Driver A", lap_time_ms=120000),
        LapInfo(id=1, label=f"Lap 2 (stub)", driver_name="Driver A", lap_time_ms=121000),
        LapInfo(id=2, label=f"Lap 3 (stub)", driver_name="Driver B", lap_time_ms=119000),
    ]
    logging.debug("Stub: get_laps(session_id=%s, run_id=%d) returning %d dummy laps", session_id[:8], run_id, len(laps))
    return laps


def get_channels(session_id: str, run_id: int, lap_id: int, vch_path: Optional[str] = None) -> List[str]:
    """Stub: Return dummy channel names."""
    _require_com()
    session = _sessions.get(session_id)
    if session is None:
        raise KeyError(f"Session not found: {session_id}")

    # Return dummy channels
    channels = [
        "Speed",
        "Throttle",
        "Brake",
        "Steering",
        "RPM",
        "Gear",
        "Lap Distance",
    ]
    logging.debug("Stub: get_channels returning %d dummy channel names", len(channels))
    return channels


def export_lap(
    session_id: str,
    run_id: int,
    lap_id: int,
    channels: List[str],
    target_frequency_hz: float,
    output_dir: Path,
    vch_path: Optional[str] = None,
) -> Path:
    """
    Stub version: Generate dummy .mat file with synthetic data.
    
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

    from scipy.io import savemat

    # Generate dummy data
    lap_duration_sec = 120.0  # 2-minute lap
    n_samples = int(np.ceil(lap_duration_sec * target_frequency_hz)) + 1
    t_common = np.linspace(0.0, lap_duration_sec, n_samples)

    mat_data: Dict[str, object] = {
        "sLap": t_common,
        "sample_rate_hz": np.array([target_frequency_hz]),
    }

    # Generate dummy channel data
    for ch_name in channels:
        var = _name_to_mat_var(ch_name)
        # Generate synthetic signal (sine wave + noise)
        freq = 0.1  # Low frequency
        synthetic = 50.0 + 20.0 * np.sin(2 * np.pi * freq * t_common)
        synthetic += np.random.normal(0, 2, len(t_common))
        mat_data[var] = synthetic

    output_dir.mkdir(parents=True, exist_ok=True)
    filename = f"teldata_{session_id[:8]}_{run_id}_{lap_id}.mat"
    mat_path = output_dir / filename
    savemat(str(mat_path), mat_data)
    logging.info("Stub: export_lap created dummy .mat file: %s", mat_path)
    return mat_path


def close_session(session_id: str) -> None:
    _sessions.pop(session_id, None)
