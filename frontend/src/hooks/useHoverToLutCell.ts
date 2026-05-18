/**
 * useHoverToLutCell
 *
 * Listens to the sLap exported by SignalWorkspace on graph hover (via ConfigManager),
 * queries the backend for the LUT input channel values at that position,
 * and returns CellHighlightInfo describing which cell(s) to highlight in MapTuning.
 *
 * Debounced at 100ms to avoid hammering the API during fast cursor movements.
 */

import { useEffect, useRef, useState } from "react";
import { queryDataset } from "../api";
import { ConfigManager } from "../store/ConfigManager";
import type { CellHighlightInfo, HoverSLap } from "../types/ConfigTypes";
import { findCellIndices } from "../utils/mapTuningHelpers";

interface UseHoverToLutCellParams {
  datasetId: string | null | undefined;
  inputChannelX: string;
  inputChannelY: string;
  rowHeaders: number[];
  colHeaders: number[];
}

const DEBOUNCE_MS = 100;

export function useHoverToLutCell({
  datasetId,
  inputChannelX,
  inputChannelY,
  rowHeaders,
  colHeaders,
}: UseHoverToLutCellParams): CellHighlightInfo | null {
  const [highlightInfo, setHighlightInfo] = useState<CellHighlightInfo | null>(null);

  // Stable refs for values used inside async callbacks
  const datasetIdRef = useRef(datasetId);
  const inputChannelXRef = useRef(inputChannelX);
  const inputChannelYRef = useRef(inputChannelY);
  const rowHeadersRef = useRef(rowHeaders);
  const colHeadersRef = useRef(colHeaders);

  useEffect(() => { datasetIdRef.current = datasetId; }, [datasetId]);
  useEffect(() => { inputChannelXRef.current = inputChannelX; }, [inputChannelX]);
  useEffect(() => { inputChannelYRef.current = inputChannelY; }, [inputChannelY]);
  useEffect(() => { rowHeadersRef.current = rowHeaders; }, [rowHeaders]);
  useEffect(() => { colHeadersRef.current = colHeaders; }, [colHeaders]);

  useEffect(() => {
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let abortController: AbortController | null = null;

    const handleSLapChange = (hoverData: HoverSLap | null) => {
      // Cancel pending debounce + in-flight request
      if (debounceTimer !== null) clearTimeout(debounceTimer);
      if (abortController !== null) abortController.abort();

      if (hoverData === null) {
        setHighlightInfo(null);
        return;
      }

      debounceTimer = setTimeout(async () => {
        const dId = datasetIdRef.current;
        const chanX = inputChannelXRef.current;
        const chanY = inputChannelYRef.current;

        if (!dId || !chanX || !chanY) return;

        const { sLap } = hoverData;
        const window = 2; // ±2 m window around the sLap point

        abortController = new AbortController();
        try {
          const result = await queryDataset({
            datasetId: dId,
            signals: [chanX, chanY],
            startDistance: sLap - window,
            endDistance: sLap + window,
            maxPoints: 10,
            signal: abortController.signal,
          });

          const lapDist = result.lap_distance;
          if (lapDist.length === 0) return;

          // Find the index closest to the requested sLap
          let closestIdx = 0;
          let minDist = Math.abs(lapDist[0] - sLap);
          for (let i = 1; i < lapDist.length; i++) {
            const d = Math.abs(lapDist[i] - sLap);
            if (d < minDist) {
              minDist = d;
              closestIdx = i;
            }
          }

          const valX = result.signals[chanX]?.[closestIdx];
          const valY = result.signals[chanY]?.[closestIdx];

          if (valX === undefined || valY === undefined) return;

          const info = findCellIndices(
            valX,
            valY,
            rowHeadersRef.current,
            colHeadersRef.current
          );
          setHighlightInfo(info);
        } catch {
          // AbortError is expected when a newer hover comes in; ignore silently
        }
      }, DEBOUNCE_MS);
    };

    // Subscribe to the shared sLap key
    const unsubscribe = ConfigManager.subscribe<HoverSLap | null>(
      "current-hover-slap",
      handleSLapChange
    );

    // Initialise with the current value (e.g. already hovered in another tab)
    const initial = ConfigManager.get<HoverSLap | null>("current-hover-slap") ?? null;
    handleSLapChange(initial);

    return () => {
      unsubscribe();
      if (debounceTimer !== null) clearTimeout(debounceTimer);
      if (abortController !== null) abortController.abort();
    };
  // Only re-run when the dataset changes (channel / header changes handled via refs)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datasetId]);

  return highlightInfo;
}
