/**
 * useConfig Hook - React integration for ConfigManager
 *
 * Provides reactive access to configuration values with automatic subscription management.
 *
 * Usage:
 *   const [layouts, setLayouts] = useConfig('layouts');
 *   const layouts = useConfig('layouts')[0]; // read-only
 */

import { useEffect, useState } from "react";
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
