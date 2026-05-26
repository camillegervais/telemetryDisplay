import type {
  AppInfo,
  DatasetImportResponse,
  DatasetMetadata,
  DatasetQueryResponse,
  TrackMapResponse,
  MapTuningSaveRequest,
  MapTuningSaveResponse,
  MapTuningCalculateRequest,
  MapTuningCalculateResponse,
  RecentImportsResponse,
} from "./types";

export type ComputeMathChannelRequest = {
  datasetId: string;
  output_name: string;
  expression: string;
  dependencies: string[];
};

export type ComputeMathChannelResponse = {
  message: string;
  samplesProcessed: number;
};

const API_BASE_URL = "http://localhost:8001/api";

export async function fetchAppInfo(): Promise<AppInfo> {
  const response = await fetch(`${API_BASE_URL}/app-info`);
  if (!response.ok) {
    throw new Error("Failed to load application info");
  }

  return (await response.json()) as AppInfo;
}

export async function importDataset(file: File): Promise<DatasetImportResponse> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${API_BASE_URL}/datasets/import`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({ detail: "Import failed" }));
    throw new Error(payload.detail ?? "Import failed");
  }

  return (await response.json()) as DatasetImportResponse;
}

export async function importDatasetFromPath(matPath: string): Promise<DatasetImportResponse> {
  const response = await fetch(`${API_BASE_URL}/datasets/import-from-path`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ mat_path: matPath }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({ detail: "Import failed" }));
    throw new Error(payload.detail ?? "Import failed");
  }

  return (await response.json()) as DatasetImportResponse;
}

export async function fetchDatasetMetadata(datasetId: string): Promise<DatasetMetadata> {
  const response = await fetch(`${API_BASE_URL}/datasets/${datasetId}/metadata`);
  if (!response.ok) {
    throw new Error("Failed to load dataset metadata");
  }

  return (await response.json()) as DatasetMetadata;
}

type QueryParams = {
  datasetId: string;
  signals: string[];
  startDistance: number;
  endDistance: number;
  maxPoints?: number;
  signal?: AbortSignal;
};

export async function queryDataset({
  datasetId,
  signals,
  startDistance,
  endDistance,
  maxPoints = 900,
  signal,
}: QueryParams): Promise<DatasetQueryResponse> {
  const response = await fetch(`${API_BASE_URL}/datasets/${datasetId}/query`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    signal,
    body: JSON.stringify({
      signals,
      start_distance: startDistance,
      end_distance: endDistance,
      max_points: maxPoints,
    }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({ detail: "Query failed" }));
    throw new Error(payload.detail ?? "Query failed");
  }

  return (await response.json()) as DatasetQueryResponse;
}

export async function fetchTrackMap(datasetId: string): Promise<TrackMapResponse> {
  const response = await fetch(`${API_BASE_URL}/datasets/${datasetId}/trackmap`);
  if (!response.ok) {
    throw new Error("Failed to load track map");
  }

  return (await response.json()) as TrackMapResponse;
}

export async function saveMapTuning(request: MapTuningSaveRequest): Promise<MapTuningSaveResponse> {
  console.log(request);
  const response = await fetch(`${API_BASE_URL}/map-tuning/save`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({ detail: "Save failed" }));
    throw new Error(payload.detail ?? "Save failed");
  }

  return (await response.json()) as MapTuningSaveResponse;
}

export async function calculateMapTuning(request: MapTuningCalculateRequest): Promise<MapTuningCalculateResponse> {
  console.log('Computation from api.ts');
  const response = await fetch(`${API_BASE_URL}/datasets/calculate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({ detail: "Calculate failed" }));
    throw new Error(payload.detail ?? "Calculate failed");
  }

  return (await response.json()) as MapTuningCalculateResponse;
}

export async function getSavedMapConfigs(): Promise<{ configs: string[]; count: number }> {
  const response = await fetch(`${API_BASE_URL}/map-tuning/configs`);

  if (!response.ok) {
    throw new Error("Failed to fetch saved configurations");
  }

  return (await response.json()) as { configs: string[]; count: number };
}

export async function loadMapConfig(configKey: string): Promise<unknown> {
  const response = await fetch(`${API_BASE_URL}/map-tuning/configs/${configKey}`);

  if (!response.ok) {
    throw new Error("Failed to load configuration");
  }

  return (await response.json()) as unknown;
}

export async function computeMathChannel(
  request: ComputeMathChannelRequest
): Promise<ComputeMathChannelResponse> {
  const { datasetId, ...body } = request;
  const response = await fetch(`${API_BASE_URL}/datasets/${datasetId}/compute-math`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({ detail: "Compute math failed" }));
    throw new Error(payload.detail ?? "Compute math failed");
  }

  return (await response.json()) as ComputeMathChannelResponse;
}

// ---------------------------------------------------------------------------
// TelData COM import
// ---------------------------------------------------------------------------

export type TelDataRunInfo = {
  id: number;
  label: string;
  level: number;
  lap_count: number;
};

export type TelDataLapInfo = {
  id: number;
  label: string;
  driver_name: string;
  lap_time_ms: number | null;
};

export type TelDataOpenResponse = {
  session_id: string;
  runs: TelDataRunInfo[];
};

export type TelDataLapsResponse = {
  laps: TelDataLapInfo[];
};

export type TelDataExportResponse = {
  mat_path: string;
};

export type TelDataChannelsResponse = {
  channels: string[];
};

export async function getTelDataChannels(sessionId: string, runId: number, lapId: number, vchPath?: string): Promise<TelDataChannelsResponse> {
  const response = await fetch(`${API_BASE_URL}/teldata/${sessionId}/channels`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ run_id: runId, lap_id: lapId, ...(vchPath && { vch_path: vchPath }) }),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({ detail: "Failed to get channels" }));
    throw new Error(payload.detail ?? "Failed to get channels");
  }
  return (await response.json()) as TelDataChannelsResponse;
}

export async function openTelDataSession(archivePath: string): Promise<TelDataOpenResponse> {
  const response = await fetch(`${API_BASE_URL}/teldata/open`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ archive_path: archivePath }),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({ detail: "Failed to open archive" }));
    throw new Error(payload.detail ?? "Failed to open archive");
  }
  return (await response.json()) as TelDataOpenResponse;
}

export async function getTelDataLaps(sessionId: string, runId: number): Promise<TelDataLapsResponse> {
  const response = await fetch(`${API_BASE_URL}/teldata/${sessionId}/laps`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ run_id: runId }),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({ detail: "Failed to get laps" }));
    throw new Error(payload.detail ?? "Failed to get laps");
  }
  return (await response.json()) as TelDataLapsResponse;
}

export async function exportTelData(
  sessionId: string,
  runId: number,
  lapId: number,
  channels: string[],
  targetFrequencyHz: number,
  vchPath?: string,
): Promise<TelDataExportResponse> {
  const response = await fetch(`${API_BASE_URL}/teldata/${sessionId}/export`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      run_id: runId,
      lap_id: lapId,
      channels,
      target_frequency_hz: targetFrequencyHz,
      ...(vchPath && { vch_path: vchPath }),
    }),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({ detail: "Export failed" }));
    throw new Error(payload.detail ?? "Export failed");
  }
  return (await response.json()) as TelDataExportResponse;
}

export async function closeTelDataSession(sessionId: string): Promise<void> {
  await fetch(`${API_BASE_URL}/teldata/${sessionId}`, { method: "DELETE" });
}

export async function fetchRecentImports(limit = 10): Promise<RecentImportsResponse> {
  const response = await fetch(`${API_BASE_URL}/datasets/recent-imports?limit=${limit}`);
  if (!response.ok) {
    throw new Error("Failed to fetch recent imports");
  }
  return (await response.json()) as RecentImportsResponse;
}

export async function deleteRecentImport(importId: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/datasets/recent-imports/${encodeURIComponent(importId)}`, {
    method: "DELETE",
  });
  if (!response.ok && response.status !== 404) {
    throw new Error("Failed to delete import");
  }
}