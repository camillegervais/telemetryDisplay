/**
 * migration.ts
 *
 * One-time migration from the legacy "map-configs" / "soft-blocks.mapConfigKey" schema
 * to the new "carto-configs" + "breakpoint-configs" model.
 *
 * Rules:
 *  - Non-destructive: legacy "map-configs" is kept until explicitly removed.
 *  - Called once at app start-up if "carto-configs" is absent but "map-configs" exists.
 *  - Duplicate breakpoints (identical values array) are deduplicated.
 *  - All actions are logged for auditability.
 */

import { ConfigManager } from "../store/ConfigManager";
import type { MapTuningData, BreakpointObject, CartoObject } from "../types";
import type { SoftBlock } from "../types";

// ── Helpers ──────────────────────────────────────────────────────────────────

function arraysEqual(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((v, i) => v === b[i]);
}

/**
 * Find an existing breakpoint key whose values match, or create a new entry.
 * Returns the key that should be used.
 */
function findOrCreateBreakpoint(
  bpMap: Record<string, BreakpointObject>,
  values: number[],
  suggestedName: string
): string {
  // Look for an existing breakpoint with the same values
  for (const [key, bp] of Object.entries(bpMap)) {
    if (arraysEqual(bp.values, values)) {
      console.log(`[migration] Reusing existing breakpoint "${key}" for "${suggestedName}"`);
      return key;
    }
  }

  // Ensure name uniqueness
  let name = suggestedName;
  let suffix = 1;
  while (bpMap[name]) {
    name = `${suggestedName}_${suffix++}`;
  }

  bpMap[name] = { name, values };
  console.log(`[migration] Created breakpoint "${name}" (${values.length} values)`);
  return name;
}

// ── Main migration function ───────────────────────────────────────────────────

export function migrateMapConfigsToCartoSystem(): void {
  const cartoConfigsExist =
    Object.keys(ConfigManager.get<Record<string, CartoObject>>("carto-configs") ?? {}).length > 0;

  const legacyMapConfigs =
    ConfigManager.get<Record<string, MapTuningData>>("map-configs") ?? {};

  const hasLegacyData = Object.keys(legacyMapConfigs).length > 0;

  // Already migrated or nothing to migrate
  if (cartoConfigsExist || !hasLegacyData) {
    if (cartoConfigsExist) {
      console.log("[migration] carto-configs already present — skipping migration.");
    } else {
      console.log("[migration] No legacy map-configs found — nothing to migrate.");
    }
    return;
  }

  console.log(
    `[migration] Starting migration of ${Object.keys(legacyMapConfigs).length} legacy map-configs…`
  );

  const bpMap: Record<string, BreakpointObject> = {};
  const cartoMap: Record<string, CartoObject> = {};

  for (const [cartoName, mapData] of Object.entries(legacyMapConfigs)) {
    const bpKeyX = findOrCreateBreakpoint(bpMap, mapData.rowHeaders, `BP_${cartoName}_X`);
    const bpKeyY = findOrCreateBreakpoint(bpMap, mapData.colHeaders, `BP_${cartoName}_Y`);

    const carto: CartoObject = {
      name: cartoName,
      breakpointKeyX: bpKeyX,
      breakpointKeyY: bpKeyY,
      gridData: mapData.gridData,
      gainVal: mapData.gainVal ?? 1,
      offsetVal: mapData.offsetVal ?? 0,
      interpolation: mapData.interpolation ?? "linear",
      extrapolation: mapData.extrapolation ?? "clamp",
      braking_signal: mapData.braking_signal ?? false,
      defaultInputChannelX: mapData.inputChannelX || undefined,
      defaultInputChannelY: mapData.inputChannelY || undefined,
    };

    cartoMap[cartoName] = carto;
    console.log(`[migration] Migrated carto "${cartoName}" (X: ${bpKeyX}, Y: ${bpKeyY})`);
  }

  // Migrate soft-blocks: replace mapConfigKey with cartoKey + channels
  const softBlocks = ConfigManager.get<SoftBlock[]>("soft-blocks") ?? [];
  if (softBlocks.length > 0) {
    const migratedBlocks = softBlocks.map((block) => ({
      ...block,
      operations: block.operations.map((op) => {
        if (op.kind !== "lut2d") return op;
        const lutOp = op as any;
        // If already migrated (has cartoKey), leave as-is
        if (lutOp.cartoKey) return op;

        const legacyKey = lutOp.mapConfigKey as string | undefined;
        if (!legacyKey) return op;

        const legacyCarto = legacyMapConfigs[legacyKey];
        return {
          ...op,
          mapConfigKey: undefined,
          cartoKey: legacyKey,
          inputChannelX: legacyCarto?.inputChannelX ?? "",
          inputChannelY: legacyCarto?.inputChannelY ?? "",
        };
      }),
    }));
    ConfigManager.set("soft-blocks", migratedBlocks);
    console.log("[migration] Migrated soft-blocks lut2d ops to new cartoKey format.");
  }

  // Persist new data
  ConfigManager.set("breakpoint-configs", bpMap);
  ConfigManager.set("carto-configs", cartoMap);

  // Migrate current-map-config → current-carto-config
  const currentMap = ConfigManager.get<string | null>("current-map-config");
  if (currentMap) {
    ConfigManager.set("current-carto-config", currentMap);
    console.log(`[migration] current-map-config "${currentMap}" → current-carto-config`);
  }

  console.log(
    `[migration] Done. ${Object.keys(cartoMap).length} cartos, ` +
    `${Object.keys(bpMap).length} breakpoints written.`
  );
}
