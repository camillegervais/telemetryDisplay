export type AppInfo = {
  name: string;
  version: string;
  reference_distance_step_m: number;
};

export type DatasetImportResponse = {
  dataset_id: string;
  message: string;
};

export type SignalMetadata = {
  name: string;
  display_signal: boolean;
  category_signal: string;
};

export type DatasetMetadata = {
  dataset_id: string;
  source_path: string;
  source_distance_step_m: number;
  normalized_distance_step_m: number;
  num_samples: number;
  lap_distance_min: number;
  lap_distance_max: number;
  signal_names: string[];
  signal_metadata: SignalMetadata[];
  source_sample_rate_hz: number | null;
  has_time_axis: boolean;
  interpolation_method: string;
  enrichment_factor: number;
};

export type DatasetQueryResponse = {
  lap_distance: number[];
  lap_time: number[] | null;
  signals: Record<string, number[]>;
  decimation_factor: number;
};

export type TrackMapResponse = {
  lap_distance: number[];
  x_position: number[];
  y_position: number[];
};

export type SignalSeries = {
  lapDistance: number[];
  lapTime: number[] | null;
  signals: Record<string, number[]>;
  decimationFactor: number;
};

export type DistanceRange = {
  start: number;
  end: number;
};

export type MathChannel = {
  name: string;
  expression: string;
  dependencies: string[];
};

// ── Soft Blocks ─────────────────────────────────────────────────────────────

export type SoftMathOp = {
  id: string;
  kind: "math";
  name: string;          // output signal name
  expression: string;
  dependencies: string[]; // parsed from expression
  displaySignal?: boolean;
};

export type SoftLutOp = {
  id: string;
  kind: "lut2d";
  name: string;          // output signal name (overrides map's outputChannelName)
  mapConfigKey: string;  // key in ConfigManager "map-configs" Record<string, MapTuningData>
  displaySignal?: boolean;
};

export type SoftOperation = SoftMathOp | SoftLutOp;

export type SoftBlock = {
  id: string;
  name: string;
  enabled: boolean;
  operations: SoftOperation[];
};

export type MapTuningData = {
  inputChannelX: string;
  inputChannelY: string;
  outputChannelName: string;
  gridData: number[][];
  rowHeaders: number[];
  colHeaders: number[];
  braking_signal: boolean;
  gainVal: number;
  offsetVal: number;
  interpolation: "floor" | "nearest" | "linear" | "round";
  extrapolation: "clamp" | "linear";
};

export type MapTuningSaveRequest = {
  datasetId: string;
} & MapTuningData;

export type MapTuningSaveResponse = {
  message: string;
  mapId: string;
};

export type MapTuningCalculateRequest = {
  datasetId: string;
  display_signal?: boolean;
  category_signal?: string;
} & MapTuningData;

export type MapTuningCalculateResponse = {
  message: string;
  samplesProcessed: number;
  outputSignal: number[];
};

// ── Recent Imports ───────────────────────────────────────────────────────────

export type RecentImportItem = {
  import_id: string;
  dataset_id: string | null;
  source_path: string;
  original_path: string | null;
  imported_at: string;
  file_size: number | null;
  signal_count: number | null;
  dataset_name: string | null;
  max_slap: number | null;
  max_tlap: number | null;
};

export type RecentImportsResponse = {
  items: RecentImportItem[];
};
