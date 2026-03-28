import type { AppInfo } from "./types";

const API_BASE_URL = "http://localhost:8000/api";

export async function fetchAppInfo(): Promise<AppInfo> {
  const response = await fetch(`${API_BASE_URL}/app-info`);
  if (!response.ok) {
    throw new Error("Failed to load application info");
  }

  return (await response.json()) as AppInfo;
}
