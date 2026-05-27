import { useEffect, useMemo, useState, type CSSProperties, type KeyboardEvent } from "react";

import { queryDataset } from "../api";
import { useTelemetryStore } from "../store/telemetryStore";
import { ConfigManager } from "../store/ConfigManager";
import { ImportDataModal } from "./ImportDataModal";

import type { DatasetMetadata, MapTuningData } from "../types";
import type { TelDataImportConfig } from "../types/ConfigTypes";

type ImportPanelProps = {
  importing: boolean;
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

interface NumberInputProps {
  value: number;
  onChange: (val: number) => void;
  style?: CSSProperties;
}

function NumberInput({ value, onChange, style }: NumberInputProps) {
  const [localVal, setLocalVal] = useState<string>(String(value));
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    if (!isFocused) {
      setLocalVal(String(value));
    }
  }, [value, isFocused]);

  const handleBlur = () => {
    setIsFocused(false);
    const parsed = parseFloat(localVal.replace(",", "."));
    if (!isNaN(parsed)) {
      onChange(parsed);
      setLocalVal(String(parsed));
    } else {
      setLocalVal(String(value));
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.currentTarget.blur();
    }
  };

  return (
    <input
      type="text"
      inputMode="decimal"
      value={localVal}
      onChange={(e) => setLocalVal(e.target.value)}
      onFocus={(e) => {
        setIsFocused(true);
        e.target.select();
      }}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      className="table-input"
      style={style}
    />
  );
}

const LAST_MAT_PATH_KEY = "telemetry-display.last-mat-path.v1";

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];

  values.forEach((value) => {
    if (seen.has(value)) {
      return;
    }
    seen.add(value);
    unique.push(value);
  });

  return unique;
}

export default function ImportPanel({
  importing,
  datasetId,
  datasetMetadata,
  onImport,
  onImportFromPath,
}: ImportPanelProps) {
  const { xAxisMode, startFinishOffsetM, setXAxisMode, setStartFinishOffsetM } = useTelemetryStore();
  const [matPath, setMatPath] = useState(() => window.localStorage.getItem(LAST_MAT_PATH_KEY) ?? "");
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [signalsSectionOpen, setSignalsSectionOpen] = useState(true);
  const [axisSectionOpen, setAxisSectionOpen] = useState(false);
  const [statsSectionOpen, setStatsSectionOpen] = useState(false);
  const [signalFilter, setSignalFilter] = useState("");
  const [signalStats, setSignalStats] = useState<Record<string, SignalStats>>({});
  const [loadingStats, setLoadingStats] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [mapsSectionOpen, setMapsSectionOpen] = useState(false);
  const [mapConfigs, setMapConfigs] = useState<Record<string, MapTuningData>>(() =>
    ConfigManager.get<Record<string, MapTuningData>>("map-configs") ?? {}
  );
  const [telDataConfigsSectionOpen, setTelDataConfigsSectionOpen] = useState(false);
  const [telDataConfigs, setTelDataConfigs] = useState<TelDataImportConfig[]>(
    () => ConfigManager.get<TelDataImportConfig[]>("teldata-configs") ?? []
  );
  // Form state for creating a new TelData config
  const [newConfigName, setNewConfigName] = useState("");
  const [newConfigChannels, setNewConfigChannels] = useState("");
  const [newConfigFreq, setNewConfigFreq] = useState("100");
  const [newConfigVCHPath, setNewConfigVCHPath] = useState("");

  const allSignals = useMemo(
    () => uniqueStrings(datasetMetadata?.signal_names ?? []),
    [datasetMetadata]
  );
  const filteredSignals = useMemo(() => {
    const filter = signalFilter.trim().toLowerCase();
    if (!filter) {
      return allSignals;
    }
    return allSignals.filter((signal) => signal.toLowerCase().includes(filter));
  }, [allSignals, signalFilter]);

  // Sync map configs and listen for external updates
  useEffect(() => {
    const unsubscribe = ConfigManager.subscribe<Record<string, MapTuningData>>("map-configs", (newConfigs) => {
      setMapConfigs(newConfigs ?? {});
    });
    return () => unsubscribe();
  }, []);

  // Sync teldata configs
  useEffect(() => {
    const unsubscribe = ConfigManager.subscribe<TelDataImportConfig[]>("teldata-configs", (updated) => {
      setTelDataConfigs(updated ?? []);
    });
    return () => unsubscribe();
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

    const statsQuerySignals = datasetMetadata.signal_names;

    queryDataset({
      datasetId,
      signals: statsQuerySignals,
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

        statsQuerySignals.forEach((signal) => {
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

  useEffect(() => {
    if (xAxisMode === "time" && datasetMetadata && !datasetMetadata.has_time_axis) {
      setXAxisMode("distance");
    }
  }, [datasetMetadata, xAxisMode, setXAxisMode]);

  function updateMapGain(name: string, newGain: number) {
    if (!Number.isFinite(newGain)) return;
    setMapConfigs((prev) => {
      const next = { ...prev };
      const cfg = next[name];
      if (!cfg) return prev;
      next[name] = { ...cfg, gainVal: Number(Number(newGain).toFixed(3)) };
      try {
        ConfigManager.set("map-configs", next);
      } catch (e) {
        console.error("Failed to set map-configs", e);
      }
      return next;
    });
  }

  function updateMapOffset(name: string, newOffset: number) {
    if (!Number.isFinite(newOffset)) return;
    setMapConfigs((prev) => {
      const next = { ...prev };
      const cfg = next[name];
      if (!cfg) return prev;
      next[name] = { ...cfg, offsetVal: Number(Number(newOffset).toFixed(3)) };
      try {
        ConfigManager.set("map-configs", next);
      } catch (e) {
        console.error("Failed to set map-configs", e);
      }
      return next;
    });
  }

  return (
    <section className="panel import-panel">
      <div className="panel-header">
        <h2>Import</h2>
        <span className="panel-badge">Data</span>
      </div>

      <div className="import-cta-wrapper">
        <button
          type="button"
          className="import-cta-button"
          onClick={() => setImportModalOpen(true)}
          disabled={importing}
        >
          {importing ? (
            <span className="loading-inline">
              <span className="loading-spinner" aria-hidden="true" />
              Import en cours...
            </span>
          ) : (
            <>
              <span className="import-cta-icon">⬇</span>
              <span>Importer des données</span>
            </>
          )}
        </button>
      </div>

      <div className="import-submenu">
        <button
          type="button"
          className="import-submenu-toggle"
          onClick={() => setSignalsSectionOpen((prev) => !prev)}
        >
          <span>{signalsSectionOpen ? "▾" : "▸"}</span>
          <span>Signaux ({filteredSignals.length})</span>
        </button>
        {signalsSectionOpen ? (
          <div className="import-submenu-content">
            <input
              type="text"
              className="signals-filter-input"
              value={signalFilter}
              onChange={(event) => setSignalFilter(event.target.value)}
              placeholder="Filtrer les signaux..."
            />

            {!datasetMetadata || datasetMetadata.signal_names.length === 0 ? (
              <p className="panel-text">Importez un dataset pour afficher les signaux.</p>
            ) : filteredSignals.length === 0 ? (
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
          </div>
        ) : null}
      </div>

      {/* ---- Axe X ---- */}
      <div className="import-submenu">
        <button
          type="button"
          className="import-submenu-toggle"
          onClick={() => setAxisSectionOpen((prev) => !prev)}
        >
          <span>{axisSectionOpen ? "▾" : "▸"}</span>
          <span>Axe X</span>
        </button>
        {axisSectionOpen ? (
          <div className="import-submenu-content">
            <div className="meta-grid" style={{ marginBottom: "0" }}>
              <div className="meta-item">
                <span>Axe X</span>
                <select
                  className="mini-select"
                  value={xAxisMode}
                  onChange={(event) => setXAxisMode(event.target.value as "distance" | "time")}
                >
                  <option value="distance">Distance</option>
                  <option value="time" disabled={!datasetMetadata?.has_time_axis}>
                    Temps
                  </option>
                </select>
              </div>
              <div className="meta-item">
                <span>Frequence source</span>
                <strong>
                  {datasetMetadata?.source_sample_rate_hz
                    ? `${datasetMetadata.source_sample_rate_hz.toFixed(2)} Hz`
                    : "Non disponible"}
                </strong>
              </div>
            </div>

            <details style={{ marginTop: "0.5rem" }}>
              <summary className="panel-text" style={{ cursor: "pointer" }}>
                Avance: ligne depart/arrivee
              </summary>
              <label className="field-label" htmlFor="start-finish-offset-input">
                Decalage (m)
              </label>
              <input
                id="start-finish-offset-input"
                type="number"
                className="signals-filter-input"
                value={Number.isFinite(startFinishOffsetM) ? startFinishOffsetM : 0}
                step={1}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  if (Number.isFinite(next)) {
                    setStartFinishOffsetM(next);
                  }
                }}
                placeholder="Ex: 15"
              />
            </details>
          </div>
        ) : null}
      </div>

      

      <div className="import-submenu">
        <button
          type="button"
          className="import-submenu-toggle"
          onClick={() => setStatsSectionOpen((prev) => !prev)}
        >
          <span>{statsSectionOpen ? "▾" : "▸"}</span>
          <span>Stats signaux</span>
        </button>
        {statsSectionOpen ? (
          <div className="import-submenu-content">
            {loadingStats ? (
              <p className="panel-text loading-inline">
                <span className="loading-spinner" aria-hidden="true" />
                Calcul des statistiques...
              </p>
            ) : null}
            {statsError ? <p className="panel-text">{statsError}</p> : null}
            {!datasetMetadata || datasetMetadata.signal_names.length === 0 ? (
              <p className="panel-text">Importez un dataset pour afficher les stats.</p>
            ) : null}
            {!loadingStats && !statsError && datasetMetadata && datasetMetadata.signal_names.length > 0 ? (
              <div className="signals-stats-list">
                {filteredSignals.map((signal) => {
                  const stat = signalStats[signal];
                  return (
                    <div key={`stat-${signal}`} className="signals-stats-item">
                      <div className="signals-stats-title">{signal}</div>
                      <div className="signals-stats-values">
                        <span>moy: {stat ? stat.mean : "-"}</span>
                        <span>std: {stat ? stat.std : "-"}</span>
                        <span>min: {stat ? stat.min : "-"}</span>
                        <span>max: {stat ? stat.max : "-"}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="import-submenu">
        <button
          type="button"
          className="import-submenu-toggle"
          onClick={() => setMapsSectionOpen((p) => !p)}
        >
          <span>{mapsSectionOpen ? "▾" : "▸"}</span>
          <span>Cartos ({Object.keys(mapConfigs).length})</span>
        </button>

        {mapsSectionOpen ? (
          <div className="import-submenu-content">
            {Object.keys(mapConfigs).length === 0 ? (
              <p className="panel-text">Aucune carto sauvegardée.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {Object.entries(mapConfigs).map(([name, cfg]) => (
                  <div key={`map-${name}`} style={{ display: "flex", gap: "0.5rem", flexDirection: "column" }}>
                    <div style={{ minWidth: "160px", overflow: "hidden", textOverflow: "ellipsis" }}>{name}</div>
                    <div style={{ display: 'flex', flexDirection: "column"}}>
                      <div style={{ display: "flex", gap: "0.25rem", justifyContent: "space-between", flexDirection: "row", width:"100%", marginBottom: "0.3rem" }}>
                        <label className="field-label" style={{ margin: 0 }}>Gain</label>
                        <div style={{ display: "flex", gap: "0.25rem"}}>
                          <button
                            className="small-button"
                            onClick={() => updateMapGain(name, (cfg.gainVal ?? 1) - 0.1)}
                            type="button"
                          >
                            −
                          </button>
                          <NumberInput
                            value={Number.isFinite(cfg.gainVal ?? 0) ? Number((cfg.gainVal ?? 0).toFixed(3)) : 0}
                            onChange={(val) => updateMapGain(name, val)}
                            style={{ width: "80px" }}
                          />
                          <button
                            className="small-button"
                            onClick={() => updateMapGain(name, (cfg.gainVal ?? 1) + 0.1)}
                            type="button"
                          >
                            +
                          </button>
                        </div>
                      </div>

                      <div style={{ display: "flex", gap: "0.25rem", justifyContent: "space-between" }}>
                        <label className="field-label" style={{ margin: 0 }}>Offset</label>
                        <div style={{ display: "flex", gap: "0.25rem"}}>
                          <button
                            className="small-button"
                            onClick={() => updateMapOffset(name, (cfg.offsetVal ?? 0) - 0.1)}
                            type="button"
                          >
                            −
                          </button>
                          <NumberInput
                            value={Number.isFinite(cfg.offsetVal ?? 0) ? Number((cfg.offsetVal ?? 0).toFixed(3)) : 0}
                            onChange={(val) => updateMapOffset(name, val)}
                            style={{ width: "80px" }}
                          />
                          <button
                            className="small-button"
                            onClick={() => updateMapOffset(name, (cfg.offsetVal ?? 0) + 0.1)}
                            type="button"
                          >
                            +
                          </button>
                        </div>
                      </div>
                      </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : null}
      </div>

      {importModalOpen ? (
        <ImportDataModal
          importing={importing}
          initialMatPath={matPath}
          telDataConfigs={telDataConfigs}
          onImport={onImport}
          onImportFromPath={onImportFromPath}
          onClose={() => setImportModalOpen(false)}
        />
      ) : null}

      {/* ---- Configs TelData ---- */}
      <div className="import-submenu">
        <button
          type="button"
          className="import-submenu-toggle"
          onClick={() => setTelDataConfigsSectionOpen((p) => !p)}
        >
          <span>{telDataConfigsSectionOpen ? "▾" : "▸"}</span>
          <span>Configs TelData ({telDataConfigs.length})</span>
        </button>

        {telDataConfigsSectionOpen ? (
          <div className="import-submenu-content">
            {/* Existing configs */}
            {telDataConfigs.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginBottom: "0.75rem" }}>
                {telDataConfigs.map((cfg) => (
                  <div key={cfg.id} style={{ display: "flex", flexDirection: "column", gap: "0.2rem", padding: "0.4rem 0.5rem", border: "1px solid rgba(255,70,93,0.25)", borderRadius: "3px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <strong style={{ fontSize: "0.82rem" }}>{cfg.name}</strong>
                      <button
                        className="small-button"
                        type="button"
                        onClick={() => {
                          const updated = telDataConfigs.filter((c) => c.id !== cfg.id);
                          ConfigManager.set("teldata-configs", updated);
                        }}
                      >
                        ✕
                      </button>
                    </div>
                    <div style={{ fontSize: "0.76rem", opacity: 0.55 }}>
                      {cfg.channels.length} canaux — {cfg.targetFrequencyHz} Hz
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="panel-text">Aucune config sauvegardée.</p>
            )}

            {/* Add new config form */}
            <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", borderTop: "1px solid rgba(255,70,93,0.2)", paddingTop: "0.6rem" }}>
              <label className="field-label">Nom</label>
              <input
                className="table-input"
                type="text"
                value={newConfigName}
                onChange={(e) => setNewConfigName(e.target.value)}
                placeholder="ex: ABS channels"
                style={{ width: "100%" }}
              />
              <label className="field-label">Canaux (un par ligne)</label>
              <textarea
                className="table-input"
                value={newConfigChannels}
                onChange={(e) => setNewConfigChannels(e.target.value)}
                placeholder={"cChannel1\ncChannel2\n..."}
                rows={4}
                style={{ width: "100%", resize: "vertical", fontFamily: "monospace", fontSize: "0.8rem" }}
              />
              <label className="field-label">Fréquence cible (Hz)</label>
              <input
                className="table-input"
                type="number"
                min={1}
                max={10000}
                value={newConfigFreq}
                onChange={(e) => setNewConfigFreq(e.target.value)}
                style={{ width: "100%" }}
              />
              <label className="field-label">VCH Path</label>
              <input
                className="table-input"
                type="text"
                value={newConfigVCHPath}
                onChange={(e) => setNewConfigVCHPath(e.target.value)}
                placeholder="Chemin vers les fichiers vch"
                style={{ width: "100%" }}
              />
              <button
                className="import-button"
                type="button"
                disabled={!newConfigName.trim() || !newConfigChannels.trim()}
                onClick={() => {
                  const channels = newConfigChannels
                    .split("\n")
                    .map((s) => s.trim())
                    .filter(Boolean);
                  const freq = parseFloat(newConfigFreq);
                  const updated: TelDataImportConfig[] = [
                    ...telDataConfigs,
                    { id: crypto.randomUUID(), name: newConfigName.trim(), channels, targetFrequencyHz: Number.isFinite(freq) ? freq : 100, vchPath: newConfigVCHPath.trim() },
                  ];
                  ConfigManager.set("teldata-configs", updated);
                  setNewConfigName("");
                  setNewConfigChannels("");
                  setNewConfigFreq("100");
                  setNewConfigVCHPath("");
                }}
              >
                Sauvegarder config
              </button>
            </div>
          </div>
        ) : null}
      </div>

      
    </section>
  );
}
