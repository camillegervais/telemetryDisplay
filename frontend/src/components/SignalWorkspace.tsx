import type { ChangeEvent } from "react";
import { useEffect, useMemo, useState } from "react";
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
};

type HoverEvent = {
  points?: Array<{ x?: unknown }>;
};

const COLORS = ["#00d4ff", "#ff4fd8", "#ffd447", "#34d399", "#ff7f50", "#8b5cf6"];

function createWidget(id: number, title: string, row: number, col: number): GraphWidget {
  return {
    id,
    title,
    signals: [],
    menuOpen: false,
    row,
    col,
  };
}

function isTrackCell(row: number, col: number, rows: number, cols: number): boolean {
  return row === rows && col === cols;
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
        paper_bgcolor: "#0b111b",
        plot_bgcolor: "#121a28",
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
    hovertemplate: `${signal}<br>%{x:.1f} m<br>%{y:.3f}<extra></extra>`,
  }));

  const layout: Record<string, unknown> = {
    title: graphOnlyMode ? undefined : title,
    paper_bgcolor: "#0b111b",
    plot_bgcolor: "#121a28",
    font: { color: "#e5e7eb" },
    margin: graphOnlyMode ? { l: 26, r: 26, t: 8, b: 22 } : { l: 36, r: 36, t: 30, b: 28 },
    xaxis: {
      title: graphOnlyMode ? undefined : "Distance (m)",
      gridcolor: "rgba(70, 83, 104, 0.25)",
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
      gridcolor: "rgba(70, 83, 104, 0.25)",
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

function selectedValues(event: ChangeEvent<HTMLSelectElement>): string[] {
  return Array.from(event.currentTarget.selectedOptions).map((option) => option.value);
}

function firstFreeCell(
  widgets: GraphWidget[],
  rows: number,
  cols: number,
  avoidTrackCell: boolean
): { row: number; col: number } {
  for (let row = 1; row <= rows; row += 1) {
    for (let col = 1; col <= cols; col += 1) {
      if (avoidTrackCell && isTrackCell(row, col, rows, cols)) {
        continue;
      }
      const occupied = widgets.some((widget) => widget.row === row && widget.col === col);
      if (!occupied) {
        return { row, col };
      }
    }
  }
  return { row: 1, col: 1 };
}

function fitWidgetsToGrid(widgets: GraphWidget[], rows: number, cols: number): GraphWidget[] {
  const fitted: GraphWidget[] = [];

  widgets.forEach((widget) => {
    let nextRow = Math.min(Math.max(widget.row, 1), rows);
    let nextCol = Math.min(Math.max(widget.col, 1), cols);

    if (isTrackCell(nextRow, nextCol, rows, cols) || fitted.some((w) => w.row === nextRow && w.col === nextCol)) {
      const free = firstFreeCell(fitted, rows, cols, true);
      nextRow = free.row;
      nextCol = free.col;
    }

    fitted.push({ ...widget, row: nextRow, col: nextCol });
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

  const [gridCols, setGridCols] = useState(2);
  const [gridRows, setGridRows] = useState(2);
  const [nextId, setNextId] = useState(3);
  const [widgets, setWidgets] = useState<GraphWidget[]>([
    createWidget(1, "G1", 1, 1),
    createWidget(2, "G2", 1, 2),
  ]);
  const [dragFromId, setDragFromId] = useState<number | null>(null);
  const [seriesById, setSeriesById] = useState<Record<number, SignalSeries | null>>({});
  const [loadingById, setLoadingById] = useState<Record<number, boolean>>({});

  const availableSignals = datasetMetadata?.signal_names ?? [];
  const canQuery = datasetId !== null && datasetMetadata !== null;

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

    activeWidgets.forEach((widget) => {
      setLoadingById((prev) => ({ ...prev, [widget.id]: true }));

      queryDataset({
        datasetId,
        signals: widget.signals,
        startDistance: start,
        endDistance: end,
        maxPoints: 1200,
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
        .finally(() => {
          if (!alive) {
            return;
          }
          setLoadingById((prev) => ({ ...prev, [widget.id]: false }));
        });
    });

    return () => {
      alive = false;
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

    const idx = nearestIndex(trackMap.lap_distance, cursorDistance);
    return {
      width,
      height,
      points: xs.map((x, i) => `${x},${ys[i]}`).join(" "),
      markerX: xs[idx],
      markerY: ys[idx],
      markerDistance: trackMap.lap_distance[idx],
    };
  }, [cursorDistance, trackMap]);

  function addWidget() {
    const id = nextId;
    setNextId((prev) => prev + 1);

    setWidgets((prev) => {
      const free = firstFreeCell(prev, gridRows, gridCols, true);
      return [...prev, createWidget(id, `G${id}`, free.row, free.col)];
    });
  }

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

  return (
    <section className={`panel signal-workspace ${graphOnlyMode ? "signal-workspace-max" : ""}`}>
      <div className={`panel-header panel-header-tight ${graphOnlyMode ? "panel-header-hidden" : ""}`}>
        <h2>Dashboard</h2>
        <div className="dashboard-tools">
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

      <div className="graph-grid" style={gridStyle}>
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
              className={`graph-tile ${dragFromId === widget.id ? "graph-tile-dragging" : ""}`}
              style={{
                gridColumn: widget.col,
                gridRow: widget.row,
              }}
              draggable
              onDragStart={() => setDragFromId(widget.id)}
              onDragEnd={() => setDragFromId(null)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                if (dragFromId !== null) {
                  swapWidgetPositions(dragFromId, widget.id);
                }
                setDragFromId(null);
              }}
            >
              <div className="graph-corner-actions">
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
              </div>

              {widget.menuOpen ? (
                <div className="graph-menu">
                  <label className="field-label" htmlFor={`signals-${widget.id}`}>
                    Signaux
                  </label>
                  <select
                    id={`signals-${widget.id}`}
                    className="signal-select"
                    multiple
                    value={widget.signals}
                    onChange={(event) => {
                      const values = selectedValues(event);
                      setWidgets((prev) =>
                        prev.map((item) =>
                          item.id === widget.id ? { ...item, signals: values } : item
                        )
                      );
                    }}
                  >
                    {availableSignals.map((signal) => (
                      <option key={`${widget.id}-${signal}`} value={signal}>
                        {signal}
                      </option>
                    ))}
                  </select>

                  <p className="menu-help">Déplacez les graphes en glissant la tuile.</p>
                </div>
              ) : null}

              {loadingById[widget.id] ? <div className="loading-plot">Chargement...</div> : null}

              <Plot
                data={chart.data}
                layout={chart.layout}
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
            </article>
          );
        })}

        <article className="graph-tile graph-tile-track" style={{ gridColumn: gridCols, gridRow: gridRows }}>
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
