import type { AppInfo } from "../types";

type ImportPanelProps = {
  appInfo: AppInfo | null;
  loading: boolean;
};

export default function ImportPanel({ appInfo, loading }: ImportPanelProps) {
  return (
    <section className="panel import-panel">
      <div className="panel-header">
        <h2>Import</h2>
        <span className="panel-badge">Phase 1</span>
      </div>

      <p className="panel-text">
        This panel will host MAT file import and show source spatial step during phase 2.
      </p>

      <label className="field-label" htmlFor="mat-file-input">
        MAT file
      </label>
      <input id="mat-file-input" type="file" accept=".mat" disabled className="file-input" />

      <div className="meta-grid">
        <div className="meta-item">
          <span>Reference step</span>
          <strong>
            {loading ? "Loading..." : `${appInfo?.reference_distance_step_m ?? "-"} m`}
          </strong>
        </div>
        <div className="meta-item">
          <span>Source step</span>
          <strong>Will be detected at import</strong>
        </div>
        <div className="meta-item">
          <span>Normalization</span>
          <strong>Linear interpolation</strong>
        </div>
      </div>
    </section>
  );
}
