/**
 * Lightweight store for LUT highlight state
 * Only used to pass seriesById (heavy data) to MapTuning
 * cursorDistance travels via ConfigManager (cross-tab)
 */

import { create } from "zustand";

interface SignalSeries {
  lapDistance: number[];
  lapTime?: number[];
  signals: Record<string, number[]>;
}

interface LutHighlightState {
  // Heavy data (local only)
  cursorDistance: number | null;
  seriesById: Record<number, SignalSeries | null>;

  // Actions
  setCursorDistance: (distance: number | null) => void;
  setSeriesById: (series: Record<number, SignalSeries | null>) => void;
}

export const useLutHighlightStore = create<LutHighlightState>((set) => ({
  cursorDistance: null,
  seriesById: {},

  setCursorDistance: (distance) => {
    console.log("🔵 Zustand: setCursorDistance", distance);
    set({ cursorDistance: distance });
  },

  setSeriesById: (series) => {
    console.log("🔵 Zustand: setSeriesById", Object.keys(series).length, "series");
    set({ seriesById: series });
  },
}));
