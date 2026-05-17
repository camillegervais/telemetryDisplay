/**
 * CONFIG MANAGER ARCHITECTURE
 * 
 * Quick reference for all methods and their purpose
 */

// ============================================================================
// METHOD REFERENCE
// ============================================================================

interface ConfigManagerMethods {
  // ===== GETTERS =====
  
  /**
   * Get a value using dot notation
   * @example
   *   ConfigManager.get('math-channels')
   *   ConfigManager.get('layouts.0.name')
   */
  get<T = unknown>(path: string): T | undefined;

  // ===== SETTERS =====
  
  /**
   * Set a single value (syncs to localStorage)
   * @example
   *   ConfigManager.set('math-channels', channels)
   */
  set<T = unknown>(path: string, value: T): void;

  /**
   * Update multiple values atomically
   * @example
   *   ConfigManager.setBatch({
   *     'math-channels': channels,
   *     'dataset-id': datasetId
   *   })
   */
  setBatch(updates: Partial<ConfigStorage>): void;

  // ===== SUBSCRIPTIONS =====
  
  /**
   * Subscribe to changes with immediate notifications
   * Returns unsubscribe function
   * @example
   *   const unsub = ConfigManager.subscribe('math-channels', (newValue) => {
   *     console.log('Changed:', newValue);
   *   });
   *   unsub(); // cleanup
   */
  subscribe<T = unknown>(
    path: string,
    callback: (value: T) => void
  ): () => void;

  /**
   * Subscribe to changes with debounce + change detection
   * Best for avoiding duplicate actions
   * @example
   *   const unsub = ConfigManager.subscribeDebouncedFull(
   *     'math-channels',
   *     (newValue) => { setMathChannels(newValue); },
   *     150  // debounce in ms
   *   );
   */
  subscribeDebouncedFull<T = unknown>(
    path: string,
    callback: (value: T) => void,
    debounceMs?: number
  ): () => void;

  // ===== STORAGE EVENTS =====
  
  /**
   * Listen for changes from other browser tabs
   * Called automatically by subscribeDebouncedFull
   * Usually not needed directly
   */
  setupStorageEventListener(): void;

  // ===== IMPORT/EXPORT =====
  
  /**
   * Export all config to TOML format
   * @returns TOML string
   */
  exportToToml(): string;

  /**
   * Import config from TOML format
   * Replaces all configs except dataset-id
   * @param tomlString TOML configuration
   */
  importFromToml(tomlString: string): void;

  // ===== UTILITY =====
  
  /**
   * Clear all configs and reset to defaults
   */
  clear(): void;
}

// ============================================================================
// USAGE BY SCENARIO
// ============================================================================

/**
 * SCENARIO 1: Simple State Sync (Most Common)
 * Use: useConfigValue hook in React components
 */
// Code: const [value, setValue] = useConfigValue('key-name', defaultValue);

/**
 * SCENARIO 2: Cross-Tab Communication
 * Use: subscribeDebouncedFull in useEffect
 */
// Code:
// useEffect(() => {
//   return ConfigManager.subscribeDebouncedFull(
//     'math-channels',
//     (newChannels) => setMathChannels(newChannels),
//     150
//   );
// }, []);

/**
 * SCENARIO 3: Multiple Related Updates
 * Use: setBatch for atomic updates
 */
// Code:
// ConfigManager.setBatch({
//   'dataset-id': newDatasetId,
//   'current-map-config': null
// });

/**
 * SCENARIO 4: Get Value Without Subscription
 * Use: get method directly
 */
// Code:
// const current = ConfigManager.get<MathChannel[]>('math-channels');

/**
 * SCENARIO 5: Watch External Changes Only (No Local State)
 * Use: subscribe (not subscribeDebouncedFull) if you don't modify locally
 */
// Code:
// useEffect(() => {
//   return ConfigManager.subscribe('dataset-id', (id) => {
//     loadDataset(id); // One-way from storage
//   });
// }, []);

// ============================================================================
// AVAILABLE CONFIG KEYS
// ============================================================================

/**
 * All keys from ConfigStorage type (defined in ConfigTypes.ts)
 * Use these as first argument to get/set/subscribe
 */
const CONFIG_KEYS = {
  'layouts': 'SavedWorkspaceConfig[]',
  'session': 'WorkspaceSessionSnapshot',
  'math-channels': 'MathChannel[]',
  'map-configs': 'Record<string, MapTuningData>',
  'current-map-config': 'string | null',
  'user-preferences': 'UserPreferences',
  'dataset-id': 'string | null'
} as const;

// ============================================================================
// DEBOUNCE TIMING RECOMMENDATIONS
// ============================================================================

const DEBOUNCE_RECOMMENDATIONS = {
  // UI state that updates frequently
  'UI State': 100,
  
  // Math channels (moderate updates)
  'Math Channels': 150,
  
  // Dataset operations (expensive API calls)
  'Dataset ID': 300,
  
  // Map tuning calculations (very expensive)
  'Map Tuning': 300,
  
  // Layout changes (rare)
  'Layouts': 100,
  
  // User preferences (rare)
  'User Preferences': 100
} as const;

// ============================================================================
// COMMON PATTERNS
// ============================================================================

/**
 * PATTERN: React Component with Full Sync
 * 
 * Best for: Components that both read and write to config
 * Import: import { useConfigValue } from '../store/useConfigValue';
 */
/* 
function MyComponent() {
  const [value, setValue] = useConfigValue('key-name', defaultValue, {
    debounceMs: 150
  });

  function handleChange(newValue) {
    setValue(newValue); // Updates locally + all other tabs
  }

  return <div>{value}</div>;
}
*/

/**
 * PATTERN: Listen to Async Operations
 * 
 * Best for: Listening to changes without modifying locally
 * Import: none - use ConfigManager directly in useEffect
 */
/*
function MyComponent() {
  useEffect(() => {
    return ConfigManager.subscribeDebouncedFull(
      'dataset-id',
      async (datasetId) => {
        if (!datasetId) return;
        const data = await fetchDataset(datasetId);
        setLocalData(data);
      },
      300  // longer debounce for API calls
    );
  }, []);

  return <div>{localData}</div>;
}
*/

/**
 * PATTERN: Atomic Multi-Key Update
 * 
 * Best for: Related values that should update together
 * Import: import { ConfigManager } from '../store/ConfigManager';
 */
/*
function handleImport(dataset) {
  ConfigManager.setBatch({
    'dataset-id': dataset.id,
    'current-map-config': null,
    'math-channels': []
  });
  // All three update together, subscribers notified once per key
}
*/

// ============================================================================
// ERROR HANDLING
// ============================================================================

/**
 * Invalid Key Error
 * Error: "Invalid config key: my-custom-key"
 * Solution: Add key to ConfigStorage type in ConfigTypes.ts
 */

/**
 * JSON Serialization Error
 * Error: "Failed to load config xyz" in console
 * Solution: localStorage corruption, clear storage and restart
 */

/**
 * Type Mismatch Error
 * Error: TypeScript error about type mismatch
 * Solution: Use proper type in useConfigValue or ConfigManager.get<T>()
 */

// ============================================================================
// PERFORMANCE CONSIDERATIONS
// ============================================================================

/**
 * Debounce Timing:
 * - Too short (50ms): May cause race conditions
 * - Good (150ms): Balances responsiveness and batching
 * - Too long (1000ms): UI feels sluggish
 * 
 * For API calls: Use 300-500ms to batch multiple changes
 * For UI state: Use 100-150ms for responsiveness
 */

/**
 * Memory Usage:
 * - Each subscription keeps a reference
 * - Unsubscribe automatically when component unmounts
 * - useConfigValue handles cleanup automatically
 */

/**
 * Storage Events:
 * - Fire immediately when other tabs change localStorage
 * - Debounce prevents callback storms
 * - Change detection (JSON.stringify) adds small overhead
 */

// ============================================================================
// DEBUGGING TIPS
// ============================================================================

/**
 * Check what's in localStorage:
 * Object.keys(localStorage).filter(k => k.startsWith('telemetry-display.config'))
 */

/**
 * Log all config changes:
 * ConfigManager.subscribe('*', (path, value) => console.log(path, value))
 * // Note: This is not implemented, use individual subscriptions
 */

/**
 * Check if value matches across tabs:
 * Tab A: ConfigManager.get('math-channels')
 * Tab B: ConfigManager.get('math-channels')
 * // Should be identical after debounce expires
 */

/**
 * Monitor debounce timing:
 * Add console.log at start and end of debounceMs timeout
 * Track how often callbacks are skipped vs executed
 */

// ============================================================================
// SUMMARY FOR DEVELOPERS
// ============================================================================

/**
 * ✅ DO:
 * - Use useConfigValue for almost everything
 * - Use subscribeDebouncedFull for listening to changes
 * - Use setBatch for related multi-key updates
 * - Customize debounce timing per use case
 * - Return unsubscribe functions from useEffect
 * 
 * ❌ DON'T:
 * - Don't use plain subscribe() for state-changing logic
 * - Don't manually track subscriptions without cleanup
 * - Don't mix ConfigManager.set with setState in same useEffect
 * - Don't forget to unsubscribe from listeners
 * - Don't set same value multiple times (use setBatch)
 */
