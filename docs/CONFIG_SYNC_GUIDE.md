/**
 * GUIDE: Using the New Config Synchronization Pattern
 *
 * This file shows how to use the new synchronization system for any ConfigStorage key.
 * The pattern is simple, transparent, and avoids double actions.
 */

// ============================================================================
// PATTERN 1: Direct Hook Usage (RECOMMENDED FOR NEW CODE)
// ============================================================================

/*
Import the hook:
  import { useConfigValue } from '../store/useConfigValue';

Then use it like useState:
  const [mathChannels, setMathChannels] = useConfigValue(
    'math-channels',
    []  // default/initial value
  );

That's it! It automatically:
  - Loads from localStorage on init
  - Syncs local changes to localStorage
  - Subscribes to changes from other tabs
  - Debounces updates by 150ms (customizable)
  - Prevents loops via change detection

With custom debounce (for expensive operations):
  const [datasetId, setDatasetId] = useConfigValue(
    'dataset-id',
    null,
    { debounceMs: 300 }  // longer delay for API calls
  );

Example: Refactored ImportPanel component
  export default function ImportPanel() {
    const [mathChannels, setMathChannels] = useConfigValue('math-channels', []);
    const [datasetId, setDatasetId] = useConfigValue('dataset-id', null, {
      debounceMs: 300
    });

    function handleAddMathChannel(name: string, expression: string): string | null {
      // ... validation code ...
      setMathChannels(prev => [...prev, newChannel]);
      return null;
    }

    function handleRemoveMathChannel(name: string) {
      setMathChannels(prev => prev.filter(ch => ch.name !== name));
    }

    return (
      // Component JSX using mathChannels and setMathChannels
    );
  }
*/

// ============================================================================
// PATTERN 2: Manual ConfigManager Usage (FOR SPECIFIC CASES)
// ============================================================================

/*
If you need direct control, use ConfigManager methods:

1. Get a value:
     const value = ConfigManager.get<T>('key-name');

2. Set a value (syncs to localStorage):
     ConfigManager.set('key-name', newValue);

3. Subscribe to changes with debounce:
     const unsubscribe = ConfigManager.subscribeDebouncedFull(
       'key-name',
       (newValue) => {
         // Handle update - called after debounce
       },
       200  // milliseconds
     );
     return () => unsubscribe();

4. Batch update multiple values atomically:
     ConfigManager.setBatch({
       'math-channels': newChannels,
       'dataset-id': datasetId,
       'current-map-config': configId
     });

Example in a React component:
  useEffect(() => {
    return ConfigManager.subscribeDebouncedFull(
      'math-channels',
      (newChannels) => {
        // Only called if value changed and debounce expired
        setLocalMathChannels(newChannels);
      },
      200
    );
  }, []);
*/

// ============================================================================
// PATTERN 3: External Updates (e.g., from async operations)
// ============================================================================

/*
When you have async operations that need to update config:

async function loadDataset(datasetId: string) {
  try {
    const [metadata, trackMap] = await Promise.all([
      fetchDatasetMetadata(datasetId),
      fetchTrackMap(datasetId)
    ]);

    // Single atomic update instead of multiple sets
    ConfigManager.setBatch({
      'dataset-id': datasetId,
      // ... any other values that changed together
    });
  } catch (error) {
    console.error('Load failed:', error);
  }
}
*/

// ============================================================================
// PATTERN 4: Action Deduplication - Preventing Double Execution
// ============================================================================

/*
The debounce mechanism prevents rapid re-execution automatically.
However, for critical operations, you can add extra guards:

function handleCalculateMapTuning(configId: string) {
  // Guard 1: Check if already loading
  if (isCalculating) return;

  setIsCalculating(true);
  
  calculateMapTuning(configId)
    .then(result => {
      // Update config atomically
      ConfigManager.setBatch({
        'map-tuning-signals': {
          configId,
          signals: result.signals,
          timestamp: Date.now()
        },
        'map-configs': {
          ...ConfigManager.get('map-configs'),
          [configId]: result.config
        }
      });
    })
    .finally(() => setIsCalculating(false));
}

// Other tabs will receive the update via subscribeDebouncedFull
// and can skip their own expensive operations
useEffect(() => {
  return ConfigManager.subscribeDebouncedFull(
    'map-tuning-signals',
    (signals) => {
      // Only re-calculate if it's a different calculation
      if (signals?.configId !== lastProcessedConfigId) {
        setLastProcessedConfigId(signals?.configId);
        onMapTuningUpdated(signals);
      }
    },
    250  // Longer debounce for expensive map calculations
  );
}, []);
*/

// ============================================================================
// QUICK REFERENCE
// ============================================================================

/*
|                 | Simple State | Cross-Tab Sync | Debounce | Best For
|---|---|---|---|
| useState + set  | ✓ | ✗ | ✗ | Local-only state
| useConfigValue  | ✓ | ✓ | ✓ | Most config values
| ConfigManager   | - | ✓ | ✓ | Direct control/batching

For almost all ConfigStorage keys, use useConfigValue:
  const [value, setValue] = useConfigValue('key-name', defaultValue);

Debounce values by operation type:
  - UI state (tabs, layout): 100-150ms
  - Math channels: 150ms
  - Dataset operations: 300-400ms
  - Map tuning: 250-300ms
*/

// ============================================================================
// ADDING NEW CONFIG KEYS - STEP BY STEP
// ============================================================================

/*
1. Add type to ConfigStorage in ConfigTypes.ts:
     export type ConfigStorage = {
       // ... existing keys ...
       'my-new-key': MyType;
     };

2. Add default value to CONFIG_DEFAULTS:
     export const CONFIG_DEFAULTS: ConfigStorage = {
       // ... existing defaults ...
       'my-new-key': defaultValue,
     };

3. Use in component with useConfigValue:
     import { useConfigValue } from '../store/useConfigValue';
     
     export function MyComponent() {
       const [myValue, setMyValue] = useConfigValue('my-new-key', defaultValue);
       // ... rest of component ...
     }

That's all! The synchronization is automatic.
*/
