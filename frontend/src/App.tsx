import { useEffect, useState } from "react";

import {
  fetchAppInfo,
  fetchDatasetMetadata,
  fetchTrackMap,
  importDataset,
  importDatasetFromPath,
} from "./api";
import { ImportPanel, SignalWorkspace } from "./components";
import { analyzeMathExpression } from "./mathChannels";
import { useTelemetryStore } from "./store/telemetryStore";
import type { AppInfo, DatasetMetadata, MathChannel, TrackMapResponse } from "./types";

const USER_DISPLAY_NAME_KEY = "telemetry-display.user-display-name.v1";

export default function App() {
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [loadingAppInfo, setLoadingAppInfo] = useState(true);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [datasetId, setDatasetId] = useState<string | null>(null);
  const [datasetMetadata, setDatasetMetadata] = useState<DatasetMetadata | null>(null);
  const [trackMap, setTrackMap] = useState<TrackMapResponse | null>(null);
  const [mathChannels, setMathChannels] = useState<MathChannel[]>([]);
  const [graphOnlyMode, setGraphOnlyMode] = useState(false);
  const [userDisplayName, setUserDisplayName] = useState("");

  const { setXRange, setCursorDistance, triggerHomeReset } = useTelemetryStore();

  function resetAllGraphsToHome() {
    setXRange(null);
    triggerHomeReset();
  }

  useEffect(() => {
    const savedName = window.localStorage.getItem(USER_DISPLAY_NAME_KEY);
    if (savedName) {
      setUserDisplayName(savedName);
    }

    let active = true;
    fetchAppInfo()
      .then((data) => {
        if (!active) return;
        setAppInfo(data);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Unknown error");
      })
      .finally(() => {
        if (!active) return;
        setLoadingAppInfo(false);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    window.localStorage.setItem(USER_DISPLAY_NAME_KEY, userDisplayName.trim());
  }, [userDisplayName]);

  async function handleImport(file: File) {
    setImporting(true);
    setError(null);

    try {
      const imported = await importDataset(file);
      await loadImportedDataset(imported.dataset_id, imported.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImporting(false);
    }
  }

  async function handleImportFromPath(matPath: string) {
    setImporting(true);
    setError(null);

    try {
      const imported = await importDatasetFromPath(matPath);
      await loadImportedDataset(imported.dataset_id, imported.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImporting(false);
    }
  }

  async function loadImportedDataset(nextDatasetId: string, message: string) {
    setDatasetId(nextDatasetId);
    setImportMessage(message);

    const [metadata, map] = await Promise.all([
      fetchDatasetMetadata(nextDatasetId),
      fetchTrackMap(nextDatasetId),
    ]);

    setDatasetMetadata(metadata);
    setTrackMap(map);
    setMathChannels([]);
    setXRange(null);
    setCursorDistance(null);
  }

  function handleAddMathChannel(name: string, expression: string): string | null {
    if (!datasetMetadata) {
      return "Dataset requis";
    }

    const trimmedName = name.trim();
    if (!trimmedName) {
      return "Nom requis";
    }

    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(trimmedName)) {
      return "Nom invalide (lettres/chiffres/underscore)";
    }

    const existing = new Set([
      ...datasetMetadata.signal_names,
      ...mathChannels.map((channel) => channel.name),
    ]);
    if (existing.has(trimmedName)) {
      return "Nom deja utilise";
    }

    const { dependencies, error } = analyzeMathExpression(expression, datasetMetadata.signal_names);
    if (error) {
      return error;
    }

    setMathChannels((prev) => [
      ...prev,
      {
        name: trimmedName,
        expression: expression.trim(),
        dependencies,
      },
    ]);
    return null;
  }

  function handleRemoveMathChannel(name: string) {
    setMathChannels((prev) => prev.filter((channel) => channel.name !== name));
  }

  return (
    <div className={`app-shell ${graphOnlyMode ? "graph-only-mode" : ""}`}>
      <header className="topbar">
        <div className="topbar-brand">
          <div className="app-logo" aria-hidden="true">
            <span className="app-logo-ring" />
            <span className="app-logo-core">TD</span>
          </div>
          <div>
            <h1>Telemetry Display</h1>
            <p>
              Race Telemetry Console
              {userDisplayName.trim() ? ` - ${userDisplayName.trim()}` : ""}
            </p>
          </div>
        </div>
        <div className="topbar-actions">
          <details className="topbar-user-menu">
            <summary className="small-button">Profil</summary>
            <div className="topbar-user-menu-content">
              <label className="field-label" htmlFor="topbar-user-input">
                Prenom
              </label>
              <input
                id="topbar-user-input"
                type="text"
                className="topbar-user-input"
                value={userDisplayName}
                onChange={(event) => setUserDisplayName(event.target.value)}
                placeholder="Votre prenom"
                aria-label="Prenom utilisateur"
              />
            </div>
          </details>
          <button className="small-button" onClick={resetAllGraphsToHome}>
            Maison
          </button>
          <button className="small-button" onClick={() => setGraphOnlyMode((prev) => !prev)}>
            {graphOnlyMode ? "UI" : "Graphes"}
          </button>
          <div className="status-box">
            <span>Backend</span>
            <strong>{loadingAppInfo ? "Connecting" : error ? "Error" : "Ready"}</strong>
          </div>
        </div>
      </header>

      {error ? <div className="error-banner">API error: {error}</div> : null}

      {importing ? (
        <div className="global-loading-overlay" role="status" aria-live="polite">
          <div className="global-loading-card">
            <span className="loading-spinner" aria-hidden="true" />
            <span>Import en cours</span>
          </div>
        </div>
      ) : null}

      <main className="dashboard-grid">
        {!graphOnlyMode ? (
          <ImportPanel
            appInfo={appInfo}
            loadingAppInfo={loadingAppInfo}
            importing={importing}
            importMessage={importMessage}
            datasetId={datasetId}
            datasetMetadata={datasetMetadata}
            mathChannels={mathChannels}
            onImport={handleImport}
            onImportFromPath={handleImportFromPath}
            onAddMathChannel={handleAddMathChannel}
            onRemoveMathChannel={handleRemoveMathChannel}
          />
        ) : null}
        <SignalWorkspace
          datasetId={datasetId}
          datasetMetadata={datasetMetadata}
          trackMap={trackMap}
          mathChannels={mathChannels}
          graphOnlyMode={graphOnlyMode}
        />
      </main>

      {graphOnlyMode ? (
        <div className="graph-only-overlay-controls">
          <button className="small-button" onClick={resetAllGraphsToHome}>
            Maison
          </button>
          <button className="small-button" onClick={() => setGraphOnlyMode(false)}>
            UI
          </button>
        </div>
      ) : null}
    </div>
  );
}
