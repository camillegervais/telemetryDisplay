"""
MAT file loading, validation, and normalization.
"""

import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Optional, Tuple, Union

import numpy as np
import pandas as pd
from scipy.io import loadmat

from app.config import config


@dataclass
class MatValidationError(Exception):
    """Raised when .mat file fails validation."""

    message: str


@dataclass
class DatasetMetadata:
    """Metadata about a loaded and normalized dataset."""

    dataset_id: str
    source_path: str
    source_distance_step_m: float
    normalized_distance_step_m: float
    num_samples: int
    lap_distance_range: tuple[float, float]
    signal_names: list[str]
    interpolation_method: str = "linear"
    enrichment_factor: float = 1.0


class MatLoader:
    """Load, validate, and normalize .mat files with spatial resampling."""

    def __init__(self, reference_step_m: float = 1.0):
        self.reference_step_m = reference_step_m
        self.loaded_datasets: dict[str, tuple[pd.DataFrame, DatasetMetadata]] = {}

    def load_and_normalize(self, mat_path: Union[str, Path]) -> Tuple[pd.DataFrame, DatasetMetadata]:
        """
        Load .mat file, validate, and normalize to reference spatial step.

        Args:
            mat_path: path to .mat file

        Returns:
            Tuple of (normalized_dataframe, metadata)

        Raises:
            MatValidationError: if validation fails
        """
        mat_path = Path(mat_path)

        # Load .mat file
        try:
            mat_data = loadmat(str(mat_path), simplify_cells=True)
        except Exception as e:
            raise MatValidationError(f"Failed to load {mat_path}: {e}")

        # Validate lap progression key (supports legacy/alternate naming).
        lap_key = "lap_distance" if "lap_distance" in mat_data else "sLap" if "sLap" in mat_data else None
        if lap_key is None:
            raise MatValidationError("Missing mandatory 'lap_distance' (or 'sLap') variable")

        lap_distance = np.asarray(mat_data[lap_key]).flatten()
        if len(lap_distance) < 2:
            raise MatValidationError("lap_distance must have at least 2 points")

        if np.any(np.isnan(lap_distance)):
            raise MatValidationError("lap_distance contains NaN values")

        # Detect or compute spatial step
        source_step_m = self._detect_spatial_step(mat_data, lap_distance)

        # Collect signal variables (exclude metadata)
        signal_names = self._extract_signal_names(mat_data, lap_distance)

        if not signal_names:
            raise MatValidationError("No signal variables found in .mat file")

        # Validate all signals have same length as lap_distance
        for signal_name in signal_names:
            signal_data = np.asarray(mat_data[signal_name]).flatten()
            if len(signal_data) != len(lap_distance):
                raise MatValidationError(
                    f"Signal '{signal_name}' has {len(signal_data)} points, "
                    f"expected {len(lap_distance)}"
                )

        # Normalize all signals to reference spatial step
        df_normalized = self._resample_to_reference_step(
            lap_distance, mat_data, signal_names
        )

        # Create metadata
        metadata = DatasetMetadata(
            dataset_id=str(uuid.uuid4()),
            source_path=str(mat_path),
            source_distance_step_m=source_step_m,
            normalized_distance_step_m=self.reference_step_m,
            num_samples=len(df_normalized),
            lap_distance_range=(
                float(df_normalized.index.min()),
                float(df_normalized.index.max()),
            ),
            signal_names=signal_names,
            enrichment_factor=source_step_m / self.reference_step_m if source_step_m > 0 else 1.0,
        )

        # Cache the dataset
        self.loaded_datasets[metadata.dataset_id] = (df_normalized, metadata)

        return df_normalized, metadata

    def _detect_spatial_step(self, mat_data: dict, lap_distance: np.ndarray) -> float:
        """
        Detect source spatial step from distance_step_m variable or compute from lap_distance.

        Args:
            mat_data: loaded .mat dictionary
            lap_distance: lap distance array

        Returns:
            Spatial step in meters
        """
        if "distance_step_m" in mat_data:
            step = np.asarray(mat_data["distance_step_m"]).flatten()[0]
            if step > 0:
                return float(step)

        # Fallback: compute median delta
        deltas = np.diff(lap_distance)
        step = float(np.median(deltas[deltas > 0]))

        if step <= 0:
            raise MatValidationError("Could not determine valid spatial step")

        return step

    def _extract_signal_names(self, mat_data: dict, lap_distance: np.ndarray) -> list[str]:
        """
        Extract signal variable names, excluding metadata and structural keys.

        Args:
            mat_data: loaded .mat dictionary
            lap_distance: for length comparison

        Returns:
            List of signal variable names
        """
        excluded = {
            "__header__",
            "__version__",
            "__globals__",
            "lap_distance",
            "sLap",
            "distance_step_m",
        }

        signals = []
        for key, value in mat_data.items():
            if key in excluded or key.startswith("_"):
                continue

            # Check if it's an array matching lap_distance length
            try:
                arr = np.asarray(value).flatten()
                if len(arr) == len(lap_distance):
                    signals.append(key)
            except Exception:
                pass

        return sorted(signals)

    def _resample_to_reference_step(
        self, lap_distance: np.ndarray, mat_data: dict, signal_names: list[str]
    ) -> pd.DataFrame:
        """
        Resample all signals to reference spatial step using linear interpolation.

        Args:
            lap_distance: original distance array
            mat_data: original .mat data
            signal_names: list of signal variable names

        Returns:
            DataFrame with resampled signals, indexed by normalized lap_distance
        """
        # Build new distance grid at reference step
        new_distance = np.arange(
            lap_distance[0], lap_distance[-1] + self.reference_step_m, self.reference_step_m
        )

        # Interpolate each signal
        resampled = {"lap_distance": new_distance}
        for signal_name in signal_names:
            original_signal = np.asarray(mat_data[signal_name]).flatten()
            # Linear interpolation, no extrapolation
            resampled_signal = np.interp(new_distance, lap_distance, original_signal)
            resampled[signal_name] = resampled_signal

        df = pd.DataFrame(resampled)
        df.set_index("lap_distance", inplace=True)

        return df

    def get_dataset(self, dataset_id: str) -> Optional[Tuple[pd.DataFrame, DatasetMetadata]]:
        """Retrieve cached dataset by ID."""
        return self.loaded_datasets.get(dataset_id)

    def get_all_datasets(self) -> dict[str, DatasetMetadata]:
        """Get metadata of all loaded datasets."""
        return {
            dataset_id: metadata for dataset_id, (_, metadata) in self.loaded_datasets.items()
        }
