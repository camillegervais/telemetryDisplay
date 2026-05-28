import { useEffect, useMemo, useState } from "react";

import { fetchRecentImports, deleteRecentImport } from "../api";
import { TelDataImportModal } from "./TelDataImportModal";

import type { RecentImportItem } from "../types";
import type { TelDataImportConfig } from "../types/ConfigTypes";

const LAST_MAT_PATH_KEY = "telemetry-display.last-mat-path.v1";

type ImportDataModalProps = {
  importing: boolean;
  initialMatPath: string;
  telDataConfigs: TelDataImportConfig[];
  onImport: (file: File) => Promise<void>;
  onImportFromPath: (path: string) => Promise<void>;
  onClose: () => void;
};

export function ImportDataModal({
  importing,
  initialMatPath,
  telDataConfigs,
  onImport,
  onImportFromPath,
  onClose,
}: ImportDataModalProps) {
  const [tab, setTab] = useState<"mat" | "recent" | "teldata">("mat");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [matPath, setMatPath] = useState(initialMatPath);
  const [recentImports, setRecentImports] = useState<RecentImportItem[]>([]);
  const [loadingRecent, setLoadingRecent] = useState(false);
  const [recentError, setRecentError] = useState<string | null>(null);
  const [telDataModalOpen, setTelDataModalOpen] = useState(false);

  const canImport = useMemo(() => selectedFile !== null && !importing, [importing, selectedFile]);
  const canImportFromPath = useMemo(() => matPath.trim().length > 0 && !importing, [importing, matPath]);

  useEffect(() => {
    if (tab !== "recent") return;
    let alive = true;
    setLoadingRecent(true);
    setRecentError(null);
    fetchRecentImports(15)
      .then((res) => { if (alive) setRecentImports(res.items); })
      .catch((err: unknown) => { if (alive) setRecentError(err instanceof Error ? err.message : "Erreur de chargement"); })
      .finally(() => { if (alive) setLoadingRecent(false); });
    return () => { alive = false; };
  }, [tab]);

  function refreshRecentImports() {
    setLoadingRecent(true);
    setRecentError(null);
    fetchRecentImports(15)
      .then((res) => setRecentImports(res.items))
      .catch((err: unknown) => setRecentError(err instanceof Error ? err.message : "Erreur"))
      .finally(() => setLoadingRecent(false));
  }

  function formatImportDate(isoStr: string): string {
    try {
      const d = new Date(isoStr);
      return (
        d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "2-digit" }) +
        " " +
        d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
      );
    } catch {
      return isoStr;
    }
  }

  function formatFileSize(bytes: number | null): string {
    if (!bytes) return "";
    if (bytes < 1024 * 1024) return ` — ${(bytes / 1024).toFixed(0)} Ko`;
    return ` — ${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
  }

  function getDisplayName(item: RecentImportItem): string {
    if (item.dataset_name) return item.dataset_name;
    const displayPath = item.original_path ?? item.source_path;
    return displayPath.split(/[/\\]/).pop() ?? displayPath;
  }

  return (
    <>
      <div
        className="import-data-modal-overlay"
        onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        <div className="import-data-modal">
          <div className="import-data-modal-header">
            <h3>Importer des données</h3>
            <button
              className="small-button"
              type="button"
              onClick={onClose}
              aria-label="Fermer"
            >
              ✕
            </button>
          </div>

          <div className="import-data-modal-tabs">
            <button
              type="button"
              className={`import-data-modal-tab${tab === "mat" ? " active" : ""}`}
              onClick={() => setTab("mat")}
            >
              Import MAT
            </button>
            <button
              type="button"
              className={`import-data-modal-tab${tab === "recent" ? " active" : ""}`}
              onClick={() => setTab("recent")}
            >
              Récents
            </button>
            <button
              type="button"
              className={`import-data-modal-tab${tab === "teldata" ? " active" : ""}`}
              onClick={() => setTab("teldata")}
            >
              TelData
            </button>
          </div>

          <div className="import-data-modal-body">
            {tab === "mat" ? (
              <>
                <label className="field-label" htmlFor="modal-mat-file-input">
                  MAT file — Load un fichier une seule fois
                </label>
                <input
                  id="modal-mat-file-input"
                  type="file"
                  accept=".mat"
                  className="file-input"
                  onChange={(event) => {
                    const pickedFile = event.target.files?.[0] ?? null;
                    setSelectedFile(pickedFile);
                  }}
                />
                {selectedFile ? <p className="panel-text file-picked">{selectedFile.name}</p> : null}
                <button
                  className="import-button"
                  disabled={!canImport}
                  onClick={async () => {
                    if (!selectedFile) return;
                    onClose();
                    await onImport(selectedFile);
                  }}
                >
                  Importer le dataset
                </button>

                <label
                  className="field-label"
                  htmlFor="modal-mat-path-input"
                  style={{ marginTop: "0.5rem" }}
                >
                  MAT path — Permet de refresh entre les simulations
                </label>
                <input
                  id="modal-mat-path-input"
                  type="text"
                  className="signals-filter-input"
                  value={matPath}
                  onChange={(event) => setMatPath(event.target.value)}
                  placeholder="Ex: C:/Users/.../data/imola.mat"
                />
                <button
                  className="import-button"
                  disabled={!canImportFromPath}
                  onClick={async () => {
                    const path = matPath.trim().replace(/^"|"$/g, "");
                    if (!path) return;
                    window.localStorage.setItem(LAST_MAT_PATH_KEY, path);
                    onClose();
                    await onImportFromPath(path);
                  }}
                >
                  Importer depuis chemin
                </button>
              </>
            ) : tab === "recent" ? (
              <>
                <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "0.4rem" }}>
                  <button
                    className="small-button"
                    type="button"
                    onClick={refreshRecentImports}
                    disabled={loadingRecent}
                    title="Rafraîchir la liste"
                  >
                    ↺
                  </button>
                </div>
                {loadingRecent ? (
                  <p className="panel-text loading-inline">
                    <span className="loading-spinner" aria-hidden="true" />
                    Chargement...
                  </p>
                ) : recentError ? (
                  <p className="panel-text">{recentError}</p>
                ) : recentImports.length === 0 ? (
                  <p className="panel-text">Aucun import récent.</p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                    {recentImports.map((item) => (
                      <div
                        key={item.import_id}
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: "0.15rem",
                          padding: "0.4rem 0.5rem",
                          border: "1px solid rgba(255,70,93,0.2)",
                          borderRadius: "3px",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "flex-start",
                            gap: "0.4rem",
                          }}
                        >
                          <div
                            style={{
                              fontSize: "0.83rem",
                              fontWeight: 600,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                              flex: 1,
                              minWidth: 0,
                            }}
                            title={item.original_path ?? item.source_path}
                          >
                            {getDisplayName(item)}
                          </div>
                          <button
                            className="small-button"
                            type="button"
                            title="Supprimer cet import"
                            onClick={() => {
                              deleteRecentImport(item.import_id)
                                .then(() =>
                                  setRecentImports((prev) =>
                                    prev.filter((r) => r.import_id !== item.import_id)
                                  )
                                )
                                .catch(() => {});
                            }}
                          >
                            ✕
                          </button>
                        </div>
                        <div style={{ fontSize: "0.74rem", opacity: 0.55 }}>
                          {formatImportDate(item.imported_at)}
                          {item.signal_count != null ? ` — ${item.signal_count} signaux` : ""}
                          {formatFileSize(item.file_size)}
                          {item.max_slap != null ? ` — Max sLap: ${item.max_slap.toFixed(2)} m` : ""}
                          {item.max_tlap != null ? ` — Max tLap: ${item.max_tlap.toFixed(2)} s` : ""}
                        </div>
                        {item.original_path ? (
                          <div
                            style={{
                              fontSize: "0.70rem",
                              opacity: 0.4,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                            title={item.original_path}
                          >
                            {item.original_path}
                          </div>
                        ) : null}
                        <button
                          className="import-button"
                          type="button"
                          style={{ marginTop: "0.25rem", padding: "0.2rem 0.5rem", fontSize: "0.78rem" }}
                          onClick={() => {
                            onClose();
                            onImportFromPath(item.source_path);
                          }}
                          disabled={importing}
                        >
                          {importing ? "Import en cours..." : "Charger"}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <>
                <p className="panel-text" style={{ marginBottom: "0.5rem" }}>
                  Ouvrez une archive TelData pour importer un dataset.
                </p>
                <img src="./../public/marelli_logo.png" style={{width: '30%', alignSelf: 'center', marginBottom: '1rem'}}></img>
                <button
                  className="import-button"
                  type="button"
                  onClick={() => setTelDataModalOpen(true)}
                >
                  Ouvrir archive TelData…
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {telDataModalOpen ? (
        <TelDataImportModal
          configs={telDataConfigs}
          onImportFromPath={async (path) => {
            setTelDataModalOpen(false);
            onClose();
            await onImportFromPath(path);
          }}
          onCancel={() => setTelDataModalOpen(false)}
        />
      ) : null}
    </>
  );
}
