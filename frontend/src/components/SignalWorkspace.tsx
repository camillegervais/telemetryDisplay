import { useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import Plot from "react-plotly.js";

import { queryDataset } from "../api";
import { evaluateMathChannel } from "../mathChannels";
import { useTelemetryStore } from "../store/telemetryStore";
import type { DatasetMetadata, DistanceRange, MathChannel, SignalSeries, TrackMapResponse } from "../types";

type SignalWorkspaceProps = {
  datasetId: string | null;
  datasetMetadata: DatasetMetadata | null;
  trackMap: TrackMapResponse | null;
  mathChannels: MathChannel[];
  graphOnlyMode: boolean;
};

type WidgetOptions = {
  alignZero?: boolean;
  [key: string]: unknown;
};

type GraphWidget = {
  id: number;
  title: string;
  kind?: "timeseries" | "xy";
  signals: string[];
  xSignal?: string | null;
  options?: WidgetOptions;
  // Legacy field kept for backward compatibility with old localStorage snapshots/configs.
  alignZero?: boolean;
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

type WorkspaceSessionSnapshot = {
  tabs: WorkspaceTab[];
  activeTabId: string;
  currentConfigId: string | null;
  selectedConfigId: string;
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
const WORKSPACE_SESSION_KEY = "telemetry-display.workspace-session.v1";
const SIGNAL_DRAG_MIME = "application/x-telemetry-signal";
const TRAJECTORY_TAB_ID = "tab-trajectory";
const TRAJECTORY_SIGNALS = ["xCar", "yCar", "xRef", "yRef", "xTrack", "yTrack"] as const;

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

function createEmptyTab(name: string): WorkspaceTab {
  return {
    id: makeId("tab"),
    name,
    gridCols: 2,
    gridRows: 2,
    nextId: 3,
    widgets: [
      { ...createWidget(1, "G1", 1, 1), signals: [] },
      { ...createWidget(2, "G2", 1, 2), signals: [] },
    ],
  };
}

function sanitizeWidgetsForStorage(widgets: GraphWidget[]): GraphWidget[] {
  return widgets.map((widget) => normalizeWidget(widget, true));
}

function closeAllWidgetMenus(widgets: GraphWidget[]): GraphWidget[] {
  return widgets.map((widget) => normalizeWidget(widget, true));
}

function normalizeWidget(widget: GraphWidget, forceCloseMenu: boolean): GraphWidget {
  const { alignZero: legacyAlignZero, options, ...rest } = widget;
  const normalizedOptions: WidgetOptions = {
    ...(options ?? {}),
    alignZero: options?.alignZero ?? legacyAlignZero ?? false,
  };

  return {
    ...rest,
    options: normalizedOptions,
    menuOpen: forceCloseMenu ? false : widget.menuOpen,
  };
}

function getWidgetAlignZero(widget: GraphWidget): boolean {
  return widget.options?.alignZero ?? widget.alignZero ?? false;
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
    return parsed
      .filter((cfg) => Array.isArray(cfg.tabs) && cfg.tabs.length > 0)
      .map((cfg) => ({
        ...cfg,
        tabs: cfg.tabs.map((tab) => ({
          ...tab,
          widgets: tab.widgets.map((widget) => normalizeWidget(widget, true)),
        })),
      }));
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

function loadWorkspaceSessionSnapshot(): WorkspaceSessionSnapshot | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(WORKSPACE_SESSION_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as WorkspaceSessionSnapshot;
    if (!Array.isArray(parsed.tabs) || parsed.tabs.length === 0 || typeof parsed.activeTabId !== "string") {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function storeWorkspaceSessionSnapshot(snapshot: WorkspaceSessionSnapshot): void {
  if (typeof window === "undefined") {
    return;
  }

  const cleanTabs = snapshot.tabs.map((tab) => ({
    ...tab,
    widgets: sanitizeWidgetsForStorage(tab.widgets),
  }));

  window.localStorage.setItem(
    WORKSPACE_SESSION_KEY,
    JSON.stringify({
      ...snapshot,
      tabs: cleanTabs,
    })
  );
}

function createWidget(id: number, title: string, row: number, col: number): GraphWidget {
  return {
    id,
    title,
    kind: "timeseries",
    signals: [],
    xSignal: null,
    options: { alignZero: false },
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

function computeStartFinishLine(
  xValues: number[],
  yValues: number[],
  lineLength: number
): { x1: number; y1: number; x2: number; y2: number } | null {
  if (xValues.length < 2 || yValues.length < 2) {
    return null;
  }

  const x0 = xValues[0];
  const y0 = yValues[0];
  const dx = xValues[1] - x0;
  const dy = yValues[1] - y0;
  const tangentNorm = Math.hypot(dx, dy);
  if (tangentNorm <= 0) {
    return null;
  }

  // Perpendicular to local tangent at lap start.
  const nx = -dy / tangentNorm;
  const ny = dx / tangentNorm;
  const half = lineLength / 2;

  return {
    x1: x0 - nx * half,
    y1: y0 - ny * half,
    x2: x0 + nx * half,
    y2: y0 + ny * half,
  };
}

function buildChartConfig(
  title: string,
  series: SignalSeries | null,
  selectedSignals: string[],
  cursorDistance: number | null,
  xRange: DistanceRange | null,
  graphOnlyMode: boolean,
  homeRevision: number,
  alignZero: boolean,
  xAxisMode: "distance" | "time"
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

  const hasTimeAxis = Array.isArray(series.lapTime) && series.lapTime.length === series.lapDistance.length;
  const useTimeAxis = xAxisMode === "time" && hasTimeAxis;
  const xValues =
    useTimeAxis
      ? (series.lapTime as number[])
      : series.lapDistance;
  const useSharedYAxis = alignZero && selectedSignals.length > 1;

  const data = selectedSignals.map((signal, index) => ({
    type: "scattergl" as const,
    mode: "lines" as const,
    name: signal,
    x: xValues,
    y: series.signals[signal] ?? [],
    line: {
      color: COLORS[index % COLORS.length],
      width: 2,
    },
    yaxis: useSharedYAxis ? "y" : index === 0 ? "y" : `y${index + 1}`,
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
      title: graphOnlyMode ? undefined : useTimeAxis ? "Temps (s)" : "Distance (m)",
      gridcolor: "rgba(255, 93, 120, 0.22)",
      zeroline: false,
      ...(!useTimeAxis && xRange
        ? {
            range: [xRange.start, xRange.end],
            autorange: false,
          }
        : {
            autorange: true,
          }),
    },
    yaxis: {
      title: graphOnlyMode ? undefined : useSharedYAxis ? "Valeur" : selectedSignals[0],
      gridcolor: "rgba(255, 93, 120, 0.22)",
      zeroline: true,
      zerolinecolor: "rgba(255, 255, 255, 0.45)",
      ...(alignZero ? { rangemode: "tozero" } : {}),
    },
    hovermode: "x",
    uirevision: `telemetry-grid-${homeRevision}`,
    showlegend: !graphOnlyMode,
    legend: {
      orientation: "h",
      yanchor: "bottom",
      y: 1.02,
      xanchor: "left",
      x: 0,
    },
  };

  if (!useSharedYAxis) {
    selectedSignals.slice(1).forEach((signal, index) => {
      layout[`yaxis${index + 2}`] = {
        title: graphOnlyMode ? undefined : signal,
        overlaying: "y",
        side: index % 2 === 0 ? "right" : "left",
        gridcolor: "rgba(0,0,0,0)",
        zeroline: true,
        zerolinecolor: "rgba(255, 255, 255, 0.45)",
        ...(alignZero ? { rangemode: "tozero" } : {}),
      };
    });
  }

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

function buildXYChartConfig(
  title: string,
  series: SignalSeries | null,
  xSignal: string | null,
  ySignals: string[],
  graphOnlyMode: boolean,
  homeRevision: number
) {
  if (!series || !xSignal || ySignals.length === 0) {
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

  const xValues = series.signals[xSignal] ?? [];
  const data = ySignals.map((signal, index) => ({
    type: "scattergl" as const,
    mode: "markers" as const,
    name: `${signal} vs ${xSignal}`,
    x: xValues,
    y: series.signals[signal] ?? [],
    marker: {
      color: COLORS[index % COLORS.length],
      size: 5,
      opacity: 0.8,
    },
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
      title: graphOnlyMode ? undefined : xSignal,
      gridcolor: "rgba(255, 93, 120, 0.22)",
      zeroline: false,
      autorange: true,
    },
    yaxis: {
      title: graphOnlyMode ? undefined : "Y",
      gridcolor: "rgba(255, 93, 120, 0.22)",
      zeroline: false,
      autorange: true,
    },
    hovermode: "closest",
    uirevision: `telemetry-xy-${homeRevision}`,
    showlegend: !graphOnlyMode,
    legend: {
      orientation: "h",
      yanchor: "bottom",
      y: 1.02,
      xanchor: "left",
      x: 0,
    },
  };

  return { data, layout };
}

function getWidgetKind(widget: GraphWidget): "timeseries" | "xy" {
  return widget.kind ?? "timeseries";
}

function getWidgetQuerySignals(widget: GraphWidget): string[] {
  const widgetKind = getWidgetKind(widget);
  if (widgetKind === "timeseries") {
    return widget.signals;
  }

  if (!widget.xSignal || widget.signals.length === 0) {
    return [];
  }

  return Array.from(new Set([widget.xSignal, ...widget.signals]));
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
  mathChannels,
  graphOnlyMode,
}: SignalWorkspaceProps) {
  const {
    cursorDistance,
    xRange,
    homeRevision,
    xAxisMode,
    setCursorDistance,
    setXRange,
  } = useTelemetryStore();

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
  const [isTabSwitching, setIsTabSwitching] = useState(false);
  const [seriesById, setSeriesById] = useState<Record<number, SignalSeries | null>>({});
  const [loadingById, setLoadingById] = useState<Record<number, boolean>>({});
  const [trajectorySeries, setTrajectorySeries] = useState<Record<string, number[]>>({});
  const [trajectoryLoading, setTrajectoryLoading] = useState(false);
  const [trajectoryError, setTrajectoryError] = useState<string | null>(null);
  const [sessionHydrated, setSessionHydrated] = useState(false);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const queryGenerationRef = useRef(0);
  const tabSwitchGenerationRef = useRef(0);

  const availableSignals = useMemo(
    () => [...(datasetMetadata?.signal_names ?? []), ...mathChannels.map((channel) => channel.name)],
    [datasetMetadata, mathChannels]
  );
  const mathChannelByName = useMemo(
    () => Object.fromEntries(mathChannels.map((channel) => [channel.name, channel])),
    [mathChannels]
  );
  const canQuery = datasetId !== null && datasetMetadata !== null;
  const isTrajectoryActive = activeTabId === TRAJECTORY_TAB_ID;

  function expandSignalsForQuery(signals: string[]): string[] {
    const expanded = new Set<string>();
    signals.forEach((signal) => {
      const channel = mathChannelByName[signal];
      if (channel) {
        channel.dependencies.forEach((dependency) => expanded.add(dependency));
      } else {
        expanded.add(signal);
      }
    });
    return Array.from(expanded);
  }

  function buildComputedSignals(rawSignals: Record<string, number[]>): Record<string, number[]> {
    const merged = { ...rawSignals };
    mathChannels.forEach((channel) => {
      const hasDeps = channel.dependencies.every((dependency) => merged[dependency] !== undefined);
      if (!hasDeps) {
        return;
      }
      try {
        merged[channel.name] = evaluateMathChannel(channel, merged);
      } catch {
        merged[channel.name] = [];
      }
    });
    return merged;
  }

  useEffect(() => {
    const snapshot = loadWorkspaceSessionSnapshot();
    if (!snapshot) {
      setSessionHydrated(true);
      return;
    }

    const clonedTabs = snapshot.tabs.map((tab) => ({
      ...tab,
      widgets: tab.widgets.map((widget) => normalizeWidget(widget, true)),
    }));
    const restoredActiveId =
      snapshot.activeTabId === TRAJECTORY_TAB_ID
        ? TRAJECTORY_TAB_ID
        : clonedTabs.some((tab) => tab.id === snapshot.activeTabId)
      ? snapshot.activeTabId
      : clonedTabs[0].id;
    const restoredActiveTab =
      clonedTabs.find((tab) => tab.id === restoredActiveId) ?? clonedTabs[0];

    setTabs(clonedTabs);
    setActiveTabId(restoredActiveId);
    if (restoredActiveId !== TRAJECTORY_TAB_ID) {
      setGridCols(restoredActiveTab.gridCols);
      setGridRows(restoredActiveTab.gridRows);
      setNextId(restoredActiveTab.nextId);
      setWidgets(restoredActiveTab.widgets);
    }
    setCurrentConfigId(snapshot.currentConfigId);
    setSelectedConfigId(snapshot.selectedConfigId);
    setSessionHydrated(true);
  }, []);

  useEffect(() => {
    if (!sessionHydrated || tabs.length === 0) {
      return;
    }

    storeWorkspaceSessionSnapshot({
      tabs,
      activeTabId,
      currentConfigId,
      selectedConfigId,
    });
  }, [sessionHydrated, tabs, activeTabId, currentConfigId, selectedConfigId]);

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
    if (isTabSwitching) {
      return;
    }

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
  }, [activeTabId, gridCols, gridRows, nextId, widgets, isTabSwitching]);

  useEffect(() => {
    setWidgets((prev) => fitWidgetsToGrid(prev, gridRows, gridCols));
  }, [gridRows, gridCols]);

  useEffect(() => {
    if (!datasetMetadata || widgets.length === 0) {
      return;
    }

    setWidgets((prev) =>
      prev.map((widget, idx) => {
        const widgetKind = getWidgetKind(widget);
        const cleanedSignals = widget.signals.filter((signal) => availableSignals.includes(signal));
        const cleanedXSignal = widget.xSignal && availableSignals.includes(widget.xSignal) ? widget.xSignal : null;

        if (widgetKind === "xy") {
          if (cleanedSignals.length === widget.signals.length && cleanedXSignal === (widget.xSignal ?? null)) {
            return widget;
          }

          return {
            ...widget,
            signals: cleanedSignals,
            xSignal: cleanedXSignal,
          };
        }

        if (cleanedSignals.length > 0) {
          if (cleanedSignals.length === widget.signals.length) {
            return widget;
          }
          return {
            ...widget,
            signals: cleanedSignals,
          };
        }

        const isEmptyDefaultWidget =
          widgetKind === "timeseries" &&
          cleanedSignals.length === 0 &&
          /^G\d+$/.test(widget.title);
        if (isEmptyDefaultWidget) {
          return {
            ...widget,
            signals: [],
          };
        }

        const fallback = datasetMetadata.signal_names[idx % Math.max(datasetMetadata.signal_names.length, 1)];
        return fallback ? { ...widget, signals: [fallback] } : widget;
      })
    );
  }, [datasetMetadata, availableSignals, widgets.length]);

  useEffect(() => {
    if (!canQuery || !datasetId || !datasetMetadata) {
      return;
    }

    const datasetSignalSet = new Set(datasetMetadata.signal_names);
    const lapMin = datasetMetadata.lap_distance_min;
    const lapMax = datasetMetadata.lap_distance_max;
    const rawStart = xRange?.start ?? lapMin;
    const rawEnd = xRange?.end ?? lapMax;
    const clampedStart = Math.max(lapMin, Math.min(rawStart, lapMax));
    const clampedEnd = Math.max(lapMin, Math.min(rawEnd, lapMax));
    const start = Math.min(clampedStart, clampedEnd);
    const end = Math.max(clampedStart, clampedEnd);

    const activeWidgets = widgets.filter((widget) => {
      const selectedSignals = getWidgetQuerySignals(widget).filter(
        (signal) => !!mathChannelByName[signal] || datasetSignalSet.has(signal)
      );
      const querySignals = expandSignalsForQuery(selectedSignals).filter((signal) =>
        datasetSignalSet.has(signal)
      );
      return querySignals.length > 0;
    });
    if (activeWidgets.length === 0) {
      return;
    }

    let alive = true;
    const queryGeneration = ++queryGenerationRef.current;
    const controller = new AbortController();

    activeWidgets.forEach((widget) => {
      setLoadingById((prev) => ({ ...prev, [widget.id]: true }));

      const selectedSignals = getWidgetQuerySignals(widget).filter(
        (signal) => !!mathChannelByName[signal] || datasetSignalSet.has(signal)
      );
      const querySignals = expandSignalsForQuery(selectedSignals).filter((signal) =>
        datasetSignalSet.has(signal)
      );

      if (querySignals.length === 0) {
        setSeriesById((prev) => ({ ...prev, [widget.id]: null }));
        setLoadingById((prev) => ({ ...prev, [widget.id]: false }));
        return;
      }

      queryDataset({
        datasetId,
        signals: querySignals,
        startDistance: start,
        endDistance: end,
        maxPoints: 1200,
        signal: controller.signal,
      })
        .then((response) => {
          if (!alive || queryGeneration !== queryGenerationRef.current) {
            return;
          }

          const signalsWithMath = buildComputedSignals(response.signals);
          setSeriesById((prev) => ({
            ...prev,
            [widget.id]: {
              lapDistance: response.lap_distance,
              lapTime: response.lap_time,
              signals: signalsWithMath,
              decimationFactor: response.decimation_factor,
            },
          }));
        })
        .catch((error: unknown) => {
          if (!alive || queryGeneration !== queryGenerationRef.current || isAbortError(error)) {
            return;
          }

          setSeriesById((prev) => ({
            ...prev,
            [widget.id]: null,
          }));
        })
        .finally(() => {
          if (!alive || queryGeneration !== queryGenerationRef.current) {
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

  useEffect(() => {
    if (!isTrajectoryActive || !canQuery || !datasetId || !datasetMetadata) {
      return;
    }

    const requestedSignals = TRAJECTORY_SIGNALS.filter((signal) =>
      datasetMetadata.signal_names.includes(signal)
    );
    if (!requestedSignals.includes("xCar") || !requestedSignals.includes("yCar")) {
      setTrajectorySeries({});
      setTrajectoryError("Signaux trajectoire manquants: xCar/yCar");
      return;
    }

    let alive = true;
    const controller = new AbortController();
    setTrajectoryLoading(true);
    setTrajectoryError(null);

    queryDataset({
      datasetId,
      signals: requestedSignals as string[],
      startDistance: datasetMetadata.lap_distance_min,
      endDistance: datasetMetadata.lap_distance_max,
      maxPoints: 5000,
      signal: controller.signal,
    })
      .then((response) => {
        if (!alive) {
          return;
        }
        setTrajectorySeries(response.signals);
      })
      .catch((error: unknown) => {
        if (!alive || isAbortError(error)) {
          return;
        }
        setTrajectoryError(error instanceof Error ? error.message : "Impossible de charger la trajectoire");
      })
      .finally(() => {
        if (!alive) {
          return;
        }
        setTrajectoryLoading(false);
      });

    return () => {
      alive = false;
      controller.abort();
    };
  }, [isTrajectoryActive, canQuery, datasetId, datasetMetadata]);

  const trajectoryChart = useMemo(() => {
    const xCar = trajectorySeries.xCar ?? [];
    const yCar = trajectorySeries.yCar ?? [];
    const xRef = trajectorySeries.xRef ?? [];
    const yRef = trajectorySeries.yRef ?? [];
    const xTrack = trajectorySeries.xTrack ?? [];
    const yTrack = trajectorySeries.yTrack ?? [];

    const hasCar = xCar.length > 0 && yCar.length > 0;
    const hasRef = xRef.length > 0 && yRef.length > 0;
    const hasTrackFromSignals = xTrack.length > 0 && yTrack.length > 0;
    const hasTrackFromMap = !!trackMap && trackMap.x_position.length > 0 && trackMap.y_position.length > 0;
    const trackLineX = hasTrackFromSignals ? xTrack : trackMap?.x_position ?? [];
    const trackLineY = hasTrackFromSignals ? yTrack : trackMap?.y_position ?? [];

    const data: Array<Record<string, unknown>> = [];
    if (hasTrackFromSignals) {
      data.push({
        type: "scattergl",
        mode: "lines",
        name: "Track",
        x: xTrack,
        y: yTrack,
        line: { color: "#ffd447", width: 1.5 },
      });
    } else if (hasTrackFromMap) {
      data.push({
        type: "scattergl",
        mode: "lines",
        name: "Track",
        x: trackMap?.x_position ?? [],
        y: trackMap?.y_position ?? [],
        line: { color: "#ffd447", width: 1.5 },
      });
    }

    let startFinishShape: Record<string, unknown> | null = null;
    if (trackLineX.length > 1 && trackLineY.length > 1) {
      const minTrackX = Math.min(...trackLineX);
      const maxTrackX = Math.max(...trackLineX);
      const minTrackY = Math.min(...trackLineY);
      const maxTrackY = Math.max(...trackLineY);
      const diagonal = Math.hypot(maxTrackX - minTrackX, maxTrackY - minTrackY);
      const startFinish = computeStartFinishLine(trackLineX, trackLineY, Math.max(diagonal * 0.03, 1));
      if (startFinish) {
        startFinishShape = {
          type: "line",
          x0: startFinish.x1,
          y0: startFinish.y1,
          x1: startFinish.x2,
          y1: startFinish.y2,
          line: {
            color: "#f8fafc",
            width: 3,
          },
        };
      }
    }

    if (hasRef) {
      data.push({
        type: "scattergl",
        mode: "lines",
        name: "Reference",
        x: xRef,
        y: yRef,
        line: { color: "#34d399", width: 2 },
      });
    }

    if (hasCar) {
      data.push({
        type: "scattergl",
        mode: "lines",
        name: "Car",
        x: xCar,
        y: yCar,
        line: { color: "#ff2d4f", width: 2 },
      });
    }

    const layout: Record<string, unknown> = {
      title: graphOnlyMode ? undefined : "Trajectoire vs Reference",
      autosize: true,
      paper_bgcolor: "#14080b",
      plot_bgcolor: "#1b0a0e",
      font: { color: "#e5e7eb" },
      margin: graphOnlyMode ? { l: 18, r: 18, t: 8, b: 18 } : { l: 32, r: 32, t: 30, b: 28 },
      xaxis: {
        title: graphOnlyMode ? undefined : "X",
        gridcolor: "rgba(255, 93, 120, 0.16)",
        zeroline: false,
        scaleanchor: "y",
        scaleratio: 1,
      },
      yaxis: {
        title: graphOnlyMode ? undefined : "Y",
        gridcolor: "rgba(255, 93, 120, 0.16)",
        zeroline: false,
      },
      hovermode: "closest",
      showlegend: true,
      uirevision: `trajectory-${homeRevision}`,
      shapes: startFinishShape ? [startFinishShape] : undefined,
    };

    return {
      hasCar,
      data,
      layout,
    };
  }, [trajectorySeries, trackMap, graphOnlyMode, homeRevision]);

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
    const startFinish = computeStartFinishLine(xs, ys, 14);
    return {
      width,
      height,
      points,
      startFinish,
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

  function addXYWidget() {
    const id = nextId;
    setNextId((prev) => prev + 1);

    setWidgets((prev) => {
      const free = firstFreeCell(prev, gridRows, gridCols);
      return [
        ...prev,
        {
          ...createWidget(id, `XY${id}`, free.row, free.col),
          kind: "xy",
        },
      ];
    });
  }

  function switchToTab(tabId: string) {
    const targetTab = tabs.find((tab) => tab.id === tabId);
    if (!targetTab) {
      return;
    }

    const switchGeneration = ++tabSwitchGenerationRef.current;
    const closedTargetWidgets = closeAllWidgetMenus(targetTab.widgets);

    setTabs((prev) =>
      prev.map((tab) => {
        if (tab.id === tabId) {
          return {
            ...tab,
            widgets: closedTargetWidgets,
          };
        }
        if (tab.id === activeTabId) {
          return {
            ...tab,
            widgets: closeAllWidgetMenus(tab.widgets),
          };
        }
        return tab;
      })
    );

    setIsTabSwitching(true);
    setSeriesById({});
    setLoadingById({});
    setWidgets([]);
    setDragFromId(null);
    setSignalDropCell(null);
    setExpandedWidgetId(null);

    window.setTimeout(() => {
      if (switchGeneration !== tabSwitchGenerationRef.current) {
        return;
      }

      setActiveTabId(tabId);
      setGridCols(targetTab.gridCols);
      setGridRows(targetTab.gridRows);
      setNextId(targetTab.nextId);
      setWidgets(closedTargetWidgets);
      setIsTabSwitching(false);
    }, 0);
  }

  function switchToTrajectoryTab() {
    if (isTrajectoryActive) {
      return;
    }

    setTabs((prev) =>
      prev.map((tab) =>
        tab.id === activeTabId
          ? {
              ...tab,
              widgets: closeAllWidgetMenus(tab.widgets),
            }
          : tab
      )
    );
    setWidgets((prev) => closeAllWidgetMenus(prev));
    setActiveTabId(TRAJECTORY_TAB_ID);
    setExpandedWidgetId(null);
    setDragFromId(null);
    setSignalDropCell(null);
  }

  function addTab() {
    const newTab = createEmptyTab(`Onglet ${tabs.length + 1}`);
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
      setSeriesById({});
      setLoadingById({});
      setDragFromId(null);
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
    const defaultName = `Configuration ${savedConfigs.length + 1}`;
    const nextName = window.prompt("Nom de la configuration", defaultName);
    if (!nextName) {
      return;
    }

    const normalizedTabs = tabs.map((tab) => ({
      ...tab,
      widgets: sanitizeWidgetsForStorage(tab.widgets),
    }));

    const newId = makeId("cfg");
    const newConfig: SavedWorkspaceConfig = {
      id: newId,
      name: nextName.trim() || defaultName,
      tabs: normalizedTabs,
      activeTabId,
    };

    setCurrentConfigId(newId);
    setSelectedConfigId(newId);

    setSavedConfigs((prev) => {
      const nextConfigs = [...prev, newConfig];
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
      widgets: tab.widgets.map((widget) => normalizeWidget(widget, true)),
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

  function addDroppedSignalToWidget(widgetId: number, signal: string) {
    setWidgets((prev) =>
      prev.map((item) => {
        if (item.id !== widgetId) {
          return item;
        }

        const widgetKind = getWidgetKind(item);
        if (widgetKind === "xy") {
          if (!item.xSignal) {
            return { ...item, xSignal: signal };
          }
          if (item.xSignal === signal || item.signals.includes(signal)) {
            return item;
          }
          return { ...item, signals: [...item.signals, signal] };
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
          ...createWidget(newId, `G${newId}`, targetRow, targetCol),
          signals: [signal],
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
          <button className="small-button" onClick={addXYWidget}>
            + Graphe XY
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
        <div className={`workspace-tab ${isTrajectoryActive ? "workspace-tab-active" : ""}`}>
          <button className="workspace-tab-name" onClick={switchToTrajectoryTab}>
            Trajectoire
          </button>
        </div>
        <button className="workspace-tab-add" onClick={addTab} title="Nouvel onglet">
          + Onglet
        </button>
      </div>

      {isTrajectoryActive ? (
        <div className="graph-grid" style={{ gridTemplateColumns: "1fr", gridTemplateRows: "1fr" }}>
          <article className="graph-tile" style={{ gridColumn: "1 / span 1", gridRow: "1 / span 1" }}>
            {trajectoryLoading ? (
              <div className="loading-plot">
                <span className="loading-spinner" aria-hidden="true" />
                Chargement...
              </div>
            ) : null}
            {trajectoryError ? <p className="panel-text">{trajectoryError}</p> : null}
            {!trajectoryError && !trajectoryChart.hasCar ? (
              <div className="placeholder-graph" aria-label="Trajectoire indisponible">
                <div className="placeholder-graph-mark">!</div>
                <div className="placeholder-graph-text">Trajectoire indisponible</div>
                <div className="placeholder-graph-help">Signaux requis: xCar et yCar</div>
              </div>
            ) : (
              <div className="plot-fill">
                <Plot
                  data={trajectoryChart.data}
                  layout={trajectoryChart.layout}
                  useResizeHandler
                  config={{ displaylogo: false, responsive: true }}
                  style={{ width: "100%", height: "100%" }}
                />
              </div>
            )}
          </article>
        </div>
      ) : isTabSwitching ? (
        <div className="graph-grid" style={gridStyle}>
          <article className="graph-tile" style={{ gridColumn: "1 / span 1", gridRow: "1 / span 1" }}>
            <div className="loading-plot">
              <span className="loading-spinner" aria-hidden="true" />
              Changement d'onglet...
            </div>
          </article>
        </div>
      ) : (
      <div
        ref={gridRef}
        className={`graph-grid ${expandedWidgetId !== null ? "graph-grid-has-expanded" : ""} ${resizeState ? "graph-grid-resizing" : ""}`}
        style={gridStyle}
      >
        {widgets.map((widget) => {
          const widgetKind = getWidgetKind(widget);
          const chart =
            widgetKind === "xy"
              ? buildXYChartConfig(
                  widget.title,
                  seriesById[widget.id] ?? null,
                  widget.xSignal ?? null,
                  widget.signals,
                  graphOnlyMode,
                  homeRevision
                )
              : buildChartConfig(
                  widget.title,
                  seriesById[widget.id] ?? null,
                  widget.signals,
                  cursorDistance,
                  xRange,
                  graphOnlyMode,
                  homeRevision,
                  getWidgetAlignZero(widget),
                  xAxisMode
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
                    addDroppedSignalToWidget(widget.id, droppedSignal);
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
                  {widgetKind === "xy" ? (
                    <>
                      <label className="field-label">Signal X</label>
                      <select
                        className="mini-select"
                        value={widget.xSignal ?? ""}
                        onChange={(event) => {
                          const nextX = event.target.value || null;
                          setWidgets((prev) =>
                            prev.map((item) =>
                              item.id === widget.id ? { ...item, xSignal: nextX } : item
                            )
                          );
                        }}
                      >
                        <option value="">Selectionner X...</option>
                        {availableSignals.map((signal) => (
                          <option key={`x-${widget.id}-${signal}`} value={signal}>
                            {signal}
                          </option>
                        ))}
                      </select>
                    </>
                  ) : null}

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

                  {widgetKind === "timeseries" ? (
                    <label className="signal-checkbox" style={{ marginTop: "0.4rem" }}>
                      <input
                        type="checkbox"
                        checked={getWidgetAlignZero(widget)}
                        onChange={(event) => {
                          const checked = event.target.checked;
                          setWidgets((prev) =>
                            prev.map((item) =>
                              item.id === widget.id
                                ? {
                                    ...item,
                                    options: {
                                      ...(item.options ?? {}),
                                      alignZero: checked,
                                    },
                                  }
                                : item
                            )
                          );
                        }}
                      />
                      <span className="signal-badge" style={{ borderColor: "#e5e7eb" }}>
                        Origine commune (0)
                      </span>
                    </label>
                  ) : null}

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

              {loadingById[widget.id] ? (
                <div className="loading-plot">
                  <span className="loading-spinner" aria-hidden="true" />
                  Chargement...
                </div>
              ) : null}

              {(widgetKind === "xy" && (!widget.xSignal || widget.signals.length === 0)) ||
              (widgetKind === "timeseries" && widget.signals.length === 0) ? (
                <div className="placeholder-graph" aria-label="Aucun signal sélectionné">
                  <div className="placeholder-graph-mark">+</div>
                  <div className="placeholder-graph-text">
                    {widgetKind === "xy" ? "Choisissez X et ajoutez Y" : "Ajoutez un signal"}
                  </div>
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
                      if (widgetKind === "xy" || xAxisMode !== "distance") {
                        return;
                      }
                      const hoveredX = evt.points?.[0]?.x;
                      if (typeof hoveredX === "number") {
                        setCursorDistance(hoveredX);
                      }
                    }}
                    onRelayout={(eventData) => {
                      if (widgetKind === "xy" || xAxisMode !== "distance") {
                        return;
                      }
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
              {trackMapped.startFinish ? (
                <line
                  x1={trackMapped.startFinish.x1}
                  y1={trackMapped.startFinish.y1}
                  x2={trackMapped.startFinish.x2}
                  y2={trackMapped.startFinish.y2}
                  stroke="#f8fafc"
                  strokeWidth="2.2"
                />
              ) : null}
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
      )}

      {!canQuery ? <p className="panel-text">Import requis.</p> : null}
    </section>
  );
}
