import logging
import sys

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import app_info, datasets, health, map_tuning

# Configure logging to console
logging.basicConfig(
    level=logging.DEBUG,
    format="%(levelname)s:%(name)s:%(message)s",
    stream=sys.stdout,
)

app = FastAPI(title="Telemetry Display API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(app_info.router)
app.include_router(datasets.router)
app.include_router(map_tuning.router)
