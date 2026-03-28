import { useEffect, useState } from "react";

import { fetchAppInfo } from "./api";
import ImportPanel from "./components/ImportPanel";
import SignalWorkspace from "./components/SignalWorkspace";
import TrackMapPanel from "./components/TrackMapPanel";
import type { AppInfo } from "./types";

export default function App() {
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    fetchAppInfo()
      .then((data) => {
        if (!active) return;
        setAppInfo(data);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Unknown error");
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <h1>Telemetry Display</h1>
          <p>Racing telemetry dashboard - scalable baseline</p>
        </div>
        <div className="status-box">
          <span>Backend</span>
          <strong>{loading ? "Connecting" : error ? "Error" : "Ready"}</strong>
        </div>
      </header>

      {error ? <div className="error-banner">API error: {error}</div> : null}

      <main className="dashboard-grid">
        <ImportPanel appInfo={appInfo} loading={loading} />
        <SignalWorkspace />
        <TrackMapPanel />
      </main>
    </div>
  );
}
