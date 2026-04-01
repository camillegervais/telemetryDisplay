import { create } from "zustand";

import type { DistanceRange } from "../types";

export type XAxisMode = "distance" | "time";

type TelemetryStore = {
  cursorDistance: number | null;
  xRange: DistanceRange | null;
  homeRevision: number;
  xAxisMode: XAxisMode;
  startFinishOffsetM: number;
  selectedSignalsA: string[];
  selectedSignalsB: string[];
  setCursorDistance: (distance: number | null) => void;
  setXRange: (range: DistanceRange | null) => void;
  triggerHomeReset: () => void;
  setXAxisMode: (mode: XAxisMode) => void;
  setStartFinishOffsetM: (offsetM: number) => void;
  setSelectedSignalsA: (signals: string[]) => void;
  setSelectedSignalsB: (signals: string[]) => void;
};

export const useTelemetryStore = create<TelemetryStore>((set) => ({
  cursorDistance: null,
  xRange: null,
  homeRevision: 0,
  xAxisMode: "distance",
  startFinishOffsetM: 0,
  selectedSignalsA: [],
  selectedSignalsB: [],
  setCursorDistance: (distance) => set({ cursorDistance: distance }),
  setXRange: (range) => set({ xRange: range }),
  triggerHomeReset: () => set((state) => ({ homeRevision: state.homeRevision + 1 })),
  setXAxisMode: (mode) => set({ xAxisMode: mode }),
  setStartFinishOffsetM: (offsetM) => set({ startFinishOffsetM: Number.isFinite(offsetM) ? offsetM : 0 }),
  setSelectedSignalsA: (signals) => set({ selectedSignalsA: signals }),
  setSelectedSignalsB: (signals) => set({ selectedSignalsB: signals }),
}));
