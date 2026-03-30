import { create } from "zustand";

import type { DistanceRange } from "../types";

export type XAxisMode = "distance" | "time";

type TelemetryStore = {
  cursorDistance: number | null;
  xRange: DistanceRange | null;
  homeRevision: number;
  xAxisMode: XAxisMode;
  sampleRateHz: number;
  selectedSignalsA: string[];
  selectedSignalsB: string[];
  setCursorDistance: (distance: number | null) => void;
  setXRange: (range: DistanceRange | null) => void;
  triggerHomeReset: () => void;
  setXAxisMode: (mode: XAxisMode) => void;
  setSampleRateHz: (rateHz: number) => void;
  setSelectedSignalsA: (signals: string[]) => void;
  setSelectedSignalsB: (signals: string[]) => void;
};

export const useTelemetryStore = create<TelemetryStore>((set) => ({
  cursorDistance: null,
  xRange: null,
  homeRevision: 0,
  xAxisMode: "distance",
  sampleRateHz: 100,
  selectedSignalsA: [],
  selectedSignalsB: [],
  setCursorDistance: (distance) => set({ cursorDistance: distance }),
  setXRange: (range) => set({ xRange: range }),
  triggerHomeReset: () => set((state) => ({ homeRevision: state.homeRevision + 1 })),
  setXAxisMode: (mode) => set({ xAxisMode: mode }),
  setSampleRateHz: (rateHz) => set({ sampleRateHz: Math.max(0.1, rateHz) }),
  setSelectedSignalsA: (signals) => set({ selectedSignalsA: signals }),
  setSelectedSignalsB: (signals) => set({ selectedSignalsB: signals }),
}));
