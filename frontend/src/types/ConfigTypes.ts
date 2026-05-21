/**
 * Configuration Types - All persisted application configurations
 *
 * This module defines the schema for all configuration types managed by ConfigManager.
 * Each type represents a specific aspect of the application state that should be persisted to localStorage.
 */

import type { MathChannel, MapTuningData, SoftBlock } from "../types";

/**
 * Graph widget in a workspace tab
 */
export type GraphWidget = {
  id: number;
  title: string;
  kind?: "timeseries" | "xy";
  signals: string[];
  xSignal?: string | null;
  options?: WidgetOptions;
  // Legacy field kept for backward compatibility
  alignZero?: boolean;
  menuOpen: boolean;
  row: number;
  col: number;
  widthSpan: number;
  heightSpan: number;
};

/**
 * Widget display options
 */
export type WidgetOptions = {
  alignZero?: boolean;
  yAxisMatchMode?: "origin-scale" | "origin-only";
  hidePositive?: boolean;
  hideNegative?: boolean;
  filterByBraking?: boolean;
  yAxisMin?: number;
  yAxisMax?: number;
  [key: string]: unknown;
};

/**
 * A tab within a workspace (contains widgets in a grid)
 */
export type WorkspaceTab = {
  id: string;
  name: string;
  gridCols: number;
  gridRows: number;
  nextId: number;
  widgets: GraphWidget[];
};

/**
 * Saved workspace configuration (named layout with tabs and widgets)
 */
export type SavedWorkspaceConfig = {
  id: string;
  name: string;
  tabs: WorkspaceTab[];
  activeTabId: string;
  mapTuning: MapTuningData;
};

/**
 * Current workspace session state (active tab, widget positions)
 */
export type WorkspaceSessionSnapshot = {
  tabs: WorkspaceTab[];
  activeTabId: string;
  currentConfigId: string | null;
  selectedConfigId: string;
};

/**
 * Info on highlighted cell(s) in the 2D LUT map
 * Populated by useHoverToLutCell when user hovers on a graph
 */
export type CellHighlightInfo = {
  /** Exact matching cell (if the hover point falls exactly on breakpoints) */
  exact: { row: number; col: number } | null;
  /** Nearest surrounding cells when there is no exact match (up to 4 corners) */
  nearest: Array<{ row: number; col: number }> | null;
};

/**
 * Hover-sLap export from SignalWorkspace to sync with MapTuning
 */
export type HoverSLap = {
  sLap: number;
  timestamp: number;
};

/**
 * User preferences
 */
export type UserPreferences = {
  displayName: string;
};

/**
 * All configuration types unified under one structure
 * Keys correspond to localStorage keys (e.g., "telemetry-display.config.layouts")
 */
export type ConfigStorage = {
  "layouts": SavedWorkspaceConfig[];
  "session": WorkspaceSessionSnapshot | null;
  "math-channels": MathChannel[];
  "map-configs": Record<string, MapTuningData>;
  "current-map-config": string | null;
  "user-preferences": UserPreferences;
  "dataset-id": string | null;
  /** sLap exported by SignalWorkspace on graph hover */
  "current-hover-slap": HoverSLap | null;
  /** Highlighted LUT cell(s) computed by useHoverToLutCell */
  "highlight-lut": CellHighlightInfo | null;
  /** Soft computation blocks (ordered operation pipelines) */
  "soft-blocks": SoftBlock[];
};

/**
 * Default/empty values for each configuration type
 */
export const CONFIG_DEFAULTS: ConfigStorage = {
  layouts: [],
  session: null,
  "math-channels": [],
  "map-configs": {},
  "current-map-config": null,
  "user-preferences": {
    displayName: "",
  },
  "dataset-id": null,
  "current-hover-slap": null,
  "highlight-lut": null,
  "soft-blocks": [],
};

/**
 * Type guard to check if a key is a valid config key
 */
export function isValidConfigKey(key: unknown): key is keyof ConfigStorage {
  return typeof key === "string" && key in CONFIG_DEFAULTS;
}

/**
 * Extract nested value from config using dot notation
 * @example get("layouts.0.name") gets layouts[0].name
 */
export function getNestedValue<T>(obj: unknown, path: string): T | undefined {
  const parts = path.split(".");
  let current: unknown = obj;

  for (const part of parts) {
    if (!current || typeof current !== "object") {
      return undefined;
    }

    // Handle array indices
    if (!isNaN(Number(part))) {
      const index = Number(part);
      if (Array.isArray(current) && index < current.length) {
        current = current[index];
      } else {
        return undefined;
      }
    } else {
      current = (current as Record<string, unknown>)[part];
    }
  }

  return current as T | undefined;
}

/**
 * Set nested value in config using dot notation
 * Returns a new object with the value set (immutable)
 * @example set({...}, "layouts.0.name", "New Layout") returns new object
 */
export function setNestedValue<T extends Record<string, unknown>>(obj: T, path: string, value: unknown): T {
  const parts = path.split(".");
  if (parts.length === 0) return obj;

  const result = JSON.parse(JSON.stringify(obj)) as T;
  let current: unknown = result;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];

    if (!isNaN(Number(part))) {
      const index = Number(part);
      if (Array.isArray(current)) {
        if (index >= current.length) {
          throw new Error(`Array index out of bounds: ${index}`);
        }
        current = current[index];
      } else {
        throw new Error(`Cannot access index on non-array`);
      }
    } else {
      if (!current || typeof current !== "object") {
        current = {};
      }
      if (!(part in (current as Record<string, unknown>))) {
        (current as Record<string, unknown>)[part] = {};
      }
      current = (current as Record<string, unknown>)[part];
    }
  }

  const lastPart = parts[parts.length - 1];
  if (!isNaN(Number(lastPart))) {
    const index = Number(lastPart);
    if (Array.isArray(current)) {
      current[index] = value;
    }
  } else {
    if (current && typeof current === "object") {
      (current as Record<string, unknown>)[lastPart] = value;
    }
  }

  return result;
}

/**
 * Import mode options for partial imports
 */
export type ImportMode = "replace" | "add";

/**
 * Selection state for each import category
 */
export type ImportSelection = {
  layouts?: {
    enabled: boolean;
    mode: ImportMode;
    selectedIds?: string[];
  };
  mathChannels?: {
    enabled: boolean;
    mode: ImportMode;
  };
  mapConfigs?: {
    enabled: boolean;
    mode: ImportMode;
    selectedKeys?: string[];
  };
  softBlocks?: {
    enabled: boolean;
    mode: ImportMode;
    selectedIds?: string[];
  };
};

/**
 * Parsed TOML data with metadata for import preview
 */
export type ParsedTomlData = {
  layouts: {
    items: SavedWorkspaceConfig[];
    count: number;
  };
  mathChannels: {
    items: MathChannel[];
    count: number;
  };
  mapConfigs: {
    items: Record<string, MapTuningData>;
    keys: string[];
    count: number;
  };
  softBlocks: {
    items: SoftBlock[];
    count: number;
  };
  meta?: {
    version: string;
    exportDate: string;
  };
};
