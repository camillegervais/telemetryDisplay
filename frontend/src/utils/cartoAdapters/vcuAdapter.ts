import type { CartoAdapter } from "./index";
import type { BreakpointObject, CartoObject } from "../../types";

/**
 * Adaptateur VCU pour l'import/export de cartos depuis des fichiers .m
 * Format: variables MATLAB avec suffixes _Axis, _XAxis, _YAxis, _Bkp, _Map2D, _Table
 */
export class VcuAdapter implements CartoAdapter {
  /**
   * Parse un fichier .m au format VCU et extrait breakpoints et cartos
   * Format attendu:
   *   c.APP_XXX_Axis = [val1, val2, ...]
   *   c.APP_YYY_XAxis = [val1, val2, ...]
   *   c.APP_ZZZ_YAxis = [val1, val2, ...]
   *   c.APP_BBB_Bkp = [val1, val2, ...]
   *   c.APP_MAP_Table = [row1; row2; row3; ...] (2D carto)
   */
  parseM(fileContent: string): {
    breakpoints: Record<string, BreakpointObject>;
    cartos: Record<string, CartoObject>;
  } {
    const breakpoints: Record<string, BreakpointObject> = {};
    const cartos: Record<string, CartoObject> = {};

    // Regex pour capturer: c.APP_XXX_YYY = [...];
    // avec support pour multilines via ...
    const lines = fileContent.split("\n");
    let currentKey = "";
    let currentValue = "";
    let inValue = false;

    for (const line of lines) {
      const trimmed = line.trim();

      // Début d'une nouvelle variable
      const assignMatch = trimmed.match(/^c\.APP_(.+?)\s*=\s*(.*)/);
      if (assignMatch) {
        // Sauvegarder la valeur précédente si elle existe
        if (currentKey && currentValue) {
          this._parseVariable(currentKey, currentValue, breakpoints, cartos);
        }

        currentKey = assignMatch[1];
        currentValue = assignMatch[2];
        inValue = true;

        // Si la ligne se termine par ";", on a la valeur complète
        // if (currentValue.includes(";")) {
        //   this._parseVariable(
        //     currentKey,
        //     currentValue.replace(/;$/, ""),
        //     breakpoints,
        //     cartos
        //   );
        //   currentKey = "";
        //   currentValue = "";
        //   inValue = false;
        // }
      } else if (inValue) {
        // Continuation de la valeur précédente (multiline)
        currentValue += " " + trimmed;

        // if (trimmed.includes(";")) {
        //   this._parseVariable(
        //     currentKey,
        //     currentValue.replace(/;$/, ""),
        //     breakpoints,
        //     cartos
        //   );
        //   currentKey = "";
        //   currentValue = "";
        //   inValue = false;
        // }
      }
    }

    // Sauvegarder la dernière valeur
    if (currentKey && currentValue) {
      this._parseVariable(currentKey, currentValue, breakpoints, cartos);
    }

    console.log('BNreakpoints : ', breakpoints);
    console.log('Cartos : ', cartos);

    return {
      breakpoints,
      cartos,
    };
  }

  /**
   * Parse une variable individuelle et l'ajoute aux breakpoints ou cartos
   */
  private _parseVariable(
    key: string,
    valueStr: string,
    breakpoints: Record<string, BreakpointObject>,
    cartos: Record<string, CartoObject>
  ): void {
    // Vérifier si c'est une table 2D (contient des `;` pour séparer les lignes)
    if(!key.includes('Char')) {
        this._parseCartoVariable(key, valueStr, cartos, breakpoints);
        this._parseBreakpointVariable(key, valueStr, breakpoints);
    } 
  }

  /**
   * Parse une variable breakpoint (1D)
   */
  private _parseBreakpointVariable(
    key: string,
    valueStr: string,
    breakpoints: Record<string, BreakpointObject>
  ): void {
    // Extraire le nom de base et le suffixe (Axis, XAxis, YAxis, Bkp)
    const suffixMatch = key.match(/^(.+?)(_Axis|_Bkp|Bkp|Axis|_PreLookup|bkp|_PIL|_FE|axis)$/);
    if (!suffixMatch || suffixMatch[1].includes('Char')) {
      return;
    }

    const baseName = suffixMatch[1];
    
    // Ignore variables that contain 'Char' in the base name (character maps etc.)
    if (baseName.includes("Char")) {
      return;
    }

    // Parser les valeurs entre [ et ]
    const arrayMatch = valueStr.match(/\[(.*)\]/);
    if (!arrayMatch) {
      return;
    }

    try {
      const valuesStr = arrayMatch[1];
      // Remplacer les "..." par des espaces et parser les nombres
      const cleanStr = valuesStr
        .replace(/\.\.\./g, "")
        .split(/[,\s]+/)
        .filter((s) => s.length > 0);

      const values = cleanStr.map((s) => {
        const num = parseFloat(s);
        return isNaN(num) ? 0 : num;
      });

      if (values.length === 0) {
        return;
      }

      // Créer ou mettre à jour le breakpoint
      const bpKey = key;
      const humanName = baseName;

      if (!breakpoints[bpKey]) {
        breakpoints[bpKey] = {
          name: humanName,
          values: values.sort((a, b) => a - b),
          unit: undefined,
          description: `Imported from ${key}`,
        };
      } else {
        breakpoints[bpKey].values = values.sort((a, b) => a - b);
      }
    } catch (error) {
      console.error(`Failed to parse breakpoint variable ${key}:`, error);
    }
  }

  /**
   * Parse une variable carto 2D (table)
   * Format: [row1val1, row1val2; row2val1, row2val2; ...]
   */
  private _parseCartoVariable(
    key: string,
    valueStr: string,
    cartos: Record<string, CartoObject>,
    breakpoints: Record<string, BreakpointObject>
  ): void {
    const suffixMatch = key.match(/^(.+?)_(Table|Map2D|Map)$/);
    if (!suffixMatch) {
      return;
    }

    const baseName = suffixMatch[1];

    try {
      // Parser la matrice
      const arrayMatch = valueStr.match(/\[(.*)\]/s);
      if (!arrayMatch) {
        return;
      }

      const matrixStr = arrayMatch[1];
      
      // Diviser par ligne (;) puis par colonne (,)
      const rows = matrixStr
        .split(";")
        .map((row) => row.trim())
        .filter((row) => row.length > 0);

      if (rows.length === 0) {
        return;
      }

      let gridData: number[][] = [];
      for (const row of rows) {
        const values = row
          .replace(/\.\.\./g, "")
          .replace(/[\[\]]/g, "")
          .split(/[,\s]+/)
          .filter((s) => s.length > 0)
          .map((s) => {
            const num = parseFloat(s);
            return isNaN(num) ? 0 : num;
          });

        if (values.length > 0) {
          gridData.push(values);
        }
      }

      if (gridData.length === 0) {
        return;
      }

      if (gridData[0].length !== 0) {
        const transposedGridData = gridData[0].map((_, colIndex) =>
            gridData.map(row => row[colIndex])
        );  

        gridData = transposedGridData;
      }
      
      // Créer le carto
      // Note: les références aux breakpoints seront définies à l'import (matching par nom)
      const cartoKey = key;

      cartos[cartoKey] = {
        name: baseName,
        breakpointKeyX: "", // À remplir lors du merge
        breakpointKeyY: "", // À remplir lors du merge
        gridData,
        gainVal: 1.0,
        offsetVal: 0.0,
        interpolation: "linear",
        extrapolation: "clamp",
        braking_signal: false,
        defaultInputChannelX: undefined,
        defaultInputChannelY: undefined,
      };
    } catch (error) {
      console.error(`Failed to parse carto variable ${key}:`, error);
    }
  }

  /**
   * Exporte les cartos et breakpoints au format .m VCU
   */
  exportToM(
    cartos: Record<string, CartoObject>,
    breakpoints: Record<string, BreakpointObject>
  ): string {
    const lines: string[] = [];

    // En-tête
    lines.push("% Cartos exported from Telemetry Display");
    lines.push(`% Exported on ${new Date().toLocaleString()}`);
    lines.push("% Data Only");
    lines.push("%");
    lines.push("");

    // Exporter les breakpoints
    for (const [key, bp] of Object.entries(breakpoints)) {
      lines.push(`c.APP_${key} = ...`);

      // Formater le array avec line wrap tous les 10 valeurs
      const valueLines: string[] = [];
      for (let i = 0; i < bp.values.length; i += 10) {
        const chunk = bp.values
          .slice(i, i + 10)
          .map((v) => (Number.isInteger(v) ? v.toString() : v.toFixed(6)))
          .join(", ");

        if (i === 0) {
          valueLines.push(` [${chunk}${i + 10 < bp.values.length ? "," : ""}`);
        } else if (i + 10 < bp.values.length) {
          valueLines.push(` ${chunk},`);
        } else {
          valueLines.push(` ${chunk}];`);
        }
      }
      lines.push(valueLines.join("\n"));
      lines.push("");
    }

    // Exporter les cartos
    for (const [key, carto] of Object.entries(cartos)) {
      lines.push(`c.APP_${key}_Table = ...`);

      // Formater la matrice
      const matrixLines: string[] = [];
      for (let i = 0; i < carto.gridData.length; i++) {
        const row = carto.gridData[i];
        const rowStr = row.map((v) => (Number.isInteger(v) ? v.toString() : v.toFixed(6))).join(", ");

        if (i === 0) {
          matrixLines.push(` [${rowStr}`);
        } else if (i === carto.gridData.length - 1) {
          matrixLines.push(`  ${rowStr}];`);
        } else {
          matrixLines.push(`  ${rowStr};`);
        }
      }
      lines.push(matrixLines.join("\n"));
      lines.push("");
    }

    return lines.join("\n");
  }
}

export const vcuAdapter = new VcuAdapter();
