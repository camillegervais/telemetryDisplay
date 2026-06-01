import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";

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
  // Slots B, C, D (reference datasets)
  activeSlot: "A" | "B" | "C" | "D";
  datasetIdB: string | null;
  datasetMetadataB: DatasetMetadata | null;
  onImportToSlotB: (file: File) => Promise<void>;
  onImportFromPathToSlotB: (matPath: string) => Promise<void>;
  datasetIdC: string | null;
  datasetMetadataC: DatasetMetadata | null;
  onImportToSlotC: (file: File) => Promise<void>;
  onImportFromPathToSlotC: (matPath: string) => Promise<void>;
  datasetIdD: string | null;
  datasetMetadataD: DatasetMetadata | null;
  onImportToSlotD: (file: File) => Promise<void>;
  onImportFromPathToSlotD: (matPath: string) => Promise<void>;
  onSwapSlot: (slot: "A" | "B" | "C" | "D") => void;
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
  activeSlot,
  datasetIdB,
  datasetMetadataB,
  datasetIdC,
  datasetMetadataC,
  datasetIdD,
  datasetMetadataD,
  onImportToSlotB,
  onImportFromPathToSlotB,
  onImportToSlotC,
  onImportFromPathToSlotC,
  onImportToSlotD,
  onImportFromPathToSlotD,
  onSwapSlot,
}: ImportPanelProps) {
  const [importRefModalOpen, setImportRefModalOpen] = useState(false);
  const [importRefTargetSlot, setImportRefTargetSlot] = useState<"B" | "C" | "D">("B");
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
  const [mapFilter, setMapFilter] = useState("");
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

  // Refs for tracking current state in subscription callbacks (Rule 2)
  const mapConfigsRef = useRef(mapConfigs);
  const telDataConfigsRef = useRef(telDataConfigs);

  // Keep refs in sync with state
  useEffect(() => {
    mapConfigsRef.current = mapConfigs;
  }, [mapConfigs]);

  useEffect(() => {
    telDataConfigsRef.current = telDataConfigs;
  }, [telDataConfigs]);

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

  // Sync map configs and listen for external updates (Rule 3: self-notification guard via subscribeDebouncedFull)
  useEffect(() => {
    const unsubscribe = ConfigManager.subscribeDebouncedFull<Record<string, MapTuningData>>("map-configs", (newConfigs) => {
      // subscribeDebouncedFull provides built-in lastValue guard, but we add secondary guard for extra safety
      if (JSON.stringify(newConfigs) !== JSON.stringify(mapConfigsRef.current)) {
        setMapConfigs(newConfigs ?? {});
      }
    }, 150);
    return () => unsubscribe();
  }, []);

  // Sync teldata configs (Rule 3: self-notification guard via subscribeDebouncedFull)
  useEffect(() => {
    const unsubscribe = ConfigManager.subscribeDebouncedFull<TelDataImportConfig[]>("teldata-configs", (updated) => {
      // subscribeDebouncedFull provides built-in lastValue guard, but we add secondary guard for extra safety
      if (JSON.stringify(updated) !== JSON.stringify(telDataConfigsRef.current)) {
        setTelDataConfigs(updated ?? []);
      }
    }, 150);
    return () => unsubscribe();
  }, []);

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
              Import ongoing...
            </span>
          ) : (
            <>
              <span className="import-cta-icon">⬇</span>
              <span>Import data</span>
            </>
          )}
        </button>
      </div>

      {/* ── Slot A / B / C / D ── */}
      <div className="import-submenu" style={{ marginBottom: "0.25rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", padding: "0.35rem 0.5rem", flexWrap: "wrap" }}>
          <button
            type="button"
            className={`small-button${activeSlot === "A" ? " small-button-active" : ""}`}
            onClick={() => activeSlot !== "A" && onSwapSlot("A")}
            title={datasetMetadata?.source_path ? datasetMetadata.source_path.split(/[\/\\]/).pop() : "Slot A"}
          >
            A
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: "0.2rem" }}>
            <button
              type="button"
              className={`small-button${activeSlot === "B" ? " small-button-active" : ""}`}
              onClick={() => activeSlot !== "B" && onSwapSlot("B")}
              title={datasetMetadataB?.source_path ? datasetMetadataB.source_path.split(/[\/\\]/).pop() : "Slot B vide"}
            >
              B
            </button>
            <button
              type="button"
              className="small-button"
              onClick={() => {
                setImportRefTargetSlot("B");
                setImportRefModalOpen(true);
              }}
              disabled={importing}
              style={{ fontSize: "0.7rem", padding: "0.1rem 0.3rem" }}
              title="Importer vers B"
            >
              +
            </button>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.2rem" }}>
            <button
              type="button"
              className={`small-button${activeSlot === "C" ? " small-button-active" : ""}`}
              onClick={() => activeSlot !== "C" && onSwapSlot("C")}
              title={datasetMetadataC?.source_path ? datasetMetadataC.source_path.split(/[\/\\]/).pop() : "Slot C vide"}
            >
              C
            </button>
            <button
              type="button"
              className="small-button"
              onClick={() => {
                setImportRefTargetSlot("C");
                setImportRefModalOpen(true);
              }}
              disabled={importing}
              style={{ fontSize: "0.7rem", padding: "0.1rem 0.3rem" }}
              title="Importer vers C"
            >
              +
            </button>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.2rem" }}>
            <button
              type="button"
              className={`small-button${activeSlot === "D" ? " small-button-active" : ""}`}
              onClick={() => activeSlot !== "D" && onSwapSlot("D")}
              title={datasetMetadataD?.source_path ? datasetMetadataD.source_path.split(/[\/\\]/).pop() : "Slot D vide"}
            >
              D
            </button>
            <button
              type="button"
              className="small-button"
              onClick={() => {
                setImportRefTargetSlot("D");
                setImportRefModalOpen(true);
              }}
              disabled={importing}
              style={{ fontSize: "0.7rem", padding: "0.1rem 0.3rem" }}
              title="Importer vers D"
            >
              +
            </button>
          </div>
          <span style={{ fontSize: "0.75rem", opacity: 0.55, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: "50px" }}>
            {activeSlot === "A"
              ? (datasetMetadata?.source_path ? datasetMetadata.source_path.split(/[\/\\]/).pop() : "A")
              : activeSlot === "B"
              ? (datasetMetadataB?.source_path ? datasetMetadataB.source_path.split(/[\/\\]/).pop() : "B")
              : activeSlot === "C"
              ? (datasetMetadataC?.source_path ? datasetMetadataC.source_path.split(/[\/\\]/).pop() : "C")
              : (datasetMetadataD?.source_path ? datasetMetadataD.source_path.split(/[\/\\]/).pop() : "D")}
          </span>
        </div>
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
              <p className="panel-text">Import a dataset to display signals</p>
            ) : filteredSignals.length === 0 ? (
              <p className="panel-text">No signal verify this filter.</p>
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
          <span>X Axis</span>
        </button>
        {axisSectionOpen ? (
          <div className="import-submenu-content">
            <div className="meta-grid" style={{ marginBottom: "0" }}>
              <div className="meta-item">
                <span>X Axis</span>
                <select
                  className="mini-select"
                  value={xAxisMode}
                  onChange={(event) => setXAxisMode(event.target.value as "distance" | "time")}
                >
                  <option value="distance">Distance</option>
                  <option value="time" disabled={!datasetMetadata?.has_time_axis}>
                    Time
                  </option>
                </select>
              </div>
              <div className="meta-item">
                <span>Source frequency</span>
                <strong>
                  {datasetMetadata?.source_sample_rate_hz
                    ? `${datasetMetadata.source_sample_rate_hz.toFixed(2)} Hz`
                    : "Non disponible"}
                </strong>
              </div>
            </div>

            <details style={{ marginTop: "0.5rem" }}>
              <summary className="panel-text" style={{ cursor: "pointer" }}>
                Offset: start finish/line
              </summary>
              <label className="field-label" htmlFor="start-finish-offset-input">
                Offset (m)
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
          <span>Signals stats</span>
        </button>
        {statsSectionOpen ? (
          <div className="import-submenu-content">
            {loadingStats ? (
              <p className="panel-text loading-inline">
                <span className="loading-spinner" aria-hidden="true" />
                Computation ongoing...
              </p>
            ) : null}
            {statsError ? <p className="panel-text">{statsError}</p> : null}
            {!datasetMetadata || datasetMetadata.signal_names.length === 0 ? (
              <p className="panel-text">Import a dataset to display stats.</p>
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
              <p className="panel-text">No maps saved.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                <input
                  type="text"
                  className="signals-filter-input"
                  value={mapFilter}
                  onChange={(e) => setMapFilter(e.target.value)}
                  placeholder="Filtrer les cartos..."
                />
                {Object.entries(mapConfigs)
                  .filter(([name]) => name.toLowerCase().includes(mapFilter.toLowerCase()))
                  .map(([name, cfg]) => (
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
                {Object.keys(mapConfigs).length > 0 && Object.entries(mapConfigs).filter(([name]) => name.toLowerCase().includes(mapFilter.toLowerCase())).length === 0 ? (
                  <p className="panel-text">No maps verify this filter.</p>
                ) : null}
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

      {importRefModalOpen ? (
        <ImportDataModal
          importing={importing}
          initialMatPath={matPath}
          telDataConfigs={telDataConfigs}
          onImport={
            importRefTargetSlot === "B"
              ? onImportToSlotB
              : importRefTargetSlot === "C"
              ? onImportToSlotC
              : onImportToSlotD
          }
          onImportFromPath={
            importRefTargetSlot === "B"
              ? onImportFromPathToSlotB
              : importRefTargetSlot === "C"
              ? onImportFromPathToSlotC
              : onImportFromPathToSlotD
          }
          onClose={() => setImportRefModalOpen(false)}
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
          <span>TelData Config ({telDataConfigs.length})</span>
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
                      {cfg.channels.length} channels — {cfg.targetFrequencyHz} Hz
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="panel-text">No saved configs.</p>
            )}

            {/* Add new config form */}
            <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", borderTop: "1px solid rgba(255,70,93,0.2)", paddingTop: "0.6rem" }}>
              <label className="field-label">Name</label>
              <input
                className="table-input"
                type="text"
                value={newConfigName}
                onChange={(e) => setNewConfigName(e.target.value)}
                placeholder="ex: ABS channels"
                style={{ width: "100%" }}
              />
              <label className="field-label">Channels (one per line)</label>
              <textarea
                className="table-input"
                value={newConfigChannels}
                onChange={(e) => setNewConfigChannels(e.target.value)}
                placeholder={"cChannel1\ncChannel2\n..."}
                rows={4}
                style={{ width: "100%", resize: "vertical", fontFamily: "monospace", fontSize: "0.8rem" }}
              />
              <label className="field-label">Target frequency (Hz)</label>
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
                Save
              </button>
            </div>
          </div>
        ) : null}
      </div>

      
    </section>
  );
}
