/**
 * useConfigValue - Reusable hook for synchronized config management
 *
 * Handles bidirectional sync between local state and ConfigManager:
 * - Persists local changes to ConfigManager
 * - Subscribes to changes from other tabs with debounce
 * - Prevents redundant updates and loops
 *
 * Pattern: Simple, transparent, and reusable for any ConfigStorage key
 */

import { useEffect, useState } from "react";
import { ConfigManager } from "./ConfigManager";
import type { ConfigStorage } from "../types/ConfigTypes";

/**
 * Options for configuring the hook behavior
 */
interface UseConfigValueOptions {
  /** Debounce delay (ms) for external updates - lower = faster response, higher = fewer updates */
  debounceMs?: number;
  /** Compare function for detecting changes - defaults to JSON.stringify */
  compare?: (a: unknown, b: unknown) => boolean;
}

/**
 * Hook for synchronized config values with cross-tab support
 *
 * @param key - ConfigStorage key to manage
 * @param initialValue - Default value if key is not in storage
 * @param options - Debounce and comparison options
 * @returns [value, setValue] - Like useState but synced with ConfigManager
 *
 * @example Basic usage - Math channels
 *   const [mathChannels, setMathChannels] = useConfigValue(
 *     "math-channels",
 *     []
 *   );
 *   // Changes to mathChannels automatically sync to localStorage
 *   // Changes from other tabs automatically update mathChannels
 *
 * @example With custom debounce - For expensive operations
 *   const [datasetId, setDatasetId] = useConfigValue(
 *     "dataset-id",
 *     null,
 *     { debounceMs: 300 } // Longer delay for API calls
 *   );
 *
 * @example Multiple values at once
 *   const [mathChannels, setMathChannels] = useConfigValue("math-channels", []);
 *   const [userPrefs, setUserPrefs] = useConfigValue("user-preferences", { displayName: "" });
 *   // Each manages its own sync independently
 */
export function useConfigValue<K extends keyof ConfigStorage>(
  key: K,
  initialValue: ConfigStorage[K],
  options: UseConfigValueOptions = {}
): [ConfigStorage[K], (value: ConfigStorage[K]) => void] {
  const { debounceMs = 150, compare } = options;

  // Initialize from ConfigManager
  const [value, setValue] = useState<ConfigStorage[K]>(() => {
    const stored = ConfigManager.get<ConfigStorage[K]>(key);
    return stored !== undefined ? stored : initialValue;
  });

  // Write local changes to ConfigManager
  useEffect(() => {
    ConfigManager.set(key, value);
  }, [key, value]);

  // Subscribe to external changes from other tabs
  useEffect(() => {
    const defaultCompare = (a: unknown, b: unknown) => 
      JSON.stringify(a) === JSON.stringify(b);
    const compareFunc = compare || defaultCompare;

    const unsubscribe = ConfigManager.subscribeDebouncedFull<ConfigStorage[K]>(
      key,
      (newValue) => {
        // Only update if value actually changed
        if (!compareFunc(value, newValue)) {
          setValue(newValue);
        }
      },
      debounceMs
    );

    return () => unsubscribe();
  }, [key, value, compare, debounceMs]);

  return [value, setValue];
}

/**
 * Hook for batch updates - useful when multiple values change together
 *
 * @param updates - Object with keys to update
 *
 * @example
 *   const updateConfigs = useBatchConfigUpdate();
 *   updateConfigs({
 *     'math-channels': newChannels,
 *     'dataset-id': newId
 *   });
 */
export function useBatchConfigUpdate() {
  return (updates: Partial<ConfigStorage>) => {
    ConfigManager.setBatch(updates);
  };
}
