"""Dataset import, query, and track map endpoints."""

from pathlib import Path
from typing import List, Dict, Optional, Tuple
import uuid
import re
import logging

import numpy as np
import pandas as pd
from scipy import signal
from fastapi import APIRouter, HTTPException, UploadFile

logger = logging.getLogger(__name__)

from app.config import config
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
)
from app.services.mat_loader import MatLoader, MatValidationError
from app.services.lut_2D import LUT2D

router = APIRouter(prefix="/api/datasets", tags=["datasets"])

# Global loader instance
mat_loader = MatLoader(reference_step_m=config.reference_distance_step_m)

# Track maps cache (dataset_id -> dataframe)
track_maps: Dict[str, pd.DataFrame] = {}


def _detect_temporal_functions(expression: str) -> bool:
    """Check if expression contains any temporal function."""
    temporal_funcs = r"\b(lowpass|highpass|derivative|integral)\s*\("
    return bool(re.search(temporal_funcs, expression))


def _get_time_axis_column(df: pd.DataFrame) -> str:
    """
    Find the time axis column in dataset.
    
    Checks for (in priority order): "__time_s__", "tLap", "tout"
    Raises ValueError if none found.
    """
    for col in ["__time_s__", "tLap", "tout"]:
        if col in df.columns:
            return col
    raise ValueError(
        "Time axis required for temporal functions. "
        "Dataset must contain one of: __time_s__, tLap, tout"
    )


def _get_sampling_rate_hz(df: pd.DataFrame) -> Tuple[float, str]:
    """
    Calculate sampling rate from time axis.
    
    Returns: (sampling_rate_hz, time_column_name)
    """
    time_col = _get_time_axis_column(df)
    t = df[time_col].values
    
    if len(t) < 2:
        raise ValueError("Need at least 2 time samples for temporal functions")
    
    dt = np.diff(t)
    if np.any(dt <= 0):
        raise ValueError(f"Time axis ({time_col}) must be strictly monotonically increasing")
    
    # Return samples/second (Hz)
    return 1.0 / np.median(dt), time_col


def _create_temporal_namespace(
    df: pd.DataFrame, dependencies: List[str], fs_hz: float, time_col: str
) -> Dict:
    """
    Create evaluation namespace with temporal function wrappers.
    
    Args:
        df: Full dataset (indexed by lap_distance)
        dependencies: List of signal names used in expression
        fs_hz: Sampling rate in Hz
        time_col: Name of time column ("__time_s__", "tLap", or "tout")
    
    Returns:
        Dict with signal arrays, scalar functions, and temporal function wrappers
    """
    # Start with signal arrays
    namespace = {dep: df[dep].values for dep in dependencies}
    t = df[time_col].values
    
    # Validate minimum length for temporal operations
    if len(t) < 2:
        raise ValueError("Temporal functions require at least 2 time samples")
    
    def lowpass_filter(signal_array, freq_hz):
        """2nd-order Butterworth low-pass filter."""
        if freq_hz <= 0 or freq_hz >= fs_hz / 2:
            raise ValueError(f"Cutoff freq must be in (0, {fs_hz/2:.1f}) Hz")
        
        # Design filter
        sos = signal.butter(2, freq_hz, fs=fs_hz, output="sos")
        # Apply forward-backward (zero-phase)
        return signal.sosfiltfilt(sos, signal_array)
    
    def highpass_filter(signal_array, freq_hz):
        """2nd-order Butterworth high-pass filter."""
        if freq_hz <= 0 or freq_hz >= fs_hz / 2:
            raise ValueError(f"Cutoff freq must be in (0, {fs_hz/2:.1f}) Hz")
        
        sos = signal.butter(2, freq_hz, fs=fs_hz, btype="high", output="sos")
        return signal.sosfiltfilt(sos, signal_array)
    
    def derivative_func(signal_array):
        """Numerical derivative using centered differences where possible."""
        if len(signal_array) < 2:
            raise ValueError("Derivative requires at least 2 samples")
        
        if len(signal_array) == 2:
            # Simple forward difference
            dt_first = t[1] - t[0]
            deriv = np.zeros_like(signal_array, dtype=np.float64)
            deriv[0] = (signal_array[1] - signal_array[0]) / dt_first
            deriv[1] = deriv[0]  # Repeat for second point
            return deriv
        
        # General case: centered differences
        dt = np.diff(t)
        deriv = np.zeros_like(signal_array, dtype=np.float64)
        
        # Centered differences for interior points
        for i in range(1, len(signal_array) - 1):
            deriv[i] = (signal_array[i + 1] - signal_array[i - 1]) / (t[i + 1] - t[i - 1])
        
        # Forward difference for first point
        deriv[0] = (signal_array[1] - signal_array[0]) / dt[0]
        # Backward difference for last point
        deriv[-1] = (signal_array[-1] - signal_array[-2]) / dt[-1]
        
        return deriv
    
    def integral_func(signal_array):
        """Cumulative trapezoidal integration."""
        if len(signal_array) < 1:
            raise ValueError("Integral requires at least 1 sample")
        
        from scipy.integrate import cumtrapz
        integral = cumtrapz(signal_array, t, initial=0)
        return integral
    
    # Add temporal functions
    namespace["lowpass"] = lowpass_filter
    namespace["highpass"] = highpass_filter
    namespace["derivative"] = derivative_func
    namespace["integral"] = integral_func
    
    # IMPORTANT: Include scalar functions so expressions can mix temporal + scalar
    namespace.update(_MATH_NAMESPACE)
    
    return namespace


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
    
    print(f"[query] Requested signals: {request.signals}", flush=True)
    print(f"[query] Available signals in metadata: {metadata.signal_names}", flush=True)
    print(f"[query] Available columns in DataFrame: {list(df.columns)}", flush=True)

    # Validate signals exist
    missing = set(request.signals) - set(metadata.signal_names)
    if missing:
        raise HTTPException(
            status_code=400, detail=f"Signals not found: {', '.join(missing)}"
        )

    # Slice by distance range
    start_dist = request.start_distance
    end_dist = request.end_distance or metadata.lap_distance_range[1]
    print(f"[query] Distance range: {start_dist} to {end_dist}", flush=True)

    df_slice = df.loc[(df.index >= start_dist) & (df.index <= end_dist)]
    print(f"[query] Slice shape: {df_slice.shape}", flush=True)

    if df_slice.empty:
        raise HTTPException(status_code=400, detail="No data in distance range")

    # Decimate if needed
    decimation_factor = max(1, len(df_slice) // request.max_points)

    if decimation_factor > 1:
        # Average by bins
        df_decimated = df_slice.iloc[::decimation_factor]
    else:
        df_decimated = df_slice

    print(f"[query] Decimation: factor={decimation_factor}, final shape={df_decimated.shape}", flush=True)

    # Build response
    lap_distance = df_decimated.index.tolist()
    lap_time = df_decimated["__time_s__"].tolist() if "__time_s__" in df_decimated.columns else None
    signals = {signal: df_decimated[signal].tolist() for signal in request.signals}
    
    for signal_name, signal_data in signals.items():
        print(f"[query] Signal '{signal_name}': {len(signal_data)} points, range=[{min(signal_data) if signal_data else 'empty'}, {max(signal_data) if signal_data else 'empty'}]", flush=True)

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

    Supports two evaluation modes:
    - Scalar (element-wise): standard math functions (abs, sqrt, sin, etc.)
    - Temporal (global): functions that operate on entire signals (lowpass, derivative, integral)
    
    Mode is auto-detected from the expression.
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

    # Auto-detect expression mode
    is_temporal = _detect_temporal_functions(payload.expression)
    msg = f"[compute-math] Expression mode: {'TEMPORAL' if is_temporal else 'SCALAR'}"
    print(msg, flush=True)
    logger.info(msg)
    
    print(f"[compute-math] Expression: {payload.expression}", flush=True)
    logger.info(f"[compute-math] Expression: {payload.expression}")
    print(f"[compute-math] Dependencies: {payload.dependencies}", flush=True)
    logger.info(f"[compute-math] Dependencies: {payload.dependencies}")

    try:
        if is_temporal:
            # Temporal mode: need time axis (tout, tLap, or __time_s__)
            fs_hz, time_col = _get_sampling_rate_hz(df)
            msg = f"[compute-math] Time axis column: {time_col}, fs: {fs_hz:.2f} Hz"
            print(msg, flush=True)
            logger.info(msg)
            
            print(f"[compute-math] Creating temporal namespace with {len(df)} rows...", flush=True)
            namespace = _create_temporal_namespace(df, payload.dependencies, fs_hz, time_col)
            print(f"[compute-math] Temporal namespace keys: {list(namespace.keys())}", flush=True)
            logger.info(f"[compute-math] Temporal namespace keys: {list(namespace.keys())}")
        else:
            # Scalar mode: standard element-wise evaluation
            namespace = {dep: df[dep].values for dep in payload.dependencies}
            namespace.update(_MATH_NAMESPACE)
            print(f"[compute-math] Scalar namespace keys: {list(namespace.keys())}", flush=True)
            logger.info(f"[compute-math] Scalar namespace keys: {list(namespace.keys())}")

        # Evaluate with suppressed numpy warnings for divide/invalid operations
        print(f"[compute-math] Starting eval() with expression: {payload.expression}", flush=True)
        logger.info(f"[compute-math] Starting eval() with {len(df)} rows...")
        with np.errstate(divide="ignore", invalid="ignore"):
            result = np.asarray(eval(payload.expression, namespace), dtype=np.float64)  # noqa: S307
        
        msg = f"[compute-math] eval() result shape: {result.shape}, dtype: {result.dtype}"
        print(msg, flush=True)
        logger.info(msg)
    except Exception as exc:
        err_msg = f"[compute-math] Expression evaluation failed: {exc}"
        print(err_msg, flush=True)
        logger.error(err_msg, exc_info=True)
        raise HTTPException(
            status_code=400, detail=f"Expression evaluation failed: {exc}"
        )

    # Replace non-finite values (inf, -inf, nan) with a safe numeric value (0.0)
    # to avoid propagating invalids into stored channels.
    if not np.all(np.isfinite(result)):
        non_finite_count = np.sum(~np.isfinite(result))
        msg = f"[compute-math] Found {non_finite_count} non-finite values, replacing with 0.0"
        print(msg, flush=True)
        logger.warning(msg)
        result = np.where(np.isfinite(result), result, 0.0)

    if result.shape == ():
        # Scalar result — broadcast to dataset length
        msg = f"[compute-math] Broadcasting scalar result {result} to {len(df)} rows"
        print(msg, flush=True)
        logger.info(msg)
        result = np.full(len(df), float(result))

    if len(result) != len(df):
        err_msg = f"[compute-math] Result length mismatch: {len(result)} vs dataset {len(df)}"
        print(err_msg, flush=True)
        logger.error(err_msg)
        raise HTTPException(
            status_code=400,
            detail=f"Expression result length ({len(result)}) does not match dataset ({len(df)})",
        )

    final_msg = f"[compute-math] Final result: shape={result.shape}, min={np.min(result):.6f}, max={np.max(result):.6f}, mean={np.mean(result):.6f}"
    print(final_msg, flush=True)
    logger.info(final_msg)
    
    print(f"[compute-math] Adding channel '{payload.output_name}' to dataset...", flush=True)
    mat_loader.add_new_channel(payload.output_name, result, dataset_id)
    print(f"[compute-math] Channel '{payload.output_name}' added successfully", flush=True)
    logger.info(f"[compute-math] Channel '{payload.output_name}' added successfully")

    return ComputeMathResponse(
        message=f"Channel '{payload.output_name}' computed and added to dataset",
        samplesProcessed=int(len(result)),
    )
