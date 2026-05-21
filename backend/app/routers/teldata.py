"""TelData COM import endpoints.

Exposes a stateless-ish session API:
  POST   /api/teldata/open                  → open archive, list runs
  POST   /api/teldata/{session_id}/laps     → list laps for a run
  POST   /api/teldata/{session_id}/export   → resample + write .mat → return path
  DELETE /api/teldata/{session_id}          → release session
"""

from pathlib import Path

from fastapi import APIRouter, HTTPException

from app.schemas import (
    TelDataExportRequest,
    TelDataExportResponse,
    TelDataLapInfo,
    TelDataLapsRequest,
    TelDataLapsResponse,
    TelDataOpenRequest,
    TelDataOpenResponse,
    TelDataRunInfo,
    TelDataChannelsRequest,
    TelDataChannelsResponse,
)
from app.services import teldata_bridge

router = APIRouter(prefix="/api/teldata", tags=["teldata"])

# .mat files land in the existing import cache directory
_IMPORT_CACHE = Path(__file__).resolve().parents[3] / "data" / "import_cache"


@router.post("/open", response_model=TelDataOpenResponse)
def open_teldata_session(request: TelDataOpenRequest) -> TelDataOpenResponse:
    """Open a TelDataX4 archive and return the flat run tree."""
    try:
        session_id, runs = teldata_bridge.open_session(request.archive_path)
        return TelDataOpenResponse(
            session_id=session_id,
            runs=[TelDataRunInfo(id=r.id, label=r.label, level=r.level, lap_count=r.lap_count) for r in runs],
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to open archive: {exc}") from exc


@router.post("/{session_id}/laps", response_model=TelDataLapsResponse)
def get_laps(session_id: str, request: TelDataLapsRequest) -> TelDataLapsResponse:
    """Return the laps available in a given run."""
    try:
        laps = teldata_bridge.get_laps(session_id, request.run_id)
        return TelDataLapsResponse(
            laps=[TelDataLapInfo(id=lap.id, label=lap.label, driver_name=getattr(lap, 'driver_name', ''), lap_time_ms=getattr(lap, 'lap_time_ms', None)) for lap in laps],
        )
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to get laps: {exc}") from exc


@router.post("/{session_id}/channels", response_model=TelDataChannelsResponse)
def get_channels_route(session_id: str, request: TelDataChannelsRequest) -> TelDataChannelsResponse:
    try:
        channels = teldata_bridge.get_channels(session_id, request.run_id, request.lap_id)
        return TelDataChannelsResponse(channels=channels)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to get channels: {exc}") from exc


@router.post("/{session_id}/export", response_model=TelDataExportResponse)
def export_teldata(session_id: str, request: TelDataExportRequest) -> TelDataExportResponse:
    """
    Resample the requested channels to a common time axis and write a .mat file
    to the import cache.  The returned mat_path can be fed directly to
    POST /api/datasets/import-from-path to load the dataset.
    """
    try:
        mat_path = teldata_bridge.export_lap(
            session_id=session_id,
            run_id=request.run_id,
            lap_id=request.lap_id,
            channels=request.channels,
            target_frequency_hz=request.target_frequency_hz,
            output_dir=_IMPORT_CACHE,
        )
        return TelDataExportResponse(mat_path=str(mat_path))
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Export failed: {exc}") from exc


@router.delete("/{session_id}", status_code=204)
def close_teldata_session(session_id: str) -> None:
    """Release the in-memory session (best-effort, never raises)."""
    teldata_bridge.close_session(session_id)
