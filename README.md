# telemetryDisplay

Application web de visualisation de télémétrie pour circuit, avec import de fichiers `.mat`, dashboard de graphes, track map et création de math channels.

## Structure du projet

- `backend/` : API FastAPI et logique d’import des données
- `frontend/` : interface React + Vite
- `data/` : jeux de données d’exemple et cartes de piste
- `docs/` : conventions de format, dont le format MAT

## Prérequis

- Python 3.10+ pour le backend
- Node.js 18+ pour le frontend
- Un navigateur moderne

## Installation

### Backend

1. Ouvrir un terminal dans `backend/`.
2. Créer l’environnement virtuel si besoin: `python -m venv .venv`
3. Activer l’environnement virtuel.
4. Installer les dépendances: `pip install -r requirements.txt`

### Frontend

1. Ouvrir un terminal dans `frontend/`.
2. Installer les dépendances: `npm install`

## Démarrage

### Lancer le backend

1. Aller dans `backend/`.
2. Activer `.venv`.
3. Lancer l’API: `uvicorn app.main:app --reload --port 8001`

L’API est disponible sur `http://localhost:8001`.

### Lancer le frontend

1. Aller dans `frontend/`.
2. Lancer l’interface: `npm run dev`

L’application est disponible sur `http://localhost:5173` et s’attend à trouver l’API sur `http://localhost:8001`.

### Démarrage complet depuis la racine

Depuis la racine du dépôt, vous pouvez utiliser le script de dev configuré pour lancer frontend et backend ensemble. Ce mode suppose que les dépendances sont déjà installées.

## Utilisation basique

1. Importer un fichier `.mat` depuis le panneau Data Hub.
2. Ou importer un fichier depuis un chemin local si le backend y a accès.
3. Consulter les signaux disponibles dans la liste de gauche.
4. Ajouter des math channels depuis le même panneau pour créer des signaux dérivés.
5. Ouvrir le dashboard pour afficher les graphes et la track map.

Fonctions utiles de l’interface:

- Le panneau Data Hub permet d’importer, filtrer et ajouter des math channels.
- Les math channels sont conservés au rechargement de la page.
- Le mode `Graph Only` masque les panneaux latéraux pour se concentrer sur les graphes.
- Le panneau Inspecteur sert à modifier widgets, tailles et positions.
- L’aide des raccourcis clavier est accessible depuis le bouton `?` en haut à droite.

## Format des fichiers MAT

Le format attendu est décrit dans [docs/MAT_FORMAT.md](docs/MAT_FORMAT.md).

En résumé:

- `sLap` est obligatoire et doit être monotone croissante.
- Chaque signal doit avoir la même longueur que `sLap`.
- `distance_step_m` est recommandé pour décrire l’échantillonnage spatial.
- Les `NaN` en fin de signal sont acceptés, mais pas au milieu.

## Données d’exemple

- `data/losail.mat` : dataset de démonstration pour Losail
- `data/losail_track.csv` : tracé de piste associé
- Les scripts de génération se trouvent dans `backend/scripts/`

## Utilisation avec MATLAB / Simulink

Cette application vise à offrir un outil pratique pour analyser des données de télémétrie issues d’une simulation Simulink. Pour générer les données compatibles avec l’application, procédez ainsi:

1. Copier le fichier `exportDataMATLAB.m` dans le dossier de votre projet Simulink.
2. Le configurer comme callback `StopFcn` de la simulation.
3. Ajouter des blocs `To Workspace` sur les signaux que vous voulez analyser dans l’application.
