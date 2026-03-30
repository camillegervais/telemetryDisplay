import { useEffect, useMemo, useState } from "react";

import { queryDataset } from "../api";
import { useTelemetryStore } from "../store/telemetryStore";

import type { AppInfo, DatasetMetadata } from "../types";

type ImportPanelProps = {
  appInfo: AppInfo | null;
  loadingAppInfo: boolean;
  importing: boolean;
  importMessage: string | null;
  datasetId: string | null;
  datasetMetadata: DatasetMetadata | null;
  onImport: (file: File) => Promise<void>;
  onImportFromPath: (matPath: string) => Promise<void>;
};

type SignalStats = {
  mean: number;
  std: number;
  min: number;
  max: number;
};

const LAST_MAT_PATH_KEY = "telemetry-display.last-mat-path.v1";
const LAST_PICKER_PATH_KEY = "telemetry-display.last-picker-path.v1";

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

export default function ImportPanel({
  appInfo,
  loadingAppInfo,
  importing,
  importMessage,
  datasetId,
  datasetMetadata,
  onImport,
  onImportFromPath,
}: ImportPanelProps) {
  const { xAxisMode, sampleRateHz, setXAxisMode, setSampleRateHz } = useTelemetryStore();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [matPath, setMatPath] = useState("");
  const [lastPickerPath, setLastPickerPath] = useState("");
  const [importSectionOpen, setImportSectionOpen] = useState(true);
  const [signalFilter, setSignalFilter] = useState("");
  const [signalStats, setSignalStats] = useState<Record<string, SignalStats>>({});
  const [loadingStats, setLoadingStats] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);

  const canImport = useMemo(() => selectedFile !== null && !importing, [importing, selectedFile]);
  const canImportFromPath = useMemo(() => matPath.trim().length > 0 && !importing, [importing, matPath]);
  const canRefreshFromLastSelection = useMemo(
    () => (!importing && matPath.trim().length > 0) || (!importing && selectedFile !== null),
    [importing, matPath, selectedFile]
  );
  const filteredSignals = useMemo(() => {
    const allSignals = datasetMetadata?.signal_names ?? [];
    const filter = signalFilter.trim().toLowerCase();
    if (!filter) {
      return allSignals;
    }
    return allSignals.filter((signal) => signal.toLowerCase().includes(filter));
  }, [datasetMetadata, signalFilter]);

  useEffect(() => {
    const savedPath = window.localStorage.getItem(LAST_MAT_PATH_KEY);
    if (savedPath) {
      setMatPath(savedPath);
    }

    const savedPickerPath = window.localStorage.getItem(LAST_PICKER_PATH_KEY);
    if (savedPickerPath) {
      setLastPickerPath(savedPickerPath);
    }
  }, []);

  useEffect(() => {
    if (datasetMetadata?.source_path) {
      setMatPath(datasetMetadata.source_path);
      window.localStorage.setItem(LAST_MAT_PATH_KEY, datasetMetadata.source_path);
    }
  }, [datasetMetadata?.source_path]);

  useEffect(() => {
    if (!datasetId || !datasetMetadata || datasetMetadata.signal_names.length === 0) {
      setSignalStats({});
      setStatsError(null);
      return;
    }

    let alive = true;
    const controller = new AbortController();
    setLoadingStats(true);
    setStatsError(null);

    queryDataset({
      datasetId,
      signals: datasetMetadata.signal_names,
      startDistance: datasetMetadata.lap_distance_min,
      endDistance: datasetMetadata.lap_distance_max,
      maxPoints: 5000,
      signal: controller.signal,
    })
      .then((response) => {
        if (!alive) {
          return;
        }

        const computed: Record<string, SignalStats> = {};
        datasetMetadata.signal_names.forEach((signal) => {
          const values = response.signals[signal] ?? [];
          if (values.length === 0) {
            return;
          }

          const min = Math.min(...values);
          const max = Math.max(...values);
          const mean = values.reduce((acc, value) => acc + value, 0) / values.length;
          const variance =
            values.reduce((acc, value) => acc + (value - mean) ** 2, 0) / values.length;

          computed[signal] = {
            mean,
            std: Math.sqrt(variance),
            min,
            max,
          };
        });

        setSignalStats(computed);
      })
      .catch((error: unknown) => {
        if (!alive) {
          return;
        }
        if (isAbortError(error)) {
          return;
        }
        setStatsError(error instanceof Error ? error.message : "Impossible de calculer les stats");
      })
      .finally(() => {
        if (!alive) {
          return;
        }
        setLoadingStats(false);
      });

    return () => {
      alive = false;
      controller.abort();
    };
  }, [datasetId, datasetMetadata]);

  function formatStat(value: number): string {
    return Number.isFinite(value) ? value.toFixed(3) : "-";
  }

  async function handleImportClick() {
    if (!selectedFile) {
      return;
    }
    await onImport(selectedFile);
  }

  async function handleRefreshFromLastSelectionClick() {
    const path = matPath.trim();
    if (path) {
      window.localStorage.setItem(LAST_MAT_PATH_KEY, path);
      await onImportFromPath(path);
      return;
    }

    if (selectedFile) {
      await onImport(selectedFile);
    }
  }

  async function handleImportFromPathClick() {
    const path = matPath.trim();
    if (!path) {
      return;
    }
    window.localStorage.setItem(LAST_MAT_PATH_KEY, path);
    await onImportFromPath(path);
  }

  return (
    <section className="panel import-panel">
      <div className="panel-header">
        <h2>Import</h2>
        <span className="panel-badge">Data</span>
      </div>

      <div className="import-submenu">
        <button
          type="button"
          className="import-submenu-toggle"
          onClick={() => setImportSectionOpen((prev) => !prev)}
        >
          <span>{importSectionOpen ? "▾" : "▸"}</span>
          <span>Import de donnees</span>
        </button>

        {importSectionOpen ? (
          <div className="import-submenu-content">
            <p className="panel-text">Chargez un MAT.</p>

            <label className="field-label" htmlFor="mat-file-input">
              MAT file
            </label>
            <input
              id="mat-file-input"
              type="file"
              accept=".mat"
              className="file-input"
              onChange={(event) => {
                const pickedFile = event.target.files?.[0] ?? null;
                setSelectedFile(pickedFile);

                const pickerPath = event.target.value?.trim() ?? "";
                if (pickerPath.length > 0) {
                  setLastPickerPath(pickerPath);
                  window.localStorage.setItem(LAST_PICKER_PATH_KEY, pickerPath);

                  // Browser file inputs often return C:\\fakepath\\..., which cannot be reused by backend path import.
                  const normalized = pickerPath.replace(/\\\\/g, "/");
                  const isFakePath = normalized.toLowerCase().includes("/fakepath/");
                  if (!isFakePath && normalized.toLowerCase().endsWith(".mat")) {
                    setMatPath(normalized);
                    window.localStorage.setItem(LAST_MAT_PATH_KEY, normalized);
                  }
                }
              }}
            />

            <button className="import-button" disabled={!canImport} onClick={handleImportClick}>
              {importing ? (
                <span className="loading-inline">
                  <span className="loading-spinner" aria-hidden="true" />
                  Import en cours...
                </span>
              ) : (
                "Importer le dataset"
              )}
            </button>

            <button
              className="import-button"
              disabled={!canRefreshFromLastSelection}
              onClick={handleRefreshFromLastSelectionClick}
            >
              {importing ? (
                <span className="loading-inline">
                  <span className="loading-spinner" aria-hidden="true" />
                  Import en cours...
                </span>
              ) : (
                "Refresh depuis derniere selection"
              )}
            </button>

            <label className="field-label" htmlFor="mat-path-input">
              MAT path (serveur local)
            </label>
            <input
              id="mat-path-input"
              type="text"
              className="signals-filter-input"
              value={matPath}
              onChange={(event) => setMatPath(event.target.value)}
              placeholder="Ex: C:/Users/camil/Documents/Code/telemetryDisplay/data/imola.mat"
            />
            <button
              className="import-button"
              disabled={!canImportFromPath}
              onClick={handleImportFromPathClick}
            >
              {importing ? (
                <span className="loading-inline">
                  <span className="loading-spinner" aria-hidden="true" />
                  Import en cours...
                </span>
              ) : (
                "Importer depuis chemin"
              )}
            </button>

            {selectedFile ? <p className="panel-text file-picked">{selectedFile.name}</p> : null}
            {lastPickerPath ? <p className="panel-text file-picked">Dernier chemin picker: {lastPickerPath}</p> : null}
            {importMessage ? <p className="panel-text import-message">{importMessage}</p> : null}

            <div className="meta-grid">
              <div className="meta-item">
                <span>Reference step</span>
                <strong>
                  {loadingAppInfo ? "Loading..." : `${appInfo?.reference_distance_step_m ?? "-"} m`}
                </strong>
              </div>
              <div className="meta-item">
                <span>Source step</span>
                <strong>
                  {datasetMetadata ? `${datasetMetadata.source_distance_step_m.toFixed(2)} m` : "-"}
                </strong>
              </div>
              <div className="meta-item">
                <span>Normalization</span>
                <strong>
                  {datasetMetadata
                    ? `${datasetMetadata.interpolation_method} (x${datasetMetadata.enrichment_factor.toFixed(2)})`
                    : "Linear interpolation"}
                </strong>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <div className="sidebar-signals">
        <div className="panel-header panel-header-tight sidebar-signals-head">
          <h2>Signaux</h2>
          <span className="panel-badge">{filteredSignals.length}</span>
        </div>

        <input
          type="text"
          className="signals-filter-input"
          value={signalFilter}
          onChange={(event) => setSignalFilter(event.target.value)}
          placeholder="Filtrer les signaux..."
        />

        <div className="meta-grid" style={{ marginBottom: "0.5rem" }}>
          <div className="meta-item">
            <span>Axe X</span>
            <select
              className="mini-select"
              value={xAxisMode}
              onChange={(event) => setXAxisMode(event.target.value as "distance" | "time")}
            >
              <option value="distance">Distance</option>
              <option value="time">Temps</option>
            </select>
          </div>
          <div className="meta-item">
            <span>Frequence (Hz)</span>
            <input
              type="number"
              className="signals-filter-input"
              min={0.1}
              step={0.1}
              value={sampleRateHz}
              onChange={(event) => {
                const next = Number(event.target.value);
                if (Number.isFinite(next) && next > 0) {
                  setSampleRateHz(next);
                }
              }}
              placeholder="Ex: 100"
            />
          </div>
        </div>

        {!datasetMetadata || datasetMetadata.signal_names.length === 0 ? (
          <p className="panel-text">Importez un dataset pour afficher les signaux.</p>
        ) : (
          <>
            {filteredSignals.length === 0 ? (
              <p className="panel-text">Aucun signal ne correspond au filtre.</p>
            ) : (
              <div className="sidebar-signals-list">
                {filteredSignals.map((signal) => (
                  <button
                    key={signal}
                    type="button"
                    className="sidebar-signal-chip"
                    draggable
                    onDragStart={(event) => {
                      event.dataTransfer.setData("application/x-telemetry-signal", signal);
                      event.dataTransfer.effectAllowed = "copy";
                    }}
                    title="Glisser vers un graphe pour ajouter"
                  >
                    {signal}
                  </button>
                ))}
              </div>
            )}

            <div className="signals-stats">
              <div className="panel-header panel-header-tight signals-stats-head">
                <h2>Stats signaux</h2>
              </div>

              {loadingStats ? (
                <p className="panel-text loading-inline">
                  <span className="loading-spinner" aria-hidden="true" />
                  Calcul des statistiques...
                </p>
              ) : null}
              {statsError ? <p className="panel-text">{statsError}</p> : null}

              {!loadingStats && !statsError ? (
                <div className="signals-stats-list">
                  {filteredSignals.map((signal) => {
                    const stat = signalStats[signal];
                    return (
                      <div key={`stat-${signal}`} className="signals-stats-item">
                        <div className="signals-stats-title">{signal}</div>
                        <div className="signals-stats-values">
                          <span>moy: {stat ? formatStat(stat.mean) : "-"}</span>
                          <span>std: {stat ? formatStat(stat.std) : "-"}</span>
                          <span>min: {stat ? formatStat(stat.min) : "-"}</span>
                          <span>max: {stat ? formatStat(stat.max) : "-"}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
