import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, KeyboardEvent } from "react";

import {
  fetchAppInfo,
  fetchDatasetMetadata,
  fetchTrackMap,
  importDataset,
  importDatasetFromPath,
} from "./api";
import { ImportPanel, SignalWorkspace, ConfigExportImport, SignalColorManager } from "./components";
import { useTelemetryStore } from "./store/telemetryStore";
import { ConfigManager } from "./store/ConfigManager";
import type { DatasetMetadata, TrackMapResponse } from "./types";
import type { InspectorCommand, InspectorSnapshot } from "./components/SignalWorkspace";

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

  const defaultStyle: CSSProperties = {
    padding: "0.5rem 0.5rem",
    border: "1.5px solid rgba(255, 70, 93, 0.4)",
    borderRadius: "2px",
    background: "rgba(22, 8, 12, 0.9)",
    color: "var(--fg-1)",
    fontSize: "0.82rem",
    fontFamily: '"Space Grotesk", monospace',
    transition: "all 0.2s ease",
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
      style={{ ...defaultStyle, ...style }}
      placeholder="auto"
    />
  );
}

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
  const [loadingAppInfo, setLoadingAppInfo] = useState(true);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // ── Slot A (dataset principal)
  const [datasetId, setDatasetId] = useState<string | null>(() => ConfigManager.get<string | null>("dataset-id") ?? null);
  const [datasetMetadata, setDatasetMetadata] = useState<DatasetMetadata | null>(null);
  const [trackMap, setTrackMap] = useState<TrackMapResponse | null>(null);
  // ── Slot B (dataset de référence)
  const [datasetIdB, setDatasetIdB] = useState<string | null>(() => ConfigManager.get<string | null>("dataset-id-b") ?? null);
  const [datasetMetadataB, setDatasetMetadataB] = useState<DatasetMetadata | null>(null);
  const [trackMapB, setTrackMapB] = useState<TrackMapResponse | null>(null);
  // ── Slot C
  const [datasetIdC, setDatasetIdC] = useState<string | null>(() => ConfigManager.get<string | null>("dataset-id-c") ?? null);
  const [datasetMetadataC, setDatasetMetadataC] = useState<DatasetMetadata | null>(null);
  const [trackMapC, setTrackMapC] = useState<TrackMapResponse | null>(null);
  // ── Slot D
  const [datasetIdD, setDatasetIdD] = useState<string | null>(() => ConfigManager.get<string | null>("dataset-id-d") ?? null);
  const [datasetMetadataD, setDatasetMetadataD] = useState<DatasetMetadata | null>(null);
  const [trackMapD, setTrackMapD] = useState<TrackMapResponse | null>(null);
  // ── Slot actif
  const [activeSlot, setActiveSlot] = useState<"A" | "B" | "C" | "D">(() => ConfigManager.get<"A" | "B" | "C" | "D">("active-slot") ?? "A");
  const [graphOnlyMode, setGraphOnlyMode] = useState(false);
  const [userDisplayName, setUserDisplayName] = useState(() => {
    const prefs = ConfigManager.get("user-preferences");
    return (prefs as { displayName?: string } | undefined)?.displayName ?? "";
  });
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
    let active = true;
    fetchAppInfo()
      .then(() => {
        // app info loaded — no state needed
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

  // Auto-load dataset metadata and track map on startup (slots A et B)
  useEffect(() => {
    let active = true;

    const savedDatasetId = ConfigManager.get<string | null>("dataset-id");
    if (savedDatasetId) {
      Promise.all([
        fetchDatasetMetadata(savedDatasetId),
        fetchTrackMap(savedDatasetId)
      ]).then(([metadata, trackMapData]) => {
        if (!active) return;
        setDatasetMetadata(metadata);
        setTrackMap(trackMapData);
      }).catch(() => {
        if (!active) return;
        ConfigManager.set("dataset-id", null);
        setDatasetId(null);
      });
    }

    const savedDatasetIdB = ConfigManager.get<string | null>("dataset-id-b");
    if (savedDatasetIdB) {
      Promise.all([
        fetchDatasetMetadata(savedDatasetIdB),
        fetchTrackMap(savedDatasetIdB)
      ]).then(([metadata, trackMapData]) => {
        if (!active) return;
        setDatasetMetadataB(metadata);
        setTrackMapB(trackMapData);
      }).catch(() => {
        if (!active) return;
        ConfigManager.set("dataset-id-b", null);
        setDatasetIdB(null);
      });
    }

    return () => {
      active = false;
    };
  }, []);

  // Sync user preferences to localStorage
  useEffect(() => {
    ConfigManager.set("user-preferences", { displayName: userDisplayName.trim() });
  }, [userDisplayName]);

  // Sync IDs et slot actif vers localStorage
  useEffect(() => {
    if (datasetId !== null) ConfigManager.set("dataset-id", datasetId);
  }, [datasetId]);

  useEffect(() => {
    ConfigManager.set("dataset-id-b", datasetIdB);
  }, [datasetIdB]);

  useEffect(() => {
    ConfigManager.set("dataset-id-c", datasetIdC);
  }, [datasetIdC]);

  useEffect(() => {
    ConfigManager.set("dataset-id-d", datasetIdD);
  }, [datasetIdD]);

  useEffect(() => {
    ConfigManager.set("active-slot", activeSlot);
  }, [activeSlot]);

  // Cross-tab: écouter les changements de dataset-id (slot A)
  useEffect(() => {
    const unsubscribe = ConfigManager.subscribeDebouncedFull<string | null>(
      "dataset-id",
      async (newDatasetId) => {
        if (newDatasetId && newDatasetId !== datasetId) {
          setDatasetId(newDatasetId);
          try {
            const metadata = await fetchDatasetMetadata(newDatasetId);
            setDatasetMetadata(metadata);
            const trackMapData = await fetchTrackMap(newDatasetId);
            setTrackMap(trackMapData);
          } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load dataset");
          }
        }
      },
      300
    );
    return () => unsubscribe();
  }, [datasetId]);

  // Cross-tab: écouter les changements de dataset-id-b (slot B)
  useEffect(() => {
    const unsubscribe = ConfigManager.subscribeDebouncedFull<string | null>(
      "dataset-id-b",
      async (newDatasetIdB) => {
        if (newDatasetIdB !== undefined && newDatasetIdB !== datasetIdB) {
          setDatasetIdB(newDatasetIdB);
          if (newDatasetIdB) {
            try {
              const metadata = await fetchDatasetMetadata(newDatasetIdB);
              setDatasetMetadataB(metadata);
              const trackMapData = await fetchTrackMap(newDatasetIdB);
              setTrackMapB(trackMapData);
            } catch (err) {
              setError(err instanceof Error ? err.message : "Failed to load ref dataset");
            }
          } else {
            setDatasetMetadataB(null);
            setTrackMapB(null);
          }
        }
      },
      300
    );
    return () => unsubscribe();
  }, [datasetIdB]);

  // Cross-tab: écouter les changements de dataset-id-c (slot C)
  useEffect(() => {
    const unsubscribe = ConfigManager.subscribeDebouncedFull<string | null>(
      "dataset-id-c",
      async (newDatasetIdC) => {
        if (newDatasetIdC !== undefined && newDatasetIdC !== datasetIdC) {
          setDatasetIdC(newDatasetIdC);
          if (newDatasetIdC) {
            try {
              const metadata = await fetchDatasetMetadata(newDatasetIdC);
              setDatasetMetadataC(metadata);
              const trackMapData = await fetchTrackMap(newDatasetIdC);
              setTrackMapC(trackMapData);
            } catch (err) {
              setError(err instanceof Error ? err.message : "Failed to load slot C dataset");
            }
          } else {
            setDatasetMetadataC(null);
            setTrackMapC(null);
          }
        }
      },
      300
    );
    return () => unsubscribe();
  }, [datasetIdC]);

  // Cross-tab: écouter les changements de dataset-id-d (slot D)
  useEffect(() => {
    const unsubscribe = ConfigManager.subscribeDebouncedFull<string | null>(
      "dataset-id-d",
      async (newDatasetIdD) => {
        if (newDatasetIdD !== undefined && newDatasetIdD !== datasetIdD) {
          setDatasetIdD(newDatasetIdD);
          if (newDatasetIdD) {
            try {
              const metadata = await fetchDatasetMetadata(newDatasetIdD);
              setDatasetMetadataD(metadata);
              const trackMapData = await fetchTrackMap(newDatasetIdD);
              setTrackMapD(trackMapData);
            } catch (err) {
              setError(err instanceof Error ? err.message : "Failed to load slot D dataset");
            }
          } else {
            setDatasetMetadataD(null);
            setTrackMapD(null);
          }
        }
      },
      300
    );
    return () => unsubscribe();
  }, [datasetIdD]);

  // Cross-tab: écouter les changements de slot actif
  useEffect(() => {
    const unsubscribe = ConfigManager.subscribe<"A" | "B" | "C" | "D">("active-slot", (newSlot) => {
      if (newSlot && newSlot !== activeSlot) setActiveSlot(newSlot);
    });
    return () => unsubscribe();
  }, [activeSlot]);

  useEffect(() => {
    function onGlobalKeyDown(event: Event): void {
      const kbEvent = event as KeyboardEvent;
      if (isEditableElement(kbEvent.target)) {
        return;
      }

      if (shortcutsModalOpen) {
        if (kbEvent.code === "Escape") {
          kbEvent.preventDefault();
          setShortcutsModalOpen(false);
        }
        return;
      }

      if (kbEvent.ctrlKey || kbEvent.metaKey || kbEvent.altKey) {
        return;
      }

      if (kbEvent.code === "KeyH") {
        kbEvent.preventDefault();
        resetAllGraphsToHome();
        return;
      }

      if (kbEvent.code === "KeyG") {
        kbEvent.preventDefault();
        setGraphOnlyMode((prev) => !prev);
        return;
      }

      if (kbEvent.code === "KeyI") {
        kbEvent.preventDefault();
        setPanelMode((prev) => (prev === "data" ? "inspector" : "data"));
        return;
      }

      if (kbEvent.code === "KeyP") {
        kbEvent.preventDefault();
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
      await loadImportedDataset(imported.dataset_id, "A");
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
      await loadImportedDataset(imported.dataset_id, "A");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImporting(false);
    }
  }

  async function handleImportToSlotB(file: File) {
    setImporting(true);
    setError(null);
    try {
      const imported = await importDataset(file);
      await loadImportedDataset(imported.dataset_id, "B");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import ref failed");
    } finally {
      setImporting(false);
    }
  }

  async function handleImportFromPathToSlotB(matPath: string) {
    setImporting(true);
    setError(null);
    try {
      const imported = await importDatasetFromPath(matPath);
      await loadImportedDataset(imported.dataset_id, "B");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import ref failed");
    } finally {
      setImporting(false);
    }
  }

  async function handleImportToSlotC(file: File) {
    setImporting(true);
    setError(null);
    try {
      const imported = await importDataset(file);
      await loadImportedDataset(imported.dataset_id, "C");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import slot C failed");
    } finally {
      setImporting(false);
    }
  }

  async function handleImportFromPathToSlotC(matPath: string) {
    setImporting(true);
    setError(null);
    try {
      const imported = await importDatasetFromPath(matPath);
      await loadImportedDataset(imported.dataset_id, "C");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import slot C failed");
    } finally {
      setImporting(false);
    }
  }

  async function handleImportToSlotD(file: File) {
    setImporting(true);
    setError(null);
    try {
      const imported = await importDataset(file);
      await loadImportedDataset(imported.dataset_id, "D");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import slot D failed");
    } finally {
      setImporting(false);
    }
  }

  async function handleImportFromPathToSlotD(matPath: string) {
    setImporting(true);
    setError(null);
    try {
      const imported = await importDatasetFromPath(matPath);
      await loadImportedDataset(imported.dataset_id, "D");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import slot D failed");
    } finally {
      setImporting(false);
    }
  }

  async function loadImportedDataset(nextDatasetId: string, slot: "A" | "B" | "C" | "D") {
    const [metadata, map] = await Promise.all([
      fetchDatasetMetadata(nextDatasetId),
      fetchTrackMap(nextDatasetId),
    ]);

    if (slot === "A") {
      setDatasetId(nextDatasetId);
      setDatasetMetadata(metadata);
      setTrackMap(map);
      setActiveSlot("A");
      setXRange(null);
      setCursorDistance(null);
    } else if (slot === "B") {
      setDatasetIdB(nextDatasetId);
      setDatasetMetadataB(metadata);
      setTrackMapB(map);
      setActiveSlot("B");
    } else if (slot === "C") {
      setDatasetIdC(nextDatasetId);
      setDatasetMetadataC(metadata);
      setTrackMapC(map);
      setActiveSlot("C");
    } else {
      setDatasetIdD(nextDatasetId);
      setDatasetMetadataD(metadata);
      setTrackMapD(map);
      setActiveSlot("D");
    }
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
  // Props dérivées selon le slot actif
  const slotMap = {
    A: { id: datasetId, metadata: datasetMetadata, trackMap },
    B: { id: datasetIdB, metadata: datasetMetadataB, trackMap: trackMapB },
    C: { id: datasetIdC, metadata: datasetMetadataC, trackMap: trackMapC },
    D: { id: datasetIdD, metadata: datasetMetadataD, trackMap: trackMapD },
  };
  const activeDatasetId = slotMap[activeSlot].id;
  const activeMetadata   = slotMap[activeSlot].metadata;
  const activeTrackMap   = slotMap[activeSlot].trackMap;
  const hasImportedDataset = Boolean(activeDatasetId && activeMetadata);

  const refreshDatasetMetadata = async () => {
    if (!activeDatasetId) return;
    try {
      const updated = await fetchDatasetMetadata(activeDatasetId);
      if (activeSlot === "A") setDatasetMetadata(updated);
      else if (activeSlot === "B") setDatasetMetadataB(updated);
      else if (activeSlot === "C") setDatasetMetadataC(updated);
      else setDatasetMetadataD(updated);
    } catch (err) {
      console.error("Failed to refresh dataset metadata:", err);
    }
  };

  const inspectorPanel = (
    <section className="panel import-panel inspector-panel">
      <div className="panel-header">
        <h2>Graphe Perso</h2>
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

                <div className="inspector-section">
                  <label className="inspector-field-label">Masquer valeurs positives</label>
                  <input
                    type="checkbox"
                    checked={activeInspectorWidget.options?.hidePositive ?? false}
                    onChange={(e) =>
                      pushInspectorCommand({
                        type: "set-hide-positive",
                        widgetId: activeInspectorWidget.id,
                        hidePositive: e.target.checked,
                      })
                    }
                    aria-label="Masquer les valeurs positives"
                  />
                </div>

                <div className="inspector-section">
                  <label className="inspector-field-label">Masquer valeurs négatives</label>
                  <input
                    type="checkbox"
                    checked={activeInspectorWidget.options?.hideNegative ?? false}
                    onChange={(e) =>
                      pushInspectorCommand({
                        type: "set-hide-negative",
                        widgetId: activeInspectorWidget.id,
                        hideNegative: e.target.checked,
                      })
                    }
                    aria-label="Masquer les valeurs négatives"
                  />
                </div>

                <div className="inspector-section">
                  <label className="inspector-field-label">Signal de freinage</label>
                  <input
                    type="checkbox"
                    checked={activeInspectorWidget.options?.filterByBraking ?? false}
                    onChange={(e) =>
                      pushInspectorCommand({
                        type: "set-filter-braking",
                        widgetId: activeInspectorWidget.id,
                        filterByBraking: e.target.checked,
                      })
                    }
                    aria-label="Filtrer par signal de freinage"
                  />
                </div>

                <div className="inspector-y-axis-inputs">
                  <label className="inspector-field-label">Échelle Y manuelle</label>
                  <div className="inspector-y-axis-range">
                    <DecimalNumberInput
                      value={activeInspectorWidget.options?.yAxisMin}
                      onChange={(val) =>
                        pushInspectorCommand({
                          type: "set-y-axis-min",
                          widgetId: activeInspectorWidget.id,
                          yAxisMin: val,
                        })
                      }
                    />
                    <span className="inspector-y-axis-sep">à</span>
                    <DecimalNumberInput
                      value={activeInspectorWidget.options?.yAxisMax}
                      onChange={(val) =>
                        pushInspectorCommand({
                          type: "set-y-axis-max",
                          widgetId: activeInspectorWidget.id,
                          yAxisMax: val,
                        })
                      }
                    />
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
        { keys: "I", action: "Basculer Data Hub/Graphe Perso" },
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
          <ConfigExportImport
                  onImportSuccess={refreshDatasetMetadata}
                />
          <button className="small-button topbar-icon-button" onClick={resetAllGraphsToHome} title="Home (H)" aria-label="Home">
            <span aria-hidden="true">HOME</span>
          </button>
          <button
            className="small-button topbar-icon-button"
            onClick={() => setPanelSide((prev) => (prev === "left" ? "right" : "left"))}
            title={`Changer cote panneau (P) - ${panelSide === "left" ? "Gauche" : "Droite"}`}
            aria-label="Changer cote panneau"
          >
            <span aria-hidden="true">SWITCH</span>
          </button>
          <button
            className="small-button topbar-icon-button"
            onClick={() => setGraphOnlyMode((prev) => !prev)}
            title={graphOnlyMode ? "Mode UI (G)" : "Mode Graphes (G)"}
            aria-label="Basculer mode Graphes"
          >
            <span aria-hidden="true">GRAPHE</span>
          </button>
          <button
            className="small-button topbar-icon-button"
            onClick={() => setPanelMode((prev) => (prev === "data" ? "inspector" : "data"))}
            title={panelMode === "data" ? "Ouvrir Graphe Perso (I)" : "Ouvrir Data Hub (I)"}
            aria-label="Basculer Data Hub Graphe Perso"
          >
            <span aria-hidden="true">PANEL MODE</span>
          </button>
          <button
            className="small-button topbar-icon-button"
            onClick={() => setShortcutsModalOpen(true)}
            title="Aide raccourcis clavier"
            aria-label="Aide raccourcis clavier"
          >
            <span aria-hidden="true">SHORTcut</span>
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
            {panelMode === "data" ? "Graphe Perso" : "Data Hub"}
          </button>
            {panelMode === "data" ? (
              <>
                <ImportPanel
                  importing={importing}
                  datasetId={datasetId}
                  datasetMetadata={datasetMetadata}
                  onImport={handleImport}
                  onImportFromPath={handleImportFromPath}
                  activeSlot={activeSlot}
                  datasetIdB={datasetIdB}
                  datasetMetadataB={datasetMetadataB}
                  datasetIdC={datasetIdC}
                  datasetMetadataC={datasetMetadataC}
                  datasetIdD={datasetIdD}
                  datasetMetadataD={datasetMetadataD}
                  onImportToSlotB={handleImportToSlotB}
                  onImportFromPathToSlotB={handleImportFromPathToSlotB}
                  onImportToSlotC={handleImportToSlotC}
                  onImportFromPathToSlotC={handleImportFromPathToSlotC}
                  onImportToSlotD={handleImportToSlotD}
                  onImportFromPathToSlotD={handleImportFromPathToSlotD}
                  onSwapSlot={(slot: "A" | "B" | "C" | "D") => setActiveSlot(slot)}
                />
                <SignalColorManager />
              </>
            ) : (
              inspectorPanel
            )}
          </div>
        ) : null}
        {hasImportedDataset ? (
          <SignalWorkspace
            datasetId={activeDatasetId}
            datasetMetadata={activeMetadata}
            trackMap={activeTrackMap}
            graphOnlyMode={graphOnlyMode}
            inspectorSelectedWidgetId={inspectorSelectedWidgetId}
            onInspectorSelectedWidgetIdChange={setInspectorSelectedWidgetId}
            onInspectorSnapshotChange={setInspectorSnapshot}
            inspectorCommand={inspectorCommand}
            onRefreshDatasetMetadata={refreshDatasetMetadata}
          />
        ) : (
          <section className="panel dashboard-empty-state" role="status" aria-live="polite">
            <div className="dashboard-empty-logo" aria-hidden="true">
              <span className="app-logo-ring" />
              <span className="app-logo-core">TD</span>
            </div>
            <h2>Aucun dataset importe</h2>
            <p>Importez un fichier de telemetrie depuis le panneau Data Hub pour afficher les graphes.</p>
          </section>
        )}
        {!graphOnlyMode && panelSide === "right" ? (
          <div className="global-side-panel">
            <button
            className="panel-button"
            onClick={() => setPanelMode((prev) => (prev === "data" ? "inspector" : "data"))}
          >
            {panelMode === "data" ? "Graphe Perso" : "Data Hub"}
          </button>
            {panelMode === "data" ? (
              <>
                <ImportPanel
                  importing={importing}
                  datasetId={datasetId}
                  datasetMetadata={datasetMetadata}
                  onImport={handleImport}
                  onImportFromPath={handleImportFromPath}
                  activeSlot={activeSlot}
                  datasetIdB={datasetIdB}
                  datasetMetadataB={datasetMetadataB}
                  datasetIdC={datasetIdC}
                  datasetMetadataC={datasetMetadataC}
                  datasetIdD={datasetIdD}
                  datasetMetadataD={datasetMetadataD}
                  onImportToSlotB={handleImportToSlotB}
                  onImportFromPathToSlotB={handleImportFromPathToSlotB}
                  onImportToSlotC={handleImportToSlotC}
                  onImportFromPathToSlotC={handleImportFromPathToSlotC}
                  onImportToSlotD={handleImportToSlotD}
                  onImportFromPathToSlotD={handleImportFromPathToSlotD}
                  onSwapSlot={(slot: "A" | "B" | "C" | "D") => setActiveSlot(slot)}
                />
                <SignalColorManager />
              </>
            ) : (
              inspectorPanel
            )}
          </div>
        ) : null}
      </main>

      {graphOnlyMode ? (
        <div className="graph-only-overlay-controls">
          <button className="small-button" onClick={resetAllGraphsToHome}>
            <span aria-hidden="true">HOME</span>
          </button>
          <button className="small-button" onClick={() => setGraphOnlyMode(false)}>
            <span aria-hidden="true">FULL</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}
