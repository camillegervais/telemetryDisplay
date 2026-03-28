"""
Circuit data utilities using FastF1 to fetch real racing track coordinates.
"""

from pathlib import Path
from typing import Optional

import numpy as np

# fastf1 is optional; gracefully handle missing dependency
try:
    import fastf1
except ImportError:
    fastf1 = None


def fetch_circuit_coordinates(circuit_name: str, year: int = 2024) -> Optional[np.ndarray]:
    """
    Fetch circuit coordinates from FastF1.

    Args:
        circuit_name: e.g., "Losail", "Monaco", "Silverstone"
        year: F1 season year

    Returns:
        Array of shape (n_points, 2) with [x, y] coordinates, or None if FastF1 not installed.
    """
    if fastf1 is None:
        return None

    try:
        session = fastf1.get_session(year, circuit_name, "FP1")
        session.load()

        # Extract telemetry from a representative full lap.
        # Using quick laps avoids out-laps/in-laps that often leave a large gap.
        driver = session.drivers[0]
        laps = session.laps.pick_driver(driver).pick_quicklaps()

        if len(laps) == 0:
            # Fallback if quicklap filtering is too strict for the session.
            laps = session.laps.pick_driver(driver)

        if len(laps) == 0:
            return None

        # Prefer the shortest valid lap first.
        lap_candidates = laps.sort_values(by="LapTime", na_position="last")

        for _, lap in lap_candidates.iterrows():
            telemetry = lap.get_telemetry()
            if telemetry.empty or "X" not in telemetry or "Y" not in telemetry:
                continue

            x = telemetry["X"].to_numpy(dtype=float)
            y = telemetry["Y"].to_numpy(dtype=float)
            finite_mask = np.isfinite(x) & np.isfinite(y)
            x = x[finite_mask]
            y = y[finite_mask]

            if x.size < 10:
                continue

            return np.column_stack((x, y))

        return None
    except Exception as e:
        print(f"FastF1 fetch failed for {circuit_name}: {e}")
        return None


def generate_synthetic_circuit(lap_distance: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """
    Generate synthetic circuit coordinates for demo/fallback.

    Args:
        lap_distance: array of distances along the lap

    Returns:
        Tuple of (x_coords, y_coords)
    """
    angle = (lap_distance / lap_distance.max()) * 2 * np.pi
    radius = 500 + 50 * np.sin(3 * angle)  # Varying radius for realistic track shape
    x = radius * np.cos(angle) + 100 * np.sin(2 * angle)
    y = 0.8 * radius * np.sin(angle) + 150 * np.cos(2 * angle)

    return x, y
