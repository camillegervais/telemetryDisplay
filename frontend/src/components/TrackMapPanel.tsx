import { useMemo } from "react";

import { useTelemetryStore } from "../store/telemetryStore";
import type { TrackMapResponse } from "../types";

type TrackMapPanelProps = {
  trackMap: TrackMapResponse | null;
};

function normalize(values: number[], min: number, max: number, outMin: number, outMax: number): number[] {
  const span = max - min || 1;
  return values.map((value) => outMin + ((value - min) / span) * (outMax - outMin));
}

function findMarkerIndex(lapDistance: number[], cursorDistance: number | null): number {
  if (cursorDistance === null || lapDistance.length === 0) {
    return 0;
  }

  let bestIndex = 0;
  let bestDelta = Number.POSITIVE_INFINITY;
  for (let index = 0; index < lapDistance.length; index += 1) {
    const delta = Math.abs(lapDistance[index] - cursorDistance);
    if (delta < bestDelta) {
      bestDelta = delta;
      bestIndex = index;
    }
  }
  return bestIndex;
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

export default function TrackMapPanel({ trackMap }: TrackMapPanelProps) {
  const cursorDistance = useTelemetryStore((state) => state.cursorDistance);

  const mapped = useMemo(() => {
    if (!trackMap || trackMap.x_position.length === 0) {
      return null;
    }

    const width = 460;
    const height = 190;
    const pad = 12;

    const minX = Math.min(...trackMap.x_position);
    const maxX = Math.max(...trackMap.x_position);
    const minY = Math.min(...trackMap.y_position);
    const maxY = Math.max(...trackMap.y_position);

    const xs = normalize(trackMap.x_position, minX, maxX, pad, width - pad);
    const ys = normalize(trackMap.y_position, minY, maxY, height - pad, pad);

    const points = xs.map((x, idx) => `${x},${ys[idx]}`).join(" ");
    const startFinish = computeStartFinishLine(xs, ys, 16);

    const markerIndex = findMarkerIndex(trackMap.lap_distance, cursorDistance);
    return {
      width,
      height,
      points,
      startFinish,
      markerX: xs[markerIndex],
      markerY: ys[markerIndex],
      markerDistance: trackMap.lap_distance[markerIndex],
    };
  }, [cursorDistance, trackMap]);

  return (
    <section className="panel track-map-panel floating-track-map">
      <div className="panel-header">
        <h2>Track</h2>
        <span className="panel-badge">Sync</span>
      </div>
      <div className="track-placeholder">
        {!mapped ? (
          <div className="track-empty">Aucune piste</div>
        ) : (
          <svg viewBox={`0 0 ${mapped.width} ${mapped.height}`} className="track-svg">
            <polyline points={mapped.points} fill="none" stroke="#ffd447" strokeWidth="2.5" />
            {mapped.startFinish ? (
              <line
                x1={mapped.startFinish.x1}
                y1={mapped.startFinish.y1}
                x2={mapped.startFinish.x2}
                y2={mapped.startFinish.y2}
                stroke="#f8fafc"
                strokeWidth="2.2"
              />
            ) : null}
            <circle cx={mapped.markerX} cy={mapped.markerY} r="5" fill="#ff4fd8" />
            <circle
              cx={mapped.markerX}
              cy={mapped.markerY}
              r="10"
              fill="none"
              stroke="rgba(255, 79, 216, 0.45)"
              strokeWidth="2"
            />
            <text x={10} y={18} fill="#e5e7eb" fontSize="12">
              {mapped.markerDistance.toFixed(1)} m
            </text>
          </svg>
        )}
      </div>
    </section>
  );
}
