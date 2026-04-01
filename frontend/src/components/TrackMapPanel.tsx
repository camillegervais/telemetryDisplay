import { useMemo } from "react";

import { useTelemetryStore } from "../store/telemetryStore";
import type { TrackMapResponse } from "../types";

type TrackMapPanelProps = {
  trackMap: TrackMapResponse | null;
};

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
  return findMarkerIndex(lapDistance, target);
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

export default function TrackMapPanel({ trackMap }: TrackMapPanelProps) {
  const cursorDistance = useTelemetryStore((state) => state.cursorDistance);
  const startFinishOffsetM = useTelemetryStore((state) => state.startFinishOffsetM);

  const mapped = useMemo(() => {
    if (!trackMap || trackMap.x_position.length === 0) {
      return null;
    }

    const width = 460;
    const height = 190;
    const pad = 12;

    const { xs, ys } = mapTrackToViewportEqual(trackMap.x_position, trackMap.y_position, width, height, pad);

    const points = xs.map((x, idx) => `${x},${ys[idx]}`).join(" ");
    const startIndex = startIndexForOffset(trackMap.lap_distance, startFinishOffsetM);
    const startFinish = computeStartFinishLine(xs, ys, 16, startIndex);

    const shiftedCursorDistance = applyOffsetToDistance(trackMap.lap_distance, cursorDistance, startFinishOffsetM);
    const markerIndex = findMarkerIndex(trackMap.lap_distance, shiftedCursorDistance);
    return {
      width,
      height,
      points,
      startFinish,
      markerX: xs[markerIndex],
      markerY: ys[markerIndex],
      markerDistance: trackMap.lap_distance[markerIndex],
    };
  }, [cursorDistance, trackMap, startFinishOffsetM]);

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
