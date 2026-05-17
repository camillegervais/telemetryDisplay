/**
 * COMPLETE REFACTORING EXAMPLE - ImportPanel
 * 
 * Before & After showing exact changes needed for priority component
 * This is a REAL EXAMPLE from the codebase
 */

// ============================================================================
// CURRENT STATE - What needs to change
// ============================================================================

/**
 * Current lines 193-223 of ImportPanel.tsx
 * (simplified for clarity)
 */

/*
export default function ImportPanel({...props...}) {
  const { xAxisMode, startFinishOffsetM, setXAxisMode, setStartFinishOffsetM } = useTelemetryStore();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [matPath, setMatPath] = useState("");
  
  // ❌ PROBLEM: Manual state management
  const [mapConfigs, setMapConfigs] = useState<Record<string, MapTuningData>>(() =>
    ConfigManager.get<Record<string, MapTuningData>>("map-configs") ?? {}
  );

  // ❌ PROBLEM: No inbound sync from other tabs
  // (missing subscribeDebouncedFull in useEffect)

  // ❌ PROBLEM: Manual outbound sync 
  useEffect(() => {
    // Not implemented - changes don't sync to other tabs
  }, [mapConfigs]);

  return (
    // JSX uses mapConfigs...
  );
}
*/

// ============================================================================
// REFACTORED VERSION - What to change it to
// ============================================================================

/*
import { useEffect, useState, useMemo } from 'react';
import { useConfigValue } from '../store/useConfigValue';        // ✅ ADD THIS IMPORT
import { ConfigManager } from '../store/ConfigManager';
import { useTelemetryStore } from './TelemetryStore';
import { getFunctionDocumentation, getOperatorDocumentation } from '../mathFunctions';
import type { ImportPanelProps, MapTuningData, MathChannel } from '../types';

export default function ImportPanel({
  appInfo,
  loadingAppInfo,
  importing,
  importMessage,
  datasetId,
  datasetMetadata,
  mathChannels,          // Keep receiving from props for now
  onImport,
  onImportFromPath,
  onAddMathChannel,
  onRemoveMathChannel,
  onRefreshMetaData
}: ImportPanelProps) {
  const { xAxisMode, startFinishOffsetM, setXAxisMode, setStartFinishOffsetM } = useTelemetryStore();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [matPath, setMatPath] = useState("");
  const [importSectionOpen, setImportSectionOpen] = useState(true);
  const [signalsSectionOpen, setSignalsSectionOpen] = useState(true);
  const [axisSectionOpen, setAxisSectionOpen] = useState(false);
  const [mathSectionOpen, setMathSectionOpen] = useState(false);
  const [statsSectionOpen, setStatsSectionOpen] = useState(false);
  const [signalFilter, setSignalFilter] = useState("");
  const [signalStats, setSignalStats] = useState<Record<string, SignalStats>>({});
  const [loadingStats, setLoadingStats] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [mathName, setMathName] = useState("");
  const [mathExpression, setMathExpression] = useState("");
  const [mathError, setMathError] = useState<string | null>(null);
  const [mathGuideOpen, setMathGuideOpen] = useState(false);
  const [mapTuningSectionOpen, setMapTuningSectionOpen] = useState(false);
  const [mapTuningGainOffsets, setMapTuningGainOffsets] = useState<Record<string, { gain: number; offset: number }>>({});

  // ✅ CHANGE THIS:
  // OLD: const [mapConfigs, setMapConfigs] = useState<Record<string, MapTuningData>>(() =>
  //   ConfigManager.get<Record<string, MapTuningData>>("map-configs") ?? {}
  // );

  // TO THIS:
  const [mapConfigs, setMapConfigs] = useConfigValue<Record<string, MapTuningData>>(
    "map-configs",
    {}
  );

  // ✅ DELETE the old useEffect that tried to sync!
  // (No need anymore - useConfigValue handles it)

  // Rest of component remains exactly the same...
  
  return (
    <section className="panel">
      {/* JSX unchanged - still uses mapConfigs and setMapConfigs */}
    </section>
  );
}
*/

// ============================================================================
// WHAT CHANGED - The diff
// ============================================================================

/**
 * ADDITIONS (what to add):
 * 
 * Line 3:
 * + import { useConfigValue } from '../store/useConfigValue';
 * 
 * Line ~202:
 * CHANGE FROM:
 *   const [mapConfigs, setMapConfigs] = useState<Record<string, MapTuningData>>(() =>
 *     ConfigManager.get<Record<string, MapTuningData>>("map-configs") ?? {}
 *   );
 * 
 * CHANGE TO:
 *   const [mapConfigs, setMapConfigs] = useConfigValue<Record<string, MapTuningData>>(
 *     "map-configs",
 *     {}
 *   );
 * 
 * DELETIONS (what to remove):
 * 
 * Any useEffect that:
 *   - Initializes mapConfigs from ConfigManager
 *   - Subscribes to mapConfigs changes
 *   - Sets mapConfigs to ConfigManager
 * 
 * These are all handled by useConfigValue now.
 */

// ============================================================================
// EXACT CHANGES TO MAKE
// ============================================================================

/**
 * Step 1: Add import at top of file
 * 
 * Find line with: import { useState, useEffect, useMemo } from 'react';
 * 
 * Add after it (or update existing import):
 * import { useConfigValue } from '../store/useConfigValue';
 */

/**
 * Step 2: Replace useState for mapConfigs
 * 
 * Find (around line 193-201):
 * const [mapConfigs, setMapConfigs] = useState<Record<string, MapTuningData>>(() =>
 *   ConfigManager.get<Record<string, MapTuningData>>("map-configs") ?? {}
 * );
 * 
 * Replace with:
 * const [mapConfigs, setMapConfigs] = useConfigValue<Record<string, MapTuningData>>(
 *   "map-configs",
 *   {}
 * );
 */

/**
 * Step 3: Remove old useEffect hooks
 * 
 * Search for useEffect in ImportPanel
 * Delete any that mention:
 *   - "map-configs"
 *   - "mapConfigs"
 *   - ConfigManager.get("map-configs")
 *   - ConfigManager.subscribe("map-configs")
 *   - ConfigManager.set("map-configs")
 */

/**
 * Step 4: Verify TypeScript
 * 
 * Run: npm run type-check
 * Should have no errors related to mapConfigs
 */

/**
 * Step 5: Test
 * 
 * Run: npm run dev
 * Open two tabs
 * Tab A: Add/modify map configuration
 * Tab B: Should see changes within 150ms
 * No errors in console
 */

// ============================================================================
// WHY THESE CHANGES WORK
// ============================================================================

/**
 * Before (manual):
 * 1. useState loads initial value from localStorage
 * 2. Component renders with initial state
 * 3. (Missing) useEffect should set up subscription → other tabs changes NOT received
 * 4. (Missing) useEffect should sync changes to localStorage → other tabs don't see changes
 * Result: ❌ No cross-tab sync
 * 
 * After (useConfigValue):
 * 1. useConfigValue loads initial value from localStorage
 * 2. Component renders with initial state
 * 3. useConfigValue automatically subscribes with debounce
 * 4. useConfigValue automatically syncs changes to localStorage
 * 5. useConfigValue sets up StorageEvent listener for other tab changes
 * Result: ✅ Automatic cross-tab sync with debounce
 */

// ============================================================================
// VERIFICATION CHECKLIST
// ============================================================================

/**
 * After making changes:
 * 
 * [ ] File saves without TypeScript errors
 * [ ] App compiles with npm run type-check
 * [ ] Browser loads without errors (check DevTools)
 * [ ] Open two tabs with app
 * [ ] Tab A: Modify map configuration (add/remove/edit)
 * [ ] Tab B: Check that changes appear within 200ms
 * [ ] Tab B: Modify map configuration
 * [ ] Tab A: Check that changes appear
 * [ ] No console errors or warnings
 * [ ] Refresh Tab A - configurations restored from localStorage
 * [ ] Close Tab A completely, open new tab - gets latest config from Tab B
 */

// ============================================================================
// NEXT COMPONENTS TO REFACTOR (IN ORDER)
// ============================================================================

/**
 * After completing ImportPanel, apply same pattern to:
 * 
 * 1. SignalWorkspace.tsx
 *    - Replace mathChannels state with useConfigValue
 *    - Single line: const [mathChannels, setMathChannels] = useConfigValue('math-channels', []);
 * 
 * 2. MapTuning.tsx
 *    - Similar to ImportPanel
 *    - Replace mapConfigs state with useConfigValue
 * 
 * 3. ConfigExportImport.tsx
 *    - Use setBatch() for atomic imports
 *    - See EXAMPLE_USAGE.ts for batch pattern
 * 
 * 4. WorkspaceExplorer.tsx
 *    - Replace layouts state with useConfigValue
 * 
 * 5. WidgetInspector.tsx
 *    - Replace session state with useConfigValue
 */

// ============================================================================
// COPY-PASTE READY CODE
// ============================================================================

/**
 * Here's the exact import statement to add:
 */
const IMPORT_TO_ADD = `import { useConfigValue } from '../store/useConfigValue';`;

/**
 * Here's the exact hook call to replace useState with:
 */
const HOOK_CALL = `const [mapConfigs, setMapConfigs] = useConfigValue<Record<string, MapTuningData>>(
  "map-configs",
  {}
);`;

/**
 * Here's what to search for and DELETE:
 */
const DELETE_PATTERNS = [
  "ConfigManager.get.*map-configs",
  "ConfigManager.subscribe.*map-configs",
  "ConfigManager.set.*map-configs",
  "useState.*ConfigManager.get.*map-configs"
];

// ============================================================================
// COMMON MISTAKES WHEN REFACTORING
// ============================================================================

/**
 * ❌ MISTAKE 1: Keeping old useState
 * 
 * DON'T DO THIS:
 *   const [mapConfigs, setMapConfigs] = useState(...);
 *   const [mapConfigs, setMapConfigs] = useConfigValue(...);  // Duplicate!
 * 
 * DO THIS:
 *   const [mapConfigs, setMapConfigs] = useConfigValue(...);  // Single source
 */

/**
 * ❌ MISTAKE 2: Forgetting the import
 * 
 * DON'T:
 *   useConfigValue('map-configs', {});  // Error: not imported
 * 
 * DO:
 *   import { useConfigValue } from '../store/useConfigValue';
 *   const [mapConfigs, setMapConfigs] = useConfigValue('map-configs', {});
 */

/**
 * ❌ MISTAKE 3: Manually calling ConfigManager.set
 * 
 * DON'T:
 *   const [mapConfigs, setMapConfigs] = useConfigValue('map-configs', {});
 *   useEffect(() => {
 *     ConfigManager.set('map-configs', mapConfigs);  // Already handled by hook!
 *   }, [mapConfigs]);
 * 
 * DO:
 *   const [mapConfigs, setMapConfigs] = useConfigValue('map-configs', {});
 *   // That's it - no manual sync needed
 */

/**
 * ❌ MISTAKE 4: Forgetting type parameter
 * 
 * DON'T:
 *   const [mapConfigs, setMapConfigs] = useConfigValue('map-configs', {});
 *   // TypeScript doesn't know mapConfigs is Record<string, MapTuningData>
 * 
 * DO:
 *   const [mapConfigs, setMapConfigs] = useConfigValue<Record<string, MapTuningData>>(
 *     'map-configs',
 *     {}
 *   );
 */

// ============================================================================
// TIME ESTIMATE
// ============================================================================

/**
 * Time to refactor ImportPanel:
 * - Find the useState for mapConfigs: 1 minute
 * - Replace with useConfigValue: 1 minute
 * - Add import: 30 seconds
 * - Delete old useEffect (if any): 1 minute
 * - Test in browser: 2 minutes
 * 
 * TOTAL: 5-6 minutes
 * 
 * Then:
 * - Commit: 1 minute
 * - Move to next component: 5-6 minutes each
 */

// ============================================================================
// SUPPORT & QUESTIONS
// ============================================================================

/**
 * If you get stuck:
 * 
 * Q: What's the import path?
 * A: '../store/useConfigValue' (from component directory)
 *    Adjust ../ based on component location
 * 
 * Q: What if there are multiple useEffect hooks?
 * A: Delete ALL useEffect hooks that mention map-configs
 *    They're no longer needed - useConfigValue handles them
 * 
 * Q: How do I know if it's working?
 * A: Open two tabs, make changes in one, check the other within 200ms
 * 
 * Q: What if I get type errors?
 * A: Add the type parameter:
 *    useConfigValue<Record<string, MapTuningData>>('map-configs', {})
 * 
 * See TESTING_GUIDE.md for more validation methods
 */

// ============================================================================
// SUMMARY
// ============================================================================

/**
 * WHAT TO DO:
 * 1. Add import for useConfigValue
 * 2. Replace useState with useConfigValue for mapConfigs
 * 3. Delete old useEffect hooks (if any)
 * 4. Test in browser
 * 5. Commit and move to next component
 * 
 * RESULT:
 * - mapConfigs now syncs across all tabs automatically
 * - No manual subscription management
 * - Same functionality, cleaner code
 * - Ready for production
 * 
 * See REFACTORING_GUIDE.md for complete step-by-step details
 */
