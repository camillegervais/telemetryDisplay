from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import app_info, datasets, health

app = FastAPI(title="Telemetry Display API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(app_info.router)
app.include_router(datasets.router)
