/**
 * EXAMPLE: Using Config Sync in SignalWorkspace
 *
 * This shows how to use the new synchronization pattern for:
 * 1. Getting available signals from multiple sources
 * 2. Syncing math channels across tabs
 * 3. Updating signal list reactively
 */

// ============================================================================
// BEFORE: Manual sync with potential race conditions
// ============================================================================

/*
// Props passed from parent
type SignalWorkspaceProps = {
  datasetId: string | null;
  datasetMetadata: DatasetMetadata | null;
  mathChannels: MathChannel[];
  // ... other props ...
};

function SignalWorkspace({ 
  datasetId, 
  datasetMetadata, 
  mathChannels,
  // ... other props ...
}: SignalWorkspaceProps) {
  const [availableSignals, setAvailableSignals] = useState<string[]>([]);

  // Local state for math channels (needs manual sync)
  useEffect(() => {
    // Potential issue: duplicate calculations
    const signals = [
      ...datasetMetadata?.signal_names ?? [],
      ...mathChannels.map(ch => ch.name)
    ];
    setAvailableSignals(signals);
  }, [datasetMetadata, mathChannels]);

  // Needs to listen to ConfigManager separately
  useEffect(() => {
    const unsubscribe = ConfigManager.subscribe('math-channels', (newChannels) => {
      // Manual deduplication logic needed
    });
    return () => unsubscribe();
  }, []);
}
*/

// ============================================================================
// AFTER: Clean sync with useConfigValue
// ============================================================================

import { useEffect, useState } from 'react';
import { useConfigValue } from '../store/useConfigValue';
import { ConfigManager } from '../store/ConfigManager';
import type { DatasetMetadata, MathChannel } from '../types';

type SignalWorkspaceProps = {
  datasetId: string | null;
  datasetMetadata: DatasetMetadata | null;
  // mathChannels NO LONGER PASSED - managed internally via useConfigValue
  graphOnlyMode: boolean;
  // ... other props ...
};

/**
 * SignalWorkspace - Dashboard with cross-tab signal synchronization
 *
 * Uses useConfigValue to sync math channels across tabs without
 * manual subscription management or double-action risks.
 */
export function SignalWorkspace({
  datasetId,
  datasetMetadata,
  graphOnlyMode,
  // ... other props ...
}: SignalWorkspaceProps) {
  // ✅ Single source of truth - synced across tabs automatically
  const [mathChannels, setMathChannels] = useConfigValue('math-channels', []);

  // ✅ Derived state - recomputes when inputs change
  const availableSignals = useMemo((): string[] => {
    if (!datasetMetadata) return [];
    return [
      ...datasetMetadata.signal_names,
      ...mathChannels.map(ch => ch.name)
    ];
  }, [datasetMetadata, mathChannels]);

  // ✅ Add math channel - automatically syncs to other tabs
  function handleAddMathChannel(name: string, expression: string): string | null {
    if (!datasetMetadata) {
      return "Dataset requis";
    }

    const trimmedName = name.trim();
    if (!trimmedName) {
      return "Nom requis";
    }

    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(trimmedName)) {
      return "Nom invalide (lettres/chiffres/underscore)";
    }

    const existing = new Set([
      ...datasetMetadata.signal_names,
      ...mathChannels.map(ch => ch.name),
    ]);
    if (existing.has(trimmedName)) {
      return "Nom deja utilise";
    }

    const { dependencies, error } = analyzeMathExpression(
      expression,
      datasetMetadata.signal_names
    );
    if (error) {
      return error;
    }

    // ✅ Update state - automatically syncs via useConfigValue
    setMathChannels(prev => [
      ...prev,
      {
        name: trimmedName,
        expression: expression.trim(),
        dependencies,
      },
    ]);
    return null;
  }

  // ✅ Remove math channel - automatically syncs to other tabs
  function handleRemoveMathChannel(name: string) {
    setMathChannels(prev => prev.filter(ch => ch.name !== name));
  }

  // ✅ Use availableSignals in your UI
  return (
    <section className="workspace">
      {/* Signal list that updates reactively */}
      <div className="signals-list">
        {availableSignals.map(signal => (
          <div key={signal} className="signal-item">
            {signal}
          </div>
        ))}
      </div>

      {/* Pass handlers to children */}
      <ImportPanel
        mathChannels={mathChannels}
        onAddMathChannel={handleAddMathChannel}
        onRemoveMathChannel={handleRemoveMathChannel}
      />

      {/* ... rest of workspace ... */}
    </section>
  );
}

// ============================================================================
// ALTERNATIVE: If parent component still needs to pass mathChannels
// ============================================================================

/*
// Parent component (App.tsx) can simplify to:
import { useConfigValue } from './store/useConfigValue';

export default function App() {
  // ✅ Single source - syncs across tabs
  const [mathChannels, setMathChannels] = useConfigValue('math-channels', []);
  const [datasetId, setDatasetId] = useConfigValue('dataset-id', null, {
    debounceMs: 300
  });

  return (
    <>
      <SignalWorkspace
        datasetId={datasetId}
        datasetMetadata={datasetMetadata}
        mathChannels={mathChannels}  // Can pass down if needed
        // OR use it internally in SignalWorkspace if not needed here
      />
    </>
  );
}
*/

// ============================================================================
// BENEFITS OF THIS APPROACH
// ============================================================================

/*
✅ No manual subscription management
✅ Debounce prevents rapid re-renders (150ms default)
✅ Automatic change detection (doesn't duplicate actions)
✅ Cross-tab sync "just works"
✅ Single setState call per update
✅ Type-safe (TypeScript knows all ConfigStorage keys)
✅ Easy to add new config values (just add to ConfigTypes + use hook)
✅ No race conditions (atomic updates via setBatch)

BEFORE: Multiple useEffect hooks, manual subscription cleanup, comparison logic
AFTER: One useConfigValue hook call
*/
