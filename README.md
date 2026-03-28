# telemetryDisplay

Scalable baseline for a racing telemetry web application.

## Project structure

- `backend/`: FastAPI API
- `frontend/`: React + Vite UI
- `data/`: input and demo data
- `docs/`: format and conventions

## Phase 1 status

- Backend scaffold with:
	- `GET /api/health`
	- `GET /api/app-info`
	- datasets placeholder router
- Frontend telemetry-style dashboard scaffold:
	- import panel
	- signals workspace placeholders
	- track map placeholder
- Spatial sampling convention documented in `docs/MAT_FORMAT.md`

## Run backend

1. `cd backend`
2. `python -m venv .venv`
3. Activate virtual environment
4. `pip install -r requirements.txt`
5. Optional: `python scripts/generate_demo_data.py`
6. `uvicorn app.main:app --reload --port 8000`

## Run frontend

1. `cd frontend`
2. `npm install`
3. `npm run dev`

Frontend runs on `http://localhost:5173` and expects API on `http://localhost:8000`.
