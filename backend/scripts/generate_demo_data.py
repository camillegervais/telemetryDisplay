from pathlib import Path

import numpy as np
from scipy.io import savemat


def build_demo_dataset(num_points: int = 2000) -> dict[str, np.ndarray]:
    lap_distance = np.linspace(0.0, 7000.0, num_points)
    distance_step_m = np.array([float(np.median(np.diff(lap_distance)))])

    speed_kmh = 180 + 40 * np.sin(lap_distance / 350)
    engine_rpm = 8500 + 2000 * np.sin(lap_distance / 200)
    throttle_percent = np.clip(65 + 35 * np.sin(lap_distance / 180), 0, 100)
    brake_percent = np.clip(30 * np.sin(lap_distance / 120 + 1.2), 0, 100)
    gear = np.clip(np.round(4 + 2 * np.sin(lap_distance / 500)), 1, 8)
    fuel_pressure_bar = 4.3 + 0.3 * np.sin(lap_distance / 130)
    coolant_temp_c = 92 + 4 * np.sin(lap_distance / 900)
    steering_angle_deg = 8 * np.sin(lap_distance / 70)

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


def build_track_csv(track_path: Path, lap_distance: np.ndarray) -> None:
    angle = (lap_distance / lap_distance.max()) * 2 * np.pi
    radius = 100 + 10 * np.sin(3 * angle)
    x = radius * np.cos(angle)
    y = 0.7 * radius * np.sin(angle)

    data = np.column_stack((lap_distance, x, y))
    header = "lap_distance,x_position,y_position"
    np.savetxt(track_path, data, delimiter=",", header=header, comments="")


def main() -> None:
    repo_root = Path(__file__).resolve().parents[2]
    data_dir = repo_root / "data"
    data_dir.mkdir(parents=True, exist_ok=True)

    dataset = build_demo_dataset()
    savemat(str(data_dir / "demo.mat"), dataset)
    build_track_csv(data_dir / "track_layout.csv", dataset["lap_distance"])

    print("Generated demo files:")
    print(f"- {data_dir / 'demo.mat'}")
    print(f"- {data_dir / 'track_layout.csv'}")


if __name__ == "__main__":
    main()
