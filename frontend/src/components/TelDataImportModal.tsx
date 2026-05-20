import { useState, type CSSProperties } from "react";

import {
  closeTelDataSession,
  exportTelData,
  getTelDataLaps,
  openTelDataSession,
  type TelDataLapInfo,
  type TelDataRunInfo,
} from "../api";
import type { TelDataImportConfig } from "../types/ConfigTypes";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Step = "path" | "run" | "lap" | "config";

interface TelDataImportModalProps {
  configs: TelDataImportConfig[];
  /** Called with the .mat path returned by the export endpoint. */
  onImportFromPath: (matPath: string) => Promise<void>;
  onCancel: () => void;
}

// ---------------------------------------------------------------------------
// Styles (inline, consistent with existing modals)
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
// Helpers
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

  const selectedConfig = configs.find((c) => c.id === selectedConfigId) ?? null;

  // ---- Step handlers -------------------------------------------------------

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
      setError(err instanceof Error ? err.message : "Impossible d'ouvrir l'archive");
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
      setError(err instanceof Error ? err.message : "Impossible de charger les laps");
    } finally {
      setLoading(false);
    }
  }

  async function handleSelectLap(lapId: number) {
    setSelectedLapId(lapId);
    setStep("config");
  }

  async function handleExport() {
    if (!sessionId || selectedRunId === null || selectedLapId === null || !selectedConfig) return;
    setLoading(true);
    setError(null);
    try {
      const exportResult = await exportTelData(
        sessionId,
        selectedRunId,
        selectedLapId,
        selectedConfig.channels,
        selectedConfig.targetFrequencyHz,
      );
      // Feed the generated .mat directly into the existing import pipeline
      await onImportFromPath(exportResult.mat_path);
      // Clean up session (best effort)
      void closeTelDataSession(sessionId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Echec de l'export");
    } finally {
      setLoading(false);
    }
  }

  function handleBack() {
    setError(null);
    if (step === "run") { setStep("path"); setRuns([]); setSelectedRunId(null); }
    else if (step === "lap") { setStep("run"); setLaps([]); setSelectedLapId(null); }
    else if (step === "config") { setStep("lap"); setSelectedLapId(null); }
  }

  // ---- Step labels ---------------------------------------------------------

  const stepLabels: Record<Step, string> = {
    path: "1 — Archive",
    run: "2 — Run",
    lap: "3 — Lap",
    config: "4 — Config + Export",
  };

  // ---- Render --------------------------------------------------------------

  return (
    <div style={overlayStyle} onClick={onCancel}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        <div>
          <div style={headerStyle}>Import TelData</div>
          <div style={{ fontSize: "0.78rem", color: "rgba(255,255,255,0.5)" }}>
            {stepLabels[step]}
          </div>
        </div>

        {error ? (
          <div style={{ color: "var(--accent)", fontSize: "0.82rem", padding: "0.4rem 0.6rem", border: "1px solid rgba(255,70,93,0.4)", borderRadius: "3px" }}>
            {error}
          </div>
        ) : null}

        {/* ---- Step: path ---- */}
        {step === "path" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <label style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.6)" }}>
              Chemin de l'archive TelDataX4
            </label>
            <input
              style={inputStyle}
              type="text"
              value={archivePath}
              onChange={(e) => setArchivePath(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void handleOpenArchive()}
              placeholder="\\server\share\run ou C:\WinTAX4\Data\..."
              autoFocus
            />
            <div style={rowStyle}>
              <button className="small-button" onClick={onCancel} disabled={loading}>Annuler</button>
              <button
                className="import-button"
                onClick={() => void handleOpenArchive()}
                disabled={!archivePath.trim() || loading}
              >
                {loading ? "Ouverture..." : "Ouvrir"}
              </button>
            </div>
          </div>
        ) : null}

        {/* ---- Step: run ---- */}
        {step === "run" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
            <label style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.6)" }}>
              Sélectionner un run ({runs.length})
            </label>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem", maxHeight: "50vh", overflowY: "auto" }}>
              {loading ? (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem", padding: "1rem", color: "var(--accent)" }}>
                  <span className="loading-spinner" aria-hidden="true" />
                  Chargement des runs...
                </div>
              ) : runs.length === 0 ? (
                <div style={{ color: "rgba(255,255,255,0.7)", padding: "1rem" }}>Aucun run trouvé.</div>
              ) : (
                runs.map((run) => (
                  <button
                    key={run.id}
                    style={{ ...(selectedRunId === run.id ? listItemSelected : listItemBase), paddingLeft: `${0.75 + run.level * 1.2}rem` }}
                    onClick={() => void handleSelectRun(run.id)}
                    disabled={loading}
                  >
                    <span>{run.label}</span>
                    {run.lap_count > 0 && (
                      <span style={{ marginLeft: "0.5rem", opacity: 0.5, fontSize: "0.76rem" }}>
                        {run.lap_count} tour{run.lap_count !== 1 ? "s" : ""}
                      </span>
                    )}
                  </button>
                ))
              )}
            </div>
            <div style={rowStyle}>
              <button className="small-button" onClick={handleBack} disabled={loading}>Retour</button>
            </div>
          </div>
        ) : null}

        {/* ---- Step: lap ---- */}
        {step === "lap" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
            <label style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.6)" }}>
              Sélectionner un lap ({laps.length})
            </label>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem", maxHeight: "50vh", overflowY: "auto" }}>
              {loading ? (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem", padding: "1rem", color: "var(--accent)" }}>
                  <span className="loading-spinner" aria-hidden="true" />
                  Chargement des tours...
                </div>
              ) : laps.length === 0 ? (
                <div style={{ color: "rgba(255,255,255,0.7)", padding: "1rem" }}>Aucun tour trouvé.</div>
              ) : (
                laps.map((lap) => (
                  <button
                    key={lap.id}
                    style={selectedLapId === lap.id ? listItemSelected : listItemBase}
                    onClick={() => void handleSelectLap(lap.id)}
                    disabled={loading}
                  >
                    <span style={{ display: "flex", justifyContent: "space-between", width: "100%", alignItems: "center" }}>
                      <span>
                        <span style={{ opacity: 0.45, marginRight: "0.4rem", fontSize: "0.76rem" }}>#{lap.id}</span>
                        {lap.driver_name ? (
                          <strong>{lap.driver_name}</strong>
                        ) : (
                          <span style={{ opacity: 0.55 }}>Inconnu</span>
                        )}
                      </span>
                      <span style={{ opacity: 0.65, fontSize: "0.8rem", fontVariantNumeric: "tabular-nums" }}>
                        {formatLapTime(lap.lap_time_ms)}
                      </span>
                    </span>
                  </button>
                ))
              )}
            </div>
            <div style={rowStyle}>
              <button className="small-button" onClick={handleBack} disabled={loading}>Retour</button>
            </div>
          </div>
        ) : null}

        {/* ---- Step: config ---- */}
        {step === "config" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {configs.length === 0 ? (
              <p style={{ fontSize: "0.82rem", color: "rgba(255,255,255,0.5)" }}>
                Aucune config TelData sauvegardée. Créez-en une dans le panneau "Configs TelData".
              </p>
            ) : (
              <>
                <label style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.6)" }}>
                  Config de channels à exporter
                </label>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                  {configs.map((cfg) => (
                    <button
                      key={cfg.id}
                      style={selectedConfigId === cfg.id ? listItemSelected : listItemBase}
                      onClick={() => setSelectedConfigId(cfg.id)}
                    >
                      <strong>{cfg.name}</strong>
                      <span style={{ marginLeft: "0.5rem", opacity: 0.6 }}>
                        {cfg.channels.length} canaux — {cfg.targetFrequencyHz} Hz
                      </span>
                    </button>
                  ))}
                </div>

                {selectedConfig ? (
              <div style={{ fontSize: "0.78rem", color: "rgba(255,255,255,0.45)", lineHeight: 1.6 }}>
                Canaux: {selectedConfig.channels.join(", ")}
              </div>
            ) : null}
            {loading ? (
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.75rem 0", color: "var(--accent)" }}>
                <span className="loading-spinner" aria-hidden="true" />
                Création du fichier .mat en cours...
              </div>
            ) : null}
          </>
        )}

            <div style={rowStyle}>
              <button className="small-button" onClick={handleBack} disabled={loading}>Retour</button>
              <button
                className="import-button"
                onClick={() => void handleExport()}
                disabled={!selectedConfig || loading}
              >
                {loading ? (
                  <span className="loading-inline">
                    <span className="loading-spinner" aria-hidden="true" />
                    Export + import...
                  </span>
                ) : (
                  "Exporter et charger"
                )}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
