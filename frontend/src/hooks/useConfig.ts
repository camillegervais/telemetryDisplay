/**
 * useConfig Hook - React integration for ConfigManager
 *
 * Provides reactive access to configuration values with automatic subscription management.
 *
 * Usage:
 *   const [layouts, setLayouts] = useConfig('layouts');
 *   const layouts = useConfig('layouts')[0]; // read-only
 */

import { useEffect, useRef, useState } from "react";
import { ConfigManager } from "../store/ConfigManager";

/**
 * Hook to read and write a configuration value with auto-subscription
 * Returns [value, setValue] similar to useState
 *
 * @example
 *   const [layouts, setLayouts] = useConfig('layouts');
 *   setLayouts([...newLayouts]); // automatically persists
 */
export function useConfig<T = unknown>(path: string): [T | undefined, (value: T) => void] {
  const [value, setValue] = useState<T | undefined>(() => ConfigManager.get<T>(path));

  useEffect(() => {
    // Subscribe to changes from other components or tabs
    const unsubscribe = ConfigManager.subscribe<T>(path, (newValue) => {
      setValue(newValue);
    });

    return () => {
      unsubscribe();
    };
  }, [path]);

  const setConfigValue = (newValue: T) => {
    setValue(newValue);
    ConfigManager.set(path, newValue);
  };

  return [value, setConfigValue];
}

/**
 * Hook for read-only access to a configuration value
 * Lighter weight than useConfig if you only need to read
 *
 * @example
 *   const layouts = useConfigValue('layouts');
 */
export function useConfigValue<T = unknown>(path: string): T | undefined {
  const [value, setValue] = useState<T | undefined>(() => ConfigManager.get<T>(path));

  useEffect(() => {
    const unsubscribe = ConfigManager.subscribe<T>(path, setValue);
    return () => {
      unsubscribe();
    };
  }, [path]);

  return value;
}

/**
 * useSyncedConfig - Standard bidirectional cross-tab synchronization pattern.
 *
 * Rules enforced:
 *  - Writes are debounced before hitting ConfigManager (prevents flooding other tabs)
 *  - Subscription uses empty deps array + ref to avoid stale closures
 *  - Self-notification is prevented via content comparison (no echo loops)
 *  - Pending save timers are cleaned up on unmount
 *
 * Use this instead of manually pairing a save useEffect with a subscribe useEffect.
 *
 * @param configKey   - The ConfigManager key (top-level only, e.g. "layouts")
 * @param value       - The current local state value to persist
 * @param setValue    - The state setter called when another tab changes the value
 * @param options.saveDebounceMs    - Debounce before writing to ConfigManager (default 150ms)
 * @param options.receiveDebounceMs - Debounce for incoming notifications (default 150ms)
 * @param options.enabled           - Set to false to suspend sync entirely (default true)
 *
 * @example
 *   const [softBlocks, setSoftBlocks] = useState<SoftBlock[]>([]);
 *   useSyncedConfig("soft-blocks", softBlocks, setSoftBlocks, { saveDebounceMs: 150 });
 */
export function useSyncedConfig<T>(
  configKey: string,
  value: T,
  setValue: (v: T) => void,
  options?: { saveDebounceMs?: number; receiveDebounceMs?: number; enabled?: boolean }
): void {
  const { saveDebounceMs = 150, receiveDebounceMs = 150, enabled = true } = options ?? {};

  // Track current value in a ref to avoid stale closures inside the subscription callback.
  const valueRef = useRef(value);
  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  // Track last value that was actually written to ConfigManager.
  // Prevents saving back a value that came from another tab (self-echo prevention).
  const lastSavedRef = useRef<T>(value);

  // Debounce timer handle for pending saves.
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Debounced save ──────────────────────────────────────────────────────────
  // Fires whenever `value` changes, but only persists after the debounce delay.
  useEffect(() => {
    if (!enabled) return;

    // Skip if content is identical to what is already stored.
    if (JSON.stringify(value) === JSON.stringify(lastSavedRef.current)) return;

    if (saveTimerRef.current !== null) clearTimeout(saveTimerRef.current);

    saveTimerRef.current = setTimeout(() => {
      lastSavedRef.current = value;
      ConfigManager.set(configKey, value);
      saveTimerRef.current = null;
    }, saveDebounceMs);

    return () => {
      if (saveTimerRef.current !== null) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
    };
    // configKey and saveDebounceMs are stable; value is the real dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, enabled]);

  // ── Stable subscription ─────────────────────────────────────────────────────
  // Created once on mount (empty dep array). Uses valueRef to read the current
  // value without causing the subscription to be recreated on every change.
  useEffect(() => {
    if (!enabled) return;

    return ConfigManager.subscribeDebouncedFull<T>(
      configKey,
      (newValue) => {
        // Prevent self-notification: skip if the incoming value matches current state.
        if (JSON.stringify(newValue) === JSON.stringify(valueRef.current)) return;
        // Also update lastSavedRef so the save effect doesn't immediately echo back.
        lastSavedRef.current = newValue;
        setValue(newValue);
      },
      receiveDebounceMs
    );
    // setValue is expected to be stable (e.g. a React state setter).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configKey, enabled, receiveDebounceMs]);
}
