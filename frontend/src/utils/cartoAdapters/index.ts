import type { BreakpointObject, CartoObject } from "../../types";

/**
 * Interface pour adapter l'import/export de cartos depuis/vers des fichiers .m
 * Permet de supporter différents formats (VCU, TAG, etc.)
 */
export interface CartoAdapter {
  /**
   * Parse un fichier .m et extrait les breakpoints et cartos
   * @param fileContent Contenu du fichier .m
   * @returns Object avec breakpoints et cartos extraits du fichier
   */
  parseM(fileContent: string): {
    breakpoints: Record<string, BreakpointObject>;
    cartos: Record<string, CartoObject>;
  };

  /**
   * Génère le contenu d'un fichier .m à partir des cartos et breakpoints
   * @param cartos Cartos à exporter
   * @param breakpoints Breakpoints à exporter
   * @returns Contenu du fichier .m au format text
   */
  exportToM(
    cartos: Record<string, CartoObject>,
    breakpoints: Record<string, BreakpointObject>
  ): string;
}
