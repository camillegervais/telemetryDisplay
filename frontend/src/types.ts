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
  /** @deprecated Use cartoKey instead — kept for backward-compat migration */
  mapConfigKey?: string;
  /** Reference to carto-configs[key] (new model) */
  cartoKey?: string;
  /** Channel used to interpolate on X axis (overrides carto's defaultInputChannelX) */
  inputChannelX?: string;
  /** Channel used to interpolate on Y axis (overrides carto's defaultInputChannelY) */
  inputChannelY?: string;
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

// ── New carto system ─────────────────────────────────────────────────────────

/**
 * Standalone breakpoint axis — can be shared across multiple CartoObjects.
 * Stored in ConfigManager under "breakpoint-configs".
 */
export type BreakpointObject = {
  name: string;
  values: number[];
  unit?: string;
  description?: string;
};

/**
 * Carto (lookup table) referencing breakpoint objects by key.
 * Channels are indicative only (for visualisation) — actual channels used
 * for interpolation are declared in the SoftLutOp that references this carto.
 * Stored in ConfigManager under "carto-configs".
 */
export type CartoObject = {
  name: string;
  /** Key in "breakpoint-configs" for the X axis (rows) */
  breakpointKeyX: string;
  /** Key in "breakpoint-configs" for the Y axis (columns) — absent for 1D cartos */
  breakpointKeyY?: string;
  gridData: number[][];
  gainVal: number;
  offsetVal: number;
  interpolation: "floor" | "nearest" | "linear" | "round";
  extrapolation: "clamp" | "linear";
  braking_signal: boolean;
  /** Indicative channel for X axis — used for LUT cell highlight and usage stats only */
  defaultInputChannelX?: string;
  /** Indicative channel for Y axis — used for LUT cell highlight and usage stats only */
  defaultInputChannelY?: string;
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
