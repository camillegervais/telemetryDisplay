"""Dataset import, query, and track map endpoints."""

from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Dict, Optional

import numpy as np
import pandas as pd
from fastapi import APIRouter, HTTPException, UploadFile

from app.config import config
from app.schemas import (
    DatasetImportResponse,
    DatasetMetadataResponse,
    DatasetQueryRequest,
    DatasetQueryResponse,
    TrackMapResponse,
)
from app.services.mat_loader import MatLoader, MatValidationError

router = APIRouter(prefix="/api/datasets", tags=["datasets"])

# Global loader instance
mat_loader = MatLoader(reference_step_m=config.reference_distance_step_m)

# Track maps cache (dataset_id -> dataframe)
track_maps: Dict[str, pd.DataFrame] = {}


def _track_csv_path_from_metadata(source_path: str) -> Path:
    source_name = Path(source_path).stem
    repo_root = Path(__file__).resolve().parents[3]
    return repo_root / "data" / f"{source_name}_track.csv"


def _load_trackmap_dataframe(source_path: str) -> Optional[pd.DataFrame]:
    csv_path = _track_csv_path_from_metadata(source_path)
    if not csv_path.exists():
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
        
        # Use temporary directory compatible with Windows and Unix
        with TemporaryDirectory() as tmpdir:
            temp_path = Path(tmpdir) / file.filename
            temp_path.write_bytes(contents)

            df_normalized, metadata = mat_loader.load_and_normalize(str(temp_path))

            # Optionally cache track map if available
            # (would be populated from CSV uploaded separately in a full implementation)

            return DatasetImportResponse(
                dataset_id=metadata.dataset_id,
                message=f"Dataset imported: {len(df_normalized)} normalized samples, "
                f"source step {metadata.source_distance_step_m:.2f}m → "
                f"reference step {metadata.normalized_distance_step_m:.2f}m",
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
        source_distance_step_m=metadata.source_distance_step_m,
        normalized_distance_step_m=metadata.normalized_distance_step_m,
        num_samples=metadata.num_samples,
        lap_distance_min=metadata.lap_distance_range[0],
        lap_distance_max=metadata.lap_distance_range[1],
        signal_names=metadata.signal_names,
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
    signals = {signal: df_decimated[signal].tolist() for signal in request.signals}

    return DatasetQueryResponse(
        lap_distance=lap_distance,
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
