from typing import Literal

from pydantic import BaseModel, Field


# === Health & App Info ===
class HealthResponse(BaseModel):
    status: Literal["ok"]


class AppInfoResponse(BaseModel):
    name: str = Field(description="Application name")
    version: str = Field(description="Application version")
    reference_distance_step_m: float = Field(
        description="Spatial reference step used by the app"
    )


# === Dataset Metadata ===
class DatasetMetadataResponse(BaseModel):
    dataset_id: str
    source_distance_step_m: float
    normalized_distance_step_m: float
    num_samples: int
    lap_distance_min: float
    lap_distance_max: float
    signal_names: list[str]
    interpolation_method: str
    enrichment_factor: float


# === Dataset Query ===
class DatasetQueryRequest(BaseModel):
    signals: list[str] = Field(..., description="List of signal names to fetch")
    start_distance: float = Field(
        default=0.0, description="Start distance in meters"
    )
    end_distance: float = Field(
        default=None, description="End distance in meters (optional, uses max if None)"
    )
    max_points: int = Field(
        default=500, ge=10, le=5000, description="Max points to return (will decimate if needed)"
    )


class DatasetQueryResponse(BaseModel):
    lap_distance: list[float]
    signals: dict[str, list[float]]
    decimation_factor: int = Field(description="Points were averaged by this factor")


# === Track Map ===
class TrackMapResponse(BaseModel):
    lap_distance: list[float]
    x_position: list[float]
    y_position: list[float]


# === Import Status ===
class DatasetImportResponse(BaseModel):
    dataset_id: str
    message: str
