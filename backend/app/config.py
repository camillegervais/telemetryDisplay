from pydantic import BaseModel


class AppConfig(BaseModel):
    # Spatial sampling reference in meters between two points.
    reference_distance_step_m: float = 1.0
    min_distance_step_m: float = 0.01
    max_distance_step_m: float = 20.0


config = AppConfig()
