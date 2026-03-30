import { useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import Plot from "react-plotly.js";

import { queryDataset } from "../api";
import { useTelemetryStore } from "../store/telemetryStore";
import type { DatasetMetadata, DistanceRange, SignalSeries, TrackMapResponse } from "../types";

type SignalWorkspaceProps = {
  datasetId: string | null;
  datasetMetadata: DatasetMetadata | null;
  trackMap: TrackMapResponse | null;
  graphOnlyMode: boolean;
};

type GraphWidget = {
  id: number;
  title: string;
  signals: string[];
  menuOpen: boolean;
  row: number;
  col: number;
  widthSpan: number;
  heightSpan: number;
};

type WorkspaceTab = {
  id: string;
  name: string;
  gridCols: number;
  gridRows: number;
  nextId: number;
  widgets: GraphWidget[];
};

type SavedWorkspaceConfig = {
  id: string;
  name: string;
  tabs: WorkspaceTab[];
  activeTabId: string;
};

type HoverEvent = {
  points?: Array<{ x?: unknown }>;
};

type ResizeHandle = "nw" | "ne" | "sw" | "se";

type ResizeState = {
  widgetId: number;
  handle: ResizeHandle;
  startX: number;
  startY: number;
  startRow: number;
  startCol: number;
  startWidthSpan: number;
  startHeightSpan: number;
};

const COLORS = ["#00a8ff", "#ff2d4f", "#ffd447", "#34d399", "#ff8a33", "#ff9aa8"];
const WORKSPACE_CONFIGS_KEY = "telemetry-display.workspace-configs.v1";
const SIGNAL_DRAG_MIME = "application/x-telemetry-signal";

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function makeId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function createDefaultTab(name: string = "Onglet 1"): WorkspaceTab {
  return {
    id: makeId("tab"),
    name,
    gridCols: 2,
    gridRows: 2,
    nextId: 3,
    widgets: [createWidget(1, "G1", 1, 1), createWidget(2, "G2", 1, 2)],
  };
}

function sanitizeWidgetsForStorage(widgets: GraphWidget[]): GraphWidget[] {
  return widgets.map((widget) => ({ ...widget, menuOpen: false }));
}

function loadSavedWorkspaceConfigs(): SavedWorkspaceConfig[] {
  if (typeof window === "undefined") {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(WORKSPACE_CONFIGS_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as SavedWorkspaceConfig[];
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((cfg) => Array.isArray(cfg.tabs) && cfg.tabs.length > 0);
  } catch {
    return [];
  }
}

function storeWorkspaceConfigs(configs: SavedWorkspaceConfig[]): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(WORKSPACE_CONFIGS_KEY, JSON.stringify(configs));
}

function createWidget(id: number, title: string, row: number, col: number): GraphWidget {
  return {
    id,
    title,
    signals: [],
    menuOpen: false,
    row,
    col,
    widthSpan: 1,
    heightSpan: 1,
  };
}

function isTrackCell(row: number, col: number, rows: number, cols: number): boolean {
  return row === rows && col === cols;
}

function getOccupiedCells(widgets: GraphWidget[]): Set<string> {
  const occupied = new Set<string>();
  widgets.forEach((widget) => {
    for (let r = widget.row; r < widget.row + widget.heightSpan; r += 1) {
      for (let c = widget.col; c < widget.col + widget.widthSpan; c += 1) {
        occupied.add(`${r},${c}`);
      }
    }
  });
  return occupied;
}

function canPlaceWidget(
  widget: GraphWidget,
  targetRow: number,
  targetCol: number,
  rows: number,
  cols: number,
  otherWidgets: GraphWidget[]
): boolean {
  // Check bounds
  if (
    targetRow < 1 ||
    targetCol < 1 ||
    targetRow + widget.heightSpan - 1 > rows ||
    targetCol + widget.widthSpan - 1 > cols
  ) {
    return false;
  }

  // Check track cell
  if (isTrackCell(targetRow, targetCol, rows, cols)) {
    return false;
  }

  // Check collisions with other widgets (excluding self)
  const occupied = getOccupiedCells(otherWidgets.filter((w) => w.id !== widget.id));
  for (let r = targetRow; r < targetRow + widget.heightSpan; r += 1) {
    for (let c = targetCol; c < targetCol + widget.widthSpan; c += 1) {
      if (occupied.has(`${r},${c}`)) {
        return false;
      }
    }
  }

  return true;
}

function normalize(values: number[], min: number, max: number, outMin: number, outMax: number): number[] {
  const span = max - min || 1;
  return values.map((value) => outMin + ((value - min) / span) * (outMax - outMin));
}

function nearestIndex(values: number[], target: number | null): number {
  if (target === null || values.length === 0) {
    return 0;
  }

  let bestIdx = 0;
  let bestDelta = Number.POSITIVE_INFINITY;
  for (let idx = 0; idx < values.length; idx += 1) {
    const delta = Math.abs(values[idx] - target);
    if (delta < bestDelta) {
      bestDelta = delta;
      bestIdx = idx;
    }
  }

  return bestIdx;
}

function buildChartConfig(
  title: string,
  series: SignalSeries | null,
  selectedSignals: string[],
  cursorDistance: number | null,
  xRange: DistanceRange | null,
  graphOnlyMode: boolean
) {
  if (!series || selectedSignals.length === 0) {
    return {
      data: [],
      layout: {
        title,
        paper_bgcolor: "#14080b",
        plot_bgcolor: "#1b0a0e",
        font: { color: "#e5e7eb" },
      },
    };
  }

  const data = selectedSignals.map((signal, index) => ({
    type: "scattergl" as const,
    mode: "lines" as const,
    name: signal,
    x: series.lapDistance,
    y: series.signals[signal] ?? [],
    line: {
      color: COLORS[index % COLORS.length],
      width: 2,
    },
    yaxis: index === 0 ? "y" : `y${index + 1}`,
    hovertemplate: `%{y:.3f}<extra></extra>`,
  }));

  const layout: Record<string, unknown> = {
    title: graphOnlyMode ? undefined : title,
    autosize: true,
    paper_bgcolor: "#14080b",
    plot_bgcolor: "#1b0a0e",
    font: { color: "#e5e7eb" },
    margin: graphOnlyMode ? { l: 26, r: 26, t: 8, b: 22 } : { l: 36, r: 36, t: 30, b: 28 },
    xaxis: {
      title: graphOnlyMode ? undefined : "Distance (m)",
      gridcolor: "rgba(255, 93, 120, 0.22)",
      zeroline: false,
      ...(xRange
        ? {
            range: [xRange.start, xRange.end],
            autorange: false,
          }
        : {
            autorange: true,
          }),
    },
    yaxis: {
      title: graphOnlyMode ? undefined : selectedSignals[0],
      gridcolor: "rgba(255, 93, 120, 0.22)",
      zeroline: false,
    },
    hovermode: "x",
    uirevision: "telemetry-grid",
    showlegend: !graphOnlyMode,
    legend: {
      orientation: "h",
      yanchor: "bottom",
      y: 1.02,
      xanchor: "left",
      x: 0,
    },
  };

  selectedSignals.slice(1).forEach((signal, index) => {
    layout[`yaxis${index + 2}`] = {
      title: graphOnlyMode ? undefined : signal,
      overlaying: "y",
      side: index % 2 === 0 ? "right" : "left",
      gridcolor: "rgba(0,0,0,0)",
      zeroline: false,
    };
  });

  if (cursorDistance !== null) {
    layout.shapes = [
      {
        type: "line",
        x0: cursorDistance,
        x1: cursorDistance,
        y0: 0,
        y1: 1,
        yref: "paper",
        line: {
          color: "#ffd447",
          width: 1,
        },
      },
    ];
  }

  return { data, layout };
}

function firstFreeCell(
  widgets: GraphWidget[],
  rows: number,
  cols: number,
  widthSpan: number = 1,
  heightSpan: number = 1
): { row: number; col: number } {
  for (let row = 1; row <= rows; row += 1) {
    for (let col = 1; col <= cols; col += 1) {
      const testWidget = { id: -1, title: "", signals: [], menuOpen: false, row, col, widthSpan, heightSpan };
      if (canPlaceWidget(testWidget, row, col, rows, cols, widgets)) {
        return { row, col };
      }
    }
  }
  return { row: 1, col: 1 };
}

function fitWidgetsToGrid(widgets: GraphWidget[], rows: number, cols: number): GraphWidget[] {
  const fitted: GraphWidget[] = [];

  widgets.forEach((widget) => {
    if (canPlaceWidget(widget, widget.row, widget.col, rows, cols, fitted)) {
      fitted.push(widget);
    } else {
      const free = firstFreeCell(fitted, rows, cols, widget.widthSpan, widget.heightSpan);
      fitted.push({ ...widget, row: free.row, col: free.col });
    }
  });

  return fitted;
}

export default function SignalWorkspace({
  datasetId,
  datasetMetadata,
  trackMap,
  graphOnlyMode,
}: SignalWorkspaceProps) {
  const { cursorDistance, xRange, setCursorDistance, setXRange } = useTelemetryStore();

  const initialTab = useMemo(() => createDefaultTab(), []);
  const [tabs, setTabs] = useState<WorkspaceTab[]>([initialTab]);
  const [activeTabId, setActiveTabId] = useState<string>(initialTab.id);
  const [gridCols, setGridCols] = useState(initialTab.gridCols);
  const [gridRows, setGridRows] = useState(initialTab.gridRows);
  const [nextId, setNextId] = useState(initialTab.nextId);
  const [widgets, setWidgets] = useState<GraphWidget[]>(initialTab.widgets);
  const [savedConfigs, setSavedConfigs] = useState<SavedWorkspaceConfig[]>(() => loadSavedWorkspaceConfigs());
  const [selectedConfigId, setSelectedConfigId] = useState<string>("");
  const [currentConfigId, setCurrentConfigId] = useState<string | null>(null);
  const [dragFromId, setDragFromId] = useState<number | null>(null);
  const [signalDropCell, setSignalDropCell] = useState<string | null>(null);
  const [expandedWidgetId, setExpandedWidgetId] = useState<number | null>(null);
  const [resizeState, setResizeState] = useState<ResizeState | null>(null);
  const [seriesById, setSeriesById] = useState<Record<number, SignalSeries | null>>({});
  const [loadingById, setLoadingById] = useState<Record<number, boolean>>({});
  const gridRef = useRef<HTMLDivElement | null>(null);

  const availableSignals = datasetMetadata?.signal_names ?? [];
  const canQuery = datasetId !== null && datasetMetadata !== null;

  useEffect(() => {
    if (!resizeState) {
      return;
    }

    const activeResize = resizeState;

    function onMouseMove(event: MouseEvent) {
      const gridElement = gridRef.current;
      if (!gridElement) {
        return;
      }

      const rect = gridElement.getBoundingClientRect();
      const cellWidth = rect.width / Math.max(gridCols, 1);
      const cellHeight = rect.height / Math.max(gridRows, 1);

      if (cellWidth <= 0 || cellHeight <= 0) {
        return;
      }

      const deltaCols = Math.round((event.clientX - activeResize.startX) / cellWidth);
      const deltaRows = Math.round((event.clientY - activeResize.startY) / cellHeight);

      setWidgets((prev) => {
        const widget = prev.find((item) => item.id === activeResize.widgetId);
        if (!widget) {
          return prev;
        }

        let nextCol = activeResize.startCol;
        let nextRow = activeResize.startRow;
        let nextWidthSpan = activeResize.startWidthSpan;
        let nextHeightSpan = activeResize.startHeightSpan;

        if (activeResize.handle.includes("e")) {
          nextWidthSpan = clamp(
            activeResize.startWidthSpan + deltaCols,
            1,
            gridCols - activeResize.startCol + 1
          );
        }
        if (activeResize.handle.includes("s")) {
          nextHeightSpan = clamp(
            activeResize.startHeightSpan + deltaRows,
            1,
            gridRows - activeResize.startRow + 1
          );
        }
        if (activeResize.handle.includes("w")) {
          const rightEdge = activeResize.startCol + activeResize.startWidthSpan - 1;
          nextCol = clamp(activeResize.startCol + deltaCols, 1, rightEdge);
          nextWidthSpan = rightEdge - nextCol + 1;
        }
        if (activeResize.handle.includes("n")) {
          const bottomEdge = activeResize.startRow + activeResize.startHeightSpan - 1;
          nextRow = clamp(activeResize.startRow + deltaRows, 1, bottomEdge);
          nextHeightSpan = bottomEdge - nextRow + 1;
        }

        const candidate = {
          ...widget,
          row: nextRow,
          col: nextCol,
          widthSpan: nextWidthSpan,
          heightSpan: nextHeightSpan,
        };
        const otherWidgets = prev.filter((item) => item.id !== widget.id);
        const canPlace = canPlaceWidget(
          candidate,
          nextRow,
          nextCol,
          gridRows,
          gridCols,
          otherWidgets
        );

        if (!canPlace) {
          return prev;
        }

        return prev.map((item) => (item.id === widget.id ? candidate : item));
      });
    }

    function onMouseUp() {
      setResizeState(null);
    }

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);

    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [gridCols, gridRows, resizeState]);

  useEffect(() => {
    setTabs((prev) =>
      prev.map((tab) =>
        tab.id === activeTabId
          ? {
              ...tab,
              gridCols,
              gridRows,
              nextId,
              widgets,
            }
          : tab
      )
    );
  }, [activeTabId, gridCols, gridRows, nextId, widgets]);

  useEffect(() => {
    setWidgets((prev) => fitWidgetsToGrid(prev, gridRows, gridCols));
  }, [gridRows, gridCols]);

  useEffect(() => {
    if (!datasetMetadata || widgets.length === 0) {
      return;
    }

    setWidgets((prev) =>
      prev.map((widget, idx) => {
        if (widget.signals.length > 0) {
          return widget;
        }
        const fallback = datasetMetadata.signal_names[idx % Math.max(datasetMetadata.signal_names.length, 1)];
        return fallback ? { ...widget, signals: [fallback] } : widget;
      })
    );
  }, [datasetMetadata]);

  useEffect(() => {
    if (!canQuery || !datasetId || !datasetMetadata) {
      return;
    }

    const start = xRange?.start ?? datasetMetadata.lap_distance_min;
    const end = xRange?.end ?? datasetMetadata.lap_distance_max;

    const activeWidgets = widgets.filter((widget) => widget.signals.length > 0);
    if (activeWidgets.length === 0) {
      return;
    }

    let alive = true;
    const controller = new AbortController();

    activeWidgets.forEach((widget) => {
      setLoadingById((prev) => ({ ...prev, [widget.id]: true }));

      queryDataset({
        datasetId,
        signals: widget.signals,
        startDistance: start,
        endDistance: end,
        maxPoints: 1200,
        signal: controller.signal,
      })
        .then((response) => {
          if (!alive) {
            return;
          }
          setSeriesById((prev) => ({
            ...prev,
            [widget.id]: {
              lapDistance: response.lap_distance,
              signals: response.signals,
              decimationFactor: response.decimation_factor,
            },
          }));
        })
        .catch((error: unknown) => {
          if (!alive || isAbortError(error)) {
            return;
          }

          setSeriesById((prev) => ({
            ...prev,
            [widget.id]: null,
          }));
        })
        .finally(() => {
          if (!alive) {
            return;
          }
          setLoadingById((prev) => ({ ...prev, [widget.id]: false }));
        });
    });

    return () => {
      alive = false;
      controller.abort();
    };
  }, [canQuery, datasetId, datasetMetadata, widgets, xRange]);

  const gridStyle = useMemo(
    () => ({
      gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))`,
      gridTemplateRows: `repeat(${gridRows}, minmax(0, 1fr))`,
    }),
    [gridCols, gridRows]
  );

  const trackMapped = useMemo(() => {
    if (!trackMap || trackMap.x_position.length === 0) {
      return null;
    }

    const width = 320;
    const height = 180;
    const pad = 10;

    const minX = Math.min(...trackMap.x_position);
    const maxX = Math.max(...trackMap.x_position);
    const minY = Math.min(...trackMap.y_position);
    const maxY = Math.max(...trackMap.y_position);

    const xs = normalize(trackMap.x_position, minX, maxX, pad, width - pad);
    const ys = normalize(trackMap.y_position, minY, maxY, height - pad, pad);

    const firstX = xs[0];
    const firstY = ys[0];
    const lastX = xs[xs.length - 1];
    const lastY = ys[ys.length - 1];
    const seamPx = Math.hypot(lastX - firstX, lastY - firstY);
    const closeTrack = seamPx <= 18;
    const points = closeTrack
      ? [...xs.map((x, i) => `${x},${ys[i]}`), `${firstX},${firstY}`].join(" ")
      : xs.map((x, i) => `${x},${ys[i]}`).join(" ");

    const idx = nearestIndex(trackMap.lap_distance, cursorDistance);
    return {
      width,
      height,
      points,
      markerX: xs[idx],
      markerY: ys[idx],
      markerDistance: trackMap.lap_distance[idx],
    };
  }, [cursorDistance, trackMap]);

  function addWidget() {
    const id = nextId;
    setNextId((prev) => prev + 1);

    setWidgets((prev) => {
      const free = firstFreeCell(prev, gridRows, gridCols);
      return [...prev, createWidget(id, `G${id}`, free.row, free.col)];
    });
  }

  function switchToTab(tabId: string) {
    const targetTab = tabs.find((tab) => tab.id === tabId);
    if (!targetTab) {
      return;
    }
    setActiveTabId(tabId);
    setGridCols(targetTab.gridCols);
    setGridRows(targetTab.gridRows);
    setNextId(targetTab.nextId);
    setWidgets(targetTab.widgets);
    setSeriesById({});
    setLoadingById({});
    setDragFromId(null);
  }

  function addTab() {
    const newTab = createDefaultTab(`Onglet ${tabs.length + 1}`);
    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(newTab.id);
    setGridCols(newTab.gridCols);
    setGridRows(newTab.gridRows);
    setNextId(newTab.nextId);
    setWidgets(newTab.widgets);
    setSeriesById({});
    setLoadingById({});
    setDragFromId(null);
  }

  function removeTab(tabId: string) {
    if (tabs.length <= 1) {
      return;
    }

    const remaining = tabs.filter((tab) => tab.id !== tabId);
    setTabs(remaining);
    if (activeTabId === tabId) {
      const nextActive = remaining[0];
      setActiveTabId(nextActive.id);
      setGridCols(nextActive.gridCols);
      setGridRows(nextActive.gridRows);
      setNextId(nextActive.nextId);
      setWidgets(nextActive.widgets);
    }
  }

  function renameTab(tabId: string) {
    const tab = tabs.find((item) => item.id === tabId);
    if (!tab) {
      return;
    }
    const nextName = window.prompt("Nom de l'onglet", tab.name);
    if (!nextName) {
      return;
    }
    setTabs((prev) => prev.map((item) => (item.id === tabId ? { ...item, name: nextName.trim() || item.name } : item)));
  }

  function saveCurrentConfiguration() {
    const defaultName = currentConfigId
      ? savedConfigs.find((cfg) => cfg.id === currentConfigId)?.name ?? "Configuration"
      : `Configuration ${savedConfigs.length + 1}`;
    const nextName = window.prompt("Nom de la configuration", defaultName);
    if (!nextName) {
      return;
    }

    const normalizedTabs = tabs.map((tab) => ({
      ...tab,
      widgets: sanitizeWidgetsForStorage(tab.widgets),
    }));

    setSavedConfigs((prev) => {
      let nextConfigs: SavedWorkspaceConfig[];
      if (currentConfigId && prev.some((cfg) => cfg.id === currentConfigId)) {
        nextConfigs = prev.map((cfg) =>
          cfg.id === currentConfigId
            ? {
                ...cfg,
                name: nextName.trim() || cfg.name,
                tabs: normalizedTabs,
                activeTabId,
              }
            : cfg
        );
      } else {
        const newId = makeId("cfg");
        setCurrentConfigId(newId);
        setSelectedConfigId(newId);
        nextConfigs = [
          ...prev,
          {
            id: newId,
            name: nextName.trim() || defaultName,
            tabs: normalizedTabs,
            activeTabId,
          },
        ];
      }
      storeWorkspaceConfigs(nextConfigs);
      return nextConfigs;
    });
  }

  function loadConfiguration(configId: string) {
    const config = savedConfigs.find((cfg) => cfg.id === configId);
    if (!config || config.tabs.length === 0) {
      return;
    }

    const clonedTabs = config.tabs.map((tab) => ({
      ...tab,
      widgets: tab.widgets.map((widget) => ({ ...widget, menuOpen: false })),
    }));
    const nextActiveId = clonedTabs.some((tab) => tab.id === config.activeTabId)
      ? config.activeTabId
      : clonedTabs[0].id;
    const activeTab = clonedTabs.find((tab) => tab.id === nextActiveId) ?? clonedTabs[0];

    setTabs(clonedTabs);
    setActiveTabId(activeTab.id);
    setGridCols(activeTab.gridCols);
    setGridRows(activeTab.gridRows);
    setNextId(activeTab.nextId);
    setWidgets(activeTab.widgets);
    setCurrentConfigId(config.id);
    setSelectedConfigId(config.id);
    setSeriesById({});
    setLoadingById({});
    setDragFromId(null);
  }

  function deleteConfiguration(configId: string) {
    setSavedConfigs((prev) => {
      const nextConfigs = prev.filter((cfg) => cfg.id !== configId);
      storeWorkspaceConfigs(nextConfigs);
      return nextConfigs;
    });
    if (currentConfigId === configId) {
      setCurrentConfigId(null);
    }
    if (selectedConfigId === configId) {
      setSelectedConfigId("");
    }
  }

  function handleDropOnEmptyCell(targetRow: number, targetCol: number) {
    setWidgets((prev) => {
      const source = prev.find((item) => item.id === dragFromId);
      if (!source) {
        return prev;
      }

      // Check if drop is valid at target position
      const otherWidgets = prev.filter((w) => w.id !== dragFromId);
      if (canPlaceWidget(source, targetRow, targetCol, gridRows, gridCols, otherWidgets)) {
        return prev.map((item) => {
          if (item.id === dragFromId) {
            return { ...item, row: targetRow, col: targetCol };
          }
          return item;
        });
      }

      return prev;
    });
  }

  const occupiedCells = useMemo(() => {
    const occupied = new Set<string>();
    widgets.forEach((widget) => {
      for (let r = widget.row; r < widget.row + widget.heightSpan; r += 1) {
        for (let c = widget.col; c < widget.col + widget.widthSpan; c += 1) {
          occupied.add(`${r},${c}`);
        }
      }
    });
    return occupied;
  }, [widgets]);

  function removeWidget(id: number) {
    setWidgets((prev) => prev.filter((widget) => widget.id !== id));
    setSeriesById((prev) => {
      const clone = { ...prev };
      delete clone[id];
      return clone;
    });
    setLoadingById((prev) => {
      const clone = { ...prev };
      delete clone[id];
      return clone;
    });
  }

  function swapWidgetPositions(sourceId: number, targetId: number) {
    if (sourceId === targetId) {
      return;
    }

    setWidgets((prev) => {
      const source = prev.find((item) => item.id === sourceId);
      const target = prev.find((item) => item.id === targetId);
      if (!source || !target) {
        return prev;
      }

      // Check if swap is valid (no collisions)
      const otherWidgets = prev.filter((w) => w.id !== sourceId && w.id !== targetId);
      const sourceAtTarget = canPlaceWidget(source, target.row, target.col, gridRows, gridCols, otherWidgets);
      const targetAtSource = canPlaceWidget(target, source.row, source.col, gridRows, gridCols, otherWidgets);

      if (!sourceAtTarget || !targetAtSource) {
        // If swap would create collision, place source at first free cell
        const free = firstFreeCell(prev.filter((w) => w.id !== sourceId), gridRows, gridCols, source.widthSpan, source.heightSpan);
        return prev.map((item) => {
          if (item.id === sourceId) {
            return { ...item, row: free.row, col: free.col };
          }
          return item;
        });
      }

      // Swap is valid
      return prev.map((item) => {
        if (item.id === sourceId) {
          return { ...item, row: target.row, col: target.col };
        }
        if (item.id === targetId) {
          return { ...item, row: source.row, col: source.col };
        }
        return item;
      });
    });
  }

  function moveWidgetToPosition(sourceId: number, targetRow: number, targetCol: number) {
    setWidgets((prev) => {
      const source = prev.find((item) => item.id === sourceId);
      if (!source) {
        return prev;
      }

      if (canPlaceWidget(source, targetRow, targetCol, gridRows, gridCols, prev.filter((w) => w.id !== sourceId))) {
        return prev.map((item) => {
          if (item.id === sourceId) {
            return { ...item, row: targetRow, col: targetCol };
          }
          return item;
        });
      }

      return prev;
    });
  }

  function changeWidgetSize(id: number, widthSpan: number, heightSpan: number) {
    setWidgets((prev) => {
      const widget = prev.find((item) => item.id === id);
      if (!widget) {
        return prev;
      }

      if (canPlaceWidget({ ...widget, widthSpan, heightSpan }, widget.row, widget.col, gridRows, gridCols, prev.filter((w) => w.id !== id))) {
        return prev.map((item) => {
          if (item.id === id) {
            return { ...item, widthSpan, heightSpan };
          }
          return item;
        });
      }

      return prev;
    });
  }

  function addSignalToWidget(widgetId: number, signal: string) {
    setWidgets((prev) =>
      prev.map((item) => {
        if (item.id !== widgetId) {
          return item;
        }
        if (item.signals.includes(signal)) {
          return item;
        }
        return { ...item, signals: [...item.signals, signal] };
      })
    );
  }

  function addWidgetWithSignalAtPosition(targetRow: number, targetCol: number, signal: string) {
    setNextId((prevId) => {
      const newId = prevId;
      setWidgets((prev) => {
        const candidate = {
          id: newId,
          title: `G${newId}`,
          signals: [signal],
          menuOpen: false,
          row: targetRow,
          col: targetCol,
          widthSpan: 1,
          heightSpan: 1,
        };

        if (!canPlaceWidget(candidate, targetRow, targetCol, gridRows, gridCols, prev)) {
          return prev;
        }

        return [...prev, candidate];
      });
      return prevId + 1;
    });
  }

  function startResize(
    event: ReactMouseEvent<HTMLButtonElement>,
    widget: GraphWidget,
    handle: ResizeHandle
  ) {
    event.preventDefault();
    event.stopPropagation();
    setResizeState({
      widgetId: widget.id,
      handle,
      startX: event.clientX,
      startY: event.clientY,
      startRow: widget.row,
      startCol: widget.col,
      startWidthSpan: widget.widthSpan,
      startHeightSpan: widget.heightSpan,
    });
  }

  return (
    <section className={`panel signal-workspace ${graphOnlyMode ? "signal-workspace-max" : ""}`}>
      <div className={`panel-header panel-header-tight ${graphOnlyMode ? "panel-header-hidden" : ""}`}>
        <h2>Dashboard</h2>
        <div className="dashboard-tools">
          <select
            className="mini-select config-select"
            value={selectedConfigId}
            onChange={(event) => setSelectedConfigId(event.target.value)}
          >
            <option value="">Config locale...</option>
            {savedConfigs.map((config) => (
              <option key={config.id} value={config.id}>
                {config.name}
              </option>
            ))}
          </select>
          <button
            className="small-button"
            disabled={!selectedConfigId}
            onClick={() => loadConfiguration(selectedConfigId)}
          >
            Charger
          </button>
          <button className="small-button" onClick={saveCurrentConfiguration}>
            Sauver
          </button>
          <button
            className="small-button"
            disabled={!selectedConfigId}
            onClick={() => deleteConfiguration(selectedConfigId)}
          >
            Suppr
          </button>
          <label>
            Colonnes
            <select
              className="mini-select"
              value={gridCols}
              onChange={(event) => setGridCols(Number(event.target.value))}
            >
              <option value={1}>1</option>
              <option value={2}>2</option>
              <option value={3}>3</option>
              <option value={4}>4</option>
            </select>
          </label>
          <label>
            Lignes
            <select
              className="mini-select"
              value={gridRows}
              onChange={(event) => setGridRows(Number(event.target.value))}
            >
              <option value={1}>1</option>
              <option value={2}>2</option>
              <option value={3}>3</option>
              <option value={4}>4</option>
            </select>
          </label>
          <button className="small-button" onClick={addWidget}>
            + Graphe
          </button>
        </div>
      </div>

      <div className={`workspace-tabs ${graphOnlyMode ? "workspace-tabs-hidden" : ""}`}>
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={`workspace-tab ${tab.id === activeTabId ? "workspace-tab-active" : ""}`}
          >
            <button className="workspace-tab-name" onClick={() => switchToTab(tab.id)} title={tab.name}>
              {tab.name}
            </button>
            <button className="workspace-tab-action" onClick={() => renameTab(tab.id)} title="Renommer onglet">
              ✎
            </button>
            <button
              className="workspace-tab-action"
              onClick={() => removeTab(tab.id)}
              title="Fermer onglet"
              disabled={tabs.length <= 1}
            >
              ×
            </button>
          </div>
        ))}
        <button className="workspace-tab-add" onClick={addTab} title="Nouvel onglet">
          + Onglet
        </button>
      </div>

      <div
        ref={gridRef}
        className={`graph-grid ${expandedWidgetId !== null ? "graph-grid-has-expanded" : ""} ${resizeState ? "graph-grid-resizing" : ""}`}
        style={gridStyle}
      >
        {widgets.map((widget) => {
          const chart = buildChartConfig(
            widget.title,
            seriesById[widget.id] ?? null,
            widget.signals,
            cursorDistance,
            xRange,
            graphOnlyMode
          );

          return (
            <article
              key={widget.id}
              className={`graph-tile ${dragFromId === widget.id ? "graph-tile-dragging" : ""} ${widget.menuOpen ? "has-open-menu" : ""} ${expandedWidgetId === widget.id ? "graph-tile-expanded" : ""}`}
              style={{
                gridColumn: `${widget.col} / span ${widget.widthSpan}`,
                gridRow: `${widget.row} / span ${widget.heightSpan}`,
              }}
              onDragOver={(event) => {
                const canDropSignal = event.dataTransfer.types.includes(SIGNAL_DRAG_MIME);
                if (dragFromId !== null || canDropSignal) {
                  event.preventDefault();
                }
                if (canDropSignal && signalDropCell !== null) {
                  setSignalDropCell(null);
                }
              }}
              onDrop={(event) => {
                event.preventDefault();
                if (dragFromId !== null) {
                  swapWidgetPositions(dragFromId, widget.id);
                } else {
                  const droppedSignal = event.dataTransfer.getData(SIGNAL_DRAG_MIME);
                  if (droppedSignal) {
                    addSignalToWidget(widget.id, droppedSignal);
                  }
                }
                setDragFromId(null);
                setSignalDropCell(null);
              }}
            >
              <div className="graph-corner-actions">
                <button
                  className="icon-button"
                  draggable
                  onDragStart={() => setDragFromId(widget.id)}
                  onDragEnd={() => setDragFromId(null)}
                  title="Déplacer"
                >
                  ↕
                </button>
                <button
                  className="icon-button"
                  onClick={() =>
                    setWidgets((prev) =>
                      prev.map((item) =>
                        item.id === widget.id ? { ...item, menuOpen: !item.menuOpen } : item
                      )
                    )
                  }
                  title="Paramètres"
                >
                  ⚙
                </button>
                <button
                  className="icon-button icon-button-danger"
                  onClick={() => removeWidget(widget.id)}
                  title="Supprimer"
                >
                  ×
                </button>
                <button
                  className="icon-button"
                  onClick={() =>
                    setExpandedWidgetId((prev) => (prev === widget.id ? null : widget.id))
                  }
                  title={expandedWidgetId === widget.id ? "Réduire" : "Plein écran"}
                >
                  {expandedWidgetId === widget.id ? "⤡" : "⛶"}
                </button>
              </div>

              <button
                type="button"
                className="graph-resize-handle handle-nw"
                onMouseDown={(event) => startResize(event, widget, "nw")}
                title="Redimensionner"
              />
              <button
                type="button"
                className="graph-resize-handle handle-ne"
                onMouseDown={(event) => startResize(event, widget, "ne")}
                title="Redimensionner"
              />
              <button
                type="button"
                className="graph-resize-handle handle-sw"
                onMouseDown={(event) => startResize(event, widget, "sw")}
                title="Redimensionner"
              />
              <button
                type="button"
                className="graph-resize-handle handle-se"
                onMouseDown={(event) => startResize(event, widget, "se")}
                title="Redimensionner"
              />

              {widget.menuOpen ? (
                <div className="graph-menu">
                  <label className="field-label">Signaux</label>
                  <div className="signal-grid">
                    {availableSignals.map((signal, idx) => (
                      <label key={`${widget.id}-${signal}`} className="signal-checkbox">
                        <input
                          type="checkbox"
                          checked={widget.signals.includes(signal)}
                          onChange={(event) => {
                            const isChecked = event.target.checked;
                            setWidgets((prev) =>
                              prev.map((item) => {
                                if (item.id === widget.id) {
                                  if (isChecked) {
                                    return { ...item, signals: [...item.signals, signal] };
                                  } else {
                                    return { ...item, signals: item.signals.filter((s) => s !== signal) };
                                  }
                                }
                                return item;
                              })
                            );
                          }}
                        />
                        <span className="signal-badge" style={{ borderColor: COLORS[idx % COLORS.length] }}>
                          {signal}
                        </span>
                      </label>
                    ))}
                  </div>

                  <p className="menu-help">Taille du graphe</p>
                  <div className="size-selector">
                    <label>Largeur</label>
                    <select
                      className="mini-select"
                      value={widget.widthSpan}
                      onChange={(event) => changeWidgetSize(widget.id, Number(event.target.value), widget.heightSpan)}
                    >
                      <option value={1}>1 col</option>
                      <option value={2}>2 cols</option>
                      <option value={3}>3 cols</option>
                      <option value={4}>4 cols</option>
                    </select>
                  </div>

                  <div className="size-selector">
                    <label>Hauteur</label>
                    <select
                      className="mini-select"
                      value={widget.heightSpan}
                      onChange={(event) => changeWidgetSize(widget.id, widget.widthSpan, Number(event.target.value))}
                    >
                      <option value={1}>1 ligne</option>
                      <option value={2}>2 lignes</option>
                      <option value={3}>3 lignes</option>
                      <option value={4}>4 lignes</option>
                    </select>
                  </div>

                  <p className="menu-help">Position</p>
                  <div className="position-selector">
                    <label>Ligne</label>
                    <select
                      className="mini-select"
                      value={widget.row}
                      onChange={(event) => moveWidgetToPosition(widget.id, Number(event.target.value), widget.col)}
                    >
                      {Array.from({ length: gridRows }, (_, i) => i + 1).map((row) => (
                        <option key={`row-${row}`} value={row}>
                          {row}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="position-selector">
                    <label>Colonne</label>
                    <select
                      className="mini-select"
                      value={widget.col}
                      onChange={(event) => moveWidgetToPosition(widget.id, widget.row, Number(event.target.value))}
                    >
                      {Array.from({ length: gridCols }, (_, i) => i + 1).map((col) => (
                        <option key={`col-${col}`} value={col}>
                          {col}
                        </option>
                      ))}
                    </select>
                  </div>

                  <p className="menu-help">Déplacez les graphes en glissant la tuile ou utilisez les contrôles ci-dessus.</p>
                </div>
              ) : null}

              {loadingById[widget.id] ? <div className="loading-plot">Chargement...</div> : null}

              {widget.signals.length === 0 ? (
                <div className="placeholder-graph" aria-label="Aucun signal sélectionné">
                  <div className="placeholder-graph-mark">+</div>
                  <div className="placeholder-graph-text">Ajoutez un signal</div>
                  <div className="placeholder-graph-help">Glissez un signal ici ou ouvrez les paramètres</div>
                </div>
              ) : (
                <div className="plot-fill">
                  <Plot
                    data={chart.data}
                    layout={chart.layout}
                    useResizeHandler
                    config={{ displaylogo: false, responsive: true }}
                    style={{ width: "100%", height: "100%" }}
                    onHover={(evt: HoverEvent) => {
                      const hoveredX = evt.points?.[0]?.x;
                      if (typeof hoveredX === "number") {
                        setCursorDistance(hoveredX);
                      }
                    }}
                    onRelayout={(eventData) => {
                      const min = eventData["xaxis.range[0]"];
                      const max = eventData["xaxis.range[1]"];
                      if (typeof min === "number" && typeof max === "number") {
                        setXRange({ start: min, end: max });
                      }
                      if (eventData["xaxis.autorange"] === true) {
                        setXRange(null);
                      }
                    }}
                  />
                </div>
              )}
            </article>
          );
        })}

        {Array.from({ length: gridRows }, (_, r) =>
          Array.from({ length: gridCols }, (_, c) => {
            const row = r + 1;
            const col = c + 1;
            const cellKey = `${row},${col}`;
            const isOccupied = occupiedCells.has(cellKey);
            const isTrack = row === gridRows && col === gridCols;

            if (isOccupied || isTrack) {
              return null;
            }

            return (
              <div
                key={`drop-${cellKey}`}
                className={`drop-zone ${signalDropCell === cellKey ? "drop-zone-signal-hover" : ""}`}
                style={{
                  gridColumn: col,
                  gridRow: row,
                }}
                onDragOver={(event) => {
                  const canDropSignal = event.dataTransfer.types.includes(SIGNAL_DRAG_MIME);
                  if (dragFromId !== null || canDropSignal) {
                    event.preventDefault();
                  }
                  if (canDropSignal && signalDropCell !== cellKey) {
                    setSignalDropCell(cellKey);
                  }
                }}
                onDragLeave={() => {
                  if (signalDropCell === cellKey) {
                    setSignalDropCell(null);
                  }
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  if (dragFromId !== null) {
                    handleDropOnEmptyCell(row, col);
                  } else {
                    const droppedSignal = event.dataTransfer.getData(SIGNAL_DRAG_MIME);
                    if (droppedSignal) {
                      addWidgetWithSignalAtPosition(row, col, droppedSignal);
                    }
                  }
                  setDragFromId(null);
                  setSignalDropCell(null);
                }}
              />
            );
          })
        ).flat()}

        <article className="graph-tile graph-tile-track" style={{ gridColumn: `${gridCols} / span 1`, gridRow: `${gridRows} / span 1` }}>
          <div className="graph-track-head">Track</div>
          {!trackMapped ? (
            <div className="track-empty">Aucune piste</div>
          ) : (
            <svg viewBox={`0 0 ${trackMapped.width} ${trackMapped.height}`} className="track-svg">
              <polyline points={trackMapped.points} fill="none" stroke="#ffd447" strokeWidth="2.4" />
              <circle cx={trackMapped.markerX} cy={trackMapped.markerY} r="5" fill="#ff4fd8" />
              <circle
                cx={trackMapped.markerX}
                cy={trackMapped.markerY}
                r="10"
                fill="none"
                stroke="rgba(255, 79, 216, 0.45)"
                strokeWidth="2"
              />
              <text x={8} y={16} fill="#e5e7eb" fontSize="11">
                {trackMapped.markerDistance.toFixed(1)} m
              </text>
            </svg>
          )}
        </article>
      </div>

      {!canQuery ? <p className="panel-text">Import requis.</p> : null}
    </section>
  );
}
