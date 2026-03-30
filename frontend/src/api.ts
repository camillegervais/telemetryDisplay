import type {
  AppInfo,
  DatasetImportResponse,
  DatasetMetadata,
  DatasetQueryResponse,
  TrackMapResponse,
} from "./types";

const API_BASE_URL = "http://localhost:8000/api";

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
