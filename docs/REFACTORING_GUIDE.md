/**
 * REFACTORING GUIDE - Step by Step
 * 
 * This guide shows exactly how to refactor a component to use
 * the new useConfigValue pattern instead of manual ConfigManager calls.
 */

// ============================================================================
// EXAMPLE 1: Simple Component with One Config Value
// ============================================================================

// ===== BEFORE: Manual subscription pattern =====
/*
import { useState, useEffect } from 'react';
import { ConfigManager } from '../store/ConfigManager';

export function UserPreferencesPanel() {
  const [preferences, setPreferences] = useState(() =>
    ConfigManager.get('user-preferences') ?? {}
  );

  // Outbound sync: Local change → ConfigManager
  useEffect(() => {
    ConfigManager.set('user-preferences', preferences);
  }, [preferences]);

  // Inbound sync: ConfigManager → Local state
  useEffect(() => {
    return ConfigManager.subscribeDebouncedFull(
      'user-preferences',
      (newPreferences) => setPreferences(newPreferences),
      150
    );
  }, []);

  function handlePreferenceChange(key: string, value: unknown) {
    setPreferences(prev => ({ ...prev, [key]: value }));
  }

  return (
    <div>
      {/* Component JSX */}
    </div>
  );
}
*/

// ===== AFTER: Using useConfigValue hook =====
/*
import { useConfigValue } from '../store/useConfigValue';

export function UserPreferencesPanel() {
  const [preferences, setPreferences] = useConfigValue('user-preferences', {});

  function handlePreferenceChange(key: string, value: unknown) {
    setPreferences(prev => ({ ...prev, [key]: value }));
  }

  return (
    <div>
      {/* Component JSX - identical to before */}
    </div>
  );
}
*/

// Savings:
// - ✅ Removed 3 useEffect hooks
// - ✅ Removed manual subscription management
// - ✅ 6 lines of code → 1 line
// - ✅ Same functionality, cleaner code

// ============================================================================
// EXAMPLE 2: Component with Multiple Config Values
// ============================================================================

// ===== BEFORE: Multiple manual subscriptions =====
/*
import { useState, useEffect } from 'react';
import { ConfigManager } from '../store/ConfigManager';

export function WorkspaceManager() {
  const [layouts, setLayouts] = useState(() =>
    ConfigManager.get('layouts') ?? []
  );
  
  const [session, setSession] = useState(() =>
    ConfigManager.get('session') ?? null
  );

  // Outbound sync for layouts
  useEffect(() => {
    ConfigManager.set('layouts', layouts);
  }, [layouts]);

  // Outbound sync for session
  useEffect(() => {
    ConfigManager.set('session', session);
  }, [session]);

  // Inbound sync for layouts
  useEffect(() => {
    return ConfigManager.subscribeDebouncedFull(
      'layouts',
      (newLayouts) => setLayouts(newLayouts),
      150
    );
  }, []);

  // Inbound sync for session
  useEffect(() => {
    return ConfigManager.subscribeDebouncedFull(
      'session',
      (newSession) => setSession(newSession),
      150
    );
  }, []);

  return (
    <div>
      {/* Component JSX */}
    </div>
  );
}
*/

// ===== AFTER: Using multiple useConfigValue hooks =====
/*
import { useConfigValue } from '../store/useConfigValue';

export function WorkspaceManager() {
  const [layouts, setLayouts] = useConfigValue('layouts', []);
  const [session, setSession] = useConfigValue('session', null);

  return (
    <div>
      {/* Component JSX */}
    </div>
  );
}
*/

// Savings:
// - ✅ Removed 4 useEffect hooks
// - ✅ 15 lines → 2 lines
// - ✅ Each hook call is independent, easy to understand
// - ✅ Same sync behavior, less boilerplate

// ============================================================================
// EXAMPLE 3: Component with Custom Debounce
// ============================================================================

// ===== BEFORE: Manual debounce for expensive operation =====
/*
import { useState, useEffect } from 'react';
import { ConfigManager } from '../store/ConfigManager';

export function DatasetPanel() {
  const [datasetId, setDatasetId] = useState(() =>
    ConfigManager.get('dataset-id') ?? null
  );

  // Outbound sync
  useEffect(() => {
    ConfigManager.set('dataset-id', datasetId);
  }, [datasetId]);

  // Inbound sync with manual longer debounce for API calls
  useEffect(() => {
    return ConfigManager.subscribeDebouncedFull(
      'dataset-id',
      (newDatasetId) => setDatasetId(newDatasetId),
      300  // Longer debounce because loading is expensive
    );
  }, []);

  return (
    <div>
      {/* Component JSX */}
    </div>
  );
}
*/

// ===== AFTER: Using useConfigValue with options =====
/*
import { useConfigValue } from '../store/useConfigValue';

export function DatasetPanel() {
  const [datasetId, setDatasetId] = useConfigValue(
    'dataset-id',
    null,
    { debounceMs: 300 }  // Longer debounce for expensive operations
  );

  return (
    <div>
      {/* Component JSX */}
    </div>
  );
}
*/

// Improvement:
// - ✅ Clear intent: "debounce 300ms" right there
// - ✅ Still just 1 hook call
// - ✅ Removed 2 useEffect hooks
// - ✅ Removed manual subscription management

// ============================================================================
// EXAMPLE 4: Component with Async Side Effects
// ============================================================================

// ===== BEFORE: Subscribe to changes, trigger async operation =====
/*
import { useState, useEffect } from 'react';
import { ConfigManager } from '../store/ConfigManager';

export function MapConfigPanel() {
  const [mapConfig, setMapConfig] = useState(() =>
    ConfigManager.get('current-map-config') ?? null
  );
  
  const [tuningData, setTuningData] = useState(null);
  const [loading, setLoading] = useState(false);

  // Watch for map config changes
  useEffect(() => {
    return ConfigManager.subscribeDebouncedFull(
      'current-map-config',
      (newConfigId) => {
        setMapConfig(newConfigId);
      },
      200
    );
  }, []);

  // Trigger calculation when config changes
  useEffect(() => {
    if (!mapConfig) {
      setTuningData(null);
      return;
    }

    setLoading(true);
    calculateMapTuning(mapConfig)
      .then(result => {
        setTuningData(result);
        // Update multiple values atomically
        ConfigManager.setBatch({
          'current-map-config': mapConfig,
          'map-configs': {
            ...ConfigManager.get('map-configs'),
            [mapConfig]: result.config
          }
        });
      })
      .finally(() => setLoading(false));
  }, [mapConfig]);

  return (
    <div>
      {/* Component JSX */}
    </div>
  );
}
*/

// ===== AFTER: Clean separation of concerns =====
/*
import { useState, useEffect } from 'react';
import { useConfigValue } from '../store/useConfigValue';
import { ConfigManager } from '../store/ConfigManager';

export function MapConfigPanel() {
  const [mapConfig, setMapConfig] = useConfigValue(
    'current-map-config',
    null,
    { debounceMs: 200 }
  );
  
  const [tuningData, setTuningData] = useState(null);
  const [loading, setLoading] = useState(false);

  // Separate effect: Calculate when config changes
  useEffect(() => {
    if (!mapConfig) {
      setTuningData(null);
      return;
    }

    setLoading(true);
    calculateMapTuning(mapConfig)
      .then(result => {
        setTuningData(result);
        // Update multiple values atomically
        ConfigManager.setBatch({
          'current-map-config': mapConfig,
          'map-configs': {
            ...ConfigManager.get('map-configs'),
            [mapConfig]: result.config
          }
        });
      })
      .finally(() => setLoading(false));
  }, [mapConfig]);

  return (
    <div>
      {/* Component JSX */}
    </div>
  );
}
*/

// Improvement:
// - ✅ Removed manual subscription/unsubscribe
// - ✅ Clear: mapConfig is synced via useConfigValue
// - ✅ Effect logic is focused on async operation, not sync
// - ✅ setBatch handles atomic updates

// ============================================================================
// STEP-BY-STEP REFACTORING CHECKLIST
// ============================================================================

/**
 * REFACTORING STEPS FOR ANY COMPONENT:
 * 
 * 1. IDENTIFY CONFIG VALUES
 *    [ ] List all states that come from ConfigManager
 *    [ ] Note their keys: 'math-channels', 'dataset-id', etc.
 *    [ ] Note default values
 *    [ ] Note debounce timing if different from 150ms
 * 
 * 2. REMOVE MANUAL PATTERNS
 *    [ ] Delete useState that initializes from ConfigManager
 *    [ ] Delete useEffect that sets ConfigManager
 *    [ ] Delete useEffect that subscribes to ConfigManager
 *    [ ] Keep any other useEffect unrelated to ConfigManager
 * 
 * 3. ADD USECONFIG VALUE HOOK
 *    [ ] Import: import { useConfigValue } from '../store/useConfigValue'
 *    [ ] For each config value: const [value, setValue] = useConfigValue(...)
 *    [ ] Use same variable names as before
 *    [ ] Pass key name, default value, and options
 * 
 * 4. VERIFY BEHAVIOR
 *    [ ] Component renders with correct initial state
 *    [ ] Local changes update state
 *    [ ] useEffect watching that state still triggers
 *    [ ] Other tabs update this component's state
 *    [ ] Multiple updates don't cause race conditions
 * 
 * 5. CLEANUP
 *    [ ] Remove unused imports
 *    [ ] Remove ConfigManager references if not using manually
 *    [ ] Run TypeScript check (should have no errors)
 *    [ ] Test in browser
 */

// ============================================================================
// COMMON MISTAKES TO AVOID
// ============================================================================

/**
 * ❌ MISTAKE 1: Forgetting to remove old useState
 * 
 * // WRONG
 * const [value, setValue] = useState(() => ConfigManager.get('key'));
 * const [value, setValue] = useConfigValue('key', default); // Double!
 * 
 * // RIGHT
 * const [value, setValue] = useConfigValue('key', default);
 */

/**
 * ❌ MISTAKE 2: Not removing old useEffect hooks
 * 
 * // WRONG
 * const [value, setValue] = useConfigValue('key', default);
 * useEffect(() => {
 *   ConfigManager.set('key', value); // Still manually syncing!
 * }, [value]);
 * 
 * // RIGHT
 * const [value, setValue] = useConfigValue('key', default);
 * // useConfigValue handles all sync automatically
 */

/**
 * ❌ MISTAKE 3: Wrong debounce timing
 * 
 * // WRONG - Math channels are fast, don't need 300ms
 * const [channels, setChannels] = useConfigValue('math-channels', [], {
 *   debounceMs: 300
 * });
 * 
 * // RIGHT
 * const [channels, setChannels] = useConfigValue('math-channels', [], {
 *   debounceMs: 150
 * });
 */

/**
 * ❌ MISTAKE 4: Calling set immediately after creating state
 * 
 * // WRONG
 * const [value, setValue] = useConfigValue('key', default);
 * useEffect(() => {
 *   setValue(someNewValue); // This might cause loops
 * }, []);
 * 
 * // RIGHT - Only call setValue in response to user action or other effects
 * const [value, setValue] = useConfigValue('key', default);
 * function handleUserAction() {
 *   setValue(someNewValue); // Good - user triggered
 * }
 */

// ============================================================================
// SUMMARY
// ============================================================================

/**
 * PATTERN TRANSFORMATION:
 * 
 * BEFORE:
 * - useState + initializer
 * - useEffect to set ConfigManager
 * - useEffect to subscribe to ConfigManager
 * - Manual subscription cleanup
 * Total: ~15-20 lines per config value
 * 
 * AFTER:
 * - Single useConfigValue hook call
 * - Optional debounce and compare options
 * Total: 1-2 lines per config value
 * 
 * RESULT:
 * ✅ Same cross-tab sync behavior
 * ✅ Same debounce timing
 * ✅ Same change detection
 * ✅ 85% less boilerplate
 * ✅ Clearer intent
 * ✅ Easier to maintain
 */
