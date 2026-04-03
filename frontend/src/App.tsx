import { useEffect, useMemo, useState } from "react";

import {
  fetchAppInfo,
  fetchDatasetMetadata,
  fetchTrackMap,
  importDataset,
  importDatasetFromPath,
} from "./api";
import { ImportPanel, SignalWorkspace } from "./components";
import { analyzeMathExpression } from "./mathChannels";
import { useTelemetryStore } from "./store/telemetryStore";
import type { AppInfo, DatasetMetadata, MathChannel, TrackMapResponse } from "./types";
import type { InspectorCommand, InspectorSnapshot } from "./components/SignalWorkspace";

const USER_DISPLAY_NAME_KEY = "telemetry-display.user-display-name.v1";

function isEditableElement(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  if (target.isContentEditable) {
    return true;
  }
  return target.closest("input, textarea, select, [contenteditable='true']") !== null;
}

export default function App() {
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [loadingAppInfo, setLoadingAppInfo] = useState(true);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [datasetId, setDatasetId] = useState<string | null>(null);
  const [datasetMetadata, setDatasetMetadata] = useState<DatasetMetadata | null>(null);
  const [trackMap, setTrackMap] = useState<TrackMapResponse | null>(null);
  const [mathChannels, setMathChannels] = useState<MathChannel[]>([]);
  const [graphOnlyMode, setGraphOnlyMode] = useState(false);
  const [userDisplayName, setUserDisplayName] = useState("");
  const [panelSide, setPanelSide] = useState<"left" | "right">("left");
  const [panelMode, setPanelMode] = useState<"data" | "inspector">("data");
  const [inspectorSnapshot, setInspectorSnapshot] = useState<InspectorSnapshot | null>(null);
  const [inspectorSelectedWidgetId, setInspectorSelectedWidgetId] = useState<number | null>(null);
  const [inspectorCommand, setInspectorCommand] = useState<InspectorCommand | null>(null);
  const [shortcutsModalOpen, setShortcutsModalOpen] = useState(false);

  const { setXRange, setCursorDistance, triggerHomeReset } = useTelemetryStore();

  function resetAllGraphsToHome() {
    setXRange(null);
    triggerHomeReset();
  }

  useEffect(() => {
    const savedName = window.localStorage.getItem(USER_DISPLAY_NAME_KEY);
    if (savedName) {
      setUserDisplayName(savedName);
    }

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
        setLoadingAppInfo(false);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    window.localStorage.setItem(USER_DISPLAY_NAME_KEY, userDisplayName.trim());
  }, [userDisplayName]);

  useEffect(() => {
    function onGlobalKeyDown(event: KeyboardEvent) {
      if (isEditableElement(event.target)) {
        return;
      }

      if (shortcutsModalOpen) {
        if (event.code === "Escape") {
          event.preventDefault();
          setShortcutsModalOpen(false);
        }
        return;
      }

      if (event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }

      if (event.code === "KeyH") {
        event.preventDefault();
        resetAllGraphsToHome();
        return;
      }

      if (event.code === "KeyG") {
        event.preventDefault();
        setGraphOnlyMode((prev) => !prev);
        return;
      }

      if (event.code === "KeyI") {
        event.preventDefault();
        setPanelMode((prev) => (prev === "data" ? "inspector" : "data"));
        return;
      }

      if (event.code === "KeyP") {
        event.preventDefault();
        setPanelSide((prev) => (prev === "left" ? "right" : "left"));
      }
    }

    window.addEventListener("keydown", onGlobalKeyDown);
    return () => {
      window.removeEventListener("keydown", onGlobalKeyDown);
    };
  }, [shortcutsModalOpen]);

  async function handleImport(file: File) {
    setImporting(true);
    setError(null);

    try {
      const imported = await importDataset(file);
      await loadImportedDataset(imported.dataset_id, imported.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImporting(false);
    }
  }

  async function handleImportFromPath(matPath: string) {
    setImporting(true);
    setError(null);

    try {
      const imported = await importDatasetFromPath(matPath);
      await loadImportedDataset(imported.dataset_id, imported.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImporting(false);
    }
  }

  async function loadImportedDataset(nextDatasetId: string, message: string) {
    setDatasetId(nextDatasetId);
    setImportMessage(message);

    const [metadata, map] = await Promise.all([
      fetchDatasetMetadata(nextDatasetId),
      fetchTrackMap(nextDatasetId),
    ]);

    setDatasetMetadata(metadata);
    setTrackMap(map);
    setMathChannels([]);
    setXRange(null);
    setCursorDistance(null);
  }

  function handleAddMathChannel(name: string, expression: string): string | null {
    if (!datasetMetadata) {
      return "Dataset requis";
    }

    const trimmedName = name.trim();
    if (!trimmedName) {
      return "Nom requis";
    }

    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(trimmedName)) {
      return "Nom invalide (lettres/chiffres/underscore)";
    }

    const existing = new Set([
      ...datasetMetadata.signal_names,
      ...mathChannels.map((channel) => channel.name),
    ]);
    if (existing.has(trimmedName)) {
      return "Nom deja utilise";
    }

    const { dependencies, error } = analyzeMathExpression(expression, datasetMetadata.signal_names);
    if (error) {
      return error;
    }

    setMathChannels((prev) => [
      ...prev,
      {
        name: trimmedName,
        expression: expression.trim(),
        dependencies,
      },
    ]);
    return null;
  }

  function handleRemoveMathChannel(name: string) {
    setMathChannels((prev) => prev.filter((channel) => channel.name !== name));
  }

  const activeInspectorWidget = useMemo(() => {
    if (!inspectorSnapshot || inspectorSelectedWidgetId === null) {
      return null;
    }
    return inspectorSnapshot.widgets.find((widget) => widget.id === inspectorSelectedWidgetId) ?? null;
  }, [inspectorSnapshot, inspectorSelectedWidgetId]);

  function pushInspectorCommand(command: InspectorCommand) {
    setInspectorCommand({ ...command });
  }

  const activeInspectorAlignModeLabel =
    activeInspectorWidget?.alignMode === "origin-only"
      ? "Origine seulement"
      : activeInspectorWidget?.alignMode === "origin-scale"
      ? "Origine + echelle"
      : "Desactive";

  const inspectorPanel = (
    <section className="panel import-panel inspector-panel">
      <div className="panel-header">
        <h2>Inspecteur</h2>
        <span className="panel-badge">Graphes</span>
      </div>
      <div className="import-submenu-content">
        <div className="meta-grid" style={{ marginBottom: "0.6rem" }}>
          <div className="meta-item">
            <span>Onglet actif</span>
            <strong>{inspectorSnapshot?.activeTabName ?? "-"}</strong>
          </div>
          <div className="meta-item">
            <span>Widgets</span>
            <strong>{inspectorSnapshot?.widgets.length ?? 0}</strong>
          </div>
        </div>

        {!inspectorSnapshot || inspectorSnapshot.widgets.length === 0 ? (
          <p className="panel-text">Selectionnez un onglet avec des graphes.</p>
        ) : (
          <>
            <div className="inspector-widget-list" role="listbox" aria-label="Widgets du dashboard">
              {inspectorSnapshot.widgets.map((widget) => (
                <button
                  key={`inspector-widget-${widget.id}`}
                  className={`inspector-widget-item ${widget.id === inspectorSelectedWidgetId ? "inspector-widget-item-active" : ""}`}
                  onClick={() => setInspectorSelectedWidgetId(widget.id)}
                >
                  <span>{widget.title}</span>
                  <strong>{widget.kind === "xy" ? "XY" : "Serie"}</strong>
                </button>
              ))}
            </div>

            {activeInspectorWidget ? (
              <div className="inspector-layout" style={{ marginTop: "0.6rem" }}>
                <div className="inspector-grid inspector-grid-info">
                  <div className="meta-item">
                    <span>Type</span>
                    <strong>{activeInspectorWidget.kind === "xy" ? "XY" : "Temporel"}</strong>
                  </div>
                  <div className="meta-item">
                    <span>Signaux</span>
                    <strong>{activeInspectorWidget.signalsCount}</strong>
                  </div>
                  <div className="meta-item">
                    <span>Position</span>
                    <strong>L{activeInspectorWidget.row} C{activeInspectorWidget.col}</strong>
                  </div>
                  <div className="meta-item">
                    <span>Taille</span>
                    <strong>{activeInspectorWidget.widthSpan}x{activeInspectorWidget.heightSpan}</strong>
                  </div>
                  {activeInspectorWidget.kind === "xy" ? (
                    <div className="meta-item">
                      <span>Signal X</span>
                      <strong>{activeInspectorWidget.xSignal ?? "-"}</strong>
                    </div>
                  ) : (
                    <div className="meta-item">
                      <span>Match axes Y</span>
                      <strong>{activeInspectorAlignModeLabel}</strong>
                    </div>
                  )}
                  <div className="meta-item">
                    <span>Menu</span>
                    <strong>{activeInspectorWidget.menuOpen ? "Ouvert" : "Ferme"}</strong>
                  </div>
                </div>

                <div className="inspector-grid inspector-grid-actions">
                  <div className="meta-item inspector-actions">
                    <span>Actions rapides</span>
                    <div className="inspector-controls-row">
                      <button
                        className="small-button"
                        onClick={() =>
                          pushInspectorCommand({
                            type: "toggle-menu",
                            widgetId: activeInspectorWidget.id,
                          })
                        }
                      >
                        Menu
                      </button>
                      {activeInspectorWidget.kind === "timeseries" ? (
                        <>
                          <button
                            className="small-button"
                            onClick={() =>
                              pushInspectorCommand({
                                type: "set-align-zero",
                                widgetId: activeInspectorWidget.id,
                                alignZero: !activeInspectorWidget.alignZero,
                              })
                            }
                          >
                            Match Y
                          </button>
                          {activeInspectorWidget.alignZero ? (
                            <select
                              className="mini-select"
                              value={activeInspectorWidget.alignMode === "origin-only" ? "origin-only" : "origin-scale"}
                              onChange={(event) =>
                                pushInspectorCommand({
                                  type: "set-align-mode",
                                  widgetId: activeInspectorWidget.id,
                                  alignMode: event.target.value === "origin-only" ? "origin-only" : "origin-scale",
                                })
                              }
                            >
                              <option value="origin-scale">Origine + echelle</option>
                              <option value="origin-only">Origine seulement</option>
                            </select>
                          ) : null}
                        </>
                      ) : null}
                    </div>
                  </div>
                  <div className="meta-item inspector-actions">
                    <span>Taille</span>
                    <div className="inspector-controls-row">
                      <label>
                        W
                        <select
                          className="mini-select"
                          value={activeInspectorWidget.widthSpan}
                          onChange={(event) =>
                            pushInspectorCommand({
                              type: "set-size",
                              widgetId: activeInspectorWidget.id,
                              widthSpan: Number(event.target.value),
                              heightSpan: activeInspectorWidget.heightSpan,
                            })
                          }
                        >
                          <option value={1}>1</option>
                          <option value={2}>2</option>
                          <option value={3}>3</option>
                          <option value={4}>4</option>
                        </select>
                      </label>
                      <label>
                        H
                        <select
                          className="mini-select"
                          value={activeInspectorWidget.heightSpan}
                          onChange={(event) =>
                            pushInspectorCommand({
                              type: "set-size",
                              widgetId: activeInspectorWidget.id,
                              widthSpan: activeInspectorWidget.widthSpan,
                              heightSpan: Number(event.target.value),
                            })
                          }
                        >
                          <option value={1}>1</option>
                          <option value={2}>2</option>
                          <option value={3}>3</option>
                          <option value={4}>4</option>
                        </select>
                      </label>
                    </div>
                  </div>
                  <div className="meta-item inspector-actions">
                    <span>Position</span>
                    <div className="inspector-controls-row">
                      <label>
                        L
                        <select
                          className="mini-select"
                          value={activeInspectorWidget.row}
                          onChange={(event) =>
                            pushInspectorCommand({
                              type: "set-position",
                              widgetId: activeInspectorWidget.id,
                              row: Number(event.target.value),
                              col: activeInspectorWidget.col,
                            })
                          }
                        >
                          {Array.from({ length: inspectorSnapshot?.gridRows ?? 1 }, (_, idx) => idx + 1).map((row) => (
                            <option key={`inspector-row-${row}`} value={row}>
                              {row}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        C
                        <select
                          className="mini-select"
                          value={activeInspectorWidget.col}
                          onChange={(event) =>
                            pushInspectorCommand({
                              type: "set-position",
                              widgetId: activeInspectorWidget.id,
                              row: activeInspectorWidget.row,
                              col: Number(event.target.value),
                            })
                          }
                        >
                          {Array.from({ length: inspectorSnapshot?.gridCols ?? 1 }, (_, idx) => idx + 1).map((col) => (
                            <option key={`inspector-col-${col}`} value={col}>
                              {col}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <p className="panel-text inspector-empty">Selectionnez un widget dans la liste.</p>
            )}
          </>
        )}
      </div>
    </section>
  );

  const shortcutGroups: Array<{ title: string; items: Array<{ keys: string; action: string }> }> = [
    {
      title: "Global",
      items: [
        { keys: "H", action: "Reset Home (zoom/axes)" },
        { keys: "G", action: "Basculer mode Graphes/UI" },
        { keys: "I", action: "Basculer Data Hub/Inspecteur" },
        { keys: "P", action: "Basculer panneau gauche/droite" },
      ],
    },
    {
      title: "Dashboard",
      items: [
        { keys: "A", action: "Ajouter un graphe" },
        { keys: "X", action: "Ajouter un graphe XY" },
        { keys: "T", action: "Ajouter un onglet" },
        { keys: "Ctrl+S", action: "Sauver configuration" },
        { keys: "Ctrl+O", action: "Charger configuration selectionnee" },
        { keys: "Ctrl+Tab", action: "Onglet suivant" },
        { keys: "Ctrl+Shift+Tab", action: "Onglet precedent" },
        { keys: "1..9", action: "Aller a l'onglet N" },
      ],
    },
    {
      title: "Widget",
      items: [
        { keys: "Delete", action: "Supprimer widget selectionne" },
        { keys: "Enter", action: "Ouvrir/fermer menu widget" },
        { keys: "F", action: "Agrandir/reduire widget" },
        { keys: "Flèches", action: "Deplacer widget selectionne" },
        { keys: "Shift+Flèches", action: "Redimensionner widget selectionne" },
        { keys: "Esc", action: "Fermer menus/expand/deselection" },
      ],
    },
  ];

  return (
    <div className={`app-shell ${graphOnlyMode ? "graph-only-mode" : ""}`}>
      <header className="topbar">
        <div className="topbar-brand">
          <div className="app-logo" aria-hidden="true">
            <span className="app-logo-ring" />
            <span className="app-logo-core">TD</span>
          </div>
          <div>
            <h1>Telemetry Display</h1>
            <p>
              Race Telemetry Console
              {userDisplayName.trim() ? ` - ${userDisplayName.trim()}` : ""}
            </p>
          </div>
        </div>
        <div className="topbar-actions">
          <details className="topbar-user-menu">
            <summary className="small-button topbar-icon-button" title="Profil" aria-label="Profil">
              <span aria-hidden="true">◉</span>
            </summary>
            <div className="topbar-user-menu-content">
              <label className="field-label" htmlFor="topbar-user-input">
                Prenom
              </label>
              <input
                id="topbar-user-input"
                type="text"
                className="topbar-user-input"
                value={userDisplayName}
                onChange={(event) => setUserDisplayName(event.target.value)}
                placeholder="Votre prenom"
                aria-label="Prenom utilisateur"
              />
            </div>
          </details>
          <button className="small-button topbar-icon-button" onClick={resetAllGraphsToHome} title="Home (H)" aria-label="Home">
            <span aria-hidden="true">⌂</span>
          </button>
          <button
            className="small-button topbar-icon-button"
            onClick={() => setPanelSide((prev) => (prev === "left" ? "right" : "left"))}
            title={`Changer cote panneau (P) - ${panelSide === "left" ? "Gauche" : "Droite"}`}
            aria-label="Changer cote panneau"
          >
            <span aria-hidden="true">⇆</span>
          </button>
          <button
            className="small-button topbar-icon-button"
            onClick={() => setGraphOnlyMode((prev) => !prev)}
            title={graphOnlyMode ? "Mode UI (G)" : "Mode Graphes (G)"}
            aria-label="Basculer mode Graphes"
          >
            <span aria-hidden="true">▣</span>
          </button>
          <button
            className="small-button topbar-icon-button"
            onClick={() => setPanelMode((prev) => (prev === "data" ? "inspector" : "data"))}
            title={panelMode === "data" ? "Ouvrir Inspecteur (I)" : "Ouvrir Data Hub (I)"}
            aria-label="Basculer Data Hub Inspecteur"
          >
            <span aria-hidden="true">⌘</span>
          </button>
          <button
            className="small-button topbar-icon-button"
            onClick={() => setShortcutsModalOpen(true)}
            title="Aide raccourcis clavier"
            aria-label="Aide raccourcis clavier"
          >
            <span aria-hidden="true">?</span>
          </button>
          <div className="status-box">
            <span>Backend</span>
            <strong>{loadingAppInfo ? "Connecting" : error ? "Error" : "Ready"}</strong>
          </div>
        </div>
      </header>

      {error ? <div className="error-banner">API error: {error}</div> : null}

      {importing ? (
        <div className="global-loading-overlay" role="status" aria-live="polite">
          <div className="global-loading-card">
            <span className="loading-spinner" aria-hidden="true" />
            <span>Import en cours</span>
          </div>
        </div>
      ) : null}

      {shortcutsModalOpen ? (
        <div className="shortcuts-modal-overlay" onClick={() => setShortcutsModalOpen(false)}>
          <section
            className="shortcuts-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Aide raccourcis clavier"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="shortcuts-modal-header">
              <h2>Raccourcis clavier</h2>
              <button
                className="icon-button"
                onClick={() => setShortcutsModalOpen(false)}
                aria-label="Fermer"
                title="Fermer"
              >
                ×
              </button>
            </div>
            <div className="shortcuts-modal-body">
              {shortcutGroups.map((group) => (
                <section className="shortcuts-group" key={group.title}>
                  <h3>{group.title}</h3>
                  <ul className="shortcuts-list">
                    {group.items.map((item) => (
                      <li key={`${group.title}-${item.keys}`}>
                        <kbd>{item.keys}</kbd>
                        <span>{item.action}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
            <p className="shortcuts-modal-footnote">Les raccourcis sont ignores quand vous ecrivez dans un champ.</p>
          </section>
        </div>
      ) : null}

      <main className={`dashboard-grid ${panelSide === "right" ? "dashboard-grid-panel-right" : ""}`}>
        {!graphOnlyMode && panelSide === "left" ? (
          <div className="global-side-panel">
            <button
            className="panel-button"
            onClick={() => setPanelMode((prev) => (prev === "data" ? "inspector" : "data"))}
          >
            {panelMode === "data" ? "Inspecteur" : "Data Hub"}
          </button>
            {panelMode === "data" ? (
              <ImportPanel
                appInfo={appInfo}
                loadingAppInfo={loadingAppInfo}
                importing={importing}
                importMessage={importMessage}
                datasetId={datasetId}
                datasetMetadata={datasetMetadata}
                mathChannels={mathChannels}
                onImport={handleImport}
                onImportFromPath={handleImportFromPath}
                onAddMathChannel={handleAddMathChannel}
                onRemoveMathChannel={handleRemoveMathChannel}
              />
            ) : (
              inspectorPanel
            )}
          </div>
        ) : null}
        <SignalWorkspace
          datasetId={datasetId}
          datasetMetadata={datasetMetadata}
          trackMap={trackMap}
          mathChannels={mathChannels}
          graphOnlyMode={graphOnlyMode}
          inspectorSelectedWidgetId={inspectorSelectedWidgetId}
          onInspectorSelectedWidgetIdChange={setInspectorSelectedWidgetId}
          onInspectorSnapshotChange={setInspectorSnapshot}
          inspectorCommand={inspectorCommand}
        />
        {!graphOnlyMode && panelSide === "right" ? (
          <div className="global-side-panel">
            {panelMode === "data" ? (
              <ImportPanel
                appInfo={appInfo}
                loadingAppInfo={loadingAppInfo}
                importing={importing}
                importMessage={importMessage}
                datasetId={datasetId}
                datasetMetadata={datasetMetadata}
                mathChannels={mathChannels}
                onImport={handleImport}
                onImportFromPath={handleImportFromPath}
                onAddMathChannel={handleAddMathChannel}
                onRemoveMathChannel={handleRemoveMathChannel}
              />
            ) : (
              inspectorPanel
            )}
          </div>
        ) : null}
      </main>

      {graphOnlyMode ? (
        <div className="graph-only-overlay-controls">
          <button className="small-button" onClick={resetAllGraphsToHome}>
            <span aria-hidden="true">⌂</span>
          </button>
          <button className="small-button" onClick={() => setGraphOnlyMode(false)}>
            <span aria-hidden="true">▣</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}
