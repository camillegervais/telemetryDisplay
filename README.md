# telemetryDisplay

Scalable baseline for a racing telemetry web application.

## Project structure

- `backend/`: FastAPI API
- `frontend/`: React + Vite UI
- `data/`: input and demo data
- `docs/`: format and conventions

## Phase 1 & 2 status

### Phase 1
- Backend scaffold with:
  - `GET /api/health`
  - `GET /api/app-info` (includes reference spatial step)
- Frontend telemetry-style dashboard scaffold:
  - import panel with spatial step display
  - signals workspace placeholders
  - track map placeholder
- Spatial sampling convention documented in `docs/MAT_FORMAT.md`

### Phase 2 (implemented)
- **MAT loader service** (`backend/app/services/mat_loader.py`) with:
  - .mat file validation (mandatory `lap_distance`, signals, spatial step)
  - Source spatial step detection (from `distance_step_m` or median delta)
  - Full normalization to reference step via **linear interpolation** (numpy.interp)
  - Metadata tracking (source step, normalized step, enrichment factor, signal names)

- **Dataset API endpoints**:
  - `POST /api/datasets/import` — upload .mat, get dataset_id
  - `GET /api/datasets/{dataset_id}/metadata` — signal list, distance range, steps, interpolation method
  - `POST /api/datasets/{dataset_id}/query` — fetch signals with distance range and max_points decimation
  - `GET /api/datasets/{dataset_id}/trackmap` — track coordinates

- **Data generation utilities**:
  - `backend/scripts/generate_losail_data.py` — generate Losail telemetry dataset (uses real FastF1 circuit data)
  - `backend/scripts/generate_demo_data.py` — generic synthetic demo data
  - `backend/app/utils/circuit.py` — reusable circuit fetcher (FastF1 + synthetic fallback)

- **Demo data available**:
  - `data/losail.mat` — 2000 samples, Losail circuit, 5400m lap, 2.7m spatial step (fetched via FastF1)
  - `data/losail_track.csv` — real Losail track coordinates from FastF1

## Run backend

1. `cd backend`
2. `python -m venv .venv`
3. Activate virtual environment
4. `pip install -r requirements.txt`
5. **Generate demo data** (choose one):
   - Losail with real circuit coordinates (requires FastF1): `python scripts/generate_losail_data.py`
   - Generic demo data: `python scripts/generate_demo_data.py`
6. `uvicorn app.main:app --reload --port 8001`

Data files are saved to `data/` directory.

## Run frontend

1. `cd frontend`
2. `npm install`
3. `npm run dev`

Frontend runs on `http://localhost:5173` and expects API on `http://localhost:8001`.

## Single-command dev startup (frontend + backend)

From repository root:

1. Ensure backend venv exists at `.venv/` (already used in project workflows).
2. Install backend runtime dependencies in this venv: `.venv/Scripts/python.exe -m pip install -r backend/requirements-runtime.txt`
3. Install root tooling once: `npm install`
4. Start both services: `npm run dev`

Optional for data-generation scripts using FastF1:
- `.venv/Scripts/python.exe -m pip install -r backend/requirements.txt`

This starts:
- Backend on `http://localhost:8001`
- Frontend on `http://localhost:5173`
