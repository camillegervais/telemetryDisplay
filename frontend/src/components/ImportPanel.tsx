import { useMemo, useState } from "react";

import type { AppInfo, DatasetMetadata } from "../types";

type ImportPanelProps = {
  appInfo: AppInfo | null;
  loadingAppInfo: boolean;
  importing: boolean;
  importMessage: string | null;
  datasetMetadata: DatasetMetadata | null;
  onImport: (file: File) => Promise<void>;
};

export default function ImportPanel({
  appInfo,
  loadingAppInfo,
  importing,
  importMessage,
  datasetMetadata,
  onImport,
}: ImportPanelProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const canImport = useMemo(() => selectedFile !== null && !importing, [importing, selectedFile]);

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
            {datasetMetadata
              ? `${datasetMetadata.source_distance_step_m.toFixed(2)} m`
              : "-"}
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

      <div className="sidebar-signals">
        <div className="panel-header panel-header-tight sidebar-signals-head">
          <h2>Signaux</h2>
          <span className="panel-badge">{datasetMetadata?.signal_names.length ?? 0}</span>
        </div>

        {!datasetMetadata || datasetMetadata.signal_names.length === 0 ? (
          <p className="panel-text">Importez un dataset pour afficher les signaux.</p>
        ) : (
          <div className="sidebar-signals-list">
            {datasetMetadata.signal_names.map((signal) => (
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
    </section>
  );
}
