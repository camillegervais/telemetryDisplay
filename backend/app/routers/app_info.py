from fastapi import APIRouter

from app.config import config
from app.schemas import AppInfoResponse

router = APIRouter(prefix="/api", tags=["app"])


@router.get("/app-info", response_model=AppInfoResponse)
def get_app_info() -> AppInfoResponse:
    return AppInfoResponse(
        name="Telemetry Display",
        version="0.1.0",
        reference_distance_step_m=config.reference_distance_step_m,
    )
