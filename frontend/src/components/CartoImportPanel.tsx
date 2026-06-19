import { useRef, useState, type CSSProperties } from "react";
import { CartoImportModal } from "./CartoImportModal";
import { CartoSelectionModal } from "./CartoSelectionModal";
import { ImportSummaryModal } from "./ImportSummaryModal";
import type { BreakpointObject, CartoObject } from "../types";
import { vcuAdapter } from "../utils/cartoAdapters/vcuAdapter";
import { CartoImportService } from "../utils/cartoImportService";

interface CartoImportPanelProps {
  onImportComplete?: () => void;
}

type ImportStep = "idle" | "select-breakpoints" | "select-cartos" | "summary";

interface ImportState {
  step: ImportStep;
  breakpoints: Record<string, BreakpointObject> | null;
  cartos: Record<string, CartoObject> | null;
  fileContent: string | null;
  selectedBreakpointKeys: string[];
  selectedCartoKeys: string[];
  summary: {
    breakpointsCreated: string[];
    breakpointsUpdated: string[];
    cartosCreated: string[];
    cartosUpdated: string[];
    cartosSkipped: string[];
    errors: string[];
  } | null;
}

export function CartoImportPanel({ onImportComplete }: CartoImportPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [state, setState] = useState<ImportState>({
    step: "idle",
    breakpoints: null,
    cartos: null,
    fileContent: null,
    selectedBreakpointKeys: [],
    selectedCartoKeys: [],
    summary: null,
  });

  const buttonStyle: CSSProperties = {
    padding: "0.6rem 1.2rem",
    borderRadius: "4px",
    border: "1px solid rgba(52, 211, 153, 0.4)",
    backgroundColor: "rgba(52, 211, 153, 0.1)",
    color: "rgba(52, 211, 153, 1)",
    cursor: "pointer",
    fontFamily: '"Space Grotesk", monospace',
    fontSize: "0.9rem",
    fontWeight: "bold",
    transition: "all 0.2s",
    marginRight: "1rem"
  };

  const handleOpenImport = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    try {
      const content = await file.text();
      const parsed = vcuAdapter.parseM(content);

      // Valider les breakpoints
      const bpErrors = CartoImportService.validateImportedBreakpoints(parsed.breakpoints);
      const cartoErrors = CartoImportService.validateImportedCartos(parsed.cartos, parsed.breakpoints);
      const allErrors = [...bpErrors, ...cartoErrors];

      if (allErrors.length > 0) {
        setState((prev) => ({
          ...prev,
          step: "summary",
          summary: {
            breakpointsCreated: [],
            breakpointsUpdated: [],
            cartosCreated: [],
            cartosUpdated: [],
            cartosSkipped: [],
            errors: allErrors,
          },
        }));
      } else {
        // Passer à la première étape : sélection des breakpoints
        setState((prev) => ({
          ...prev,
          step: "select-breakpoints",
          breakpoints: parsed.breakpoints,
          cartos: parsed.cartos,
          fileContent: content,
          selectedBreakpointKeys: Object.keys(parsed.breakpoints),
          selectedCartoKeys: Object.keys(parsed.cartos),
        }));
      }
    } catch (error) {
      setState((prev) => ({
        ...prev,
        step: "summary",
        summary: {
          breakpointsCreated: [],
          breakpointsUpdated: [],
          cartosCreated: [],
          cartosUpdated: [],
          cartosSkipped: [],
          errors: [
            `Failed to read file: ${error instanceof Error ? error.message : String(error)}`,
          ],
        },
      }));
    } finally {
      setIsLoading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleBreakpointsSelected = (selectedKeys: string[]) => {
    setState((prev) => ({
      ...prev,
      step: "select-cartos",
      selectedBreakpointKeys: selectedKeys,
    }));
  };

  const handleCartosSelected = async (selectedKeys: string[]) => {
    setIsLoading(true);
    try {
      // Étape 1 : Importer les breakpoints sélectionnés
      const bpResult = CartoImportService.importAndMergeBreakpoints(
        state.fileContent!,
        vcuAdapter,
        state.selectedBreakpointKeys
      );

      // Étape 2 : Importer les cartos sélectionnés
      const cartoResult = CartoImportService.importAndMergeCartos(
        state.fileContent!,
        vcuAdapter,
        selectedKeys
      );

      setState((prev) => ({
        ...prev,
        step: "summary",
        selectedCartoKeys: selectedKeys,
        summary: {
          breakpointsCreated: bpResult.breakpointsCreated,
          breakpointsUpdated: bpResult.breakpointsUpdated,
          cartosCreated: cartoResult.cartosCreated,
          cartosUpdated: cartoResult.cartosUpdated,
          cartosSkipped: cartoResult.cartosSkipped,
          errors: [...bpResult.errors, ...cartoResult.errors],
        },
      }));
    } catch (error) {
      setState((prev) => ({
        ...prev,
        step: "summary",
        summary: {
          breakpointsCreated: [],
          breakpointsUpdated: [],
          cartosCreated: [],
          cartosUpdated: [],
          cartosSkipped: [],
          errors: [
            `Import failed: ${error instanceof Error ? error.message : String(error)}`,
          ],
        },
      }));
    } finally {
      setIsLoading(false);
    }
  };

  const handleSummaryClose = () => {
    setState({
      step: "idle",
      breakpoints: null,
      cartos: null,
      fileContent: null,
      selectedBreakpointKeys: [],
      selectedCartoKeys: [],
      summary: null,
    });
    onImportComplete?.();
  };

  return (
    <>
      <button
        style={buttonStyle}
        onClick={handleOpenImport}
        title="Import breakpoints and cartos from .m file"
        disabled={isLoading}
      >
        {isLoading ? "Loading..." : "📥 Import .m"}
      </button>

      <input
        ref={fileInputRef}
        type="file"
        accept=".m"
        onChange={handleFileSelected}
        style={{ display: "none" }}
      />

      {state.step === "select-breakpoints" && state.breakpoints && (
        <CartoImportModal
          breakpoints={state.breakpoints}
          onConfirm={handleBreakpointsSelected}
          onCancel={() =>
            setState({
              step: "idle",
              breakpoints: null,
              cartos: null,
              fileContent: null,
              selectedBreakpointKeys: [],
              selectedCartoKeys: [],
              summary: null,
            })
          }
          isLoading={isLoading}
        />
      )}

      {state.step === "select-cartos" && state.cartos && Object.keys(state.cartos).length > 0 && (
        <CartoSelectionModal
          cartos={state.cartos}
          onConfirm={handleCartosSelected}
          onCancel={() =>
            setState((prev) => ({
              ...prev,
              step: "select-breakpoints",
            }))
          }
          isLoading={isLoading}
        />
      )}

      {state.step === "summary" && state.summary && (
        <ImportSummaryModal summary={state.summary} onClose={handleSummaryClose} />
      )}
    </>
  );
}
