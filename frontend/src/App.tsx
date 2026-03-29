import { useEffect, useState } from "react";

import {
  fetchAppInfo,
  fetchDatasetMetadata,
  fetchTrackMap,
  importDataset,
} from "./api";
import { ImportPanel, SignalWorkspace } from "./components";
import { useTelemetryStore } from "./store/telemetryStore";
import type { AppInfo, DatasetMetadata, TrackMapResponse } from "./types";

export default function App() {
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [loadingAppInfo, setLoadingAppInfo] = useState(true);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [datasetId, setDatasetId] = useState<string | null>(null);
  const [datasetMetadata, setDatasetMetadata] = useState<DatasetMetadata | null>(null);
  const [trackMap, setTrackMap] = useState<TrackMapResponse | null>(null);
  const [graphOnlyMode, setGraphOnlyMode] = useState(false);

  const { setXRange, setCursorDistance } = useTelemetryStore();

  function resetAllGraphsToHome() {
    setXRange(null);
  }

  useEffect(() => {
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

  async function handleImport(file: File) {
    setImporting(true);
    setError(null);

    try {
      const imported = await importDataset(file);
      setDatasetId(imported.dataset_id);
      setImportMessage(imported.message);

      const [metadata, map] = await Promise.all([
        fetchDatasetMetadata(imported.dataset_id),
        fetchTrackMap(imported.dataset_id),
      ]);

      setDatasetMetadata(metadata);
      setTrackMap(map);
      setXRange(null);
      setCursorDistance(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className={`app-shell ${graphOnlyMode ? "graph-only-mode" : ""}`}>
      <header className="topbar">
        <div>
          <h1>Telemetry Display</h1>
          <p>Dashboard telemetry</p>
        </div>
        <div className="topbar-actions">
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

      <main className="dashboard-grid">
        {!graphOnlyMode ? (
          <ImportPanel
            appInfo={appInfo}
            loadingAppInfo={loadingAppInfo}
            importing={importing}
            importMessage={importMessage}
            datasetId={datasetId}
            datasetMetadata={datasetMetadata}
            onImport={handleImport}
          />
        ) : null}
        <SignalWorkspace
          datasetId={datasetId}
          datasetMetadata={datasetMetadata}
          trackMap={trackMap}
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
