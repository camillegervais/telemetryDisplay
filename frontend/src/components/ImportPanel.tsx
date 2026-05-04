import { useEffect, useMemo, useState, type CSSProperties, type KeyboardEvent } from "react";

import { queryDataset, calculateMapTuning } from "../api";
import { evaluateMathChannel } from "../mathChannels";
import { useTelemetryStore } from "../store/telemetryStore";

import type { AppInfo, DatasetMetadata, MathChannel, MapTuningData } from "../types";

type ImportPanelProps = {
  appInfo: AppInfo | null;
  loadingAppInfo: boolean;
  importing: boolean;
  importMessage: string | null;
  datasetId: string | null;
  datasetMetadata: DatasetMetadata | null;
  mathChannels: MathChannel[];
  onImport: (file: File) => Promise<void>;
  onImportFromPath: (matPath: string) => Promise<void>;
  onAddMathChannel: (name: string, expression: string) => string | null;
  onRemoveMathChannel: (name: string) => void;
  onRefreshMetaData: () => void;
};

type SignalStats = {
  mean: number;
  std: number;
  min: number;
  max: number;
};

const LAST_MAT_PATH_KEY = "telemetry-display.last-mat-path.v1";
const LAST_PICKER_PATH_KEY = "telemetry-display.last-picker-path.v1";
const MAP_TUNING_STORAGE_KEY = "map_tuning_local_configs";

function getMapTuningConfigs(): Record<string, MapTuningData> {
  try {
    const data = localStorage.getItem(MAP_TUNING_STORAGE_KEY);
    return data ? JSON.parse(data) : {};
  } catch (e) {
    return {};
  }
}

function saveMapTuningConfigs(configs: Record<string, MapTuningData>): void {
  try {
    localStorage.setItem(MAP_TUNING_STORAGE_KEY, JSON.stringify(configs));
  } catch (e) {
    console.error("Failed to save map tuning configs", e);
  }
}

interface DecimalNumberInputProps {
  value: number | undefined;
  onChange: (value: number | undefined) => void;
  style?: CSSProperties;
}

function DecimalNumberInput({ value, onChange, style }: DecimalNumberInputProps) {
  const [localValue, setLocalValue] = useState(value === undefined ? "" : String(value));
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    if (!isFocused) {
      setLocalValue(value === undefined ? "" : String(value));
    }
  }, [value, isFocused]);

  const handleBlur = () => {
    setIsFocused(false);
    const trimmed = localValue.trim();
    if (trimmed === "") {
      onChange(undefined);
      return;
    }
    const parsed = parseFloat(trimmed.replace(",", "."));
    if (!isNaN(parsed)) {
      onChange(parsed);
      setLocalValue(String(parsed));
    } else {
      setLocalValue(value === undefined ? "" : String(value));
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
      value={localValue}
      onChange={(e) => setLocalValue(e.target.value)}
      onFocus={(e) => {
        setIsFocused(true);
        e.target.select();
      }}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      style={style}
      placeholder="auto"
    />
  );
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function formatImportMessageLines(message: string): string[] {
  const normalized = message.replace(/\r?\n/g, " ").replace(/\s+/g, " ").trim();
  if (!normalized) {
    return [];
  }

  const lines: string[] = [];
  const firstCommaIndex = normalized.indexOf(",");
  if (firstCommaIndex > 0) {
    lines.push(normalized.slice(0, firstCommaIndex).trim());
  } else {
    lines.push(normalized);
  }

  const sourceStepMatch = normalized.match(/source step\s*([^,\-\s]+m?)/i);
  const referenceStepMatch = normalized.match(/reference step\s*([^,\s]+m?)/i);

  if (sourceStepMatch) {
    lines.push(`Source step: ${sourceStepMatch[1]}`);
  }
  if (referenceStepMatch) {
    lines.push(`Reference step: ${referenceStepMatch[1]}`);
  }

  if (lines.length < 3) {
    const chunks = normalized
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);

    chunks.forEach((chunk) => {
      if (lines.length >= 3) {
        return;
      }
      if (!lines.includes(chunk)) {
        lines.push(chunk);
      }
    });
  }

  return lines.slice(0, 3);
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
  appInfo,
  loadingAppInfo,
  importing,
  importMessage,
  datasetId,
  datasetMetadata,
  mathChannels,
  onImport,
  onImportFromPath,
  onAddMathChannel,
  onRemoveMathChannel,
  onRefreshMetaData
}: ImportPanelProps) {
  const { xAxisMode, startFinishOffsetM, setXAxisMode, setStartFinishOffsetM } = useTelemetryStore();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [matPath, setMatPath] = useState("");
  const [importSectionOpen, setImportSectionOpen] = useState(true);
  const [signalsSectionOpen, setSignalsSectionOpen] = useState(true);
  const [axisSectionOpen, setAxisSectionOpen] = useState(false);
  const [mathSectionOpen, setMathSectionOpen] = useState(false);
  const [statsSectionOpen, setStatsSectionOpen] = useState(false);
  const [signalFilter, setSignalFilter] = useState("");
  const [signalStats, setSignalStats] = useState<Record<string, SignalStats>>({});
  const [loadingStats, setLoadingStats] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [mathName, setMathName] = useState("");
  const [mathExpression, setMathExpression] = useState("");
  const [mathError, setMathError] = useState<string | null>(null);
  const [mapTuningSectionOpen, setMapTuningSectionOpen] = useState(false);
  const [mapTuningGainOffsets, setMapTuningGainOffsets] = useState<Record<string, { gain: number; offset: number }>>({});


  const canImport = useMemo(() => selectedFile !== null && !importing, [importing, selectedFile]);
  const canImportFromPath = useMemo(() => matPath.trim().length > 0 && !importing, [importing, matPath]);
  const allSignals = useMemo(
    () =>
      uniqueStrings([
        ...(datasetMetadata?.signal_names ?? []),
        ...mathChannels.map((channel) => channel.name),
      ]),
    [datasetMetadata, mathChannels]
  );
  const filteredSignals = useMemo(() => {
    const filter = signalFilter.trim().toLowerCase();
    if (!filter) {
      return allSignals;
    }
    return allSignals.filter((signal) => signal.toLowerCase().includes(filter));
  }, [allSignals, signalFilter]);
  const importMessageLines = useMemo(
    () => (importMessage ? formatImportMessageLines(importMessage) : []),
    [importMessage]
  );

  useEffect(() => {
    const savedPath = window.localStorage.getItem(LAST_MAT_PATH_KEY);
    if (savedPath) {
      setMatPath(savedPath);
    }
  }, []);

  useEffect(() => {
    if (datasetMetadata?.source_path) {
      setMatPath(datasetMetadata.source_path);
      window.localStorage.setItem(LAST_MAT_PATH_KEY, datasetMetadata.source_path);
    }
  }, [datasetMetadata?.source_path]);

  useEffect(() => {
    if (xAxisMode === "time" && datasetMetadata && !datasetMetadata.has_time_axis) {
      setXAxisMode("distance");
    }
  }, [datasetMetadata, xAxisMode, setXAxisMode]);

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

    const statsQuerySignals = new Set(datasetMetadata.signal_names);
    mathChannels.forEach((channel) => {
      channel.dependencies.forEach((dependency) => statsQuerySignals.add(dependency));
    });

    queryDataset({
      datasetId,
      signals: Array.from(statsQuerySignals),
      startDistance: datasetMetadata.lap_distance_min,
      endDistance: datasetMetadata.lap_distance_max,
      maxPoints: 5000,
      signal: controller.signal,
    })
      .then((response) => {
        if (!alive) {
          return;
        }

        const signalsWithMath: Record<string, number[]> = { ...response.signals };
        mathChannels.forEach((channel) => {
          try {
            signalsWithMath[channel.name] = evaluateMathChannel(channel, signalsWithMath);
          } catch {
            signalsWithMath[channel.name] = [];
          }
        });

        const computed: Record<string, SignalStats> = {};
        const statsSignals = uniqueStrings([
          ...datasetMetadata.signal_names,
          ...mathChannels.map((channel) => channel.name),
        ]);

        statsSignals.forEach((signal) => {
          const values = signalsWithMath[signal] ?? [];
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
  }, [datasetId, datasetMetadata, mathChannels]);

  function formatStat(value: number): string {
    return Number.isFinite(value) ? value.toFixed(3) : "-";
  }

  const recalculateMapTuning = async (configName: string, gain: number, offset: number) => {
    if (!datasetId) return;
    const configs = getMapTuningConfigs();
    const config = configs[configName];
    if (!config) return;

    try {
      await calculateMapTuning({
        datasetId,
        inputChannelX: config.inputChannelX,
        inputChannelY: config.inputChannelY,
        outputChannelName: config.outputChannelName,
        gridData: config.gridData,
        rowHeaders: config.rowHeaders,
        colHeaders: config.colHeaders,
        braking_signal: config.braking_signal,
        gainVal: gain,
        offsetVal: offset,
      });

      // Update the stored config with new gain/offset
      const updatedConfigs = { ...configs };
      updatedConfigs[configName] = {
        ...config,
        gainVal: gain,
        offsetVal: offset,
      };
      saveMapTuningConfigs(updatedConfigs);

      // Refresh all math channels that depend on this map
      await onRefreshMetaData();
    } catch (err) {
      console.error("Failed to recalculate map tuning:", err);
    }
  };

  async function handleImportClick() {
    if (!selectedFile) {
      return;
    }
    await onImport(selectedFile);
  }

  async function handleImportFromPathClick() {
    const path = matPath.trim().replace(/^"|"$/g, "");
    if (!path) {
      return;
    }
    window.localStorage.setItem(LAST_MAT_PATH_KEY, path);
    await onImportFromPath(path);
  }

  function handleAddMathChannelClick() {
    const error = onAddMathChannel(mathName, mathExpression);
    if (error) {
      setMathError(error);
      return;
    }

    setMathName("");
    setMathExpression("");
    setMathError(null);
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
              MAT file - Load un fichier une seule fois
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

            <label className="field-label" htmlFor="mat-path-input">
              MAT path - Permet de refresh entre les simulations
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
            {importMessageLines.length > 0 ? (
              <p className="panel-text import-message">
                {importMessageLines.map((line, index) => (
                  <span key={`import-msg-${index}`}>
                    {line}
                    {index < importMessageLines.length - 1 ? <br /> : null}
                  </span>
                ))}
              </p>
            ) : null}

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
          onClick={() => setMathSectionOpen((prev) => !prev)}
        >
          <span>{mathSectionOpen ? "▾" : "▸"}</span>
          <span>Math channel ({mathChannels.length})</span>
        </button>
        {mathSectionOpen ? (
          <div className="import-submenu-content math-channel-content">
            <input
              type="text"
              className="signals-filter-input"
              value={mathName}
              onChange={(event) => setMathName(event.target.value)}
              placeholder="Nom du canal (ex: speed_gain)"
            />
            <input
              type="text"
              className="signals-filter-input"
              value={mathExpression}
              onChange={(event) => setMathExpression(event.target.value)}
              placeholder="Expression (ex: gain(speed_kmh, 1.05) - 3)"
            />
            <button className="small-button" onClick={handleAddMathChannelClick}>
              Ajouter math
            </button>
            {mathError ? <p className="panel-text">{mathError}</p> : null}
            {mathChannels.length > 0 ? (
              <div className="signals-stats-list math-channel-list">
                {mathChannels.map((channel) => (
                  <div key={channel.name} className="signals-stats-item">
                    <div className="signals-stats-title">{channel.name}</div>
                    <div className="signals-stats-values math-channel-expression">
                      <span>{channel.expression}</span>
                    </div>
                    <button
                      type="button"
                      className="small-button math-channel-remove"
                      onClick={() => onRemoveMathChannel(channel.name)}
                    >
                      Supprimer
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
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
        ) : null}
      </div>

      {/* Sous-menu Cartographies */}
      <div className="import-submenu">
        <button
          type="button"
          className="import-submenu-toggle"
          onClick={() => setMapTuningSectionOpen((prev) => !prev)}
        >
          <span>{mapTuningSectionOpen ? "▾" : "▸"}</span>
          <span>Cartographies Stockées</span>
        </button>
        {mapTuningSectionOpen ? (
          <div className="import-submenu-content">
            {(() => {
              const configs = getMapTuningConfigs();
              const configNames = Object.keys(configs);
              if (configNames.length === 0) {
                return (
                  <div style={{ padding: "1rem", textAlign: "center", fontSize: "0.8rem", color: "var(--fg-2)" }}>
                    Aucune cartographie stockée
                  </div>
                );
              }

              return (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                  {configNames.map((configName) => {
                    const config = configs[configName];
                    const gains = mapTuningGainOffsets[configName] ?? {
                      gain: config.gainVal ?? 1,
                      offset: config.offsetVal ?? 0,
                    };

                    return (
                      <div
                        key={configName}
                        style={{
                          padding: "0.75rem",
                          border: "1px solid var(--line)",
                          borderRadius: "4px",
                          display: "flex",
                          flexDirection: "column",
                          gap: "0.5rem",
                        }}
                      >
                        <div style={{ fontSize: "0.85rem", fontWeight: "500", color: "var(--fg-1)" }}>
                          {configName}
                        </div>
                        <div style={{ display: "grid", gap: "0.75rem" }}>
                          <div style={{ display: "flex", flexDirection: "column" }}>
                            <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem"}}>
                              <span>Gain:</span>
                              <div style={{ display: "flex", gap: "0.25rem", alignItems: "center"}}>
                                <button
                                  type="button"
                                  className="small-button"
                                  onClick={() =>
                                    setMapTuningGainOffsets((prev) => ({
                                      ...prev,
                                      [configName]: {
                                        ...gains,
                                        gain: Number((gains.gain - 0.1).toFixed(1)),
                                      },
                                    }))
                                  }
                                >
                                  −
                                </button>
                                <DecimalNumberInput
                                  value={gains.gain}
                                  onChange={(newGain) =>
                                    setMapTuningGainOffsets((prev) => ({
                                      ...prev,
                                      [configName]: { ...gains, gain: newGain },
                                    }))
                                  }
                                  style={{
                                    flex: 1,
                                    padding: "0.4rem",
                                    border: "1px solid var(--line)",
                                    borderRadius: "2px",
                                    background: "var(--bg-2)",
                                    color: "var(--fg-1)",
                                  }}
                                />
                                <button
                                  type="button"
                                  className="small-button"
                                  onClick={() =>
                                    setMapTuningGainOffsets((prev) => ({
                                      ...prev,
                                      [configName]: {
                                        ...gains,
                                        gain: Number((gains.gain + 0.1).toFixed(1)),
                                      },
                                    }))
                                  }
                                >
                                  +
                                </button>
                              </div>
                            </label>
                            <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                              <span>Offset:</span>
                              <div style={{ display: "flex", gap: "0.25rem", alignItems: "center" }}>
                                <button
                                  type="button"
                                  className="small-button"
                                  onClick={() =>
                                    setMapTuningGainOffsets((prev) => ({
                                      ...prev,
                                      [configName]: {
                                        ...gains,
                                        offset: Number((gains.offset - 0.1).toFixed(1)),
                                      },
                                    }))
                                  }
                                >
                                  −
                                </button>
                                <DecimalNumberInput
                                  value={gains.offset}
                                  onChange={(newOffset) =>
                                    setMapTuningGainOffsets((prev) => ({
                                      ...prev,
                                      [configName]: { ...gains, offset: newOffset },
                                    }))
                                  }
                                  style={{
                                    flex: 1,
                                    padding: "0.4rem",
                                    border: "1px solid var(--line)",
                                    borderRadius: "2px",
                                    background: "var(--bg-2)",
                                    color: "var(--fg-1)",
                                  }}
                                />
                                <button
                                  type="button"
                                  className="small-button"
                                  onClick={() =>
                                    setMapTuningGainOffsets((prev) => ({
                                      ...prev,
                                      [configName]: {
                                        ...gains,
                                        offset: Number((gains.offset + 0.1).toFixed(1)),
                                      },
                                    }))
                                  }
                                >
                                  +
                                </button>
                              </div>
                            </label>
                          </div>
                        </div>
                        <button
                          className="small-button"
                          onClick={() => recalculateMapTuning(configName, gains.gain, gains.offset)}
                          disabled={!datasetId}
                          style={{ fontSize: "0.8rem" }}
                        >
                          🔄 Recalculer
                        </button>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        ) : null}
      </div>
    </section>
  );
}
