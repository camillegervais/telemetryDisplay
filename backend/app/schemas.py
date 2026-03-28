from typing import Literal

from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    status: Literal["ok"]


class AppInfoResponse(BaseModel):
    name: str = Field(description="Application name")
    version: str = Field(description="Application version")
    reference_distance_step_m: float = Field(
        description="Spatial reference step used by the app"
    )
