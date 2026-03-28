export type AppInfo = {
  name: string;
  version: string;
  reference_distance_step_m: number;
};

export type DatasetImportResponse = {
  dataset_id: string;
  message: string;
};

export type DatasetMetadata = {
  dataset_id: string;
  source_distance_step_m: number;
  normalized_distance_step_m: number;
  num_samples: number;
  lap_distance_min: number;
  lap_distance_max: number;
  signal_names: string[];
  interpolation_method: string;
  enrichment_factor: number;
};

export type DatasetQueryResponse = {
  lap_distance: number[];
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
  signals: Record<string, number[]>;
  decimationFactor: number;
};

export type DistanceRange = {
  start: number;
  end: number;
};
