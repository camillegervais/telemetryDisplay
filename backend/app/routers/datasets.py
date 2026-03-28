from fastapi import APIRouter

router = APIRouter(prefix="/api/datasets", tags=["datasets"])


@router.get("/placeholder")
def datasets_placeholder() -> dict[str, str]:
    # This endpoint will be replaced by import/query endpoints in phase 2.
    return {"message": "datasets endpoints will be added in phase 2"}
