"""
Generate telemetry demo data for Losail circuit using FastF1.
Falls back to synthetic data if FastF1 is unavailable.
"""

import sys
from pathlib import Path
from typing import Dict

import numpy as np
from scipy.io import savemat

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.utils.circuit import fetch_circuit_coordinates, generate_synthetic_circuit


def build_losail_dataset(
    num_points: int = 2000, circuit_name: str = "Losail"
) -> Dict[str, np.ndarray]:
    """
    Build a telemetry dataset indexed by lap distance,
    with realistic signal values for Losail circuit.

    Args:
        num_points: number of sampled points along the lap
        circuit_name: track name (e.g., "Losail")

    Returns:
        Dictionary with lap_distance and signal variables
    """
    lap_distance = np.linspace(0.0, 5400.0, num_points)  # Losail ~5.4 km
    distance_step_m = np.array([float(np.median(np.diff(lap_distance)))])

    # Losail is a street circuit with long straights and technical corners
    # Adjust signal profiles to match circuit characteristics

    # Long straights -> higher top speeds
    speed_kmh = 200 + 50 * np.sin(lap_distance / 400) + 20 * np.sin(lap_distance / 1200)

    # High downforce circuit -> elevated RPM
    engine_rpm = 9000 + 2500 * np.sin(lap_distance / 250)

    # Aggressive acceleration on straights
    throttle_percent = np.clip(
        70 + 30 * np.exp(-(((lap_distance % 500) - 250) ** 2) / 10000), 0, 100
    )

    # Braking zones before corners
    brake_percent = np.clip(40 * np.exp(-(((lap_distance % 500)) ** 2) / 15000), 0, 100)

    # Gear selection follows circuit rhythm
    gear = np.clip(np.round(3 + 3 * np.sin(lap_distance / 300)), 1, 8)

    # Fuel pressure steady
    fuel_pressure_bar = 4.5 + 0.2 * np.sin(lap_distance / 500)

    # Temperature management important
    coolant_temp_c = 95 + 5 * np.sin(lap_distance / 1000)

    # Aggressive steering on technical sections
    steering_angle_deg = 12 * np.sin(lap_distance / 100) + 4 * np.cos(lap_distance / 300)

    return {
        "lap_distance": lap_distance,
        "distance_step_m": distance_step_m,
        "speed_kmh": speed_kmh,
        "engine_rpm": engine_rpm,
        "throttle_percent": throttle_percent,
        "brake_percent": brake_percent,
        "gear": gear,
        "fuel_pressure_bar": fuel_pressure_bar,
        "coolant_temp_c": coolant_temp_c,
        "steering_angle_deg": steering_angle_deg,
    }


def build_track_csv(
    track_path: Path, lap_distance: np.ndarray, circuit_name: str = "Losail"
) -> None:
    """
    Save track layout to CSV.
    Prioritizes real data from FastF1, falls back to synthetic generation.

    Args:
        track_path: output CSV path
        lap_distance: array of distances along lap
        circuit_name: circuit identifier
    """
    # Try to fetch real circuit data
    coords = fetch_circuit_coordinates(circuit_name)

    if coords is None:
        # Fallback to synthetic generation
        print(f"Using synthetic circuit for {circuit_name}")
        x, y = generate_synthetic_circuit(lap_distance)
    else:
        # Interpolate real coordinates to match lap_distance grid
        print(f"Using real circuit coordinates for {circuit_name}")
        real_distance = np.linspace(0, lap_distance.max(), coords.shape[0])
        x = np.interp(lap_distance, real_distance, coords[:, 0])
        y = np.interp(lap_distance, real_distance, coords[:, 1])

    data = np.column_stack((lap_distance, x, y))
    header = "lap_distance,x_position,y_position"
    np.savetxt(track_path, data, delimiter=",", header=header, comments="")


def main() -> None:
    """Generate Losail demo dataset and save to data/ directory."""
    repo_root = Path(__file__).resolve().parents[2]
    data_dir = repo_root / "data"
    data_dir.mkdir(parents=True, exist_ok=True)

    print("Generating Losail telemetry dataset...")

    # Build dataset
    dataset = build_losail_dataset(num_points=2000, circuit_name="Losail")

    # Save .mat file
    mat_path = data_dir / "losail.mat"
    savemat(str(mat_path), dataset)
    print(f"✓ Saved {mat_path}")

    # Save track layout
    track_path = data_dir / "losail_track.csv"
    build_track_csv(track_path, dataset["lap_distance"], circuit_name="Losail")
    print(f"✓ Saved {track_path}")

    print("\nDataset summary:")
    print(f"  Lap distance: 0 - {dataset['lap_distance'][-1]:.1f} m")
    print(f"  Spatial step: {dataset['distance_step_m'][0]:.2f} m")
    print(f"  Points: {len(dataset['lap_distance'])}")


if __name__ == "__main__":
    main()
