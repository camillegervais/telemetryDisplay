"""Dataset import, query, and track map endpoints."""

from pathlib import Path
from typing import List, Dict, Optional, Tuple
import uuid

import numpy as np
import pandas as pd
from fastapi import APIRouter, HTTPException, UploadFile

from app.config import config
from app import db
from app.schemas import (
    DatasetImportResponse,
    DatasetImportFromPathRequest,
    DatasetMetadataResponse,
    DatasetQueryRequest,
    DatasetQueryResponse,
    TrackMapResponse,
    MapTuningRequest,
    MapTuningSaveResponse,
    MapTuningCalculateResponse,
    ComputeMathRequest,
    ComputeMathResponse,
    RecentImportItem,
    RecentImportsResponse,
)
from app.services.mat_loader import MatLoader, MatValidationError
from app.services.lut_2D import LUT2D

router = APIRouter(prefix="/api/datasets", tags=["datasets"])

# Global loader instance
mat_loader = MatLoader(reference_step_m=config.reference_distance_step_m)

# Track maps cache (dataset_id -> dataframe)
track_maps: Dict[str, pd.DataFrame] = {}


def _track_csv_path_from_metadata(source_path: str) -> Optional[Path]:
    """
    Resolve track CSV from MAT filename using circuit token matching.

    Priority:
    1) Any CSV stem present in MAT stem (e.g. imola_track in run_imola_track_v2.mat)
    2) Any CSV stem without trailing '_track' present in MAT stem (e.g. imola in run_imola_v2.mat)
    3) Legacy exact fallback: <mat_stem>_track.csv
    """
    source_stem = Path(source_path).stem.lower()
    repo_root = Path(__file__).resolve().parents[3]
    data_dir = repo_root / "data"

    if not data_dir.exists():
        return None

    csv_files = list(data_dir.glob("*.csv"))
    if not csv_files:
        return None

    candidates: List[Tuple[int, Path]] = []
    generic_tokens = {"data", "track", "pilote", "reference", "midline", "result", "import", "cache"}

    for csv_path in csv_files:
        csv_stem = csv_path.stem.lower()
        tokens = {csv_stem}

        if csv_stem.endswith("_track"):
            tokens.add(csv_stem[: -len("_track")])
        if csv_stem.endswith("_data"):
            tokens.add(csv_stem[: -len("_data")])

        for part in csv_stem.split("_"):
            if len(part) >= 3 and part not in generic_tokens:
                tokens.add(part)

        best_token_len = max((len(token) for token in tokens if token and token in source_stem), default=0)
        if best_token_len > 0:
            candidates.append((best_token_len, csv_path))

    if candidates:
        # Prefer the most specific token match (longest circuit key found in filename).
        candidates.sort(key=lambda item: item[0], reverse=True)
        return candidates[0][1]

    legacy_path = data_dir / f"{Path(source_path).stem}_track.csv"
    if legacy_path.exists():
        return legacy_path

    return None


def _load_trackmap_dataframe(source_path: str) -> Optional[pd.DataFrame]:
    csv_path = _track_csv_path_from_metadata(source_path)
    if csv_path is None or not csv_path.exists():
        return None

    df = pd.read_csv(csv_path)
    required = {"lap_distance", "x_position", "y_position"}
    if not required.issubset(df.columns):
        return None

    return df[["lap_distance", "x_position", "y_position"]].dropna()


@router.post("/import", response_model=DatasetImportResponse)
async def import_mat_file(file: UploadFile) -> DatasetImportResponse:
    """
    Import a .mat file, validate, and normalize to reference spatial step.

    Args:
        file: .mat file upload

    Returns:
        Dataset ID and import status
    """
    if not file.filename.endswith(".mat"):
        raise HTTPException(status_code=400, detail="File must be .mat")

    try:
        contents = await file.read()

        repo_root = Path(__file__).resolve().parents[3]
        import_cache_dir = repo_root / "data" / "import_cache"
        import_cache_dir.mkdir(parents=True, exist_ok=True)

        safe_name = Path(file.filename).name
        stable_path = import_cache_dir / f"{uuid.uuid4().hex}_{safe_name}"
        stable_path.write_bytes(contents)

        df_normalized, metadata = mat_loader.load_and_normalize(stable_path)

        try:
            db.add_import(
                source_path=str(stable_path),
                signal_count=len(metadata.signal_names),
                file_size=len(contents),
                dataset_name=Path(file.filename).stem,
                dataset_id=metadata.dataset_id,
            )
        except Exception:
            pass  # DB tracking is best-effort

        return DatasetImportResponse(
            dataset_id=metadata.dataset_id,
            message=f"Dataset imported: {len(df_normalized)} normalized samples,"
            f" Source step {metadata.source_distance_step_m:.2f}m,"
            f" Reference step {metadata.normalized_distance_step_m:.2f}m",
        )

    except MatValidationError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Import failed: {str(e)}")


@router.post("/import-from-path", response_model=DatasetImportResponse)
def import_mat_file_from_path(request: DatasetImportFromPathRequest) -> DatasetImportResponse:
    """
    Import a .mat file directly from a server-local path.

    This endpoint is intended for repeated simulation workflows where the same file
    is updated on disk and reloaded often.
    """
    mat_path = Path(request.mat_path).expanduser().resolve()

    if mat_path.suffix.lower() != ".mat":
        raise HTTPException(status_code=400, detail="File must be .mat")

    if not mat_path.exists() or not mat_path.is_file():
        raise HTTPException(status_code=404, detail="MAT file path not found")

    try:
        df_normalized, metadata = mat_loader.load_and_normalize(mat_path)

        try:
            db.add_import(
                source_path=str(mat_path),
                signal_count=len(metadata.signal_names),
                file_size=mat_path.stat().st_size,
                dataset_name=mat_path.stem,
                dataset_id=metadata.dataset_id,
            )
        except Exception:
            pass  # DB tracking is best-effort

        return DatasetImportResponse(
            dataset_id=metadata.dataset_id,
            message=f"Dataset imported from path: {len(df_normalized)} normalized samples,"
            f" Source step {metadata.source_distance_step_m:.2f}m,"
            f" Reference step {metadata.normalized_distance_step_m:.2f}m",
        )
    except MatValidationError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Import failed: {str(e)}")


@router.get("/recent-imports", response_model=RecentImportsResponse)
def get_recent_imports(limit: int = 10) -> RecentImportsResponse:

    """Return the most recent dataset imports (MAT files and TelData exports)."""
    limit = max(1, min(limit, 50))
    rows = db.get_recent_imports(limit=limit)
    items = [
        RecentImportItem(
            import_id=row["import_id"],
            dataset_id=row.get("dataset_id"),
            source_path=row["source_path"],
            imported_at=row["imported_at"],
            file_size=row.get("file_size"),
            signal_count=row.get("signal_count"),
            dataset_name=row.get("dataset_name"),
        )
        for row in rows
    ]
    return RecentImportsResponse(items=items)


@router.delete("/recent-imports/{import_id}", status_code=204)
def delete_recent_import(import_id: str) -> None:
    """Delete a recent import entry and its cache file."""
    found = db.delete_import(import_id)
    if not found:
        raise HTTPException(status_code=404, detail="Import not found")


@router.get("/{dataset_id}/metadata", response_model=DatasetMetadataResponse)
def get_dataset_metadata(dataset_id: str) -> DatasetMetadataResponse:
    """
    Get metadata about a loaded dataset (no data, just structure).

    Args:
        dataset_id: dataset identifier

    Returns:
        Dataset metadata
    """
    dataset = mat_loader.get_dataset(dataset_id)
    if dataset is None:
        raise HTTPException(status_code=404, detail="Dataset not found")

    _, metadata = dataset
    return DatasetMetadataResponse(
        dataset_id=metadata.dataset_id,
        source_path=metadata.source_path,
        source_distance_step_m=metadata.source_distance_step_m,
        normalized_distance_step_m=metadata.normalized_distance_step_m,
        num_samples=metadata.num_samples,
        lap_distance_min=metadata.lap_distance_range[0],
        lap_distance_max=metadata.lap_distance_range[1],
        signal_names=metadata.signal_names,
        source_sample_rate_hz=metadata.source_sample_rate_hz,
        has_time_axis=metadata.has_time_axis,
        interpolation_method=metadata.interpolation_method,
        enrichment_factor=metadata.enrichment_factor,
    )


@router.post("/{dataset_id}/query", response_model=DatasetQueryResponse)
def query_dataset(dataset_id: str, request: DatasetQueryRequest) -> DatasetQueryResponse:
    """
    Query signal data from a dataset with optional decimation.

    Args:
        dataset_id: dataset identifier
        request: query parameters (signals, distance range, max_points)

    Returns:
        Decimated signal data
    """
    dataset = mat_loader.get_dataset(dataset_id)
    if dataset is None:
        raise HTTPException(status_code=404, detail="Dataset not found")

    df, metadata = dataset

    # Validate signals exist
    missing = set(request.signals) - set(metadata.signal_names)
    if missing:
        raise HTTPException(
            status_code=400, detail=f"Signals not found: {', '.join(missing)}"
        )

    # Slice by distance range
    start_dist = request.start_distance
    end_dist = request.end_distance or metadata.lap_distance_range[1]

    df_slice = df.loc[(df.index >= start_dist) & (df.index <= end_dist)]

    if df_slice.empty:
        raise HTTPException(status_code=400, detail="No data in distance range")

    # Decimate if needed
    decimation_factor = max(1, len(df_slice) // request.max_points)

    if decimation_factor > 1:
        # Average by bins
        df_decimated = df_slice.iloc[::decimation_factor]
    else:
        df_decimated = df_slice

    # Build response
    lap_distance = df_decimated.index.tolist()
    lap_time = df_decimated["__time_s__"].tolist() if "__time_s__" in df_decimated.columns else None
    signals = {signal: df_decimated[signal].tolist() for signal in request.signals}

    return DatasetQueryResponse(
        lap_distance=lap_distance,
        lap_time=lap_time,
        signals=signals,
        decimation_factor=decimation_factor,
    )


@router.get("/{dataset_id}/trackmap", response_model=TrackMapResponse)
def get_trackmap(dataset_id: str) -> TrackMapResponse:
    """Get track map coordinates (x, y) indexed by lap distance."""
    dataset = mat_loader.get_dataset(dataset_id)
    if dataset is None:
        raise HTTPException(status_code=404, detail="Dataset not found")

    _, metadata = dataset

    if dataset_id in track_maps:
        track_df = track_maps[dataset_id]
        return TrackMapResponse(
            lap_distance=track_df["lap_distance"].tolist(),
            x_position=track_df["x_position"].tolist(),
            y_position=track_df["y_position"].tolist(),
        )

    track_df = _load_trackmap_dataframe(metadata.source_path)
    if track_df is not None and not track_df.empty:
        track_maps[dataset_id] = track_df
        return TrackMapResponse(
            lap_distance=track_df["lap_distance"].tolist(),
            x_position=track_df["x_position"].tolist(),
            y_position=track_df["y_position"].tolist(),
        )

    # Fallback only if CSV is missing for this dataset.
    lap_min, lap_max = metadata.lap_distance_range
    lap_distance = np.linspace(lap_min, lap_max, metadata.num_samples)
    angle = (lap_distance / max(lap_max, 1.0)) * 2 * np.pi
    x = 500 * np.cos(angle)
    y = 300 * np.sin(angle)
    return TrackMapResponse(
        lap_distance=lap_distance.tolist(),
        x_position=x.tolist(),
        y_position=y.tolist(),
    )

@router.post("/calculate", response_model=MapTuningCalculateResponse)
async def calculate_map_output(payload: MapTuningRequest):
    """
    Calculate output channel based on map tuning.

    This endpoint takes the current map configuration and applies it to
    a dataset, creating a new computed output channel.
    """
    try:
        if not payload.datasetId:
            raise HTTPException(status_code=400, detail="datasetId is required")

        if not payload.gridData or not payload.rowHeaders or not payload.colHeaders:
            raise HTTPException(status_code=400, detail="gridData, rowHeaders, and colHeaders are required")

        if not payload.inputChannelX or not payload.inputChannelY:
            raise HTTPException(
                status_code=400, detail="inputChannelX and inputChannelY are required"
            )

        dataset = mat_loader.get_dataset(payload.datasetId)
        if dataset is None:
            raise HTTPException(status_code=404, detail="Dataset not found. Ensure it is loaded first.")

        df_normalized, metadata = dataset

        # Create the 2D LUT object to store the 2D LUT characteristics
        lut_object = LUT2D(
            payload.inputChannelX,
            payload.inputChannelY,
            np.array(payload.rowHeaders),
            np.array(payload.colHeaders),
            np.array(payload.gridData),
            payload.outputChannelName,
            payload.braking_signal,
            payload.gainVal,
            payload.offsetVal,
            payload.interpolation,
        )

        # Compute the output channel (assuming LUT2D is callable on the DataFrame directly)
        output_values = lut_object.apply2DLUT(df_normalized)
        
        # Ensure output is a numpy array for processing
        if not isinstance(output_values, np.ndarray):
            output_values = np.array(output_values)

        # We add the new channel to the requested dataset for future display
        sourcepath = mat_loader.add_new_channel(
            payload.outputChannelName,
            output_values,
            payload.datasetId,
        )

        return {
            "message": f"Map '{payload.outputChannelName}' calculated successfully",
            "samplesProcessed": output_values.size,
            "outputSignal": output_values.tolist(), # Convert to list for JSON serialization
            "sourcePath": sourcepath,
        }

    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to calculate map output:{str(e)}"
        )


# Allowed math functions for expression evaluation (numpy-backed, no builtins)
_MATH_NAMESPACE = {
    "abs": np.abs,
    "sign": np.sign,
    "min": np.minimum,   # element-wise 2-arg
    "max": np.maximum,   # element-wise 2-arg
    "clamp": np.clip,
    "sqrt": np.sqrt,
    "log": np.log,
    "exp": np.exp,
    "sin": np.sin,
    "cos": np.cos,
    "tan": np.tan,
    "pow": np.power,
    "where": np.where,   # ternary: where(cond, val_true, val_false)
    "sat":    lambda s, lo, hi: np.minimum(np.maximum(s, lo), hi),   # sat(signal, lower, upper)
    "satdyn": lambda s, lo, hi: np.minimum(np.maximum(s, lo), hi),   # satdyn(signal, lower_signal, upper_signal)
    "gain":   lambda s, f: s * f,
    "norm2":  lambda a, b: np.sqrt(a**2 + b**2),
    "and_":   lambda a, b: np.where((a != 0) & (b != 0), 1.0, 0.0),
    "or_":    lambda a, b: np.where((a != 0) | (b != 0), 1.0, 0.0),
    "__builtins__": {},  # block all Python builtins
}


@router.post("/{dataset_id}/compute-math", response_model=ComputeMathResponse)
async def compute_math_channel(dataset_id: str, payload: ComputeMathRequest):
    """
    Evaluate a math expression on the full dataset and persist the result as a new channel.

    The expression uses signal names as variables; supports standard arithmetic and
    the math functions defined in _MATH_NAMESPACE (abs, sqrt, sin, etc.).
    """
    dataset = mat_loader.get_dataset(dataset_id)
    if dataset is None:
        raise HTTPException(status_code=404, detail="Dataset not found")

    df, metadata = dataset

    missing = [dep for dep in payload.dependencies if dep not in df.columns]
    if missing:
        raise HTTPException(
            status_code=400,
            detail=f"Signal(s) not found in dataset: {', '.join(missing)}",
        )

    # Build evaluation namespace: signal arrays + allowed math functions
    namespace = {dep: df[dep].values for dep in payload.dependencies}
    namespace.update(_MATH_NAMESPACE)

    try:
        # Evaluate with suppressed numpy warnings for divide/invalid operations;
        # sanitize afterwards to ensure no infinities or NaNs are persisted.
        with np.errstate(divide="ignore", invalid="ignore"):
            result = np.asarray(eval(payload.expression, namespace), dtype=np.float64)  # noqa: S307
    except Exception as exc:
        raise HTTPException(
            status_code=400, detail=f"Expression evaluation failed: {exc}"
        )

    # Replace non-finite values (inf, -inf, nan) with a safe numeric value (0.0)
    # to avoid propagating invalids into stored channels.
    if not np.all(np.isfinite(result)):
        result = np.where(np.isfinite(result), result, 0.0)

    if result.shape == ():
        # Scalar result — broadcast to dataset length
        result = np.full(len(df), float(result))

    if len(result) != len(df):
        raise HTTPException(
            status_code=400,
            detail=f"Expression result length ({len(result)}) does not match dataset ({len(df)})",
        )

    mat_loader.add_new_channel(payload.output_name, result, dataset_id)

    return ComputeMathResponse(
        message=f"Channel '{payload.output_name}' computed and added to dataset",
        samplesProcessed=int(len(result)),
    )
