import { useState, type CSSProperties } from "react";

import {
  closeTelDataSession,
  exportTelData,
  getTelDataLaps,
  openTelDataSession,
  getTelDataChannels,
  type TelDataLapInfo,
  type TelDataRunInfo,
} from "../api";
import type { TelDataImportConfig } from "../types/ConfigTypes";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Step = "path" | "run" | "lap" | "config" | "validate";

interface TelDataImportModalProps {
  configs: TelDataImportConfig[];
  onImportFromPath: (matPath: string) => Promise<void>;
  onCancel: () => void;
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const overlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  backgroundColor: "rgba(0, 0, 0, 0.75)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 9999,
};

const modalStyle: CSSProperties = {
  backgroundColor: "rgba(22, 8, 12, 0.97)",
  border: "1px solid rgba(255, 70, 93, 0.35)",
  borderRadius: "8px",
  padding: "1.5rem",
  width: "52vw",
  maxHeight: "88vh",
  overflowY: "auto",
  boxShadow: "0 8px 32px rgba(0, 0, 0, 0.7)",
  fontFamily: '"Space Grotesk", monospace',
  color: "var(--fg-1)",
  display: "flex",
  flexDirection: "column",
  gap: "1rem",
};

const headerStyle: CSSProperties = {
  fontSize: "1.1rem",
  fontWeight: "bold",
  marginBottom: "0.25rem",
  color: "var(--accent)",
};

const inputStyle: CSSProperties = {
  width: "100%",
  padding: "0.45rem 0.6rem",
  border: "1.5px solid rgba(255, 70, 93, 0.4)",
  borderRadius: "3px",
  background: "rgba(22, 8, 12, 0.9)",
  color: "var(--fg-1)",
  fontSize: "0.82rem",
  fontFamily: '"Space Grotesk", monospace',
  boxSizing: "border-box",
};

const listItemBase: CSSProperties = {
  padding: "0.45rem 0.75rem",
  borderRadius: "3px",
  cursor: "pointer",
  border: "1px solid rgba(255, 70, 93, 0.2)",
  fontSize: "0.82rem",
  textAlign: "left",
  background: "transparent",
  color: "var(--fg-1)",
  width: "100%",
};

const listItemSelected: CSSProperties = {
  ...listItemBase,
  border: "1px solid rgba(255, 70, 93, 0.8)",
  background: "rgba(255, 70, 93, 0.1)",
};

const rowStyle: CSSProperties = {
  display: "flex",
  gap: "0.5rem",
  justifyContent: "flex-end",
  marginTop: "0.5rem",
};

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function formatLapTime(ms: number | null): string {
  if (ms === null || ms <= 0) return "—";
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const millis = ms % 1000;
  return `${minutes > 0 ? `${minutes}:` : ""}${String(seconds).padStart(minutes > 0 ? 2 : 1, "0")}.${String(millis).padStart(3, "0")}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TelDataImportModal({ configs, onImportFromPath, onCancel }: TelDataImportModalProps) {
  const [step, setStep] = useState<Step>("path");
  const [archivePath, setArchivePath] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [runs, setRuns] = useState<TelDataRunInfo[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<number | null>(null);
  const [laps, setLaps] = useState<TelDataLapInfo[]>([]);
  const [selectedLapId, setSelectedLapId] = useState<number | null>(null);
  const [selectedConfigId, setSelectedConfigId] = useState<string | null>(
    configs.length > 0 ? configs[0].id : null,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [availableChannels, setAvailableChannels] = useState<string[]>([]);
  const [exportChannels, setExportChannels] = useState<string[]>([]);
  const [channelFilter, setChannelFilter] = useState("");

  const selectedConfig = configs.find((c) => c.id === selectedConfigId) ?? null;

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  function resolveConfigChannels(
    available: string[],
    configChannels: string[],
  ): { present: Array<{ config: string; actual: string }>; missing: string[] } {
    const availMap = new Map(available.map((c) => [c.toLowerCase(), c]));
    const present: Array<{ config: string; actual: string }> = [];
    const missing: string[] = [];
    for (const ch of configChannels) {
      const actual = availMap.get(ch.toLowerCase());
      if (actual !== undefined) {
        present.push({ config: ch, actual });
      } else {
        missing.push(ch);
      }
    }
    return { present, missing };
  }

  // ---------------------------------------------------------------------------
  // Step handlers
  // ---------------------------------------------------------------------------

  async function handleOpenArchive() {
    const path = archivePath.trim();
    if (!path) return;
    setLoading(true);
    setError(null);
    try {
      const result = await openTelDataSession(path);
      setSessionId(result.session_id);
      setRuns(result.runs);
      setStep("run");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible to load the archive");
    } finally {
      setLoading(false);
    }
  }

  async function handleSelectRun(runId: number) {
    if (!sessionId) return;
    setSelectedRunId(runId);
    setLoading(true);
    setError(null);
    try {
      const result = await getTelDataLaps(sessionId, runId);
      setLaps(result.laps);
      setStep("lap");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible to load the laps");
    } finally {
      setLoading(false);
    }
  }

  function handleSelectLap(lapId: number) {
    setSelectedLapId(lapId);
    setAvailableChannels([]);
    setExportChannels([]);
    setChannelFilter("");
    setStep("config");
  }

  async function handleLoadChannels() {
    if (sessionId === null || selectedRunId === null || selectedLapId === null) return;
    setLoading(true);
    setError(null);
    try {
      const ch = await getTelDataChannels(
        sessionId,
        selectedRunId,
        selectedLapId,
        selectedConfig?.vchPath || undefined,
      );
      const available = ch.channels || [];
      setAvailableChannels(available);
      if (selectedConfig) {
        const { present } = resolveConfigChannels(available, selectedConfig.channels);
        setExportChannels(present.map((p) => p.actual));
      } else {
        setExportChannels([]);
      }
      setStep("validate");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible to load the channels");
    } finally {
      setLoading(false);
    }
  }

  async function handleExport() {
    if (
      !sessionId ||
      selectedRunId === null ||
      selectedLapId === null ||
      !selectedConfig ||
      exportChannels.length === 0
    )
      return;
    setLoading(true);
    setError(null);
    try {
      const exportResult = await exportTelData(
        sessionId,
        selectedRunId,
        selectedLapId,
        exportChannels,
        selectedConfig.targetFrequencyHz,
        selectedConfig.vchPath || undefined,
      );
      await onImportFromPath(exportResult.mat_path);
      void closeTelDataSession(sessionId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible to export");
    } finally {
      setLoading(false);
    }
  }

  function handleBack() {
    setError(null);
    if (step === "run") {
      setStep("path");
      setRuns([]);
      setSelectedRunId(null);
    } else if (step === "lap") {
      setStep("run");
      setLaps([]);
      setSelectedLapId(null);
    } else if (step === "config") {
      setStep("lap");
      setSelectedLapId(null);
    } else if (step === "validate") {
      setStep("config");
      setAvailableChannels([]);
      setExportChannels([]);
      setChannelFilter("");
    }
  }

  // ---------------------------------------------------------------------------
  // Derived
  // ---------------------------------------------------------------------------

  const stepLabels: Record<Step, string> = {
    path: "1 — Archive",
    run: "2 — Run",
    lap: "3 — Lap",
    config: "4 — Config",
    validate: "5 — Validation & Export",
  };

  const channelStatus = selectedConfig
    ? resolveConfigChannels(availableChannels, selectedConfig.channels)
    : { present: [], missing: [] };

  const filteredAvailable = [...new Set(availableChannels)].filter((ch) =>
    ch.toLowerCase().includes(channelFilter.toLowerCase()),
  ).sort();

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div style={overlayStyle} onClick={onCancel}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div>
          <div style={headerStyle}>Import TelData</div>
          <div style={{ fontSize: "0.78rem", color: "rgba(255,255,255,0.5)" }}>
            {stepLabels[step]}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div
            style={{
              color: "var(--accent)",
              fontSize: "0.82rem",
              padding: "0.4rem 0.6rem",
              border: "1px solid rgba(255,70,93,0.4)",
              borderRadius: "3px",
            }}
          >
            {error}
          </div>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* Step: path                                                          */}
        {/* ------------------------------------------------------------------ */}
        {step === "path" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <label style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.6)" }}>
              Path to the TelDataX4 archive
            </label>
            {loading ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  padding: "1rem",
                  color: "var(--accent)",
                }}
              >
                <span className="loading-spinner" aria-hidden="true" />
                Loading...
              </div>
            ) : (
              <input
                style={inputStyle}
                type="text"
                value={archivePath}
                onChange={(e) => setArchivePath(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void handleOpenArchive()}
                placeholder="\\server\share\run or C:\WinTAX4\Data\..."
                autoFocus
              />
            )}
            <div style={rowStyle}>
              <button className="small-button" onClick={onCancel} disabled={loading}>
                Return
              </button>
              <button
                className="import-button"
                onClick={() => void handleOpenArchive()}
                disabled={!archivePath.trim() || loading}
              >
                {loading ? "Opening..." : "Open"}
              </button>
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* Step: run                                                           */}
        {/* ------------------------------------------------------------------ */}
        {step === "run" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
            <label style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.6)" }}>
              Select a run ({runs.length})
            </label>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "0.25rem",
                maxHeight: "52vh",
                overflowY: "auto",
              }}
            >
              {loading ? (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    padding: "1rem",
                    color: "var(--accent)",
                  }}
                >
                  <span className="loading-spinner" aria-hidden="true" /> Loading...
                </div>
              ) : runs.length === 0 ? (
                <div style={{ color: "rgba(255,255,255,0.6)", padding: "1rem" }}>
                  No run found.
                </div>
              ) : (
                runs.map((run) => (
                  <button
                    key={run.id}
                    style={{
                      ...(selectedRunId === run.id ? listItemSelected : listItemBase),
                      paddingLeft: `${0.75 + run.level * 1.2}rem`,
                    }}
                    onClick={() => void handleSelectRun(run.id)}
                    disabled={loading}
                  >
                    <span>{run.label}</span>
                    {run.lap_count > 0 && (
                      <span style={{ marginLeft: "0.5rem", opacity: 0.5, fontSize: "0.76rem" }}>
                        {run.lap_count} lap{run.lap_count !== 1 ? "s" : ""}
                      </span>
                    )}
                  </button>
                ))
              )}
            </div>
            <div style={rowStyle}>
              <button className="small-button" onClick={handleBack} disabled={loading}>
                Return
              </button>
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* Step: lap                                                           */}
        {/* ------------------------------------------------------------------ */}
        {step === "lap" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
            <label style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.6)" }}>
              Select a lap ({laps.length})
            </label>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "0.25rem",
                maxHeight: "52vh",
                overflowY: "auto",
              }}
            >
              {laps.length === 0 ? (
                <div style={{ color: "rgba(255,255,255,0.6)", padding: "1rem" }}>
                  No lap found.
                </div>
              ) : (
                laps.map((lap) => (
                  <button
                    key={lap.id}
                    style={selectedLapId === lap.id ? listItemSelected : listItemBase}
                    onClick={() => handleSelectLap(lap.id)}
                  >
                    <span
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        width: "100%",
                        alignItems: "center",
                      }}
                    >
                      <span>
                        <span
                          style={{
                            opacity: 0.45,
                            marginRight: "0.4rem",
                            fontSize: "0.76rem",
                          }}
                        >
                          #{lap.id}
                        </span>
                        {lap.driver_name ? (
                          <strong>{lap.driver_name}</strong>
                        ) : (
                          <span style={{ opacity: 0.55 }}>Unknown</span>
                        )}
                      </span>
                      <span
                        style={{
                          opacity: 0.65,
                          fontSize: "0.8rem",
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {formatLapTime(lap.lap_time_ms)}
                      </span>
                    </span>
                  </button>
                ))
              )}
            </div>
            <div style={rowStyle}>
              <button className="small-button" onClick={handleBack}>
                Return
              </button>
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* Step: config                                                        */}
        {/* ------------------------------------------------------------------ */}
        {step === "config" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {configs.length === 0 ? (
              <p style={{ fontSize: "0.82rem", color: "rgba(255,255,255,0.5)" }}>
                No saved config. Create one in the "Configs TelData" panel.
              </p>
            ) : (
              <>
                <div>
                  <label style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.8)" }}>
                    Import config (channels + frequency)
                  </label>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.25rem",
                      marginTop: "0.3rem",
                    }}
                  >
                    {configs.map((cfg) => (
                      <button
                        key={cfg.id}
                        style={selectedConfigId === cfg.id ? listItemSelected : listItemBase}
                        onClick={() => setSelectedConfigId(cfg.id)}
                      >
                        <span
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "baseline",
                            width: "100%",
                          }}
                        >
                          <strong>{cfg.name}</strong>
                          <span style={{ opacity: 0.55, fontSize: "0.76rem" }}>
                            {cfg.channels.length} channels — {cfg.targetFrequencyHz} Hz
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {selectedConfig && (
                  <div style={{ fontSize: "0.76rem", color: "rgba(255,255,255,0.6)", lineHeight: 1.6 }}>
                    <b>Channels: </b>{selectedConfig.channels.join(", ")}
                  </div>
                )}
                {selectedConfig && (
                  <div style={{ fontSize: "0.76rem", color: "rgba(255,255,255,0.6)", lineHeight: 1.6 }}>
                    <b>VCH Path:</b> {selectedConfig.vchPath}
                  </div>
                )}                
              </>
            )}

            {loading && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  padding: "0.5rem 0",
                  color: "var(--accent)",
                }}
              >
                <span className="loading-spinner" aria-hidden="true" />
                Channels loading...
              </div>
            )}

            <div style={rowStyle}>
              <button className="small-button" onClick={handleBack} disabled={loading}>
                Return
              </button>
              <button
                className="import-button"
                onClick={() => void handleLoadChannels()}
                disabled={!selectedConfig || loading}
              >
                {loading ? "Loading..." : "Load the channels →"}
              </button>
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* Step: validate                                                      */}
        {/* ------------------------------------------------------------------ */}
        {step === "validate" && selectedConfig && (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>

            {/* Config channel status */}
            <div>
              <div
                style={{
                  fontSize: "0.8rem",
                  color: "rgba(255,255,255,0.6)",
                  marginBottom: "0.35rem",
                }}
              >
                Config's channel "{selectedConfig.name}"
                <span style={{ marginLeft: "0.4rem", opacity: 0.5 }}>
                  ({channelStatus.present.length}/{selectedConfig.channels.length} available)
                </span>
              </div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.2rem",
                  maxHeight: "22vh",
                  overflowY: "auto",
                  border: "1px solid rgba(255,70,93,0.12)",
                  borderRadius: "3px",
                  padding: "0.4rem",
                }}
              >
                {selectedConfig.channels.map((ch) => {
                  const found = channelStatus.present.find((p) => p.config === ch);
                  return (
                    <div
                      key={ch}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.5rem",
                        fontSize: "0.8rem",
                        padding: "0.2rem 0.3rem",
                      }}
                    >
                      <span
                        style={{
                          color: found ? "#4caf50" : "rgba(255,70,93,0.9)",
                          fontSize: "0.85rem",
                          fontWeight: "bold",
                          minWidth: "1rem",
                        }}
                      >
                        {found ? "✓" : "✗"}
                      </span>
                      <span
                        style={{ fontFamily: "monospace", opacity: found ? 1 : 0.5 }}
                      >
                        {ch}
                      </span>
                      {found && found.actual !== ch && (
                        <span style={{ fontSize: "0.72rem", opacity: 0.45 }}>
                          → {found.actual}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
              {channelStatus.missing.length > 0 && (
                <div
                  style={{
                    fontSize: "0.76rem",
                    color: "rgba(255,70,93,0.7)",
                    marginTop: "0.25rem",
                  }}
                >
                  {channelStatus.missing.length} channel
                  {channelStatus.missing.length > 1 ? "s" : ""} unavailable
                  {channelStatus.missing.length > 1 ? "s" : ""} — ignored
                  {channelStatus.missing.length > 1 ? "s" : ""} in the export.
                </div>
              )}
            </div>

            {/* All available channels — filterable reference list */}
            <div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: "0.25rem",
                }}
              >
                <div style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.6)" }}>
                  All channels available ({availableChannels.length})
                </div>
                <input
                  type="text"
                  placeholder="Filter..."
                  value={channelFilter}
                  onChange={(e) => setChannelFilter(e.target.value)}
                  style={{ ...inputStyle, width: "45%", padding: "0.3rem 0.5rem" }}
                />
              </div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.15rem",
                  maxHeight: "22vh",
                  overflowY: "auto",
                  border: "1px solid rgba(255,70,93,0.12)",
                  borderRadius: "3px",
                  padding: "0.4rem",
                }}
              >
                {filteredAvailable.length === 0 ? (
                  <div style={{ color: "rgba(255,255,255,0.5)", fontSize: "0.8rem" }}>
                    No result.
                  </div>
                ) : (
                  filteredAvailable.map((ch) => {
                    const inConfig = selectedConfig.channels.some(
                      (c) => c.toLowerCase() === ch.toLowerCase(),
                    );
                    const id_div = ch + '-1';
                    return (
                      <div
                        key={id_div}
                        style={{
                          fontSize: "0.78rem",
                          fontFamily: "monospace",
                          padding: "0.15rem 0.3rem",
                          color: inConfig
                            ? "rgba(255,255,255,0.9)"
                            : "rgba(255,255,255,0.4)",
                        }}
                      >
                        {ch}
                        {inConfig && (
                          <span
                            style={{
                              marginLeft: "0.4rem",
                              color: "#4caf50",
                              fontSize: "0.7rem",
                            }}
                          >
                            ✓ config
                          </span>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Export summary */}
            <div
              style={{
                fontSize: "0.78rem",
                padding: "0.5rem 0.6rem",
                border: "1px solid rgba(255,70,93,0.12)",
                borderRadius: "3px",
                color: "rgba(255,255,255,0.6)",
                lineHeight: 1.7,
              }}
            >
              <strong style={{ color: "rgba(255,255,255,0.8)" }}>Export :</strong>{" "}
              {exportChannels.length} channel{exportChannels.length !== 1 ? "s" : ""} —{" "}
              {selectedConfig.targetFrequencyHz} Hz
              {selectedConfig.vchPath && (
                <div style={{ opacity: 0.55, fontSize: "0.74rem" }}>VCH : {selectedConfig.vchPath}</div>
              )}
            </div>

            {loading && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  color: "var(--accent)",
                  fontSize: "0.82rem",
                }}
              >
                <span className="loading-spinner" aria-hidden="true" />
                Exporting the .mat...
              </div>
            )}

            <div style={rowStyle}>
              <button className="small-button" onClick={handleBack} disabled={loading}>
                Return
              </button>
              <button
                className="import-button"
                onClick={() => void handleExport()}
                disabled={exportChannels.length === 0 || loading}
              >
                {loading ? (
                  <span className="loading-inline">
                    <span className="loading-spinner" aria-hidden="true" />
                    Export + import...
                  </span>
                ) : (
                  `Export ${exportChannels.length} channel${exportChannels.length !== 1 ? "s" : ""}`
                )}
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
