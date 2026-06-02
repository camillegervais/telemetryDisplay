import { useEffect, useState } from "react";
import { queryDataset } from "../api";

/**
 * Statistics for a single 1D map cell
 */
export interface CellUsageStats {
  cellIndex: number;
  breakpointValue: number;
  usageCount: number;
  usagePercentage: number;
}

/**
 * Hook to calculate 1D map cell usage statistics based on input channel data
 * within a specified sLap range.
 */
export function use1DMapUsageStats({
  datasetId,
  inputChannel,
  breakpoints,
  minSLap,
  maxSLap,
  enabled = true,
}: {
  datasetId: string | null;
  inputChannel: string;
  breakpoints: number[];
  minSLap: number;
  maxSLap: number;
  enabled?: boolean;
}) {
  const [stats, setStats] = useState<CellUsageStats[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !datasetId || !inputChannel || breakpoints.length === 0) {
      setStats(null);
      setError(null);
      return;
    }

    let alive = true;
    const controller = new AbortController();

    (async () => {
      try {
        setLoading(true);
        setError(null);

        // Query the input channel data for the specified sLap range
        const response = await queryDataset({
          datasetId,
          signals: [inputChannel],
          startDistance: minSLap,
          endDistance: maxSLap,
          maxPoints: 5000,
          signal: controller.signal,
        });

        if (!alive) return;

        const inputValues = response.signals[inputChannel] ?? [];

        if (inputValues.length === 0) {
          setStats([]);
          return;
        }

        // Count occurrences of each breakpoint range
        const usageCounts = new Array(breakpoints.length).fill(0);
        
        inputValues.forEach((value) => {
          // Find which cell this value falls into
          // Breakpoints define the lower bounds of each cell
          // Cell 0: [breakpoints[0], breakpoints[1])
          // Cell 1: [breakpoints[1], breakpoints[2])
          // ...
          // Cell n-1: [breakpoints[n-1], inf)
          
          let cellIndex = -1;
          for (let i = breakpoints.length - 1; i >= 0; i--) {
            if (value >= breakpoints[i]) {
              cellIndex = i;
              break;
            }
          }
          
          // If value is below all breakpoints, assign to cell 0
          if (cellIndex === -1) {
            cellIndex = 0;
          }
          
          usageCounts[cellIndex]++;
        });

        // Convert counts to percentages and create stats
        const totalSamples = inputValues.length;
        const cellStats: CellUsageStats[] = breakpoints.map((bp, idx) => ({
          cellIndex: idx,
          breakpointValue: bp,
          usageCount: usageCounts[idx],
          usagePercentage:
            totalSamples > 0 ? (usageCounts[idx] / totalSamples) * 100 : 0,
        }));

        if (alive) {
          setStats(cellStats);
        }
      } catch (err) {
        if (!alive || (err instanceof Error && err.name === "AbortError")) {
          return;
        }
        const errorMsg =
          err instanceof Error ? err.message : "Failed to calculate usage stats";
        if (alive) {
          setError(errorMsg);
        }
      } finally {
        if (alive) {
          setLoading(false);
        }
      }
    })();

    return () => {
      alive = false;
      controller.abort();
    };
  }, [
    datasetId,
    inputChannel,
    breakpoints.join(","), // Convert to string for dependency comparison
    minSLap,
    maxSLap,
    enabled,
  ]);

  return { stats, loading, error };
}
