export default function TrackMapPanel() {
  return (
    <section className="panel track-map-panel">
      <div className="panel-header">
        <h2>Track Map</h2>
        <span className="panel-badge">Cursor sync ready</span>
      </div>
      <div className="track-placeholder">
        <div className="track-shape" />
        <div className="car-dot" title="Vehicle cursor position" />
      </div>
    </section>
  );
}
