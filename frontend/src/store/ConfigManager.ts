/**
 * ConfigManager - Centralized configuration storage and state management
 *
 * Singleton class that manages all application configurations:
 * - Persists to localStorage with dot-notation access
 * - Manages Zustand store for runtime state
 * - Provides subscribers pattern for reactive updates
 * - Supports cross-tab synchronization via StorageEvent
 *
 * Usage:
 *   const layouts = ConfigManager.get('layouts');
 *   ConfigManager.set('math-channels', [...]);
 *   const unsubscribe = ConfigManager.subscribe('layouts', (newValue) => {...});
 */

import * as TOML from "smol-toml";

import {
  CONFIG_DEFAULTS,
  type ConfigStorage,
  type ImportSelection,
  type ParsedTomlData,
  getNestedValue,
  isValidConfigKey,
  setNestedValue,
} from "../types/ConfigTypes";
import type { MapTuningData } from "../types";

type SubscriberCallback<T = unknown> = (newValue: T) => void;
type Subscribers = Map<string, Set<SubscriberCallback>>;

const STORAGE_PREFIX = "telemetry-display.config";

/**
 * ConfigManager Singleton - unified configuration management
 */
class ConfigManagerClass {
  private storage: ConfigStorage;
  private subscribers: Subscribers = new Map();
  private storageEventListener: ((e: StorageEvent) => void) | null = null;

  constructor() {
    this.storage = this.loadFromLocalStorage();
    this.setupStorageEventListener();
  }

  /**
   * Load all configurations from localStorage
   */
  private loadFromLocalStorage(): ConfigStorage {
    if (typeof window === "undefined") {
      return CONFIG_DEFAULTS;
    }

    const result: Partial<ConfigStorage> = {};

    for (const key of Object.keys(CONFIG_DEFAULTS) as Array<keyof ConfigStorage>) {
      const storageKey = `${STORAGE_PREFIX}.${key}`;
      try {
        const raw = window.localStorage.getItem(storageKey);
        if (raw) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (result as any)[key] = JSON.parse(raw);
        } else {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (result as any)[key] = CONFIG_DEFAULTS[key];
        }
      } catch (error) {
        console.error(`Failed to load config ${key}:`, error);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (result as any)[key] = CONFIG_DEFAULTS[key];
      }
    }

    return result as ConfigStorage;
  }

  /**
   * Save a specific configuration to localStorage
   */
  private saveToLocalStorage<K extends keyof ConfigStorage>(key: K, value: ConfigStorage[K]): void {
    if (typeof window === "undefined") {
      return;
    }

    try {
      const storageKey = `${STORAGE_PREFIX}.${key}`;
      window.localStorage.setItem(storageKey, JSON.stringify(value));
    } catch (error) {
      console.error(`Failed to save config ${key}:`, error);
    }
  }

  /**
   * Setup listener for cross-tab synchronization
   */
  private setupStorageEventListener(): void {
    if (typeof window === "undefined") {
      return;
    }

    this.storageEventListener = (event: StorageEvent) => {
      // Only process events for our config keys
      if (!event.key || !event.key.startsWith(STORAGE_PREFIX)) {
        return;
      }

      const key = event.key.replace(`${STORAGE_PREFIX}.`, "");
      if (!isValidConfigKey(key)) {
        return;
      }

      try {
        let newValue: unknown;
        if (event.newValue) {
          newValue = JSON.parse(event.newValue);
        } else {
          newValue = CONFIG_DEFAULTS[key as keyof ConfigStorage];
        }

        // Update internal storage
        (this.storage as Record<string, unknown>)[key] = newValue;

        // Notify subscribers
        this.notifySubscribers(key, newValue);
      } catch (error) {
        console.error(`Failed to process storage event for ${key}:`, error);
      }
    };

    window.addEventListener("storage", this.storageEventListener);
  }

  /**
   * Get a configuration value using dot notation
   * @example get('layouts') or get('layouts.0.name')
   */
  public get<T = unknown>(path: string): T | undefined {
    const parts = path.split(".");
    const topLevelKey = parts[0];

    if (!isValidConfigKey(topLevelKey)) {
      console.warn(`Invalid config key: ${topLevelKey}`);
      return undefined;
    }

    if (parts.length === 1) {
      return this.storage[topLevelKey] as T;
    }

    const nestedPath = parts.slice(1).join(".");
    return getNestedValue<T>(this.storage[topLevelKey], nestedPath);
  }

  /**
   * Set a configuration value using dot notation
   * Updates both internal storage and localStorage
   * @example set('layouts', [...]) or set('layouts.0.name', 'New Name')
   */
  public set<T = unknown>(path: string, value: T): void {
    const parts = path.split(".");
    const topLevelKey = parts[0];

    if (!isValidConfigKey(topLevelKey)) {
      throw new Error(`Invalid config key: ${topLevelKey}`);
    }

    if (parts.length === 1) {
      // Setting top-level key
      const storedValue = value as ConfigStorage[typeof topLevelKey];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (this.storage as any)[topLevelKey] = storedValue;
      this.saveToLocalStorage(topLevelKey, storedValue);
      this.notifySubscribers(path, value);
    } else {
      // Setting nested value
      const nestedPath = parts.slice(1).join(".");
      const updated = setNestedValue(
        this.storage[topLevelKey] as Record<string, unknown>,
        nestedPath,
        value
      );
      const storedValue = updated as ConfigStorage[typeof topLevelKey];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (this.storage as any)[topLevelKey] = storedValue;
      this.saveToLocalStorage(topLevelKey, storedValue);
      this.notifySubscribers(path, value);
    }
  }

  /**
   * Subscribe to changes on a configuration value
   * Returns unsubscribe function
   * @example
   *   const unsubscribe = ConfigManager.subscribe('layouts', (newValue) => {
   *     console.log('Layouts changed:', newValue);
   *   });
   *   unsubscribe(); // stop listening
   */
  public subscribe<T = unknown>(path: string, callback: SubscriberCallback<T>): () => void {
    if (!this.subscribers.has(path)) {
      this.subscribers.set(path, new Set());
    }

    this.subscribers.get(path)!.add(callback as SubscriberCallback);

    return () => {
      this.subscribers.get(path)?.delete(callback as SubscriberCallback);
      if (this.subscribers.get(path)?.size === 0) {
        this.subscribers.delete(path);
      }
    };
  }

  /**
   * Subscribe with debounce - prevents double actions on rapid updates
   * Ideal for expensive operations (API calls, recalculations)
   * @param path Config key to watch
   * @param callback Function to call when value changes
   * @param debounceMs Delay before calling callback (default 100ms)
   * @returns Unsubscribe function
   * 
   * @example
   *   ConfigManager.subscribeDebouncedFull(
   *     'math-channels',
   *     (newValue) => recalculateAll(newValue),
   *     200
   *   );
   */
  public subscribeDebouncedFull<T = unknown>(
    path: string,
    callback: (value: T) => void,
    debounceMs: number = 100
  ): () => void {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let lastValue: unknown = this.get(path);

    const wrappedCallback: SubscriberCallback<T> = (newValue: T) => {
      // Skip if value hasn't actually changed
      if (JSON.stringify(newValue) === JSON.stringify(lastValue)) {
        return;
      }
      lastValue = newValue;

      // Clear pending call
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }

      // Schedule new call
      timeoutId = setTimeout(() => {
        callback(newValue);
        timeoutId = null;
      }, debounceMs);
    };

    return this.subscribe(path, wrappedCallback);
  }

  /**
   * Update multiple config values atomically
   * All updates use the same batch, preventing intermediate states
   * @param updates Object with config keys and their new values
   * 
   * @example
   *   ConfigManager.setBatch({
   *     'math-channels': newChannels,
   *     'dataset-id': datasetId
   *   });
   */
  public setBatch(updates: Partial<ConfigStorage>): void {
    // Validate all keys first
    for (const key of Object.keys(updates)) {
      if (!isValidConfigKey(key)) {
        throw new Error(`Invalid config key: ${key}`);
      }
    }

    // Apply all updates
    for (const key of Object.keys(updates) as Array<keyof ConfigStorage>) {
      const value = updates[key];
      if (value !== undefined) {
        const storedValue = value as ConfigStorage[typeof key];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (this.storage as any)[key] = storedValue;
        this.saveToLocalStorage(key, storedValue);
        this.notifySubscribers(key as string, value);
      }
    }
  }

  /**
   * Notify all subscribers for a config path
   */
  private notifySubscribers(path: string, value: unknown): void {
    const callbacks = this.subscribers.get(path);
    if (callbacks) {
      callbacks.forEach((callback) => {
        try {
          callback(value);
        } catch (error) {
          console.error(`Subscriber error for ${path}:`, error);
        }
      });
    }

    // Also notify parent subscribers (e.g., if 'layouts.0' changed, notify 'layouts' subscribers)
    const parts = path.split(".");
    if (parts.length > 1) {
      const parentPath = parts.slice(0, -1).join(".");
      const parentCallbacks = this.subscribers.get(parentPath);
      if (parentCallbacks) {
        const parentValue = this.get(parentPath);
        parentCallbacks.forEach((callback) => {
          try {
            callback(parentValue);
          } catch (error) {
            console.error(`Subscriber error for ${parentPath}:`, error);
          }
        });
      }
    }
  }

  /**
   * Get all configurations as a snapshot
   * Useful for export functionality
   */
  public getAllConfig(): ConfigStorage {
    return JSON.parse(JSON.stringify(this.storage));
  }

  /**
   * Clear all configurations and reset to defaults
   */
  public clear(): void {
    if (typeof window === "undefined") {
      return;
    }

    for (const key of Object.keys(CONFIG_DEFAULTS) as Array<keyof ConfigStorage>) {
      const storageKey = `${STORAGE_PREFIX}.${key}`;
      window.localStorage.removeItem(storageKey);
      const defaultValue = CONFIG_DEFAULTS[key] as ConfigStorage[typeof key];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (this.storage as any)[key] = defaultValue;
      this.notifySubscribers(key as string, defaultValue);
    }
  }

  /**
   * Cleanup event listeners (called on app shutdown if needed)
   */
  public destroy(): void {
    if (this.storageEventListener && typeof window !== "undefined") {
      window.removeEventListener("storage", this.storageEventListener);
    }
  }

  /**
   * Export all configurations to TOML format (excluding dataset-id)
   */
  public exportToToml(): string {
    const exportData: Record<string, unknown> = {
      _meta: {
        version: "1.0",
        exportDate: new Date().toISOString(),
      },
      session: this.storage.session,
      layouts: this.storage.layouts,
      "math-channels": this.storage["math-channels"],
      "map-configs": this.storage["map-configs"],
      "current-map-config": this.storage["current-map-config"],
      "user-preferences": this.storage["user-preferences"],
      "soft-blocks": this.storage["soft-blocks"],
      "signal-colors": this.storage["signal-colors"],
      "teldata-configs": this.storage["teldata-configs"],
    };

    return TOML.stringify(exportData);
  }

  /**
   * Parse TOML for import preview without applying changes
   * Returns structured data with metadata for selective import UI
   */
  public parseTomlForImport(tomlString: string): ParsedTomlData {
    try {
      const parsed = TOML.parse(tomlString) as Record<string, unknown>;

      const layouts = (parsed.layouts as ConfigStorage["layouts"]) || [];
      const mathChannels = (parsed["math-channels"] as ConfigStorage["math-channels"]) || [];
      const mapConfigs = (parsed["map-configs"] as ConfigStorage["map-configs"]) || {};
      const softBlocks = (parsed["soft-blocks"] as ConfigStorage["soft-blocks"]) || [];
      const signalColors = (parsed["signal-colors"] as ConfigStorage["signal-colors"]) || {};
      const telDataConfigs = (parsed["teldata-configs"] as ConfigStorage["teldata-configs"]) || [];
      const meta = parsed._meta as { version?: string; exportDate?: string } | undefined;

      return {
        layouts: {
          items: layouts,
          count: layouts.length,
        },
        mathChannels: {
          items: mathChannels,
          count: mathChannels.length,
        },
        mapConfigs: {
          items: mapConfigs,
          keys: Object.keys(mapConfigs),
          count: Object.keys(mapConfigs).length,
        },
        softBlocks: {
          items: softBlocks,
          count: softBlocks.length,
        },
        signalColors: {
          items: signalColors,
          count: Object.keys(signalColors).length,
        },
        telDataConfigs: {
          items: telDataConfigs,
          count: telDataConfigs.length,
        },
        meta: {
          version: meta?.version || "1.0",
          exportDate: meta?.exportDate || new Date().toISOString(),
        },
      };
    } catch (error) {
      throw new Error(
        `Failed to parse TOML configuration: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Import configurations from TOML with selective options
   * Allows partial imports with merge or replace modes
   */
  public importFromTomlPartial(data: ParsedTomlData, selection: ImportSelection): void {
    try {
      // Helper function to merge arrays by deduplicating on a key
      const mergeArrays = <T extends Record<string, unknown>>(
        existing: T[],
        imported: T[],
        keyField: keyof T = "id" as keyof T
      ): T[] => {
        const existingMap = new Map(existing.map((item) => [item[keyField], item]));
        imported.forEach((item) => {
          existingMap.set(item[keyField], item);
        });
        return Array.from(existingMap.values());
      };

      const updates: Partial<ConfigStorage> = {};

      // Handle layouts
      if (selection.layouts?.enabled) {
        const selectedLayouts = selection.layouts.selectedIds
          ? data.layouts.items.filter((l) => selection.layouts?.selectedIds?.includes(l.id))
          : data.layouts.items;

        if (selection.layouts.mode === "replace") {
          updates.layouts = selectedLayouts;
        } else {
          updates.layouts = mergeArrays(this.storage.layouts, selectedLayouts, "id");
        }
      }

      // Handle math channels
      if (selection.mathChannels?.enabled) {
        if (selection.mathChannels.mode === "replace") {
          updates["math-channels"] = data.mathChannels.items;
        } else {
          updates["math-channels"] = mergeArrays(
            this.storage["math-channels"],
            data.mathChannels.items,
            "name"
          );
        }
      }

      // Handle map configs
      if (selection.mapConfigs?.enabled) {
        const selectedKeys = selection.mapConfigs.selectedKeys && selection.mapConfigs.selectedKeys.length > 0
          ? selection.mapConfigs.selectedKeys
          : data.mapConfigs.keys;
        const selectedConfigs = Object.fromEntries(
          selectedKeys.map((key) => [key, data.mapConfigs.items[key]]).filter(([, v]) => v)
        );

        if (selection.mapConfigs.mode === "replace") {
          updates["map-configs"] = selectedConfigs as Record<string, MapTuningData>;
        } else {
          updates["map-configs"] = {
            ...this.storage["map-configs"],
            ...selectedConfigs,
          };
        }
      }

      // Handle soft blocks
      if (selection.softBlocks?.enabled) {
        const selectedBlocks = selection.softBlocks.selectedIds && selection.softBlocks.selectedIds.length > 0
          ? data.softBlocks.items.filter((block) => selection.softBlocks?.selectedIds?.includes(block.id))
          : data.softBlocks.items;

        if (selection.softBlocks.mode === "replace") {
          updates["soft-blocks"] = selectedBlocks;
        } else {
          updates["soft-blocks"] = mergeArrays(
            this.storage["soft-blocks"],
            selectedBlocks,
            "id"
          );
        }
      }

      // Handle signal colors
      if (selection.signalColors?.enabled) {
        if (selection.signalColors.mode === "replace") {
          updates["signal-colors"] = data.signalColors.items;
        } else {
          updates["signal-colors"] = {
            ...this.storage["signal-colors"],
            ...data.signalColors.items,
          };
        }
      }
      // Handle TelData configs
      if (selection.telDataConfigs?.enabled) {
        const selectedConfigs = selection.telDataConfigs.selectedIds && selection.telDataConfigs.selectedIds.length > 0
          ? data.telDataConfigs.items.filter((c) => selection.telDataConfigs?.selectedIds?.includes(c.id))
          : data.telDataConfigs.items;

        if (selection.telDataConfigs.mode === "replace") {
          updates["teldata-configs"] = selectedConfigs;
        } else {
          updates["teldata-configs"] = mergeArrays(
            this.storage["teldata-configs"],
            selectedConfigs,
            "id"
          );
        }
      }

      // Apply all updates
      for (const [key, value] of Object.entries(updates)) {
        if (value !== undefined) {
          const storageKey = key as keyof ConfigStorage;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (this.storage as any)[storageKey] = value;
          this.saveToLocalStorage(storageKey, value as ConfigStorage[typeof storageKey]);
          this.notifySubscribers(key, value);
        }
      }
    } catch (error) {
      throw new Error(
        `Failed to import TOML configuration: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Import configurations from TOML format (replaces all existing configs)
   */
  public importFromToml(tomlString: string): void {
    try {
      const parsed = TOML.parse(tomlString) as Record<string, unknown>;

      // Extract configs, ignoring _meta
      const configsToImport: Partial<ConfigStorage> = {
        session: (parsed.session as ConfigStorage["session"]) || this.storage.session,
        layouts: (parsed.layouts as ConfigStorage["layouts"]) || this.storage.layouts,
        "math-channels": (parsed["math-channels"] as ConfigStorage["math-channels"]) || this.storage["math-channels"],
        "map-configs": (parsed["map-configs"] as ConfigStorage["map-configs"]) || this.storage["map-configs"],
        "current-map-config": (parsed["current-map-config"] as ConfigStorage["current-map-config"]) || this.storage["current-map-config"],
        "user-preferences": (parsed["user-preferences"] as ConfigStorage["user-preferences"]) || this.storage["user-preferences"],
        "soft-blocks": (parsed["soft-blocks"] as ConfigStorage["soft-blocks"]) || this.storage["soft-blocks"],
        "signal-colors": (parsed["signal-colors"] as ConfigStorage["signal-colors"]) || this.storage["signal-colors"],
        "dataset-id": this.storage["dataset-id"], // Keep current dataset
      };

      // Replace all configs (except dataset-id which stays unchanged)
      for (const key of Object.keys(configsToImport) as Array<keyof ConfigStorage>) {
        if (key === "dataset-id") continue; // Don't override dataset

        const value = configsToImport[key];
        if (value !== undefined) {
          const storedValue = value as ConfigStorage[typeof key];
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (this.storage as any)[key] = storedValue;
          this.saveToLocalStorage(key, storedValue);
          this.notifySubscribers(key as string, value);
        }
      }
    } catch (error) {
      throw new Error(`Failed to import TOML configuration: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

/**
 * Singleton instance - exported as the public API
 */
export const ConfigManager = new ConfigManagerClass();

/**
 * Type export for dependency injection scenarios (optional)
 */
export type { ConfigManagerClass };
