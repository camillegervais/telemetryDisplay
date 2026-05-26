import { useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import Plot from "react-plotly.js";

import { queryDataset, calculateMapTuning, computeMathChannel } from "../api";
import { evaluateMathChannel } from "../mathChannels";
import { useTelemetryStore } from "../store/telemetryStore";
import { ConfigManager } from "../store/ConfigManager";
import type { DatasetMetadata, DistanceRange, SignalSeries, TrackMapResponse, MapTuningData, SoftBlock, SoftLutOp, SoftMathOp } from "../types";
import MapTuning from "./MapTuning";
import SoftTab, { type BlockStatus } from "./SoftTab";

type SignalWorkspaceProps = {
  datasetId: string | null;
  datasetMetadata: DatasetMetadata | null;
  trackMap: TrackMapResponse | null;
  graphOnlyMode: boolean;
  inspectorSelectedWidgetId?: number | null;
  onInspectorSelectedWidgetIdChange?: (widgetId: number | null) => void;
  onInspectorSnapshotChange?: (snapshot: InspectorSnapshot) => void;
  inspectorCommand?: InspectorCommand | null;
  onRefreshDatasetMetadata?: () => Promise<void>;
};

export type InspectorWidgetSummary = {
  id: number;
  title: string;
  kind: "timeseries" | "xy";
  signalsCount: number;
  xSignal: string | null;
  row: number;
  col: number;
  widthSpan: number;
  heightSpan: number;
  alignZero: boolean;
  alignMode: "off" | "origin-scale" | "origin-only";
  menuOpen: boolean;
  options?: WidgetOptions;
};

export type InspectorSnapshot = {
  activeTabId: string;
  activeTabName: string;
  gridCols: number;
  gridRows: number;
  widgets: InspectorWidgetSummary[];
  selectedWidgetId: number | null;
};

export type InspectorCommand = {
  type: "toggle-menu" | "set-align-zero" | "set-align-mode" | "set-size" | "set-position" | "set-hide-positive" | "set-hide-negative" | "set-filter-braking" | "set-y-axis-min" | "set-y-axis-max";
  widgetId: number;
  alignZero?: boolean;
  alignMode?: "origin-scale" | "origin-only";
  widthSpan?: number;
  heightSpan?: number;
  row?: number;
  col?: number;
  hidePositive?: boolean;
  hideNegative?: boolean;
  filterByBraking?: boolean;
  yAxisMin?: number;
  yAxisMax?: number;
};

type YAxisMatchMode = "origin-scale" | "origin-only";

type WidgetOptions = {
  alignZero?: boolean;
  yAxisMatchMode?: YAxisMatchMode;
  hidePositive?: boolean;
  hideNegative?: boolean;
  filterByBraking?: boolean;
  yAxisMin?: number;
  yAxisMax?: number;
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
  mapTuning: MapTuningData;
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

function buildSessionSnapshot(
  tabs: WorkspaceTab[],
  activeTabId: string,
  currentConfigId: string | null,
  selectedConfigId: string
): WorkspaceSessionSnapshot {
  return {
    tabs: tabs.map((tab) => ({
      ...tab,
      widgets: tab.widgets.map(({ menuOpen, ...widget }) => ({ ...widget, menuOpen: false })),
    })),
    activeTabId,
    currentConfigId,
    selectedConfigId,
  };
}

const COLORS = ["#00a8ff", "#ff2d4f", "#ffd447", "#34d399", "#ff8a33", "#ff9aa8"];
const SIGNAL_DRAG_MIME = "application/x-telemetry-signal";
const TRAJECTORY_TAB_ID = "tab-trajectory";
const ANALYSIS_TAB_ID = "tab-analysis";
const SOFT_TAB_ID = "tab-soft";
const TRAJECTORY_SIGNALS = ["xCar", "yCar", "xRef", "yRef", "xTrack", "yTrack"] as const;
const BRAKING_NAME_SIGNAL = 'MBrakeR';

// Empty MapTuningData to avoid errors
const emptyMapTuningData = {
  inputChannelX: "",
  inputChannelY: "",
  outputChannelName: "",
  gridData: [[0]],
  rowHeaders: [0],
  colHeaders: [0],
  braking_signal: false,
  gainVal: 1,
  offsetVal: 0,
  interpolation: "linear" as const,
};

function isEditableElement(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  if (target.isContentEditable) {
    return true;
  }
  return target.closest("input, textarea, select, [contenteditable='true']") !== null;
}

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
  const normalizedMatchMode: YAxisMatchMode =
    options?.yAxisMatchMode === "origin-only" ? "origin-only" : "origin-scale";
  const normalizedOptions: WidgetOptions = {
    ...(options ?? {}),
    alignZero: options?.alignZero ?? legacyAlignZero ?? false,
    yAxisMatchMode: normalizedMatchMode,
    hidePositive: options?.hidePositive ?? false,
    hideNegative: options?.hideNegative ?? false,
    filterByBraking: options?.filterByBraking ?? false,
  };

  return {
    ...rest,
    options: normalizedOptions,
    menuOpen: forceCloseMenu ? false : widget.menuOpen,
  };
}

function sanitizeTabWidgetIds(tab: WorkspaceTab): WorkspaceTab {
  const usedIds = new Set<number>();
  let nextCandidateId = 1;

  const widgets = tab.widgets.map((widget) => {
    let normalizedId = Number.isFinite(widget.id) ? Math.trunc(widget.id) : nextCandidateId;
    if (normalizedId < 1) {
      normalizedId = nextCandidateId;
    }

    while (usedIds.has(normalizedId)) {
      normalizedId = nextCandidateId;
      nextCandidateId += 1;
    }

    usedIds.add(normalizedId);
    nextCandidateId = Math.max(nextCandidateId, normalizedId + 1);

    return {
      ...normalizeWidget(widget, true),
      id: normalizedId,
    };
  });

  const maxWidgetId = widgets.reduce((maxId, widget) => Math.max(maxId, widget.id), 0);
  const fallbackNextId = Math.max(1, maxWidgetId + 1);
  const tabNextId = Number.isFinite(tab.nextId) ? Math.trunc(tab.nextId) : fallbackNextId;

  return {
    ...tab,
    widgets,
    nextId: Math.max(tabNextId, fallbackNextId),
  };
}

function getWidgetAlignZero(widget: GraphWidget): boolean {
  return widget.options?.alignZero ?? widget.alignZero ?? false;
}

function getWidgetYAxisMatchMode(widget: GraphWidget): "off" | YAxisMatchMode {
  if (!getWidgetAlignZero(widget)) {
    return "off";
  }
  return widget.options?.yAxisMatchMode === "origin-only" ? "origin-only" : "origin-scale";
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

function mapTrackToViewportEqual(
  xValues: number[],
  yValues: number[],
  width: number,
  height: number,
  pad: number
): { xs: number[]; ys: number[] } {
  const minX = Math.min(...xValues);
  const maxX = Math.max(...xValues);
  const minY = Math.min(...yValues);
  const maxY = Math.max(...yValues);

  const spanX = Math.max(maxX - minX, 1e-9);
  const spanY = Math.max(maxY - minY, 1e-9);
  const drawableW = Math.max(width - 2 * pad, 1);
  const drawableH = Math.max(height - 2 * pad, 1);
  const scale = Math.min(drawableW / spanX, drawableH / spanY);

  const offsetX = pad + (drawableW - spanX * scale) / 2;
  const offsetY = pad + (drawableH - spanY * scale) / 2;

  const xs = xValues.map((value) => offsetX + (value - minX) * scale);
  const ys = yValues.map((value) => height - (offsetY + (value - minY) * scale));
  return { xs, ys };
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
  lineLength: number,
  startIndex: number = 0
): { x1: number; y1: number; x2: number; y2: number } | null {
  if (xValues.length < 2 || yValues.length < 2) {
    return null;
  }

  const safeStart = ((startIndex % xValues.length) + xValues.length) % xValues.length;
  const nextIndex = (safeStart + 1) % xValues.length;

  const x0 = xValues[safeStart];
  const y0 = yValues[safeStart];
  const dx = xValues[nextIndex] - x0;
  const dy = yValues[nextIndex] - y0;
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

function startIndexForOffset(lapDistance: number[], offsetM: number): number {
  if (lapDistance.length === 0) {
    return 0;
  }

  const min = lapDistance[0];
  const max = lapDistance[lapDistance.length - 1];
  const span = Math.max(max - min, 1e-9);
  const normalizedOffset = ((offsetM % span) + span) % span;
  const target = min + normalizedOffset;
  return nearestIndex(lapDistance, target);
}

function applyOffsetToDistance(lapDistance: number[], distance: number | null, offsetM: number): number | null {
  if (distance === null || lapDistance.length === 0) {
    return distance;
  }

  const min = lapDistance[0];
  const max = lapDistance[lapDistance.length - 1];
  const span = Math.max(max - min, 1e-9);
  const normalizedOffset = ((offsetM % span) + span) % span;
  const shifted = distance + normalizedOffset;
  const wrapped = ((shifted - min) % span + span) % span + min;
  return wrapped;
}

function buildOriginAlignedRange(values: number[]): [number, number] | null {
  const finiteValues = values.filter((value) => Number.isFinite(value));
  if (finiteValues.length === 0) {
    return null;
  }

  const min = Math.min(...finiteValues);
  const max = Math.max(...finiteValues);

  const negativeExtent = Math.max(0, -min);
  const positiveExtent = Math.max(0, max);
  const halfSpan = Math.max(negativeExtent, positiveExtent, 1e-9);

  return [-halfSpan, halfSpan];
}

function getSignalColor(signal: string, index: number): string {
  return (ConfigManager.get("signal-colors") as Record<string, string> | undefined)?.[signal] ?? COLORS[index % COLORS.length];
}

function buildChartConfig(
  title: string,
  series: SignalSeries | null,
  selectedSignals: string[],
  cursorDistance: number | null,
  xRange: DistanceRange | null,
  graphOnlyMode: boolean,
  homeRevision: number,
  yAxisMatchMode: "off" | YAxisMatchMode,
  xAxisMode: "distance" | "time",
  options?: WidgetOptions
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
  const useSharedYAxis = yAxisMatchMode === "origin-scale" && selectedSignals.length > 1;
  const originOnlyRanges =
    yAxisMatchMode === "origin-only"
      ? Object.fromEntries(
          selectedSignals.map((signal) => [signal, buildOriginAlignedRange(series.signals[signal] ?? [])])
        )
      : {};

  const data = selectedSignals.map((signal, index) => {
    let yValues = series.signals[signal] ?? [];
    
    // Apply filters
    if (options?.hidePositive) {
      yValues = yValues.map(v => v > 0 ? NaN : v);
    }
    if (options?.hideNegative) {
      yValues = yValues.map(v => v < 0 ? NaN : v);
    }
    if (options?.filterByBraking && series.signals[BRAKING_NAME_SIGNAL]) {
      const brakeValues = series.signals[BRAKING_NAME_SIGNAL];
      yValues = yValues.map((v, i) => brakeValues[i] !== 0 ? v : NaN);
    }

    return {
      type: "scatter" as const,
      mode: "lines" as const,
      name: signal,
      x: xValues,
      y: yValues,
      line: {
        color: getSignalColor(signal, index),
        width: 2,
      },
      yaxis: useSharedYAxis ? "y" : index === 0 ? "y" : `y${index + 1}`,
      hovertemplate: `%{y:.3f}<extra></extra>`,
    };
  });

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
      ...(yAxisMatchMode === "origin-only" && originOnlyRanges[selectedSignals[0]]
        ? {
            range: originOnlyRanges[selectedSignals[0]],
            autorange: false,
          }
        : {}),
      ...(options?.yAxisMin !== undefined && options?.yAxisMax !== undefined
        ? {
            range: [options.yAxisMin, options.yAxisMax],
            autorange: false,
          }
        : {}),
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
        ...(yAxisMatchMode === "origin-only" && originOnlyRanges[signal]
          ? {
              range: originOnlyRanges[signal],
              autorange: false,
              tickmode: "sync",
            }
          : {}),
        ...(options?.yAxisMin !== undefined && options?.yAxisMax !== undefined
          ? {
              range: [options.yAxisMin, options.yAxisMax],
              autorange: false,
            }
          : {}),
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
  homeRevision: number,
  options?: WidgetOptions
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
  const data = ySignals.map((signal, index) => {
    let yValues = series.signals[signal] ?? [];
    
    // Apply filters to y values
    if (options?.hidePositive) {
      yValues = yValues.map(v => v > 0 ? NaN : v);
    }
    if (options?.hideNegative) {
      yValues = yValues.map(v => v < 0 ? NaN : v);
    }
    if (options?.filterByBraking && series.signals[BRAKING_NAME_SIGNAL]) {
      const brakeValues = series.signals[BRAKING_NAME_SIGNAL];
      yValues = yValues.map((v, i) => brakeValues[i] !== 0 ? v : NaN);
    }

    return {
      type: "scatter" as const,
      mode: "markers" as const,
      name: `${signal} vs ${xSignal}`,
      x: xValues,
      y: yValues,
      marker: {
        color: getSignalColor(signal, index),
        size: 5,
        opacity: 0.8,
      },
      hovertemplate: `%{y:.3f}<extra></extra>`,
    };
  });

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
      ...(options?.yAxisMin !== undefined && options?.yAxisMax !== undefined
        ? {
            range: [options.yAxisMin, options.yAxisMax],
            autorange: false,
          }
        : {
            autorange: true,
          }),
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
  return findFirstFreeCell(widgets, rows, cols, widthSpan, heightSpan) ?? { row: 1, col: 1 };
}

function findFirstFreeCell(
  widgets: GraphWidget[],
  rows: number,
  cols: number,
  widthSpan: number = 1,
  heightSpan: number = 1
): { row: number; col: number } | null {
  for (let row = 1; row <= rows; row += 1) {
    for (let col = 1; col <= cols; col += 1) {
      const testWidget = { id: -1, title: "", signals: [], menuOpen: false, row, col, widthSpan, heightSpan };
      if (canPlaceWidget(testWidget, row, col, rows, cols, widgets)) {
        return { row, col };
      }
    }
  }
  return null;
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
  inspectorSelectedWidgetId,
  onInspectorSelectedWidgetIdChange,
  onInspectorSnapshotChange,
  inspectorCommand,
  onRefreshDatasetMetadata,
}: SignalWorkspaceProps) {
  const {
    cursorDistance,
    xRange,
    homeRevision,
    xAxisMode,
    startFinishOffsetM,
    setCursorDistance,
    setXRange,
  } = useTelemetryStore();

  const initialTab = useMemo(() => createDefaultTab(), []);
  const [tabs, setTabs] = useState<WorkspaceTab[]>([initialTab]);  
  // Force re-render when signal color mapping changes so plots update
  const [, setSignalColorsRevision] = useState(0);
  useEffect(() => {
    const unsubscribe = ConfigManager.subscribe("signal-colors", () => {
      setSignalColorsRevision((v) => v + 1);
    });
    return unsubscribe;
  }, []);
  const [activeTabId, setActiveTabId] = useState<string>(initialTab.id);
  const [gridCols, setGridCols] = useState(initialTab.gridCols);
  const [gridRows, setGridRows] = useState(initialTab.gridRows);
  const [nextId, setNextId] = useState(initialTab.nextId);
  const [widgets, setWidgets] = useState<GraphWidget[]>(initialTab.widgets);
  const [savedConfigs, setSavedConfigs] = useState<SavedWorkspaceConfig[]>(() => ConfigManager.get<SavedWorkspaceConfig[]>("layouts") ?? []);
  const [selectedConfigId, setSelectedConfigId] = useState<string>("");
  const [currentConfigId, setCurrentConfigId] = useState<string | null>(null);
  // Refs to expose current state values to subscription callbacks without stale closures.
  const savedConfigsRef = useRef(savedConfigs);
  const tabsRef = useRef(tabs);
  const currentConfigIdRef = useRef(currentConfigId);
  const selectedConfigIdRef = useRef(selectedConfigId);
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
  const [focusSignalsOpen, setFocusSignalsOpen] = useState(true);
  const [focusTargetWidgetId, setFocusTargetWidgetId] = useState<string>("auto");
  const [focusSignalFilter, setFocusSignalFilter] = useState("");
  const [localSelectedWidgetId, setLocalSelectedWidgetId] = useState<number | null>(null);
  const [mapTuningData, setMapTuningData] = useState<MapTuningData | null>(null);
  const [mapConfigs, setMapConfigs] = useState<Record<string, MapTuningData>>(
    () => ConfigManager.get<Record<string, MapTuningData>>("map-configs") ?? {}
  );
  const mapConfigsRef = useRef<Record<string, MapTuningData>>(mapConfigs);
  const datasetIdRef = useRef<string | null>(datasetId);
  const [softBlocks, setSoftBlocks] = useState<SoftBlock[]>(() => ConfigManager.get<SoftBlock[]>("soft-blocks") ?? []);
  const [softBlockStatuses, setSoftBlockStatuses] = useState<Record<string, BlockStatus>>({});
  const softBlocksRef = useRef(softBlocks);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const queryGenerationRef = useRef(0);
  const tabSwitchGenerationRef = useRef(0);
  const activeTabIdRef = useRef(activeTabId);
  const sessionSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedSessionRef = useRef<WorkspaceSessionSnapshot | null>(null);
  
  useEffect(() => { activeTabIdRef.current = activeTabId; }, [activeTabId]);
  useEffect(() => { datasetIdRef.current = datasetId; }, [datasetId]);
  useEffect(() => { savedConfigsRef.current = savedConfigs; }, [savedConfigs]);
  useEffect(() => { tabsRef.current = tabs; }, [tabs]);
  useEffect(() => { currentConfigIdRef.current = currentConfigId; }, [currentConfigId]);
  useEffect(() => { selectedConfigIdRef.current = selectedConfigId; }, [selectedConfigId]);

  // Keep ref in sync so async callbacks always see latest blocks
  useEffect(() => {
    softBlocksRef.current = softBlocks;
  }, [softBlocks]);

  // Helper function to update widgets and sync to tabs
  function updateWidgetsAndTabs(
    updater: (prev: GraphWidget[]) => GraphWidget[],
    options?: { nextTabId?: number }
  ): void {
    setWidgets((prevWidgets) => {
      const newWidgets = updater(prevWidgets);
      setTabs((prevTabs) =>
        prevTabs.map((tab) =>
          tab.id === activeTabIdRef.current
            ? {
                ...tab,
                widgets: newWidgets,
                ...(options?.nextTabId !== undefined ? { nextId: options.nextTabId } : {}),
              }
            : tab
        )
      );
      return newWidgets;
    });
  }

  // Collect all soft block output names
  const softOutputNames = useMemo(
    () => softBlocks.flatMap((b) => b.operations.map((op) => op.name)),
    [softBlocks]
  );

  const availableSignals = useMemo(() => {
    // Deduplicate: soft block outputs are persisted to dataset by the backend,
    // so after calculation they appear in both signal_names AND softOutputNames.
    const seen = new Set<string>();
    const result: string[] = [];
    for (const s of [
      ...(datasetMetadata?.signal_names ?? []),
      ...softOutputNames,
    ]) {
      if (!seen.has(s)) { seen.add(s); result.push(s); }
    }
    return result;
  }, [datasetMetadata, softOutputNames]);
  const filteredFocusSignals = useMemo(() => {
    const q = focusSignalFilter.trim().toLowerCase();
    if (q.length === 0) {
      return availableSignals;
    }
    return availableSignals.filter((signal) => signal.toLowerCase().includes(q));
  }, [availableSignals, focusSignalFilter]);
  const canQuery = datasetId !== null && datasetMetadata !== null;
  const isTrajectoryActive = activeTabId === TRAJECTORY_TAB_ID;
  const isAnalysisActive = activeTabId === ANALYSIS_TAB_ID;
  const isSoftActive = activeTabId === SOFT_TAB_ID;
  const selectedWidgetId = inspectorSelectedWidgetId ?? localSelectedWidgetId;

  function updateSelectedWidgetId(next: number | null) {
    if (inspectorSelectedWidgetId !== undefined) {
      onInspectorSelectedWidgetIdChange?.(next);
      return;
    }
    setLocalSelectedWidgetId(next);
  }

  useEffect(() => {
    if (focusTargetWidgetId === "auto") {
      return;
    }
    const selectedId = Number(focusTargetWidgetId);
    const stillExists = widgets.some((widget) => widget.id === selectedId);
    if (!stillExists) {
      setFocusTargetWidgetId("auto");
    }
  }, [widgets, focusTargetWidgetId]);

  useEffect(() => {
    if (selectedWidgetId === null) {
      return;
    }
    const exists = widgets.some((widget) => widget.id === selectedWidgetId);
    if (!exists) {
      updateSelectedWidgetId(null);
    }
  }, [widgets, selectedWidgetId]);

  useEffect(() => {
    if (!onInspectorSnapshotChange) {
      return;
    }

    const activeTabName =
      activeTabId === TRAJECTORY_TAB_ID
        ? "Trajectoire"
        : tabs.find((tab) => tab.id === activeTabId)?.name ?? "Onglet";

    const widgetSummaries: InspectorWidgetSummary[] = widgets.map((widget) => ({
      id: widget.id,
      title: widget.title,
      kind: getWidgetKind(widget),
      signalsCount: widget.signals.length,
      xSignal: widget.xSignal ?? null,
      row: widget.row,
      col: widget.col,
      widthSpan: widget.widthSpan,
      heightSpan: widget.heightSpan,
      alignZero: getWidgetAlignZero(widget),
      alignMode: getWidgetYAxisMatchMode(widget),
      menuOpen: widget.menuOpen,
      options: widget.options,
    }));

    onInspectorSnapshotChange({
      activeTabId,
      activeTabName,
      gridCols,
      gridRows,
      widgets: widgetSummaries,
      selectedWidgetId,
    });
  }, [activeTabId, tabs, gridCols, gridRows, widgets, selectedWidgetId, onInspectorSnapshotChange]);

  useEffect(() => {
    if (!inspectorCommand) {
      return;
    }

    if (inspectorCommand.type === "toggle-menu") {
      updateWidgetsAndTabs((prev) =>
        prev.map((item) =>
          item.id === inspectorCommand.widgetId ? { ...item, menuOpen: !item.menuOpen } : item
        )
      );
      return;
    }

    if (inspectorCommand.type === "set-align-zero") {
      const checked = Boolean(inspectorCommand.alignZero);
      setWidgets((prev) =>
        prev.map((item) =>
          item.id === inspectorCommand.widgetId && getWidgetKind(item) === "timeseries"
            ? {
                ...item,
                options: {
                  ...(item.options ?? {}),
                  alignZero: checked,
                  yAxisMatchMode: item.options?.yAxisMatchMode === "origin-only" ? "origin-only" : "origin-scale",
                },
              }
            : item
        )
      );
      return;
    }

    if (inspectorCommand.type === "set-align-mode") {
      const mode = inspectorCommand.alignMode ?? "origin-scale";
      setWidgets((prev) =>
        prev.map((item) =>
          item.id === inspectorCommand.widgetId && getWidgetKind(item) === "timeseries"
            ? {
                ...item,
                options: {
                  ...(item.options ?? {}),
                  alignZero: true,
                  yAxisMatchMode: mode,
                },
              }
            : item
        )
      );
      return;
    }

    if (inspectorCommand.type === "set-size") {
      setWidgets((prev) => {
        const widget = prev.find((item) => item.id === inspectorCommand.widgetId);
        if (!widget) {
          return prev;
        }
        const widthSpan = inspectorCommand.widthSpan ?? widget.widthSpan;
        const heightSpan = inspectorCommand.heightSpan ?? widget.heightSpan;
        if (
          !canPlaceWidget(
            { ...widget, widthSpan, heightSpan },
            widget.row,
            widget.col,
            gridRows,
            gridCols,
            prev.filter((w) => w.id !== inspectorCommand.widgetId)
          )
        ) {
          return prev;
        }
        return prev.map((item) =>
          item.id === inspectorCommand.widgetId ? { ...item, widthSpan, heightSpan } : item
        );
      });
      return;
    }

    if (inspectorCommand.type === "set-position") {
      setWidgets((prev) => {
        const widget = prev.find((item) => item.id === inspectorCommand.widgetId);
        if (!widget) {
          return prev;
        }
        const row = inspectorCommand.row ?? widget.row;
        const col = inspectorCommand.col ?? widget.col;
        if (
          !canPlaceWidget(
            widget,
            row,
            col,
            gridRows,
            gridCols,
            prev.filter((w) => w.id !== inspectorCommand.widgetId)
          )
        ) {
          return prev;
        }
        return prev.map((item) =>
          item.id === inspectorCommand.widgetId ? { ...item, row, col } : item
        );
      });
      return;
    }

    if (inspectorCommand.type === "set-hide-positive") {
      setWidgets((prev) =>
        prev.map((item) =>
          item.id === inspectorCommand.widgetId
            ? {
                ...item,
                options: {
                  ...(item.options ?? {}),
                  hidePositive: inspectorCommand.hidePositive,
                },
              }
            : item
        )
      );
      return;
    }

    if (inspectorCommand.type === "set-hide-negative") {
      setWidgets((prev) =>
        prev.map((item) =>
          item.id === inspectorCommand.widgetId
            ? {
                ...item,
                options: {
                  ...(item.options ?? {}),
                  hideNegative: inspectorCommand.hideNegative,
                },
              }
            : item
        )
      );
      return;
    }

    if (inspectorCommand.type === "set-filter-braking") {
      setWidgets((prev) =>
        prev.map((item) =>
          item.id === inspectorCommand.widgetId
            ? {
                ...item,
                options: {
                  ...(item.options ?? {}),
                  filterByBraking: inspectorCommand.filterByBraking,
                },
              }
            : item
        )
      );
      return;
    }

    if (inspectorCommand.type === "set-y-axis-min") {
      setWidgets((prev) =>
        prev.map((item) =>
          item.id === inspectorCommand.widgetId
            ? {
                ...item,
                options: {
                  ...(item.options ?? {}),
                  yAxisMin: inspectorCommand.yAxisMin,
                },
              }
            : item
        )
      );
      return;
    }

    if (inspectorCommand.type === "set-y-axis-max") {
      setWidgets((prev) =>
        prev.map((item) =>
          item.id === inspectorCommand.widgetId
            ? {
                ...item,
                options: {
                  ...(item.options ?? {}),
                  yAxisMax: inspectorCommand.yAxisMax,
                },
              }
            : item
        )
      );
      return;
    }
  }, [inspectorCommand, gridCols, gridRows]);

  // Build a lookup: soft math op name → dependencies (for on-the-fly evaluation)
  const softMathOpByName = useMemo(() => {
    const map: Record<string, SoftMathOp> = {};
    for (const block of softBlocks) {
      for (const op of block.operations) {
        if (op.kind === "math") map[op.name] = op;
      }
    }
    return map;
  }, [softBlocks]);

  function expandSignalsForQuery(signals: string[]): string[] {
    const expanded = new Set<string>();
    const visited = new Set<string>();

    function visit(name: string) {
      if (visited.has(name)) return; // already processed — prevents cycles
      visited.add(name);

      const softMath = softMathOpByName[name];
      if (softMath) {
        // Expand dependencies first
        for (const dep of softMath.dependencies) {
          visit(dep);
        }
        return;
      }

      // LUT soft ops and raw dataset signals are already in the dataset — query them directly
      expanded.add(name);
    }

    for (const s of signals) {
      visit(s);
    }

    return Array.from(expanded);
  }

  function buildComputedSignals(rawSignals: Record<string, number[]>): Record<string, number[]> {
    const merged = { ...rawSignals };
    // Soft block math ops (evaluated in block/operation order for proper chaining)
    for (const block of softBlocksRef.current) {
      for (const op of block.operations) {
        if (op.kind !== "math") continue;
        if (merged[op.name] !== undefined) continue; // LUT result already in dataset
        const hasDeps = op.dependencies.every((dep) => merged[dep] !== undefined);
        if (!hasDeps) continue;
        try {
          merged[op.name] = evaluateMathChannel(op, merged);
        } catch {
          merged[op.name] = [];
        }
      }
    }
    return merged;
  }

  useEffect(() => {
    const snapshot = ConfigManager.get<WorkspaceSessionSnapshot>("session");
    if (!snapshot) {
      setSessionHydrated(true);
      return;
    }

    const clonedTabs = snapshot.tabs
      .map((tab) => sanitizeTabWidgetIds(tab))
      .map(tab => ({
        ...tab,
        widgets: tab.widgets.map(w => ({ ...w, menuOpen: false }))
      }));
    const restoredActiveId =
      snapshot.activeTabId === TRAJECTORY_TAB_ID
        ? TRAJECTORY_TAB_ID
        : snapshot.activeTabId === ANALYSIS_TAB_ID
        ? ANALYSIS_TAB_ID
        : snapshot.activeTabId === SOFT_TAB_ID
        ? SOFT_TAB_ID
        : clonedTabs.some((tab) => tab.id === snapshot.activeTabId)
      ? snapshot.activeTabId
      : clonedTabs[0].id;
    const restoredActiveTab =
      clonedTabs.find((tab) => tab.id === restoredActiveId) ?? clonedTabs[0];

    setTabs(clonedTabs);
    setActiveTabId(restoredActiveId);
    if (
      restoredActiveId !== TRAJECTORY_TAB_ID &&
      restoredActiveId !== ANALYSIS_TAB_ID &&
      restoredActiveId !== SOFT_TAB_ID
    ) {
      setGridCols(restoredActiveTab.gridCols);
      setGridRows(restoredActiveTab.gridRows);
      setNextId(restoredActiveTab.nextId);
      setWidgets(restoredActiveTab.widgets);
    }
    setCurrentConfigId(snapshot.currentConfigId);
    setSelectedConfigId(snapshot.selectedConfigId);
    setSessionHydrated(true);
  }, []);

  // Cleanup: clear any pending session saves on unmount
  useEffect(() => {
    return () => {
      if (sessionSaveTimeoutRef.current !== null) {
        clearTimeout(sessionSaveTimeoutRef.current);
      }
    };
  }, []);

  // ── Soft Blocks: persist + cross-tab sync ──────────────────────────────────
  useEffect(() => {
    ConfigManager.set("soft-blocks", softBlocks);
  }, [softBlocks]);

  useEffect(() => {
    return ConfigManager.subscribeDebouncedFull<SoftBlock[]>(
      "soft-blocks",
      (newBlocks) => {
        // Only update if different (avoids self-triggering)
        if (JSON.stringify(newBlocks) !== JSON.stringify(softBlocksRef.current)) {
          setSoftBlocks(newBlocks);
        }
      },
      200
    );
  }, []);

  // ── Map Configs: sync from other tabs (MapTuning tab saves here) ────────────
  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = ConfigManager.subscribe<Record<string, MapTuningData>>("map-configs", (newConfigs) => {
      const next = newConfigs ?? {};
      // Detect changed map keys
      const prev = mapConfigsRef.current ?? {};
      const changedKeys: string[] = [];
      const allKeys = new Set<string>([...Object.keys(prev), ...Object.keys(next)]);
      const fieldsToCheck = ["gridData", "rowHeaders", "colHeaders", "gainVal", "offsetVal", "braking_signal", "interpolation"];
      for (const k of allKeys) {
        const a = prev[k];
        const b = next[k];
        // Only trigger recalculation when the table values or breakpoints/gain/offset/braking changed.
        // Ignore changes to axes (inputChannelX/inputChannelY) or outputChannelName.
        if (a && b) {
          for (const f of fieldsToCheck) {
            // Use JSON.stringify for deep comparison
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            if (JSON.stringify((a as any)[f]) !== JSON.stringify((b as any)[f])) {
              changedKeys.push(k);
              break;
            }
          }
        }
      }

      setMapConfigs(next);
      mapConfigsRef.current = next;

      if (!datasetIdRef.current) return;
      if (changedKeys.length === 0) return;

      // Debounce recalculation to avoid spamming
      if (timeoutId !== null) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        // Find blocks referencing any of the changed map keys
        const affectedBlocks = softBlocksRef.current.filter((b) =>
          b.operations.some((op) => op.kind === "lut2d" && changedKeys.includes((op as SoftLutOp).mapConfigKey))
        );
        for (const blk of affectedBlocks) {
          // Fire and forget
          // eslint-disable-next-line @typescript-eslint/no-floating-promises
          calculateSoftBlock(blk.id, softBlocksRef.current);
        }
        timeoutId = null;
      }, 250);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    mapConfigsRef.current = mapConfigs;
  }, [mapConfigs]);

  // ── Soft Blocks: calculation engine ────────────────────────────────────────

  async function calculateSoftBlock(blockId: string, blocksSnapshot?: SoftBlock[]): Promise<void> {
    const blocks = blocksSnapshot ?? softBlocksRef.current;
    const block = blocks.find((b) => b.id === blockId);
    const currentDatasetId = datasetIdRef.current;
    if (!block || !currentDatasetId) return;
    if (block.enabled === false) return;

    setSoftBlockStatuses((prev) => ({ ...prev, [blockId]: { state: "running" } }));

    try {
      // Execute operations in order — each persists its output to the dataset
      // so subsequent ops can reference it (both within the block and across blocks)
      for (const op of block.operations) {
        if (op.kind === "lut2d") {
          const lutOp = op as SoftLutOp;
          // Use the latest persisted map configs (ref) to ensure live edits are applied
          const latestMapCfgs = mapConfigsRef.current ?? mapConfigs;
          const mapCfg = latestMapCfgs[lutOp.mapConfigKey];
          if (!mapCfg) {
            throw new Error(`Map "${lutOp.mapConfigKey}" introuvable. Sauvegardez-la d'abord dans l'onglet Rejeu Cartos.`);
          }
          await calculateMapTuning({
            datasetId: currentDatasetId,
            inputChannelX: mapCfg.inputChannelX,
            inputChannelY: mapCfg.inputChannelY,
            outputChannelName: lutOp.name,  // use op name as output (not map's outputChannelName)
            gridData: mapCfg.gridData,
            rowHeaders: mapCfg.rowHeaders,
            colHeaders: mapCfg.colHeaders,
            braking_signal: mapCfg.braking_signal,
            gainVal: mapCfg.gainVal,
            offsetVal: mapCfg.offsetVal,
            interpolation: mapCfg.interpolation ?? "linear",
          });
        } else if (op.kind === "math") {
          const mathOp = op as SoftMathOp;
          if (mathOp.dependencies.length > 0 && mathOp.expression.trim()) {
            await computeMathChannel({
              datasetId: currentDatasetId,
              output_name: mathOp.name,
              expression: mathOp.expression,
              dependencies: mathOp.dependencies,
            });
          }
        }
      }

      setSoftBlockStatuses((prev) => ({ ...prev, [blockId]: { state: "done" } }));
      // Refresh metadata so new signals appear in the signal list
      onRefreshDatasetMetadata?.();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erreur calcul";
      setSoftBlockStatuses((prev) => ({ ...prev, [blockId]: { state: "error", error: msg } }));
    }
  }

  async function calculateAllSoftBlocks(blocksSnapshot?: SoftBlock[]): Promise<void> {
    const blocks = blocksSnapshot ?? softBlocksRef.current;
    if (!datasetId || blocks.length === 0) return;
    // Run blocks sequentially so each block can reference outputs of the previous one
    for (const block of blocks) {
      if (block.enabled === false) continue;
      await calculateSoftBlock(block.id, blocks);
    }
  }

  // Recalculate all soft blocks when dataset changes
  useEffect(() => {
    if (datasetId && softBlocksRef.current.length > 0) {
      calculateAllSoftBlocks(softBlocksRef.current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datasetId]);

  // Recalculate blocks whose LUT ops changed (debounced to avoid spamming on rapid edits)
  const pendingRecalcRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!datasetId) return;
    if (pendingRecalcRef.current !== null) clearTimeout(pendingRecalcRef.current);
    pendingRecalcRef.current = setTimeout(() => {
      // Only recalculate blocks that have LUT ops (math ops are on-the-fly)
      const blocksWithLut = softBlocks.filter((b) =>
        b.operations.some((op) => op.kind === "lut2d")
      );
      if (blocksWithLut.length > 0) {
        calculateAllSoftBlocks(softBlocks);
      }
      pendingRecalcRef.current = null;
    }, 800); // Generous debounce — user may be mid-edit
    return () => {
      if (pendingRecalcRef.current !== null) clearTimeout(pendingRecalcRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [softBlocks, datasetId]);

  // Debounced save for session - prevents alternation between browser tabs
  useEffect(() => {
    if (!sessionHydrated || tabs.length === 0) {
      return;
    }

    const sessionSnapshot = buildSessionSnapshot(tabs, activeTabId, currentConfigId, selectedConfigId);

    // Skip save if content hasn't changed
    if (JSON.stringify(sessionSnapshot) === JSON.stringify(lastSavedSessionRef.current)) {
      return;
    }

    // Clear pending save
    if (sessionSaveTimeoutRef.current !== null) {
      clearTimeout(sessionSaveTimeoutRef.current);
    }

    // Schedule debounced save
    sessionSaveTimeoutRef.current = setTimeout(() => {
      lastSavedSessionRef.current = sessionSnapshot;
      ConfigManager.set("session", sessionSnapshot);
      sessionSaveTimeoutRef.current = null;
    }, 150); // Debounce delay
  }, [sessionHydrated, tabs, activeTabId, currentConfigId, selectedConfigId]);

  // Listen for layout changes from other tabs (cross-tab sync)
  // Uses subscribeDebouncedFull + empty deps + ref to prevent stale-closure loops.
  useEffect(() => {
    return ConfigManager.subscribeDebouncedFull<SavedWorkspaceConfig[]>("layouts", (newLayouts) => {
      if (JSON.stringify(newLayouts) !== JSON.stringify(savedConfigsRef.current)) {
        setSavedConfigs(newLayouts);
      }
    }, 150);
  }, []);

  // Listen for session changes from other tabs with debounce (active workspace state)
  // Note: activeTabId is NOT synced to allow different tabs on different windows
  useEffect(() => {
    const unsubscribe = ConfigManager.subscribeDebouncedFull<WorkspaceSessionSnapshot>(
      "session",
      (newSnapshot) => {
        if (!newSnapshot) return;

        const localPersistedSnapshot = buildSessionSnapshot(
          tabsRef.current,
          activeTabIdRef.current,
          currentConfigIdRef.current,
          selectedConfigIdRef.current
        );
        if (
          sessionSaveTimeoutRef.current !== null &&
          JSON.stringify(newSnapshot) !== JSON.stringify(localPersistedSnapshot)
        ) {
          return;
        }

        // Check if tabs or config changed (but NOT activeTabId)
        if (JSON.stringify(newSnapshot.tabs) !== JSON.stringify(tabsRef.current) ||
            newSnapshot.currentConfigId !== currentConfigIdRef.current ||
            newSnapshot.selectedConfigId !== selectedConfigIdRef.current) {

          const currentLocalTab = tabsRef.current.find((tab) => tab.id === activeTabIdRef.current);
          const localMenuOpenById = new Map(
            (currentLocalTab?.widgets ?? []).map((widget) => [widget.id, widget.menuOpen])
          );
          const clonedTabs = newSnapshot.tabs.map((tab) => {
            const sanitizedTab = sanitizeTabWidgetIds(tab);
            if (sanitizedTab.id !== activeTabIdRef.current) {
              return sanitizedTab;
            }

            return {
              ...sanitizedTab,
              widgets: sanitizedTab.widgets.map((widget) => ({
                ...widget,
                menuOpen: localMenuOpenById.get(widget.id) ?? widget.menuOpen,
              })),
            };
          });
          setTabs(clonedTabs);

          // Update widgets for current active tab if it exists in the new tabs
          const currentActiveTab = clonedTabs.find((tab) => tab.id === activeTabIdRef.current);
          if (
            currentActiveTab &&
            activeTabIdRef.current !== TRAJECTORY_TAB_ID &&
            activeTabIdRef.current !== ANALYSIS_TAB_ID &&
            activeTabIdRef.current !== SOFT_TAB_ID
          ) {
            setGridCols(currentActiveTab.gridCols);
            setGridRows(currentActiveTab.gridRows);
            setNextId(currentActiveTab.nextId);
            setWidgets(currentActiveTab.widgets);
          }
          
          setCurrentConfigId(newSnapshot.currentConfigId);
          setSelectedConfigId(newSnapshot.selectedConfigId);
        }
      },
      150 // Debounce delay matching the save debounce
    );

    return () => unsubscribe();
  }, []); // Empty dependencies - debounce is stable internally

  useEffect(() => {
    function onWindowPointerDown(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      if (target.closest(".graph-menu") || target.closest("[data-menu-toggle='true']")) {
        return;
      }

      const hasOpenMenu = tabsRef.current
        .flatMap((tab) => tab.widgets)
        .some((widget) => widget.menuOpen);
      if (!hasOpenMenu) {
        return;
      }

      updateWidgetsAndTabs((prev) => prev.map((widget) => ({ ...widget, menuOpen: false })));
    }

    window.addEventListener("mousedown", onWindowPointerDown);
    return () => {
      window.removeEventListener("mousedown", onWindowPointerDown);
    };
  }, []);


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

  // Create a stable dependency key based only on widget signals, not on UI state like menuOpen
  const widgetSignalsKey = useMemo(() => {
    return JSON.stringify(
      widgets.map((w) => ({
        id: w.id,
        signals: w.signals,
        xSignal: w.xSignal,
      }))
    );
  }, [widgets]);

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
        (signal) => datasetSignalSet.has(signal) || softMathOpByName[signal] !== undefined
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
        (signal) => datasetSignalSet.has(signal) || softMathOpByName[signal] !== undefined
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
  }, [canQuery, datasetId, datasetMetadata, widgetSignalsKey, xRange]);

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
        type: "scatter",
        mode: "lines",
        name: "Track",
        x: xTrack,
        y: yTrack,
        line: { color: "#ffd447", width: 1.5 },
      });
    } else if (hasTrackFromMap) {
      data.push({
        type: "scatter",
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
        type: "scatter",
        mode: "lines",
        name: "Reference",
        x: xRef,
        y: yRef,
        line: { color: "#34d399", width: 2 },
      });
    }

    if (hasCar) {
      data.push({
        type: "scatter",
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

    const { xs, ys } = mapTrackToViewportEqual(trackMap.x_position, trackMap.y_position, width, height, pad);

    const firstX = xs[0];
    const firstY = ys[0];
    const lastX = xs[xs.length - 1];
    const lastY = ys[ys.length - 1];
    const seamPx = Math.hypot(lastX - firstX, lastY - firstY);
    const closeTrack = seamPx <= 18;
    const points = closeTrack
      ? [...xs.map((x, i) => `${x},${ys[i]}`), `${firstX},${firstY}`].join(" ")
      : xs.map((x, i) => `${x},${ys[i]}`).join(" ");

    const shiftedCursorDistance = applyOffsetToDistance(trackMap.lap_distance, cursorDistance, startFinishOffsetM);
    const idx = nearestIndex(trackMap.lap_distance, shiftedCursorDistance);
    const startIndex = startIndexForOffset(trackMap.lap_distance, startFinishOffsetM);
    const startFinish = computeStartFinishLine(xs, ys, 14, startIndex);
    return {
      width,
      height,
      points,
      startFinish,
      markerX: xs[idx],
      markerY: ys[idx],
      markerDistance: trackMap.lap_distance[idx],
    };
  }, [cursorDistance, trackMap, startFinishOffsetM]);

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
    updateSelectedWidgetId(null);
    setDragFromId(null);
    setSignalDropCell(null);
  }

  function switchToAnalysisTab() {
    if (isAnalysisActive) {
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
    setActiveTabId(ANALYSIS_TAB_ID);
    setExpandedWidgetId(null);
    updateSelectedWidgetId(null);
    setDragFromId(null);
    setSignalDropCell(null);
  }

  function switchToSoftTab() {
    if (isSoftActive) {
      return;
    }

    setTabs((prev) =>
      prev.map((tab) =>
        tab.id === activeTabId
          ? { ...tab, widgets: closeAllWidgetMenus(tab.widgets) }
          : tab
      )
    );
    setWidgets((prev) => closeAllWidgetMenus(prev));
    setActiveTabId(SOFT_TAB_ID);
    setExpandedWidgetId(null);
    updateSelectedWidgetId(null);
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
    // Create a default name for the prompt
    const defaultName = savedConfigs.find(elem => elem.id === currentConfigId)?.name || `Configuration ${savedConfigs.length + 1}`;
    // Get the new name from the user
    const nextName = window.prompt("Nom de la configuration", defaultName);
    // If no name entered we abort
    if (!nextName) {
      return;
    }

    // Create the tab configuration
    const normalizedTabs = tabs.map((tab) => ({
      ...tab,
      widgets: sanitizeWidgetsForStorage(tab.widgets),
    }));

    // If the name is already saved, we update the saved configuration
    if(savedConfigs.find(e => e.name === nextName)) {
      setSavedConfigs((prev) => {
        const nextConfigs = prev.map((elem) => {
          if(elem.name === nextName) {
            return {
              id: elem.id,
              name: elem.name,
              tabs: normalizedTabs,
              activeTabId,
              mapTuning: mapTuningData || emptyMapTuningData,
            };
          } else {
            return elem;
          }
        });
        return nextConfigs;
      });
    }
    // Else we add the current configuration
    else {
      // Create a fully new object with all the data
      const newId = makeId("cfg");
      const newConfig: SavedWorkspaceConfig = {
        id: newId,
        name: nextName.trim() || defaultName,
        tabs: normalizedTabs,
        activeTabId,
        mapTuning: mapTuningData || emptyMapTuningData,
      };

      // Update the current configuration
      setCurrentConfigId(newId);
      setSelectedConfigId(newId);

      // Add the new configuration to the list
      setSavedConfigs((prev) => {
        const nextConfigs = [...prev, newConfig];
        ConfigManager.set("layouts", nextConfigs);
        return nextConfigs;
      });
    }
    
    
  }

  function loadConfiguration(configId: string) {
    const config = savedConfigs.find((cfg) => cfg.id === configId);
    if (!config || config.tabs.length === 0) {
      return;
    }

    const clonedTabs = config.tabs.map((tab) => sanitizeTabWidgetIds(tab));
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
    setMapTuningData(config.mapTuning ?? null);
  }

  function deleteConfiguration(configId: string) {
    setSavedConfigs((prev) => {
      const nextConfigs = prev.filter((cfg) => cfg.id !== configId);
      ConfigManager.set("layouts", nextConfigs);
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
    if (selectedWidgetId === id) {
      updateSelectedWidgetId(null);
    }
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
    updateWidgetsAndTabs((prev) =>
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

  function addSignalFromFocusToolbar(signal: string) {
    if (!canQuery) {
      return;
    }

    const preferredId = focusTargetWidgetId === "auto" ? null : Number(focusTargetWidgetId);
    const existingTarget = preferredId !== null
      ? widgets.find((widget) => widget.id === preferredId)
      : widgets.find((widget) => widget.id === expandedWidgetId) ?? widgets[0];

    if (existingTarget) {
      addDroppedSignalToWidget(existingTarget.id, signal);
      return;
    }

    const free = firstFreeCell([], gridRows, gridCols, 1, 1);
    addWidgetWithSignalAtPosition(free.row, free.col, signal);
  }

  function addWidgetWithSignalAtPosition(targetRow: number, targetCol: number, signal: string) {
    const newId = nextId;
    const candidate = {
      ...createWidget(newId, `G${newId}`, targetRow, targetCol),
      signals: [signal],
    };

    if (!canPlaceWidget(candidate, targetRow, targetCol, gridRows, gridCols, widgets)) {
      return;
    }

    setWidgets((prev) => [...prev, candidate]);
    setNextId(newId + 1);
  }

  function duplicateWidget(widgetId: number) {
    const source = widgets.find((item) => item.id === widgetId);
    if (!source) {
      return;
    }

    const newId = nextId;
    const free = firstFreeCell(widgets, gridRows, gridCols, source.widthSpan, source.heightSpan);
    const duplicate = normalizeWidget(
      {
        ...source,
        id: newId,
        signals: [...source.signals],
        xSignal: source.xSignal ?? null,
        options: source.options ? { ...source.options } : undefined,
        menuOpen: false,
        row: free.row,
        col: free.col,
      },
      true
    );

    if (!canPlaceWidget(duplicate, free.row, free.col, gridRows, gridCols, widgets)) {
      return;
    }

    setNextId(newId + 1);
    updateWidgetsAndTabs((prev) => [...prev, duplicate], { nextTabId: newId + 1 });
    updateSelectedWidgetId(newId);
    setSeriesById((prev) => {
      const sourceSeries = prev[widgetId];
      if (!sourceSeries) {
        return prev;
      }
      return { ...prev, [newId]: sourceSeries };
    });
    setLoadingById((prev) => ({ ...prev, [newId]: prev[widgetId] ?? false }));
  }

  function canMoveDraggedWidgetToTab(targetTabId: string): boolean {
    if (dragFromId === null || targetTabId === activeTabIdRef.current) {
      return false;
    }

    const sourceWidget = widgets.find((item) => item.id === dragFromId);
    const targetTab = tabs.find((tab) => tab.id === targetTabId);
    if (!sourceWidget || !targetTab) {
      return false;
    }

    return (
      findFirstFreeCell(
        targetTab.widgets,
        targetTab.gridRows,
        targetTab.gridCols,
        sourceWidget.widthSpan,
        sourceWidget.heightSpan
      ) !== null
    );
  }

  function moveDraggedWidgetToTab(targetTabId: string) {
    if (dragFromId === null || targetTabId === activeTabIdRef.current) {
      setDragFromId(null);
      return;
    }

    const currentTabs = tabsRef.current;
    const sourceTab = currentTabs.find((tab) => tab.id === activeTabIdRef.current);
    const targetTab = currentTabs.find((tab) => tab.id === targetTabId);
    if (!sourceTab || !targetTab) {
      setDragFromId(null);
      return;
    }

    const sourceWidget = sourceTab.widgets.find((item) => item.id === dragFromId);
    if (!sourceWidget) {
      setDragFromId(null);
      return;
    }

    const free = findFirstFreeCell(
      targetTab.widgets,
      targetTab.gridRows,
      targetTab.gridCols,
      sourceWidget.widthSpan,
      sourceWidget.heightSpan
    );
    if (!free) {
      setDragFromId(null);
      return;
    }

    const movedWidget = normalizeWidget(
      {
        ...sourceWidget,
        row: free.row,
        col: free.col,
        menuOpen: false,
      },
      true
    );
    const updatedTargetTab: WorkspaceTab = {
      ...targetTab,
      widgets: [...targetTab.widgets, movedWidget],
    };
    const nextTabs = currentTabs.map((tab) => {
      if (tab.id === sourceTab.id) {
        return {
          ...tab,
          widgets: tab.widgets.filter((item) => item.id !== sourceWidget.id),
        };
      }
      if (tab.id === targetTab.id) {
        return updatedTargetTab;
      }
      return tab;
    });

    setTabs(nextTabs);
    setActiveTabId(targetTabId);
    setGridCols(updatedTargetTab.gridCols);
    setGridRows(updatedTargetTab.gridRows);
    setNextId(updatedTargetTab.nextId);
    setWidgets(updatedTargetTab.widgets);
    setExpandedWidgetId(null);
    updateSelectedWidgetId(sourceWidget.id);
    setDragFromId(null);
    setSignalDropCell(null);
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

  function moveSelectedWidget(deltaRow: number, deltaCol: number): boolean {
    if (selectedWidgetId === null) {
      return false;
    }

    let moved = false;
    setWidgets((prev) => {
      const widget = prev.find((item) => item.id === selectedWidgetId);
      if (!widget) {
        return prev;
      }

      const nextRow = clamp(widget.row + deltaRow, 1, gridRows - widget.heightSpan + 1);
      const nextCol = clamp(widget.col + deltaCol, 1, gridCols - widget.widthSpan + 1);
      if (nextRow === widget.row && nextCol === widget.col) {
        return prev;
      }

      const otherWidgets = prev.filter((item) => item.id !== widget.id);
      if (!canPlaceWidget(widget, nextRow, nextCol, gridRows, gridCols, otherWidgets)) {
        return prev;
      }

      moved = true;
      return prev.map((item) =>
        item.id === widget.id
          ? {
              ...item,
              row: nextRow,
              col: nextCol,
            }
          : item
      );
    });

    return moved;
  }

  function resizeSelectedWidget(deltaWidth: number, deltaHeight: number): boolean {
    if (selectedWidgetId === null) {
      return false;
    }

    let resized = false;
    setWidgets((prev) => {
      const widget = prev.find((item) => item.id === selectedWidgetId);
      if (!widget) {
        return prev;
      }

      const maxWidth = gridCols - widget.col + 1;
      const maxHeight = gridRows - widget.row + 1;
      const nextWidth = clamp(widget.widthSpan + deltaWidth, 1, maxWidth);
      const nextHeight = clamp(widget.heightSpan + deltaHeight, 1, maxHeight);
      if (nextWidth === widget.widthSpan && nextHeight === widget.heightSpan) {
        return prev;
      }

      const otherWidgets = prev.filter((item) => item.id !== widget.id);
      if (!canPlaceWidget({ ...widget, widthSpan: nextWidth, heightSpan: nextHeight }, widget.row, widget.col, gridRows, gridCols, otherWidgets)) {
        return prev;
      }

      resized = true;
      return prev.map((item) =>
        item.id === widget.id
          ? {
              ...item,
              widthSpan: nextWidth,
              heightSpan: nextHeight,
            }
          : item
      );
    });

    return resized;
  }

  useEffect(() => {
    function onWorkspaceKeyDown(event: KeyboardEvent) {
      if (isEditableElement(event.target)) {
        return;
      }

      const hasPrimaryModifier = event.ctrlKey || event.metaKey;
      const hasOtherModifiers = event.altKey;
      if (hasOtherModifiers) {
        return;
      }

      if (hasPrimaryModifier && event.code === "KeyS") {
        event.preventDefault();
        saveCurrentConfiguration();
        return;
      }

      if (hasPrimaryModifier && event.code === "KeyO") {
        if (!selectedConfigId) {
          return;
        }
        event.preventDefault();
        loadConfiguration(selectedConfigId);
        return;
      }

      if (hasPrimaryModifier && event.code === "Tab") {
        event.preventDefault();
        const sequence = [...tabs.map((tab) => tab.id), TRAJECTORY_TAB_ID, ANALYSIS_TAB_ID, SOFT_TAB_ID];
        const currentIndex = sequence.indexOf(activeTabId);
        const direction = event.shiftKey ? -1 : 1;
        const nextIndex =
          currentIndex < 0
            ? 0
            : (currentIndex + direction + sequence.length) % sequence.length;
        const nextTabId = sequence[nextIndex];
        if (nextTabId === TRAJECTORY_TAB_ID) {
          switchToTrajectoryTab();
        } else if (nextTabId === ANALYSIS_TAB_ID) {
          switchToAnalysisTab();
        } else if (nextTabId === SOFT_TAB_ID) {
          switchToSoftTab();
        } else {
          switchToTab(nextTabId);
        }
        return;
      }

      if (hasPrimaryModifier) {
        return;
      }

      if (event.code === "KeyA") {
        event.preventDefault();
        addWidget();
        return;
      }

      if (event.code === "KeyX") {
        event.preventDefault();
        addXYWidget();
        return;
      }

      if (event.code === "KeyT") {
        event.preventDefault();
        addTab();
        return;
      }

      if (event.code.startsWith("Digit") && !event.shiftKey) {
        const tabNumber = Number(event.code.replace("Digit", ""));
        if (Number.isNaN(tabNumber) || tabNumber < 1 || tabNumber > 9) {
          return;
        }
        const targetTab = tabs[tabNumber - 1];
        if (targetTab) {
          event.preventDefault();
          switchToTab(targetTab.id);
        }
        return;
      }

      if (event.code === "Delete" || event.code === "Backspace") {
        if (isTrajectoryActive || selectedWidgetId === null) {
          return;
        }
        event.preventDefault();
        removeWidget(selectedWidgetId);
        return;
      }

      if (event.code === "Enter") {
        if (isTrajectoryActive || selectedWidgetId === null) {
          return;
        }
        event.preventDefault();
        setWidgets((prev) =>
          prev.map((item) =>
            item.id === selectedWidgetId ? { ...item, menuOpen: !item.menuOpen } : item
          )
        );
        return;
      }

      if (event.code === "KeyF") {
        if (isTrajectoryActive || selectedWidgetId === null) {
          return;
        }
        event.preventDefault();
        setExpandedWidgetId((prev) => (prev === selectedWidgetId ? null : selectedWidgetId));
        return;
      }

      if (event.code === "Escape") {
        const hasOpenMenu = widgets.some((widget) => widget.menuOpen);
        if (hasOpenMenu) {
          event.preventDefault();
          updateWidgetsAndTabs((prev) => prev.map((widget) => ({ ...widget, menuOpen: false })));
          return;
        }
        if (expandedWidgetId !== null) {
          event.preventDefault();
          setExpandedWidgetId(null);
          return;
        }
        if (selectedWidgetId !== null) {
          event.preventDefault();
          updateSelectedWidgetId(null);
        }
        return;
      }

      if (isTrajectoryActive || selectedWidgetId === null) {
        return;
      }

      if (event.code === "ArrowUp") {
        const changed = event.shiftKey ? resizeSelectedWidget(0, -1) : moveSelectedWidget(-1, 0);
        if (changed) {
          event.preventDefault();
        }
        return;
      }

      if (event.code === "ArrowDown") {
        const changed = event.shiftKey ? resizeSelectedWidget(0, 1) : moveSelectedWidget(1, 0);
        if (changed) {
          event.preventDefault();
        }
        return;
      }

      if (event.code === "ArrowLeft") {
        const changed = event.shiftKey ? resizeSelectedWidget(-1, 0) : moveSelectedWidget(0, -1);
        if (changed) {
          event.preventDefault();
        }
        return;
      }

      if (event.code === "ArrowRight") {
        const changed = event.shiftKey ? resizeSelectedWidget(1, 0) : moveSelectedWidget(0, 1);
        if (changed) {
          event.preventDefault();
        }
      }
    }

    window.addEventListener("keydown", onWorkspaceKeyDown);
    return () => {
      window.removeEventListener("keydown", onWorkspaceKeyDown);
    };
  }, [
    activeTabId,
    expandedWidgetId,
    gridCols,
    gridRows,
    isTrajectoryActive,
    isAnalysisActive,
    selectedConfigId,
    selectedWidgetId,
    tabs,
    widgets,
  ]);

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
              <option value={5}>5</option>
              <option value={6}>6</option>
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
              <option value={5}>5</option>
              <option value={6}>6</option>
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

      {graphOnlyMode ? (
        <div className="focus-mini-toolbar" aria-label="Actions rapides focus">
          <button className="small-button" onClick={() => setFocusSignalsOpen((prev) => !prev)}>
            {focusSignalsOpen ? "Masquer signaux" : "Montrer signaux"}
          </button>
          <button className="small-button" onClick={addWidget}>
            + Graphe
          </button>
          <button className="small-button" onClick={addXYWidget}>
            + Graphe XY
          </button>
          <label>
            Col
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
            Lig
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
          <label>
            Cible
            <select
              className="mini-select"
              value={focusTargetWidgetId}
              onChange={(event) => setFocusTargetWidgetId(event.target.value)}
            >
              <option value="auto">Auto</option>
              {widgets.map((widget) => (
                <option key={`focus-target-${widget.id}`} value={String(widget.id)}>
                  {widget.title}
                </option>
              ))}
            </select>
          </label>
          <div className={`focus-signal-drawer ${focusSignalsOpen ? "focus-signal-drawer-open" : "focus-signal-drawer-closed"}`}>
            <input
              className="focus-signal-filter"
              type="text"
              value={focusSignalFilter}
              onChange={(event) => setFocusSignalFilter(event.target.value)}
              placeholder="Filtrer les signaux..."
              aria-label="Filtrer les signaux"
            />
            <div className="focus-signal-list" aria-label="Signaux disponibles">
              {filteredFocusSignals.map((signal) => (
                <button
                  key={`focus-signal-${signal}`}
                  className="sidebar-signal-chip focus-signal-chip"
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.setData(SIGNAL_DRAG_MIME, signal);
                    event.dataTransfer.effectAllowed = "copy";
                  }}
                  onClick={() => addSignalFromFocusToolbar(signal)}
                  disabled={!canQuery}
                  title={`Cliquer ou glisser: ${signal}`}
                >
                  {signal}
                </button>
              ))}
              {filteredFocusSignals.length === 0 ? (
                <span className="focus-signal-empty">Aucun signal</span>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      <div className={`workspace-tabs ${graphOnlyMode ? "workspace-tabs-hidden" : ""}`}>
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={`workspace-tab ${tab.id === activeTabId ? "workspace-tab-active" : ""}`}
            onDragOver={(event) => {
              if (dragFromId === null) {
                return;
              }

              if (canMoveDraggedWidgetToTab(tab.id)) {
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
              } else {
                event.dataTransfer.dropEffect = "none";
              }
            }}
            onDrop={(event) => {
              if (dragFromId === null) {
                return;
              }

              if (!canMoveDraggedWidgetToTab(tab.id)) {
                setDragFromId(null);
                return;
              }

              event.preventDefault();
              moveDraggedWidgetToTab(tab.id);
            }}
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
        <div className={`workspace-tab ${isAnalysisActive ? "workspace-tab-active" : ""}`}>
          <button className="workspace-tab-name" onClick={switchToAnalysisTab}>
            Tuning Cartos
          </button>
        </div>
        <div className={`workspace-tab ${isSoftActive ? "workspace-tab-active" : ""}`}>
          <button className="workspace-tab-name" onClick={switchToSoftTab}>
            Soft
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
              <div className="loading-plot loading-plot-overlay">
                <span className="loading-spinner" aria-hidden="true" />
                Chargement...
              </div>
            ) : null}
            {trajectoryError ? <p className="panel-text">{trajectoryError}</p> : null}
            {!trajectoryLoading && !trajectoryError && !trajectoryChart.hasCar ? (
              <div className="placeholder-graph" aria-label="Trajectoire indisponible">
                <div className="placeholder-graph-mark">!</div>
                <div className="placeholder-graph-text">Trajectoire indisponible</div>
                <div className="placeholder-graph-help">Signaux requis: xCar et yCar</div>
              </div>
            ) : !trajectoryLoading && !trajectoryError ? (
              <div className="plot-fill">
                <Plot
                  data={trajectoryChart.data}
                  layout={trajectoryChart.layout}
                  useResizeHandler
                  config={{ displaylogo: false, responsive: true }}
                  style={{ width: "100%", height: "100%", backgroundColor: "transparent" }}
                />
              </div>
            ) : null}
          </article>
        </div>
      ) : isAnalysisActive ? (
        <div className="hide-scroll" style={{ overflowY: "auto"}}>
          <MapTuning
            availableSignals={availableSignals}
            datasetId={datasetId}
            onSave={(data) => setMapTuningData(data)}
            onSignalsUpdated={onRefreshDatasetMetadata}
          />
        </div>
      ) : isSoftActive ? (
        <div className="hide-scroll" style={{ overflowY: "auto", padding: "0.5rem" }}>
          <SoftTab
            availableSignals={availableSignals}
            datasetId={datasetId}
            softBlocks={softBlocks}
            onChange={(newBlocks) => setSoftBlocks(newBlocks)}
            onCalculateBlock={(blockId) => calculateSoftBlock(blockId)}
            blockStatuses={softBlockStatuses}
            mapConfigs={mapConfigs}
            onSwitchToMapTuning={switchToAnalysisTab}
          />
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
                  homeRevision,
                  widget.options
                )
              : buildChartConfig(
                  widget.title,
                  seriesById[widget.id] ?? null,
                  widget.signals,
                  cursorDistance,
                  xRange,
                  graphOnlyMode,
                  homeRevision,
                  getWidgetYAxisMatchMode(widget),
                  xAxisMode,
                  widget.options
                );

          return (
            <article
              key={widget.id}
              className={`graph-tile ${dragFromId === widget.id ? "graph-tile-dragging" : ""} ${widget.menuOpen ? "has-open-menu" : ""} ${expandedWidgetId === widget.id ? "graph-tile-expanded" : ""} ${selectedWidgetId === widget.id ? "graph-tile-inspector-active" : ""}`}
              style={{
                gridColumn: `${widget.col} / span ${widget.widthSpan}`,
                gridRow: `${widget.row} / span ${widget.heightSpan}`,
              }}
              onClick={() => updateSelectedWidgetId(widget.id)}
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
                  onDragStart={(e) => {
                    e.stopPropagation?.();
                    e.dataTransfer.effectAllowed = "move";
                    updateSelectedWidgetId(widget.id);
                    setDragFromId(widget.id);
                  }}
                  onDragEnd={() => setDragFromId(null)}
                  title="Déplacer"
                >
                  ↕
                </button>
                <button
                  className="icon-button"
                  data-menu-toggle="true"
                  onClick={(e) => {
                    e.stopPropagation();
                    updateSelectedWidgetId(widget.id);
                    updateWidgetsAndTabs((prev) =>
                      prev.map((item) =>
                        item.id === widget.id ? { ...item, menuOpen: !item.menuOpen } : item
                      )
                    );
                  }}
                  title="Paramètres"
                >
                  ⚙
                </button>
                <button
                  className="icon-button"
                  onClick={(e) => {
                    e.stopPropagation();
                    duplicateWidget(widget.id);
                  }}
                  title="Dupliquer"
                >
                  ⧉
                </button>
                <button
                  className="icon-button icon-button-danger"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeWidget(widget.id);
                  }}
                  title="Supprimer"
                >
                  ×
                </button>
                <button
                  className="icon-button"
                  onClick={(e) => {
                    e.stopPropagation();
                    updateSelectedWidgetId(widget.id);
                    setExpandedWidgetId((prev) => (prev === widget.id ? null : widget.id));
                  }}
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
                <div className="graph-menu" onClick={(e) => e.stopPropagation()}>
                  {widgetKind === "xy" ? (
                    <>
                      <label className="field-label" htmlFor={`x-signal-${widget.id}`}>Signal X</label>
                      <select
                        id={`x-signal-${widget.id}`}
                        className="mini-select"
                        value={widget.xSignal ?? ""}
                        onChange={(event) => {
                          const nextX = event.target.value || null;
                          updateWidgetsAndTabs((prev) =>
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

                  <p className="field-label">Signaux</p>
                  <div className="signal-grid">
                    {widget.signals.map((signal, idx) => (
                      <label key={`${widget.id}-${signal}`} className="signal-checkbox">
                        <input
                          type="checkbox"
                          checked={true}
                          onChange={() => {
                            updateWidgetsAndTabs((prev) =>
                              prev.map((item) => {
                                if (item.id === widget.id) {
                                  return { ...item, signals: item.signals.filter((s) => s !== signal) };
                                }
                                return item;
                              })
                            );
                          }}
                        />
                        <span className="signal-badge" style={{ borderColor: getSignalColor(signal, idx) }}>
                          {signal}
                        </span>
                      </label>
                    ))}
                  </div>

                  {widgetKind === "timeseries" ? (
                    <>
                      <label className="signal-checkbox" style={{ marginTop: "0.4rem" }}>
                        <input
                          id={`align-zero-${widget.id}`}
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
                                        yAxisMatchMode:
                                          item.options?.yAxisMatchMode === "origin-only"
                                            ? "origin-only"
                                            : "origin-scale",
                                      },
                                    }
                                  : item
                              )
                            );
                          }}
                        />
                        <span className="signal-badge" style={{ borderColor: "#e5e7eb" }}>
                          Match axes Y
                        </span>
                      </label>

                      {getWidgetAlignZero(widget) ? (
                        <div className="size-selector" style={{ marginTop: "0.35rem" }}>
                          <label htmlFor={`mode-y-${widget.id}`}>Mode Y</label>
                          <select
                            id={`mode-y-${widget.id}`}
                            className="mini-select"
                            value={getWidgetYAxisMatchMode(widget) === "origin-only" ? "origin-only" : "origin-scale"}
                            onChange={(event) => {
                              const mode: YAxisMatchMode =
                                event.target.value === "origin-only" ? "origin-only" : "origin-scale";
                              setWidgets((prev) =>
                                prev.map((item) =>
                                  item.id === widget.id
                                    ? {
                                        ...item,
                                        options: {
                                          ...(item.options ?? {}),
                                          alignZero: true,
                                          yAxisMatchMode: mode,
                                        },
                                      }
                                    : item
                                )
                              );
                            }}
                          >
                            <option value="origin-scale">Origine + echelle</option>
                            <option value="origin-only">Origine seulement</option>
                          </select>
                        </div>
                      ) : null}
                    </>
                  ) : null}

                  <p className="menu-help">Taille du graphe</p>
                  <div className="size-selector">
                    <label htmlFor={`width-${widget.id}`}>Largeur</label>
                    <select
                      id={`width-${widget.id}`}
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
                    <label htmlFor={`height-${widget.id}`}>Hauteur</label>
                    <select
                      id={`height-${widget.id}`}
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
                    <label htmlFor={`row-${widget.id}`}>Ligne</label>
                    <select
                      id={`row-${widget.id}`}
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
                    <label htmlFor={`col-${widget.id}`}>Colonne</label>
                    <select
                      id={`col-${widget.id}`}
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
                <div className="loading-plot loading-plot-overlay">
                  <span className="loading-spinner" aria-hidden="true" />
                  Chargement...
                </div>
              ) : null}

              {loadingById[widget.id] ? null : ((widgetKind === "xy" && (!widget.xSignal || widget.signals.length === 0)) ||
              (widgetKind === "timeseries" && widget.signals.length === 0)) ? (
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
                    style={{ width: "100%", height: "100%", backgroundColor: "transparent" }}
                    onHover={(evt: HoverEvent) => {
                      if (widgetKind === "xy" || xAxisMode !== "distance") {
                        return;
                      }
                      const hoveredX = evt.points?.[0]?.x;
                      if (typeof hoveredX === "number") {
                        setCursorDistance(hoveredX);
                        ConfigManager.set("current-hover-slap", {
                          sLap: hoveredX,
                          timestamp: Date.now(),
                        });
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
