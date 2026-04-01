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
    source_sample_rate_hz: Optional[float] = None
    has_time_axis: bool = False
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

        lap_distance_raw = np.asarray(mat_data[lap_key]).flatten()
        if len(lap_distance_raw) < 2:
            raise MatValidationError("lap_distance must have at least 2 points")

        if np.any(np.isnan(lap_distance_raw)):
            raise MatValidationError("lap_distance contains NaN values")

        source_points = len(lap_distance_raw)

        # Keep a single clean lap segment and enforce strictly increasing progression.
        segment_indices = self._select_clean_lap_indices(lap_distance_raw)
        lap_distance = lap_distance_raw[segment_indices]
        monotonic_mask = self._strictly_increasing_mask(lap_distance)
        lap_distance = lap_distance[monotonic_mask]

        if len(lap_distance) < 2:
            raise MatValidationError("Could not build a clean increasing lap from lap_distance/sLap")

        # Detect or compute spatial step
        source_step_m = self._detect_spatial_step(mat_data, lap_distance)
        sample_rate_hz = self._detect_sample_rate_hz(mat_data)

        # Collect signal variables (exclude metadata)
        signal_names = self._extract_signal_names(mat_data, source_points)

        if not signal_names:
            raise MatValidationError("No signal variables found in .mat file")

        trimmed_signals: dict[str, np.ndarray] = {}
        source_time: Optional[np.ndarray] = None
        if sample_rate_hz is not None and sample_rate_hz > 0:
            source_time_raw = np.arange(source_points, dtype=float) / sample_rate_hz
            source_time_segment = source_time_raw[segment_indices]
            source_time = source_time_segment[monotonic_mask]

        # Validate all signals have same length as lap_distance
        for signal_name in signal_names:
            signal_data = np.asarray(mat_data[signal_name]).flatten()
            if len(signal_data) != source_points:
                raise MatValidationError(
                    f"Signal '{signal_name}' has {len(signal_data)} points, "
                    f"expected {source_points}"
                )

            signal_segment = signal_data[segment_indices]
            trimmed_signals[signal_name] = signal_segment[monotonic_mask]

        # Normalize all signals to reference spatial step
        df_normalized = self._resample_to_reference_step(lap_distance, trimmed_signals, source_time)

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
            source_sample_rate_hz=sample_rate_hz,
            has_time_axis=source_time is not None,
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

    def _extract_signal_names(self, mat_data: dict, expected_length: int) -> list[str]:
        """
        Extract signal variable names, excluding metadata and structural keys.

        Args:
            mat_data: loaded .mat dictionary
            expected_length: required source length for candidate signals

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
            "sample_rate_hz",
            "sampling_rate_hz",
            "sampling_frequency_hz",
            "fs",
            "dt",
        }

        signals = []
        for key, value in mat_data.items():
            if key in excluded or key.startswith("_"):
                continue

            # Check if it's an array matching lap_distance length
            try:
                arr = np.asarray(value).flatten()
                if len(arr) == expected_length:
                    signals.append(key)
            except Exception:
                pass

        return sorted(signals)

    def _detect_sample_rate_hz(self, mat_data: dict) -> Optional[float]:
        """Detect source sampling rate (Hz) from common MAT keys."""
        frequency_keys = (
            "sample_rate_hz",
            "sampling_rate_hz",
            "sampling_frequency_hz",
            "fs",
        )
        for key in frequency_keys:
            if key in mat_data:
                value = np.asarray(mat_data[key]).flatten()
                if value.size == 0:
                    continue
                rate = float(value[0])
                if np.isfinite(rate) and rate > 0:
                    return rate

        if "dt" in mat_data:
            value = np.asarray(mat_data["dt"]).flatten()
            if value.size > 0:
                dt = float(value[0])
                if np.isfinite(dt) and dt > 0:
                    return 1.0 / dt

        return None

    def _select_clean_lap_indices(self, lap_distance: np.ndarray) -> np.ndarray:
        """
        Select a single clean lap segment when progression wraps (e.g. starts near sMax then resets to 0).
        """
        if len(lap_distance) < 2:
            return np.arange(len(lap_distance))

        wrap_points = np.where(np.diff(lap_distance) < 0)[0]
        if len(wrap_points) == 0:
            return np.arange(len(lap_distance))

        best_start = 0
        best_end = len(lap_distance)
        best_span = float(lap_distance[-1] - lap_distance[0])
        best_len = len(lap_distance)

        segment_starts = [0, *(wrap_points + 1)]
        segment_ends = [*(wrap_points + 1), len(lap_distance)]

        for start, end in zip(segment_starts, segment_ends):
            segment = lap_distance[start:end]
            if len(segment) < 2:
                continue

            span = float(segment[-1] - segment[0])
            if span > best_span or (span == best_span and len(segment) > best_len):
                best_start = start
                best_end = end
                best_span = span
                best_len = len(segment)

        return np.arange(best_start, best_end)

    def _strictly_increasing_mask(self, lap_distance: np.ndarray) -> np.ndarray:
        """
        Keep only strictly increasing progression points (drops duplicates/non-increasing noise).
        """
        if len(lap_distance) == 0:
            return np.array([], dtype=bool)

        keep = np.ones(len(lap_distance), dtype=bool)
        last = lap_distance[0]
        for idx in range(1, len(lap_distance)):
            if lap_distance[idx] <= last:
                keep[idx] = False
            else:
                last = lap_distance[idx]

        return keep

    def _resample_to_reference_step(
        self,
        lap_distance: np.ndarray,
        signals: dict[str, np.ndarray],
        source_time: Optional[np.ndarray] = None,
    ) -> pd.DataFrame:
        """
        Resample all signals to reference spatial step using linear interpolation.

        Args:
            lap_distance: original distance array
            signals: trimmed source signals keyed by signal name

        Returns:
            DataFrame with resampled signals, indexed by normalized lap_distance
        """
        # Build new distance grid at reference step
        new_distance = np.arange(
            lap_distance[0], lap_distance[-1] + self.reference_step_m, self.reference_step_m
        )

        # Interpolate each signal
        resampled = {"lap_distance": new_distance}
        for signal_name, original_signal in signals.items():
            # Linear interpolation, no extrapolation
            resampled_signal = np.interp(new_distance, lap_distance, original_signal)
            resampled[signal_name] = resampled_signal

        if source_time is not None and len(source_time) == len(lap_distance):
            resampled["__time_s__"] = np.interp(new_distance, lap_distance, source_time)

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
