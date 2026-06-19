import type {
  BreakpointObject,
  CartoObject,
} from "../types";
import { ConfigManager } from "../store/ConfigManager";
import type { CartoAdapter } from "./cartoAdapters";

/**
 * Service pour importer et fusionner des cartos depuis des fichiers .m
 * Stratégie de merge: fusion par nom (breakpoints et cartos)
 */
export class CartoImportService {
  /**
   * Importe un fichier .m et fusionne les breakpoints/cartos avec ceux existants
   * Étape 1: Fusion des breakpoints (breakpoints seuls)
   * @param selectedBreakpointKeys Keys des breakpoints à importer (undefined = tous)
   * @returns Résumé de l'import des breakpoints
   */
  static importAndMergeBreakpoints(
    fileContent: string,
    adapter: CartoAdapter,
    selectedBreakpointKeys?: string[]
  ): {
    breakpointsCreated: string[];
    breakpointsUpdated: string[];
    cartosAffected: string[];
    errors: string[];
  } {
    const result = {
      breakpointsCreated: [] as string[],
      breakpointsUpdated: [] as string[],
      cartosAffected: new Set<string>(),
      errors: [] as string[],
    };

    try {
      // Parser le fichier
      const { breakpoints: importedBreakpoints } = adapter.parseM(fileContent);

      // Récupérer les breakpoints et cartos existants
      const existingBreakpoints =
        ConfigManager.get<Record<string, BreakpointObject>>(
          "breakpoint-configs"
        ) || {};
      const existingCartos = ConfigManager.get<Record<string, CartoObject>>(
        "carto-configs"
      ) || {};

      // Map pour associer breakpoints par nom
      const bpByName: Record<string, { key: string; obj: BreakpointObject }> =
        {};
      for (const [key, bp] of Object.entries(existingBreakpoints)) {
        bpByName[bp.name] = { key, obj: bp };
      }

      // Fusionner les breakpoints (filtrer si selectedBreakpointKeys fournis)
      const updatedBreakpoints = { ...existingBreakpoints };
      const keysToImport = selectedBreakpointKeys || Object.keys(importedBreakpoints);

      for (const [importedKey, importedBp] of Object.entries(
        importedBreakpoints
      )) {
        // Sauter si ce breakpoint n'est pas sélectionné
        if (!keysToImport.includes(importedKey)) {
          continue;
        }
        const existingEntry = bpByName[importedBp.name];

        if (existingEntry) {
          // Breakpoint existe: mettre à jour les valeurs
          const oldValues = JSON.stringify(
            existingEntry.obj.values.sort((a, b) => a - b)
          );
          const newValues = JSON.stringify(
            importedBp.values.sort((a, b) => a - b)
          );

          if (oldValues !== newValues) {
            // Les valeurs ont changé: mettre à jour
            updatedBreakpoints[existingEntry.key] = {
              ...existingEntry.obj,
              values: importedBp.values.sort((a, b) => a - b),
              description: `Updated from import on ${new Date().toISOString()}`,
            };
            result.breakpointsUpdated.push(existingEntry.key);

            // Marquer les cartos qui utilisent ce breakpoint comme affectées
            for (const [cartoKey, carto] of Object.entries(existingCartos)) {
              if (
                carto.breakpointKeyX === existingEntry.key ||
                carto.breakpointKeyY === existingEntry.key
              ) {
                result.cartosAffected.add(cartoKey);
              }
            }
          }
        } else {
          // Nouveau breakpoint: créer une clé unique
          let newKey = importedKey;
          let counter = 1;

          while (updatedBreakpoints[newKey]) {
            newKey = `${importedKey}_${counter}`;
            counter++;
          }

          updatedBreakpoints[newKey] = {
            ...importedBp,
            description: `Imported on ${new Date().toISOString()}`,
          };

          result.breakpointsCreated.push(newKey);
          bpByName[importedBp.name] = { key: newKey, obj: importedBp };
        }
      }

      // Persister les breakpoints mis à jour
      ConfigManager.set("breakpoint-configs", updatedBreakpoints);
    } catch (error) {
      result.errors.push(
        `Import error: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    return {
      ...result,
      cartosAffected: Array.from(result.cartosAffected),
    };
  }

  /**
   * Étape 2: Fusion des cartos
   * @param fileContent Contenu du fichier pour parser les cartos
   * @param adapter Adapter pour parser
   * @param selectedCartoKeys Clés des cartos sélectionnées pour import (depuis étape 1)
   * @returns Résumé de l'import des cartos
   */
  static importAndMergeCartos(
    fileContent: string,
    adapter: CartoAdapter,
    selectedCartoKeys: string[]
  ): {
    cartosCreated: string[];
    cartosUpdated: string[];
    cartosSkipped: string[];
    errors: string[];
  } {
    const result = {
      cartosCreated: [] as string[],
      cartosUpdated: [] as string[],
      cartosSkipped: [] as string[],
      errors: [] as string[],
    };

    try {
      // Parser le fichier
      const { cartos: importedCartos, breakpoints: importedBreakpoints } =
        adapter.parseM(fileContent);

      if (Object.keys(importedCartos).length === 0) {
        result.cartosSkipped.push(
          ...selectedCartoKeys.map((k) => `No 2D cartos found in file`)
        );
        return result;
      }

      // Récupérer les cartos et breakpoints existants
      const existingCartos = ConfigManager.get<Record<string, CartoObject>>(
        "carto-configs"
      ) || {};
      const existingBreakpoints =
        ConfigManager.get<Record<string, BreakpointObject>>(
          "breakpoint-configs"
        ) || {};

      // Map pour associer cartos par nom
      const cartoByName: Record<string, { key: string; obj: CartoObject }> =
        {};
      for (const [key, carto] of Object.entries(existingCartos)) {
        cartoByName[carto.name] = { key, obj: carto };
      }

      // Map pour associer les breakpoints importés par nom (pour les lier aux cartos)
      const bpByName: Record<string, string> = {};
      for (const [key, bp] of Object.entries(importedBreakpoints)) {
        bpByName[bp.name] = key;
      }

      // Fusionner les cartos sélectionnés
      const updatedCartos = { ...existingCartos };

      for (const importedKey of selectedCartoKeys) {
        // if (!importedCartos[importedKey]) {
        //   result.cartosSkipped.push(importedKey);
        //   continue;
        // }

        const importedCarto = importedCartos[importedKey];

        // Validation: les breakpoints doivent exister
        const bpXKey = this._findBreakpointKey(
          importedCarto.breakpointKeyX || importedCarto.name,
          existingBreakpoints,
          bpByName
        );
        const bpYKey = importedCarto.breakpointKeyY
          ? this._findBreakpointKey(
              importedCarto.breakpointKeyY,
              existingBreakpoints,
              bpByName
            )
          : undefined;

        // If breakpoint X not found, allow import but record a warning.
        if (!bpXKey) {
          result.errors.push(
            `Carto ${importedKey}: X breakpoint not found — importing carto with empty X reference`
          );
        }

        // Vérifier la cohérence des tailles uniquement si breakpoint existe
        if (bpXKey) {
          const bpX = existingBreakpoints[bpXKey];
          if (bpX.values.length !== importedCarto.gridData.length) {
            result.errors.push(
              `Carto ${importedKey}: X breakpoint size (${bpX.values.length}) doesn't match grid rows (${importedCarto.gridData.length})`
            );
            // still import but mark as skipped to avoid corrupt data
            result.cartosSkipped.push(importedKey);
            continue;
          }
        }

        if (bpYKey) {
          const bpY = existingBreakpoints[bpYKey];
          const expectedCols = bpY.values.length;
          const actualCols = importedCarto.gridData[0]?.length || 0;
          if (expectedCols !== actualCols) {
            result.errors.push(
              `Carto ${importedKey}: Y breakpoint size (${expectedCols}) doesn't match grid cols (${actualCols})`
            );
            result.cartosSkipped.push(importedKey);
            continue;
          }
        }

        const existingEntry = cartoByName[importedCarto.name];

        if (existingEntry) {
          // Carto existe: mettre à jour
          updatedCartos[existingEntry.key] = {
            ...existingEntry.obj,
            gridData: importedCarto.gridData,
            breakpointKeyX: bpXKey || existingEntry.obj.breakpointKeyX,
            breakpointKeyY: bpYKey || existingEntry.obj.breakpointKeyY,
            description: `Updated from import on ${new Date().toISOString()}`,
          };
          result.cartosUpdated.push(existingEntry.key);
        } else {
          // Nouveau carto: créer une clé unique
          let newKey = importedCarto.name;
          let counter = 1;

          while (updatedCartos[newKey]) {
            newKey = `${importedCarto.name}_${counter}`;
            counter++;
          }

          updatedCartos[newKey] = {
            name: importedCarto.name,
            gridData: importedCarto.gridData,
            breakpointKeyX: bpXKey,
            breakpointKeyY: bpYKey,
            gainVal: 1.0,
            offsetVal: 0.0,
            interpolation: "linear",
            extrapolation: "clamp",
            braking_signal: false,
            defaultInputChannelX: undefined,
            defaultInputChannelY: undefined,
          };
          result.cartosCreated.push(newKey);
          cartoByName[importedCarto.name] = { key: newKey, obj: updatedCartos[newKey] };
        }
      }

      // Persister les cartos mis à jour
      ConfigManager.set("carto-configs", updatedCartos);
    } catch (error) {
      result.errors.push(
        `Import error: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    return result;
  }

  /**
   * Trouve la clé d'un breakpoint existant par nom
   */
  private static _findBreakpointKey(
    nameLike: string,
    existingBreakpoints: Record<string, BreakpointObject>,
    bpByName: Record<string, string>
  ): string | undefined {
    // Chercher par nom exact
    for (const [key, bp] of Object.entries(existingBreakpoints)) {
      if (bp.name === nameLike) {
        return key;
      }
    }

    // Chercher dans les breakpoints importés
    if (bpByName[nameLike]) {
      return bpByName[nameLike];
    }

    return undefined;
  }

  /**
   * Valide les breakpoints importés (vérification basique)
   */
  static validateImportedBreakpoints(
    breakpoints: Record<string, BreakpointObject>
  ): string[] {
    const errors: string[] = [];

    for (const [key, bp] of Object.entries(breakpoints)) {
      if (!bp.name || bp.name.trim().length === 0) {
        errors.push(`Breakpoint ${key}: name is empty`);
      }

      if (!Array.isArray(bp.values) || bp.values.length === 0) {
        errors.push(`Breakpoint ${key}: values array is empty`);
      }

      // Vérifier que les valeurs sont triées
      for (let i = 1; i < bp.values.length; i++) {
        if (bp.values[i] < bp.values[i - 1]) {
          errors.push(
            `Breakpoint ${key}: values are not sorted (${bp.values[i]} < ${bp.values[i - 1]})`
          );
        }
      }
    }

    return errors;
  }

  /**
   * Valide les cartos importés
   */
  static validateImportedCartos(
    cartos: Record<string, CartoObject>,
    breakpoints: Record<string, BreakpointObject>
  ): string[] {
    const errors: string[] = [];

    for (const [key, carto] of Object.entries(cartos)) {
      if (!carto.name || carto.name.trim().length === 0) {
        errors.push(`Carto ${key}: name is empty`);
      }

      if (!Array.isArray(carto.gridData) || carto.gridData.length === 0) {
        errors.push(`Carto ${key}: gridData is empty`);
      } else {
        // Vérifier que toutes les lignes ont la même longueur
        const firstLen = carto.gridData[0].length;
        for (let i = 1; i < carto.gridData.length; i++) {
          if (carto.gridData[i].length !== firstLen) {
            errors.push(
              `Carto ${key}: inconsistent row length at row ${i}`
            );
          }
        }
      }
    }

    return errors;
  }
}
