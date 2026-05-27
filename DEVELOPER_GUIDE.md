# Developer Guide - Telemetry Display

Guide complet pour les développeurs reprenant l'application **Telemetry Display**. Couvre l'architecture, les patterns, la structure du projet et les fonctionnalités implémentées.

---

## Table des matières

1. [Vue d'ensemble](#vue-densemble)
2. [Architecture globale](#architecture-globale)
3. [Prérequis et installation](#prérequis-et-installation)
4. [Démarrage du projet](#démarrage-du-projet)
5. [Structure du projet](#structure-du-projet)
6. [Backend - API FastAPI](#backend---api-fastapi)
7. [Frontend - React + Vite](#frontend---react--vite)
8. [Patterns et conventions](#patterns-et-conventions)
9. [Fonctionnalités détaillées](#fonctionnalités-détaillées)
10. [Flux de données](#flux-de-données)
11. [Synchronisation cross-tab](#synchronisation-cross-tab)
12. [Points importants à connaître](#points-importants-à-connaître)

---

## Vue d'ensemble

**Telemetry Display** est une application web légère pour visualiser et analyser les données de télémétrie sur des simulations ou des données de course.

### Cas d'usage
- **Importation de données MAT** depuis simulations (Simulink), WinTAX ou données de course
- **Dashboard interactif** avec graphiques multiples (séries temporelles, XY)
- **Canaux mathématiques personnalisés** via expressions mathématiques
- **Maps de tuning 2D** avec lookup tables éditables
- **Émulation de blocs logiciels** pour visualiser les effets des changements de carto
- **Synchronisation multi-tabs** pour travailler combiner les visuels
- **Sauvegarde/restauration** de configurations complètes

### Technologies clés
- **Backend**: FastAPI (Python 3.14+), SQLite
- **Frontend**: React 19.2, TypeScript, Vite, Zustand
- **Stockage**: localStorage, SQLite
- **Format d'entrée**: Fichiers MATLAB `.mat`

---

## Conditions de développement

La quantité importante de code rend parfois l'ajout de fonctionnalités compliqués, l'ajout de ces fonctions peut endommager certains fonctionnalités de fond (cross tabs par exemple). Pour aider le développeur dans l'ajout de fonctionnalités, des scripts d'agents sont fournis. Ils ont les règles de développement sur ces fonctionnalités de fond et permettent d'assurer une bonne qualité de code.

## Architecture globale

```
┌─────────────────────────────────────────────────────────┐
│                    Telemetry Display                    │
├──────────────────┬──────────────────┬───────────────────┤
│   Frontend       │   Communication  │   Backend         │
│   (React)        │   (HTTP/REST)    │   (FastAPI)       │
│                  │                  │                   │
│ • Components     │ • API endpoints  │ • Import MAT      │
│ • Hooks          │ • JSON/Binary    │ • Map tuning      │
│ • ConfigManager  │                  │ • Computations    │
│ • Store (Zustand)│                  │ • DB SQLite       │
└──────────────────┴──────────────────┴───────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│ localStorage (ConfigManager + Zustand state)            │
│ • Configurations (layouts, colors, etc.)                │
│ • Métadonnées (dataset-id, préférences, etc.)           │
└─────────────────────────────────────────────────────────┘
```

### Communication Frontend ↔ Backend

Le frontend utilise une **API REST** définie dans [api.ts](./frontend/src/api.ts):

| Fonction | Méthode | Endpoint | Usage |
|----------|---------|----------|-------|
| `fetchAppInfo()` | GET | `/app-info` | Info app et config globale |
| `fetchDatasetMetadata()` | GET | `/datasets/{id}/metadata` | Métadonnées du dataset |
| `fetchDataset()` | GET | `/datasets/{id}/data` | Données signal brutes |
| `importDataset()` | POST | `/datasets/import` | Import fichier MAT |
| `importDatasetFromPath()` | POST | `/datasets/import-from-path` | Import via chemin |
| `fetchTrackMap()` | GET | `/datasets/{id}/trackmap` | Géométrie piste |
| `calculateLUT()` | POST | `/map-tuning/calculate` | Calcul lookup table |
| `saveLUT()` | POST | `/map-tuning/save` | Sauvegarde map config |
| `computeMathChannel()` | POST | `/math/compute` | Calcul canal personnalisé |

---

## Prérequis et installation

### Prérequis système

```bash
# Python 3.14+
python --version  # => Python 3.14.x

# Node.js (LTS recommandé)
node --version    # => v20.x ou v22.x
npm --version     # => npm 10+
```

### Installation complète

#### 1. Backend

```bash
cd backend
python -m venv .venv

# Windows
.venv\Scripts\activate
# ou Linux/Mac
source .venv/bin/activate

pip install -r requirements.txt
```

#### 2. Frontend

```bash
cd frontend
npm install
```

#### 3. Dépendances globales (lanceur)

```bash
cd telemetryDisplay  # racine du projet
npm install
```

---

## Démarrage du projet

### Option 1 : Mode développement complet (Recommandé)

Depuis la **racine du projet**:

```bash
npm run dev
```

Cela lance:
- **Backend** sur `http://localhost:8001`
- **Frontend** sur `http://localhost:5173`

Les deux sortie logs apparaissent dans la même fenêtre (backend en vert, frontend en cyan).

### Option 2 : Lancer séparément

#### Backend seul
```bash
cd backend
source .venv/bin/activate  # ou .venv\Scripts\activate
uvicorn app.main:app --reload --port 8001
```

#### Frontend seul
```bash
cd frontend
npm run dev
```

### Option 3 : Script shell

Utilisez le script `Telemetry Display.sh` depuis la racine:

```bash
./Telemetry\ Display.sh
```

> **Note**: Pour Windows, créez un raccourci pointant vers ce script pour lancer facilement l'application.

---

## Structure du projet

```
telemetryDisplay/
├── backend/                                    # API FastAPI
│   ├── app/
│   │   ├── main.py                             # Initialisation FastAPI, routers
│   │   ├── config.py                           # Configuration app
│   │   ├── schemas.py                          # Schémas Pydantic (requêtes/réponses)
│   │   ├── db.py                               # Gestion SQLite
│   │   ├── routers/                            # Endpoints organisés par domaine
│   │   │   ├── datasets.py                     # Import/requête de données
│   │   │   ├── map_tuning.py                   # Lookup table 2D
│   │   │   ├── teldata.py                      # Imports TelData
│   │   │   ├── health.py                       # Health check
│   │   │   └── app_info.py                     # Info application
│   │   ├── services/                           # Logique métier
│   │   │   ├── mat_loader.py                   # Parser fichiers .mat
│   │   │   ├── lut_2D.py                       # Calculs lookup table
│   │   │   └── teldata_bridge.py               # Intégration TelData
│   │   └── utils/                              # Utilitaires
│   ├── requirements.txt                        # Dépendances Python
│   └── requirements-runtime.txt
│
├── frontend/                                   # Interface React + Vite
│   ├── src/
│   │   ├── main.tsx                            # Point d'entrée React
│   │   ├── App.tsx                             # Composant principal
│   │   ├── api.ts                              # Client API (fetch)
│   │   ├── types.ts                            # Types globaux
│   │   ├── mathChannels.ts                     # Parseur expressions math
│   │   ├── mathFunctions.ts                    # Fonctions mathématiques dispo
│   │   ├── components/                         # Composants React
│   │   │   ├── ImportPanel.tsx                 # Import données, gestion configs
│   │   │   ├── SignalWorkspace.tsx             # Dashboard multi-graphs
│   │   │   ├── MapTuning.tsx                   # Éditeur lookup table
│   │   │   ├── SignalColorManager.tsx          # Gestion couleurs signaux
│   │   │   ├── TrackMapPanel.tsx               # Visualisation piste
│   │   │   ├── ConfigExportImport.tsx          # Sauvegarde configs
│   │   │   ├── ImportDataModal.tsx             # Modal import MAT
│   │   │   ├── TelDataImportModal.tsx          # Modal import TelData
│   │   │   └── index.ts                        # Exports
│   │   ├── hooks/                              # Custom React hooks
│   │   │   ├── useConfig.ts                    # Lecture/écriture ConfigManager
│   │   │   ├── useConfigValue.ts               # Bidirectionnel avec debounce
│   │   │   ├── useHoverToLutCell.ts            # Hover surbrillance cells
│   │   │   └── (autres hooks)
│   │   ├── store/                              # État global
│   │   │   ├── ConfigManager.ts                # Singleton localStorage + subscribers
│   │   │   ├── telemetryStore.ts               # Zustand store (données)
│   │   │   ├── lutHighlightStore.ts            # Store surbrillance LUT
│   │   │   └── useConfigValue.ts               # Hook custom
│   │   ├── types/                              # Types TypeScript
│   │   │   ├── ConfigTypes.ts                  # Types ConfigManager
│   │   │   ├── types.ts                        # Types app
│   │   │   └── (autres types)
│   │   ├── utils/                              # Utilitaires
│   │   └── styles.css                          # Styles globaux
│   ├── public/                                 # Assets statiques
│   ├── index.html                              # HTML template
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│
├── data/                                       # Données d'exemple
│   ├── *.csv                                   # Données de test (Imola, Spa, etc.)
│   ├── import_cache/                           # Cache fichiers importés
│   └── imports.db                              # DB SQLite (créée au runtime)
│
├── docs/                                       # Documentation
│   ├── CROSS_TAB_SYNC_AGENT.md                 # Règles synchronisation cross-tab
│   ├── MAT_FORMAT.md                           # Convention format fichiers .mat
│   └── example/
│       └── EXAMPLE_USAGE.ts                    # Exemple d'utilisation API
│
├── resources/                                  # Ressources supplémentaires
│   ├── python-3.14.5-amd64.exe                 # Installeur Python (Windows)
│   ├── Sample_Python.py
│   ├── test.py
│   └── output.mat
│
├── package.json                                # NPM root (lance dev concurrente)
├── tsconfig.json
├── vite.config.ts
├── README.md                                   # Guide utilisateur
├── USER_GUIDE.md                               # Guide fonctionnel détaillé
├── DEVELOPER_GUIDE.md                          # Ce fichier
├── requirements.txt                            # Dépendances Python globales
└── Telemetry Display.sh                        # Script lancement global
```

---

## Backend - API FastAPI

### Architecture

Le backend est structuré en **couches** :

1. **`main.py`** - Initialisation FastAPI, middleware CORS, lifespan (startup/shutdown)
2. **`routers/`** - Points d'entrée HTTP (endpoints)
3. **`services/`** - Logique métier (parsers MAT, calculs LUT, etc.)
4. **`db.py`** - Persistance SQLite (métadonnées imports)
5. **`config.py`** - Configuration applicative
6. **`schemas.py`** - Schémas Pydantic (validation requêtes/réponses)

### Flux principal d'import MAT

```
User POST /datasets/import {file}
    ↓
[datasets.py] import_dataset()
    ├─ Valide le fichier MAT
    ├─ Charge via mat_loader.py
    ├─ Génère dataset_id unique
    ├─ Stocke métadonnées en SQLite
    └─ Retourne DatasetMetadataResponse

User GET /datasets/{id}/metadata
    ├─ Lit metadonnées SQLite
    └─ Retourne liste signaux + pas d'échantillonnage

User GET /datasets/{id}/data?signals=[...]&max_points=500
    ├─ Charge données du MAT en cache
    ├─ Décime si nécessaire (max_points)
    └─ Retourne signaux + lap_distance
```

### Fichiers clés du backend

#### `backend/app/main.py`
```python
# Initialisation FastAPI avec lifespan
app = FastAPI(title="Telemetry Display API", version="0.1.0", lifespan=lifespan)

# CORS ouvert pour localhost:5173 (frontend dev)
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173"], ...)

# Routers inclus
app.include_router(health.router)
app.include_router(datasets.router)
app.include_router(map_tuning.router)
# etc.
```

**Lifespan (startup/shutdown)**:
- `db.init_db()` - Crée tables SQLite
- `db.cleanup_old_imports(max_age_days=14)` - Nettoie imports anciens

#### `backend/app/routers/datasets.py`

| Endpoint | Méthode | Fonction |
|----------|---------|----------|
| `/datasets/import` | POST | Importer fichier MAT uploadé |
| `/datasets/import-from-path` | POST | Importer MAT via chemin serveur |
| `/datasets/{id}/metadata` | GET | Métadonnées (pas de données) |
| `/datasets/{id}/data` | GET | Signaux + lap_distance |
| `/datasets/{id}/trackmap` | GET | Géométrie piste (x, y, lap_distance) |

#### `backend/app/routers/map_tuning.py`

| Endpoint | Méthode | Fonction |
|----------|---------|----------|
| `/map-tuning/save` | POST | Sauvegarder lookup table |
| `/map-tuning/calculate` | POST | Calcul signal output via LUT |

#### `backend/app/services/mat_loader.py`

Parse fichiers MATLAB `.mat` selon la convention:

**Données obligatoires:**
- `lap_distance` - 1D array (m), monotone croissant
- Signaux nommés - même longueur que `lap_distance`

**Données optionnelles:**
- `distance_step_m` - pas spatial (m)
- `lap_time` - temps cumulé (s)

**Normalisation**:
- Rééchantillonnage à pas référence (`reference_distance_step_m`)
- Interpolation linéaire
- Méta: source step, normalized step, enrichment factor

#### `backend/app/db.py`

SQLite stocke **métadonnées** des imports (pas les données MAT):

```sql
CREATE TABLE recent_imports (
    import_id    TEXT PRIMARY KEY,      -- UUID
    dataset_id   TEXT,                  -- Clé référence
    source_path  TEXT NOT NULL,         -- Chemin fichier MAT
    imported_at  TEXT NOT NULL,         -- Timestamp ISO
    file_size    INTEGER,               -- Bytes
    signal_count INTEGER,               -- Nb signaux
    dataset_name TEXT                   -- Nom affichage
)
```

### Configuration

[backend/app/config.py](./backend/app/config.py):

```python
class AppConfig(BaseModel):
    reference_distance_step_m: float = 0.3  # Pas spatial de référence (m)
    min_distance_step_m: float = 0.01
    max_distance_step_m: float = 20.0
```

### Schémas Pydantic

Voir [backend/app/schemas.py](./backend/app/schemas.py) pour tous les modèles.

Exemples clés:

```python
# Requête import
class DatasetImportRequest(BaseModel):
    # file: UploadFile (dans POST multi-part)
    pass

# Réponse métadonnées
class DatasetMetadataResponse(BaseModel):
    dataset_id: str
    source_path: str
    source_distance_step_m: float
    normalized_distance_step_m: float
    num_samples: int
    signal_names: List[str]
    has_time_axis: bool
    interpolation_method: str

# Requête données
class DatasetQueryRequest(BaseModel):
    signals: List[str]           # Signaux à retourner
    start_distance: float = 0.0
    end_distance: Optional[float] = None
    max_points: int = 500        # Décimation

# Réponse données
class DatasetQueryResponse(BaseModel):
    lap_distance: List[float]
    lap_time: Optional[List[float]]
    signals: Dict[str, List[float]]
    decimation_factor: int
```

---

## Frontend - React + Vite

### Architecture

Le frontend utilise:

- **React 19.2** avec hooks (useState, useEffect, useRef, useContext)
- **TypeScript** pour la sécurité des types
- **Vite** pour dev server rapide + build
- **Zustand** pour état réactif (telemetry data)
- **ConfigManager singleton** pour localStorage + subscribers

### État global

#### 1. ConfigManager (localStorage)

Singleton qui manage **toute la configuration** persistée:

```typescript
// Lecture
const layouts = ConfigManager.get('layouts');

// Écriture
ConfigManager.set('dataset-id', 'abc123');

// Subscription (listener)
const unsubscribe = ConfigManager.subscribe('layouts', (newLayouts) => {
  console.log('Layouts changed:', newLayouts);
});
unsubscribe(); // cleanup
```

**Keys stockées** (voir [ConfigTypes.ts](./frontend/src/types/ConfigTypes.ts)):

| Key | Type | Owner | Description |
|-----|------|-------|-------------|
| `dataset-id` | string \| null | App.tsx | ID du dataset courant |
| `session` | WorkspaceSessionSnapshot | SignalWorkspace.tsx | Config onglets/grilles |
| `layouts` | LayoutsConfig | SignalWorkspace.tsx | Config graphes par tab |
| `soft-blocks` | SoftBlock[] | SignalWorkspace.tsx | Blocs logiciels |
| `map-configs` | Record<string, MapTuningData> | MapTuning.tsx | Maps lookup tables |
| `current-map-config` | string \| null | MapTuning.tsx | Clé map courante |
| `signal-colors` | Record<string, string> | SignalColorManager.tsx | Couleurs signaux |
| `current-hover-slap` | number \| null | SignalWorkspace.tsx | Hover cursor position |
| `user-preferences` | UserPreferences | App.tsx | Thème, langue, etc. |
| `teldata-configs` | TelDataConfig[] | ImportPanel.tsx | Configs TelData archives |
| `math-channels` | MathChannel[] | (global) | Canaux mathématiques |

#### 2. Zustand Store (telemetryStore)

État **réactif** pour les données volumineuses:

```typescript
const { datasets, currentDataset, addDataset, setCurrentDataset } = useTelemetryStore();
```

Contient:
- `datasets` - Cache des MAT importés
- `currentDataset` - Dataset actif
- Données traitées (signaux normalisés, LUT output, etc.)

### Hooks patterns

#### `useConfig(key)`

Hook simple pour ConfigManager:

```typescript
const [layouts, setLayouts] = useConfig('layouts');

// Automatiquement synced avec ConfigManager + autres tabs
setLayouts(newLayouts); // Sauvegarde + notifie abonnés
```

**⚠️ Limitation**: Pas de debounce. À éviter pour writes rapides.

#### `useConfigValue(key, compare, debounceMs)`

Hook avancé avec **debounce bidirectionnel**:

```typescript
const [softBlocks, setSoftBlocks] = useConfigValue(
  'soft-blocks',
  (a, b) => JSON.stringify(a) === JSON.stringify(b),
  150  // debounce ms
);

setSoftBlocks(newBlocks);  // Debounce 150ms avant écriture
```

**Patterns:**
- Write: Debounced
- Read (cross-tab): Debounced
- Comparison: Custom function ou JSON.stringify

#### Custom hooks

Exemples:
- `useHoverToLutCell()` - Position cursor hover pour LUT
- `useDatasetMetadata(datasetId)` - Fetch métadonnées (memoized)

### Composants principaux

#### `App.tsx`

Composant racine:

1. Initialise état global (dataset-id, user-preferences)
2. Montage composants principaux (ImportPanel, SignalWorkspace)
3. Listen cross-tab dataset changes (debounce 300ms)
4. Fetch métadonnées + track map au changement dataset

#### `ImportPanel.tsx`

Panneau gauche:

1. **Onglet Import Data**:
   - Modal import MAT (file picker ou chemin)
   - Récents (derniers 15 imports)
   - TelData archive import
   
2. **Gestion couleurs signaux**:
   - Mapper signal name → couleur
   - Color picker (debounce 150ms)

3. **Gestion configurations**:
   - Charger/sauver configurations map-tuning
   - CRUD teldata-configs

#### `SignalWorkspace.tsx`

Workspace principal:

1. **Système d'onglets** (tabs):
   - Multi-tab dashboard
   - Chaque tab = grille de graphes indépendante
   - Session persistée via ConfigManager

2. **Création/gestion graphes**:
   - Drag-drop signaux → crée graphs
   - Édition propriétés graph (min/max Y, légende, etc.)
   - Suppression graphs

3. **Interaction**:
   - Zoom (click-drag)
   - Hover synced (cursor sur tous graphs)
   - Filtrage signaux (click légende)

4. **Soft Blocks** (blocs logiciels):
   - Éditeur de blocs (équations, LUT inputs)
   - Calcul auto signals output
   - UI d'édition par type bloc

5. **Synchronisation cross-tab**:
   - Session: debounce 150ms both ways
   - Layouts: immediate save, debounce 150ms read
   - Soft blocks: debounce 150ms both ways
   - Map configs: non-debounced subscribe, calcul 250ms debounced

#### `MapTuning.tsx`

Éditeur lookup table 2D:

1. **Chargement configuration**:
   - Dropdown configs sauvegardées
   - Load → remplir grid + paramètres

2. **Édition grid**:
   - Édition cellules (textinput)
   - Validation nombres
   - Auto-save (debounce 150ms) ⚠️ Voir [CROSS_TAB_SYNC_AGENT.md](./docs/CROSS_TAB_SYNC_AGENT.md)

3. **Sauvegarde**:
   - Save button → modal confirmation nom
   - Sauvegarde configs persistées

#### `SignalColorManager.tsx`

Mini-composant gestion couleurs:

- Color picker par signal
- Debounce 150ms sur changement couleur
- Persisted dans ConfigManager

#### `TrackMapPanel.tsx`

Affichage géométrie piste:

- Charge piste via `/datasets/{id}/trackmap`
- Affiche trace X/Y
- Hover cursor synced avec graphs SignalWorkspace

### Utilities

#### `mathChannels.ts`

Parser expressions mathématiques:

```typescript
const expr = "sqrt(gLong^2 + gLat^2)";
const compiled = compileMathExpression(expr);
const result = evaluateExpression(compiled, { gLong: 5, gLat: 3 });
// => ~5.83
```

Supporte:
- Opérateurs: `+`, `-`, `*`, `/`, `^` (puissance)
- Fonctions: `sqrt()`, `abs()`, `sin()`, `cos()`, `log()`, etc.
- Variables: noms signaux

#### `mathFunctions.ts`

Librairie fonction mathématiques disponibles:

```typescript
const MATH_FUNCTIONS = {
  sqrt: (x) => Math.sqrt(x),
  abs: (x) => Math.abs(x),
  sin: (x) => Math.sin(x),
  // etc. 10+ fonctions
};
```

### Types

[frontend/src/types.ts](./frontend/src/types.ts) et [ConfigTypes.ts](./frontend/src/types/ConfigTypes.ts):

```typescript
// Dataset
interface DatasetMetadata {
  dataset_id: string;
  source_path: string;
  source_distance_step_m: number;
  normalized_distance_step_m: number;
  num_samples: number;
  signal_names: string[];
  source_sample_rate_hz?: number;
  has_time_axis: boolean;
  interpolation_method: string;
  enrichment_factor: number;
}

// Graph
interface GraphDefinition {
  id: string;
  type: 'time-series' | 'xy';
  signals: string[];  // Noms signaux
  title?: string;
  xAxisLabel?: string;
  yAxisLabel?: string;
  minY?: number;
  maxY?: number;
}

// Soft Block
interface SoftBlock {
  id: string;
  name: string;
  type: 'linear' | 'lut1d' | 'lut2d' | 'math-channel';
  // ... autres propriétés selon type
}

// Map Tuning
interface MapTuningData {
  inputChannelX: string;
  inputChannelY: string;
  outputChannelName: string;
  gridData: number[][];  // LUT grid
  rowHeaders: number[];
  colHeaders: number[];
  gainVal: number;
  offsetVal: number;
  interpolation: 'linear' | 'nearest';
  extrapolation: 'clamp' | 'extend';
}

// Math Channel
interface MathChannel {
  id: string;
  name: string;
  expression: string;  // "sqrt(gLong^2 + gLat^2)"
  enabled: boolean;
}
```

---

## Patterns et conventions

### 1. Synchronisation ConfigManager

**Règle clé**: Toute opération rapide (input, drag, mousemove) **DOIT** être debounced.

```typescript
// ❌ MAUVAIS - Overwrites cross-tab
const handleColorChange = (color: string) => {
  ConfigManager.set('signal-colors', { ...colors, [signal]: color });
};

// ✅ BON - Debounced
const timerRef = useRef<NodeJS.Timeout | null>(null);

const handleColorChange = (color: string) => {
  if (timerRef.current) clearTimeout(timerRef.current);
  timerRef.current = setTimeout(() => {
    ConfigManager.set('signal-colors', { ...colors, [signal]: color });
  }, 150);
};
```

Voir [CROSS_TAB_SYNC_AGENT.md](./docs/CROSS_TAB_SYNC_AGENT.md) pour règles complètes.

### 2. Hooks custom

Pattern standard:

```typescript
// Custom hook pour feature X
export const useFeatureX = (param) => {
  const [state, setState] = useState(...);
  const ref = useRef(...);

  // Subscription effects avec deps vide
  useEffect(() => {
    const unsubscribe = ConfigManager.subscribe('key', (newVal) => {
      setState(newVal);
    });
    return () => unsubscribe();
  }, []); // Toujours vide!

  return { state, setState };
};
```

### 3. Composants et organisation

**Par domaine fonctionnel**:
- `ImportPanel.tsx` - Import + gestion configs
- `SignalWorkspace.tsx` - Dashboard workspace
- `MapTuning.tsx` - Éditeur LUT
- `TrackMapPanel.tsx` - Piste

Chaque composant gère son propre état ConfigManager.

### 4. API calls

Utilise le client API [api.ts](./frontend/src/api.ts):

```typescript
import { fetchDataset, calculateLUT } from './api';

const { data } = await fetchDataset(datasetId, { signals, max_points: 500 });
const output = await calculateLUT(mapRequest);
```

**Gestion erreurs**:
```typescript
try {
  const data = await fetchDataset(...);
} catch (error) {
  if (error instanceof TypeError) {
    // Network error
  } else if (error.response?.status === 404) {
    // Not found
  }
}
```

### 5. TypeScript strict

- Types explicites partout (pas d'`any`)
- Interfaces pour structures métier
- Literal types pour enums (`'linear' | 'nearest'`)
- Discriminated unions pour polymorphisme

---

## Fonctionnalités détaillées

### 1. Import de données MAT

**Flow:**

1. User click "IMPORTER DES DONNÉES"
2. Choisit fichier `.mat` ou chemin
3. Frontend POST `/datasets/import` ou `/datasets/import-from-path`
4. Backend:
   - Parse MAT via `mat_loader.py`
   - Valide format
   - Normalise signaux (rééchantillonnage)
   - Génère UUID dataset_id
   - Sauvegarde métadonnées SQLite
   - Retourne DatasetMetadataResponse
5. Frontend:
   - Stocke dataset_id dans ConfigManager
   - Affiche signaux dans liste
   - Fetch metadata + trackmap
   - Met à jour store Zustand

**Convention MAT** (voir [MAT_FORMAT.md](./docs/MAT_FORMAT.md)):

```matlab
% Obligatoire
lap_distance = [0.0, 0.3, 0.6, ..., 5000];  % 1D array monotone

% Signaux (même longueur)
rpm = [2000, 2100, 2200, ...];
throttle = [0.1, 0.15, 0.2, ...];
brake = [0.0, 0.0, 0.05, ...];
gLong = [0.1, 0.15, 0.12, ...];
gLat = [0.08, 0.1, 0.12, ...];
```

### 2. Création et gestion de graphes

**Onglets (tabs)**:

- Multi-tab dashboard (créer avec `+ TAB`)
- Chaque tab = grille de cellules indépendante
- Tab configuration persistée dans ConfigManager (`session` key)
- Changer dataset → tous graphs se mettent à jour automatiquement

**Drag-drop signaux**:

```
Drag "rpm" from signal list → Drop on empty cell
→ Crée time-series graph avec rpm

Drag "throttle" → Drop on même graph
→ Ajoute throttle à graph (même ou axe Y séparé)
```

**Zoom et pan**:

```
Click-drag sur graph → Zoom sur région
Double-click → Reset zoom
Hover → Crosshair + valeurs en temps réel
```

**Filtrage signaux**:

```
Click "rpm" dans légende → Cache rpm
Click "rpm" à nouveau → Affiche rpm
```

### 3. Canaux mathématiques (Math Channels)

Créer signaux personnalisés via expressions:

```
Expression: "sqrt(gLong^2 + gLat^2)"
→ Crée signal "lateral_g" = magnitude accélération lat + long

Expression: "rpm * 0.001"
→ Crée signal "rpm_thousands"

Expression: "if(throttle > 0.5, 100, 0)"
→ Logique conditionnelle (si throttle > 50%, affiche 100)
```

**Parser**:
- Tokenize expression
- Build AST
- Evaluate sur chaque sample

**Fonctions dispos** (voir [mathFunctions.ts](./frontend/src/mathFunctions.ts)):
- Arithmétique: `+`, `-`, `*`, `/`, `^`, `%`
- Trigonométrie: `sin`, `cos`, `tan`, `asin`, `acos`, `atan`
- Logarithme: `log`, `log10`, `ln`
- Racine: `sqrt`, `cbrt`
- Arrondi: `round`, `floor`, `ceil`
- Valeur abs: `abs`
- Min/max: `min`, `max`
- Constantes: `pi`, `e`

### 4. Maps de tuning 2D (Lookup Tables)

**Éditeur LUT**:

1. Sélectionner input channels X et Y
2. Éditer grid (lookup table 2D)
3. Configurer paramètres:
   - `gainVal`, `offsetVal` (post-traitement)
   - `interpolation` (linear / nearest)
   - `extrapolation` (clamp / extend)
4. Calculer signal output via `/map-tuning/calculate`
5. Visualiser signal généré
6. Sauvegarder configuration (nommée) ou exporter

**Backend LUT** ([services/lut_2D.py](./backend/app/services/lut_2D.py)):

```python
def interpolate_2d_lut(x, y, lut_grid, row_headers, col_headers, interp='linear'):
    """
    Lookup dans grid 2D:
    - x trouve colonne interpolée
    - y trouve ligne interpolée
    - Retourne valeur interpolée dans grid
    """
```

### 5. Blocs logiciels (Soft Blocks)

Émulation comportements logiciels du véhicule:

**Types de blocs**:

1. **Linear**: `output = gain * input + offset`
2. **LUT 1D**: Lookup table 1D
3. **LUT 2D**: Lookup table 2D (voir maps tuning)
4. **Math Channel**: Expression mathématique

**UI d'édition**:
- Choisir type bloc
- Configurer paramètres (inputs, grid, etc.)
- Auto-calcul signal output
- Visualisation

**Storage**:
- Persisté dans ConfigManager (`soft-blocks` key)
- Cross-tab sync avec debounce 150ms

### 6. Synchronisation multi-tabs

**Problématique**: Plusieurs onglets du navigateur ouverts → Changements dans Tab A doivent se refléter dans Tab B.

**Solution**: ConfigManager + StorageEvent listener

```typescript
// Tab A: Édite config
ConfigManager.set('layouts', newLayouts);
// → Stockage localStorage

// Navigateur: Déclenche StorageEvent
window.addEventListener('storage', (e) => {
  if (e.key === 'telemetry-display.config.layouts') {
    // Tab B: Reçoit notification
    ConfigManager.notifySubscribers('layouts', JSON.parse(e.newValue));
  }
});

// Tab B: Subscribers notifiés (debounced)
ConfigManager.subscribeDebouncedFull('layouts', (newLayouts) => {
  console.log('Layouts updated from other tab!', newLayouts);
}, 150);
```

**Règles importantes** (voir [CROSS_TAB_SYNC_AGENT.md](./docs/CROSS_TAB_SYNC_AGENT.md)):

| Key | Write | Read | Usage |
|-----|-------|------|-------|
| dataset-id | Immediate | 300ms debounce | Changement dataset |
| session | 150ms debounce | 150ms debounce | Grille tabs |
| layouts | Immediate | 150ms debounce | Graphs config |
| soft-blocks | 150ms debounce | 150ms debounce | Blocs logiciels |
| map-configs | 300ms debounce (auto-save) | Non-debounced | Maps lookup |
| signal-colors | 150ms debounce | Non-debounced | Couleurs signaux |

### 7. Export/Import configurations

**ConfigExportImport.tsx**:

Sauvegarde et charge configurations complètes:

```
Export → Fichier TOML contenant toutes les keys du ConfigManager

Import → Restaure ConfigManager depuis TOML
```

Usage:
```
Click "Exporter config" → Download TOML
Click "Importer config" → Upload TOML → Restaure tout
```

---

## Flux de données

### Flux import → affichage data

```
┌─────────────────────────────────────────────────────────────┐
│ 1. User imports MAT file                                    │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. Frontend POST /datasets/import                           │
│    → Backend parses MAT, normalizes, saves metadata         │
│    → Returns dataset_id, signal_names, num_samples          │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. Frontend saves dataset-id in ConfigManager               │
│    → Triggers cross-tab subscribers (debounce 300ms)        │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 4. Frontend GET /datasets/{id}/metadata                     │
│    → Gets signal list, sample count, distance range         │
│    → Stores in Zustand store (telemetryStore)               │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 5. Frontend GET /datasets/{id}/trackmap                     │
│    → Gets track geometry (x, y coords vs lap_distance)      │
│    → Displays in TrackMapPanel                              │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 6. User drags signal to graph cell                          │
│    → SignalWorkspace updates `layouts` (immediate)          │
│    → Triggers re-render                                     │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 7. Graph mounts, fetches data                               │
│    → Frontend GET /datasets/{id}/data?signals=[rpm,...]     │
│    → Returns signals decimated to max_points=500            │
│    → Stores in Zustand + re-renders graph with Plotly       │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 8. User hovers → Crosshair updates                          │
│    → Sets `current-hover-slap` via ConfigManager            │
│    → All graphs + trackmap react (non-debounced)            │
└─────────────────────────────────────────────────────────────┘
```

### Flux création canal mathématique

```
┌──────────────────────────────────────────────────────────────┐
│ 1. User creates math channel (e.g., "sqrt(gLong^2+gLat^2)")  │
└──────────────────────────────────────────────────────────────┘
                          ↓
┌──────────────────────────────────────────────────────────────┐
│ 2. Frontend saves to ConfigManager('math-channels')          │
│    → Triggers subscribers (debounce TBD)                     │
└──────────────────────────────────────────────────────────────┘
                          ↓
┌──────────────────────────────────────────────────────────────┐
│ 3. SignalWorkspace listens to math-channels change           │
│    → Parses expression via mathChannels.compileMathExpression│
│    → Evaluates for each sample in current dataset            │
│    → Creates virtual signal in memory                        │
└──────────────────────────────────────────────────────────────┘
                          ↓
┌──────────────────────────────────────────────────────────────┐
│ 4. Signal list shows new math channel                        │
│    → User can drag to graph like normal signal               │
└──────────────────────────────────────────────────────────────┘
                          ↓
┌──────────────────────────────────────────────────────────────┐
│ 5. Graph fetches + displays math channel data                │
│    → Stored in Zustand (telemetryStore)                      │
│    → Re-computes cross-tab (per dataset)                     │
└──────────────────────────────────────────────────────────────┘
```

### Flux création soft block

```
┌──────────────────────────────────────────────────────────────┐
│ 1. User creates soft block (type: 'lut2d', inputs, grid)     │
└──────────────────────────────────────────────────────────────┘
                          ↓
┌──────────────────────────────────────────────────────────────┐
│ 2. Frontend saves to ConfigManager('soft-blocks')            │
│    → Debounce 150ms → write + cross-tab sync                 │
└──────────────────────────────────────────────────────────────┘
                          ↓
┌──────────────────────────────────────────────────────────────┐
│ 3. SignalWorkspace listens (debounce 150ms)                  │
│    → calculateSoftBlock() for each block                     │
│    → POST /map-tuning/calculate to backend                   │
│    → Get output signal                                       │
└──────────────────────────────────────────────────────────────┘
                          ↓
┌──────────────────────────────────────────────────────────────┐
│ 4. Output signal added to virtual signals                    │
│    → Can be used in graphs or other blocks                   │
└──────────────────────────────────────────────────────────────┘
```

---

## Synchronisation cross-tab

### Rules to follow

Voir [CROSS_TAB_SYNC_AGENT.md](./docs/CROSS_TAB_SYNC_AGENT.md) pour règles complètes.

**Résumé**:

1. **Rule 1**: Writes rapides (input, drag) → **MUST debounce** 150-300ms
2. **Rule 2**: Subscription effects → **empty dependency array + refs**
3. **Rule 3**: Self-notification → guard par comparaison JSON dans chaque callback
4. **Rule 4**: Bidirectionnel dans le même composant → utiliser `useSyncedConfig`

### Corrections apportées

| Fichier | Problème | Statut |
|---------|----------|--------|
| `MapTuning.tsx` | Auto-save sans debounce (fires sur chaque cellule) | ✅ 300ms debounce |
| `SignalWorkspace.tsx` | map-config listener sans debounce calculs | ✅ 250ms debounce + clearTimeout |
| `SignalWorkspace.tsx` | `saveCurrentConfiguration` n'appelait pas `ConfigManager.set("layouts")` sur update | ✅ Corrigé |
| `SignalColorManager.tsx` | Callback subscribe sans guard (Rule 3) | ✅ `signalColorsRef` + comparaison |
| `ImportPanel.tsx` | Callbacks subscribe sans guard (Rule 3) | ✅ refs + comparaison |

---

## Points importants à connaître

### 1. Performance

- **Décimation signaux**: `/datasets/{id}/data` retourne max 500 points par défaut
  - Backend moyenne les points si trop nombreux
  - `decimation_factor` indique ratio d'averaging
  
- **Caching**: Zustand store cache données chargées
  - Évite re-fetch dataset à chaque changement tab
  - Clear cache si dataset change

- **Debouncing ConfigManager**: Essential pour cross-tab
  - Sans debounce: chaque keystroke → StorageEvent dans toutes tabs
  - Avec debounce 150ms: batch updates

### 2. Erreurs courantes à éviter

- ❌ Appeler `ConfigManager.set()` direct dans `onChange` handler
- ❌ Oublier `return () => unsubscribe()` dans useEffect
- ❌ Avoir des dépendances dans subscription effect (non-empty [])
- ❌ Modifier directement localStorage au lieu de ConfigManager
- ❌ Ne pas valider réponse API (toujours check status + structure)

### 3. Dépendances clés

**Backend**:
- `fastapi` - Framework web async
- `scipy.io` - Parser MAT
- `pydantic` - Validation schémas
- `numpy` - Calculs numériques

**Frontend**:
- `react` - UI framework
- `vite` - Dev server + build
- `zustand` - State management
- `plotly.js` - Graphiques
- `typescript` - Type checking

### 4. Ports et URLs

| Service | Port | URL |
|---------|------|-----|
| Frontend Vite | 5173 | `http://localhost:5173` |
| Backend API | 8001 | `http://localhost:8001` |
| API docs | 8001 | `http://localhost:8001/docs` |

### 5. Fichiers de configuration clés

- [backend/app/config.py](./backend/app/config.py) - Config app backend
- [frontend/src/types/ConfigTypes.ts](./frontend/src/types/ConfigTypes.ts) - Default configs + keys
- [vite.config.ts](./frontend/vite.config.ts) - Vite build config
- [package.json](./package.json) - NPM scripts root

### 6. Fichiers de référence

Consulter ces docs pour le contexte:
- [USER_GUIDE.md](./USER_GUIDE.md) - Guide utilisateur (fonctionnalités)
- [README.md](./README.md) - Setup + installation
- [docs/MAT_FORMAT.md](./docs/MAT_FORMAT.md) - Convention format MAT
- [docs/CROSS_TAB_SYNC_AGENT.md](./docs/CROSS_TAB_SYNC_AGENT.md) - Rules sync cross-tab

### 7. Debugging tips

**Frontend**:
```javascript
// Inspector ConfigManager
ConfigManager.get('layouts')  // Lire config
ConfigManager.set('debug', true)  // Debug flag
const unsubscribe = ConfigManager.subscribe('dataset-id', (v) => console.log('Dataset changed:', v));

// Inspector Zustand
useTelemetryStore.getState()  // État courant
```

**Backend**:
```bash
# Logs API
curl http://localhost:8001/docs  # Swagger UI interactive

# Reloader auto (--reload flag)
uvicorn app.main:app --reload --port 8001

# Debug SQLite
sqlite3 data/imports.db "SELECT * FROM recent_imports LIMIT 5;"
```

### 8. Extension future

Considérer comme **extension pluggable**:
- Ajouter nouvelles routers → inclure dans main.py
- Ajouter soft block type → ajouter à schema + logic
- Ajouter fonction math → ajouter à mathFunctions.ts + enum

---

## Checklist pour reprendre le projet

- [ ] Cloner repo + installer dépendances (pip install, npm install)
- [ ] Tester démarrage `npm run dev` (backend + frontend)
- [ ] Importer exemple MAT depuis `data/`
- [ ] Créer graphe drag-drop signal
- [ ] Lire [CROSS_TAB_SYNC_AGENT.md](./docs/CROSS_TAB_SYNC_AGENT.md) - **Important!**
- [ ] Explorer types TypeScript ([types.ts](./frontend/src/types.ts), [ConfigTypes.ts](./frontend/src/types/ConfigTypes.ts))
- [ ] Lancer tests API via `http://localhost:8001/docs` (Swagger UI)
- [ ] Ouvrir 2 tabs → Tester sync cross-tab (éditer layouts dans tab A, voir update tab B)
- [ ] Débugger ConfigManager avec console browser devtools
- [ ] Consulter [CROSS_TAB_SYNC_ANALYSIS.md](./memories/repo/CROSS_TAB_SYNC_ANALYSIS.md) pour problèmes connus

---

**Dernière mise à jour**: 27 mai 2026
