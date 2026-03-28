import { create } from "zustand";

import type { DistanceRange } from "../types";

type TelemetryStore = {
  cursorDistance: number | null;
  xRange: DistanceRange | null;
  selectedSignalsA: string[];
  selectedSignalsB: string[];
  setCursorDistance: (distance: number | null) => void;
  setXRange: (range: DistanceRange | null) => void;
  setSelectedSignalsA: (signals: string[]) => void;
  setSelectedSignalsB: (signals: string[]) => void;
};

export const useTelemetryStore = create<TelemetryStore>((set) => ({
  cursorDistance: null,
  xRange: null,
  selectedSignalsA: [],
  selectedSignalsB: [],
  setCursorDistance: (distance) => set({ cursorDistance: distance }),
  setXRange: (range) => set({ xRange: range }),
  setSelectedSignalsA: (signals) => set({ selectedSignalsA: signals }),
  setSelectedSignalsB: (signals) => set({ selectedSignalsB: signals }),
}));
