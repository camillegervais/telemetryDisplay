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
  getNestedValue,
  isValidConfigKey,
  setNestedValue,
} from "../types/ConfigTypes";

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
    };

    return TOML.stringify(exportData);
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
