from typing import Literal, Optional, List, Dict

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
class SignalMetadataResponse(BaseModel):
    name: str
    display_signal: bool = Field(description="Whether the signal should appear in available signal lists")
    category_signal: str = Field(description="Signal category, e.g. Dataset or soft block name")


class DatasetMetadataResponse(BaseModel):
    dataset_id: str
    source_path: str
    source_distance_step_m: float
    normalized_distance_step_m: float
    num_samples: int
    lap_distance_min: float
    lap_distance_max: float
    signal_names: List[str]
    signal_metadata: List[SignalMetadataResponse]
    source_sample_rate_hz: Optional[float]
    has_time_axis: bool
    interpolation_method: str
    enrichment_factor: float


# === Dataset Query ===
class DatasetQueryRequest(BaseModel):
    signals: List[str] = Field(..., description="List of signal names to fetch")
    start_distance: float = Field(
        default=0.0, description="Start distance in meters"
    )
    end_distance: Optional[float] = Field(
        default=None, description="End distance in meters (optional, uses max if None)"
    )
    max_points: int = Field(
        default=500, ge=10, le=5000, description="Max points to return (will decimate if needed)"
    )


class DatasetQueryResponse(BaseModel):
    lap_distance: List[float]
    lap_time: Optional[List[float]] = None
    signals: Dict[str, List[float]]
    decimation_factor: int = Field(description="Points were averaged by this factor")


# === Track Map ===
class TrackMapResponse(BaseModel):
    lap_distance: List[float]
    x_position: List[float]
    y_position: List[float]


# === Import Status ===
class DatasetImportResponse(BaseModel):
    dataset_id: str
    message: str


class DatasetImportFromPathRequest(BaseModel):
    mat_path: str = Field(..., min_length=1, description="Absolute or server-local path to a .mat file")


class SignalMetadataUpdateRequest(BaseModel):
    display_signal: Optional[bool] = Field(default=None, description="Whether the signal should appear in available lists")
    category_signal: Optional[str] = Field(default=None, description="New category for the signal")


class SignalCategoryRenameRequest(BaseModel):
    old_category: str = Field(..., min_length=1, description="Existing category to rename")
    new_category: str = Field(..., min_length=1, description="New category name")


# === Map Tuning ===
class MapTuningRequest(BaseModel):
    datasetId: str
    inputChannelX: str
    inputChannelY: str
    outputChannelName: str
    gridData: List[List[float]]
    rowHeaders: List[float]
    colHeaders: List[float]
    braking_signal: bool
    gainVal: float
    offsetVal: float
    interpolation: str = "linear"
    extrapolation: str = "clamp"
    display_signal: bool = Field(default=True, description="Whether this output signal should be shown in signal lists")
    category_signal: Optional[str] = Field(default=None, description="Category label for this computed signal")


class MapTuningSaveResponse(BaseModel):
    message: str
    mapId: str


class MapTuningCalculateResponse(BaseModel):
    message: str
    samplesProcessed: int
    outputSignal: List[float]


class ComputeMathRequest(BaseModel):
    output_name: str = Field(..., description="Name for the output signal")
    expression: str = Field(..., description="Math expression using signal names")
    dependencies: List[str] = Field(..., description="Signal names referenced in the expression")
    display_signal: bool = Field(default=True, description="Whether this output signal should be shown in signal lists")
    category_signal: Optional[str] = Field(default=None, description="Category label for this computed signal")


class ComputeMathResponse(BaseModel):
    message: str
    samplesProcessed: int


# === TelData COM import ===

class TelDataRunInfo(BaseModel):
    id: int
    label: str
    level: int
    lap_count: int = 0


class TelDataLapInfo(BaseModel):
    id: int
    label: str
    driver_name: str = ""
    lap_time_ms: Optional[int] = None


class TelDataOpenRequest(BaseModel):
    archive_path: str = Field(..., min_length=1)


class TelDataOpenResponse(BaseModel):
    session_id: str
    runs: List[TelDataRunInfo]


class TelDataLapsRequest(BaseModel):
    run_id: int


class TelDataLapsResponse(BaseModel):
    laps: List[TelDataLapInfo]


class TelDataChannelsRequest(BaseModel):
    run_id: int
    lap_id: int
    vch_path: Optional[str] = Field(default=None, description="Optional .vch file path to enable math channels")


class TelDataChannelsResponse(BaseModel):
    channels: List[str]


class TelDataExportRequest(BaseModel):
    run_id: int
    lap_id: int
    channels: List[str] = Field(..., min_length=1)
    target_frequency_hz: float = Field(default=100.0, gt=0)
    vch_path: Optional[str] = Field(default=None, description="Optional path to .vch file for math channels")


class TelDataExportResponse(BaseModel):
    mat_path: str


# === Recent Imports ===

class RecentImportItem(BaseModel):
    import_id: str
    dataset_id: Optional[str] = None
    source_path: str
    original_path: Optional[str] = None
    imported_at: str
    file_size: Optional[int] = None
    signal_count: Optional[int] = None
    dataset_name: Optional[str] = None
    max_slap: Optional[float] = None
    max_tlap: Optional[float] = None


class RecentImportsResponse(BaseModel):
    items: List[RecentImportItem]