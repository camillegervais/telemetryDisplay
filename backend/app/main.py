from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import db
from app.routers import app_info, datasets, health, map_tuning, teldata


@asynccontextmanager
async def lifespan(app: FastAPI):
    db.init_db()
    db.cleanup_old_imports(max_age_days=14)
    yield


app = FastAPI(title="Map Replay API", version="0.1.0", lifespan=lifespan)

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
app.include_router(teldata.router)
