import { create } from "zustand";

import type { DistanceRange } from "../types";

type TelemetryStore = {
  cursorDistance: number | null;
  xRange: DistanceRange | null;
  homeRevision: number;
  selectedSignalsA: string[];
  selectedSignalsB: string[];
  setCursorDistance: (distance: number | null) => void;
  setXRange: (range: DistanceRange | null) => void;
  triggerHomeReset: () => void;
  setSelectedSignalsA: (signals: string[]) => void;
  setSelectedSignalsB: (signals: string[]) => void;
};

export const useTelemetryStore = create<TelemetryStore>((set) => ({
  cursorDistance: null,
  xRange: null,
  homeRevision: 0,
  selectedSignalsA: [],
  selectedSignalsB: [],
  setCursorDistance: (distance) => set({ cursorDistance: distance }),
  setXRange: (range) => set({ xRange: range }),
  triggerHomeReset: () => set((state) => ({ homeRevision: state.homeRevision + 1 })),
  setSelectedSignalsA: (signals) => set({ selectedSignalsA: signals }),
  setSelectedSignalsB: (signals) => set({ selectedSignalsB: signals }),
}));
