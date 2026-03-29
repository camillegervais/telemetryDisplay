import { useEffect, useMemo, useState } from "react";

import { queryDataset } from "../api";

import type { AppInfo, DatasetMetadata } from "../types";

type ImportPanelProps = {
  appInfo: AppInfo | null;
  loadingAppInfo: boolean;
  importing: boolean;
  importMessage: string | null;
  datasetId: string | null;
  datasetMetadata: DatasetMetadata | null;
  onImport: (file: File) => Promise<void>;
};

type SignalStats = {
  mean: number;
  std: number;
  min: number;
  max: number;
};

export default function ImportPanel({
  appInfo,
  loadingAppInfo,
  importing,
  importMessage,
  datasetId,
  datasetMetadata,
  onImport,
}: ImportPanelProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [importSectionOpen, setImportSectionOpen] = useState(true);
  const [signalFilter, setSignalFilter] = useState("");
  const [signalStats, setSignalStats] = useState<Record<string, SignalStats>>({});
  const [loadingStats, setLoadingStats] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);

  const canImport = useMemo(() => selectedFile !== null && !importing, [importing, selectedFile]);
  const filteredSignals = useMemo(() => {
    const allSignals = datasetMetadata?.signal_names ?? [];
    const filter = signalFilter.trim().toLowerCase();
    if (!filter) {
      return allSignals;
    }
    return allSignals.filter((signal) => signal.toLowerCase().includes(filter));
  }, [datasetMetadata, signalFilter]);

  useEffect(() => {
    if (!datasetId || !datasetMetadata || datasetMetadata.signal_names.length === 0) {
      setSignalStats({});
      setStatsError(null);
      return;
    }

    let alive = true;
    setLoadingStats(true);
    setStatsError(null);

    queryDataset({
      datasetId,
      signals: datasetMetadata.signal_names,
      startDistance: datasetMetadata.lap_distance_min,
      endDistance: datasetMetadata.lap_distance_max,
      maxPoints: 5000,
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
              onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
            />

            <button className="import-button" disabled={!canImport} onClick={handleImportClick}>
              {importing ? "Import en cours..." : "Importer le dataset"}
            </button>

            {selectedFile ? <p className="panel-text file-picked">{selectedFile.name}</p> : null}
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

              {loadingStats ? <p className="panel-text">Calcul des statistiques...</p> : null}
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
