export default function SignalWorkspace() {
  return (
    <section className="panel signal-workspace">
      <div className="panel-header">
        <h2>Signals</h2>
        <span className="panel-badge">Scalable layout</span>
      </div>
      <div className="workspace-placeholder">
        <div className="placeholder-graph">Graph container A (multi-axis)</div>
        <div className="placeholder-graph">Graph container B (multi-axis)</div>
      </div>
    </section>
  );
}
