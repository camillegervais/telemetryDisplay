import React, { useState, useMemo, useEffect, useCallback } from "react";

// Définitions locales pour permettre l'exécution dans cet environnement isolé
export type MapTuningData = {
  inputChannelX: string;
  inputChannelY: string;
  outputChannelName: string;
  gridData: number[][];
  rowHeaders: number[];
  colHeaders: number[];
};

const saveMapTuning = async (data: any) => new Promise((resolve) => setTimeout(() => resolve({ message: "Saved" }), 800));
const calculateMapTuning = async (data: any) => new Promise((resolve) => setTimeout(() => resolve({ samplesProcessed: 1450 }), 1500));

interface MapTuningProps {
  availableSignals?: string[];
  datasetId?: string | null;
  currentData?: MapTuningData | null;
  onSave?: (data: MapTuningData) => void;
  onCalculate?: (data: MapTuningData) => void;
  onSignalsUpdated?: () => void; // <-- Ajout de cette prop
}

// ============================================================================
// COMPOSANT INPUT SUR-MESURE (Gère les flottants, négatifs et le focus)
// ============================================================================
interface NumberInputProps {
  value: number;
  onChange: (val: number) => void;
  onPaste?: (e: React.ClipboardEvent<HTMLInputElement>) => void;
  style?: React.CSSProperties;
}

const NumberInput: React.FC<NumberInputProps> = ({ value, onChange, onPaste, style }) => {
  const [localVal, setLocalVal] = useState<string>(String(value));
  const [isFocused, setIsFocused] = useState(false);

  // Synchronise la valeur externe quand on n'est pas en train d'éditer
  useEffect(() => {
    if (!isFocused) {
      setLocalVal(String(value));
    }
  }, [value, isFocused]);

  const handleBlur = () => {
    setIsFocused(false);
    // Remplace la virgule par un point pour le parsing JavaScript
    const parsed = parseFloat(localVal.replace(",", "."));
    
    if (!isNaN(parsed)) {
      onChange(parsed);
      setLocalVal(String(parsed));
    } else {
      // Si la saisie est invalide (ex: texte), on annule
      setLocalVal(String(value));
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.currentTarget.blur();
    }
  };

  return (
    <input
      type="text"
      value={localVal}
      onChange={(e) => setLocalVal(e.target.value)}
      onFocus={(e) => {
        setIsFocused(true);
        e.target.select();
      }}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      onPaste={onPaste}
      className="table-input"
      style={style}
    />
  );
};

// ============================================================================
// COMPOSANT PRINCIPAL
// ============================================================================
export default function MapTuning({
  availableSignals = ["RPM", "TPS", "MAP", "Lambda"],
  datasetId = "demo-dataset-123",
  currentData = null,
  onSave,
  onCalculate,
  onSignalsUpdated, // <-- Récupération de la prop
}: MapTuningProps) {
  // State: Configuration
  const [inputChannelX, setInputChannelX] = useState<string>(
    availableSignals.length > 0 ? availableSignals[0] : ""
  );
  const [inputChannelY, setInputChannelY] = useState<string>(
    availableSignals.length > 1 ? availableSignals[1] : availableSignals[0] || ""
  );
  const [outputChannelName, setOutputChannelName] = useState<string>("MapTuningOutput");

  // State: Grid
  const [numRows, setNumRows] = useState<number>(5);
  const [numCols, setNumCols] = useState<number>(5);
  const [gridData, setGridData] = useState<number[][]>(
    Array(5).fill(null).map(() => Array(5).fill(50.0))
  );
  const [rowHeaders, setRowHeaders] = useState<number[]>([20.0, 40.0, 60.0, 80.0, 100.0]);
  const [colHeaders, setColHeaders] = useState<number[]>([1000.0, 2000.0, 3000.0, 4000.0, 5000.0]);

  // State: UI feedback
  const [isSaving, setIsSaving] = useState(false);
  const [isCalculating, setIsCalculating] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Calcul min/max pour la heatmap
  const { minValue, maxValue } = useMemo(() => {
    const flat = gridData.flat();
    return {
      minValue: Math.min(...flat),
      maxValue: Math.max(...flat),
    };
  }, [gridData]);

  // Fonction utilitaire pour la couleur
  const getHeatmapColor = useCallback((value: number): string => {
    if (maxValue === minValue) return "rgba(100, 150, 255, 0.4)";
    const normalized = (value - minValue) / (maxValue - minValue);
    
    // Gradient s'adaptant au thème "Rouge/Sombre" de l'app
    if (normalized < 0.5) {
      const t = normalized * 2;
      const r = Math.round(100 + (255 - 100) * t);
      const g = Math.round(150 + (43 - 150) * t); // Vers le magenta
      const b = Math.round(255 + (79 - 255) * t);
      return `rgba(${r}, ${g}, ${b}, 0.5)`;
    } else {
      const t = (normalized - 0.5) * 2;
      const r = 255;
      const g = Math.round(43 + (180 - 43) * t); // Vers le jaune
      const b = Math.round(79 + (80 - 79) * t);
      return `rgba(${r}, ${g}, ${b}, 0.5)`;
    }
  }, [minValue, maxValue]);

  // ============================================================================
  // LOGIQUE DE MISE À JOUR & COPIER-COLLER EXCEL
  // ============================================================================
  const updateGridCell = useCallback((row: number, col: number, value: number) => {
    setGridData((prev) => {
      const newGrid = prev.map((r) => [...r]);
      newGrid[row][col] = value;
      return newGrid;
    });
  }, []);

  const updateRowHeader = useCallback((row: number, value: number) => {
    setRowHeaders((prev) => {
      const newHeaders = [...prev];
      newHeaders[row] = value;
      return newHeaders;
    });
  }, []);

  const updateColHeader = useCallback((col: number, value: number) => {
    setColHeaders((prev) => {
      const newHeaders = [...prev];
      newHeaders[col] = value;
      return newHeaders;
    });
  }, []);

  // Gestion du collage depuis Excel (TSV) dans la grille principale 2D
  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLInputElement>, startRow: number, startCol: number) => {
    e.preventDefault();
    const pasteData = e.clipboardData.getData("text");
    if (!pasteData) return;

    // Excel copie les données séparées par des tabulations (\t) et des retours à la ligne (\n)
    const rows = pasteData.split(/\r?\n/).map((row) => row.split("\t"));

    setGridData((prev) => {
      const newGrid = prev.map((r) => [...r]);
      let hasChanges = false;

      for (let i = 0; i < rows.length; i++) {
        if (startRow + i >= newGrid.length) break;
        
        for (let j = 0; j < rows[i].length; j++) {
          if (startCol + j >= newGrid[0].length) break;

          const cellString = rows[i][j].trim();
          if (cellString === "") continue;

          // Supporte les formats avec virgule ou point
          const val = parseFloat(cellString.replace(",", "."));
          if (!isNaN(val)) {
            newGrid[startRow + i][startCol + j] = val;
            hasChanges = true;
          }
        }
      }
      return hasChanges ? newGrid : prev;
    });
  }, []);

  // Gestion du collage depuis Excel dans les en-têtes de colonnes (1D)
  const handlePasteColHeaders = useCallback((e: React.ClipboardEvent<HTMLInputElement>, startCol: number) => {
    e.preventDefault();
    const pasteData = e.clipboardData.getData("text");
    if (!pasteData) return;

    // Aplatit les tabulations et sauts de ligne pour un collage 1D fluide
    const cells = pasteData.split(/[\t\n\r]+/).filter(val => val.trim() !== "");

    setColHeaders((prev) => {
      const newHeaders = [...prev];
      let hasChanges = false;

      for (let i = 0; i < cells.length; i++) {
        if (startCol + i >= newHeaders.length) break;
        const val = parseFloat(cells[i].replace(",", "."));
        if (!isNaN(val)) {
          newHeaders[startCol + i] = val;
          hasChanges = true;
        }
      }
      return hasChanges ? newHeaders : prev;
    });
  }, []);

  // Gestion du collage depuis Excel dans les en-têtes de lignes (1D)
  const handlePasteRowHeaders = useCallback((e: React.ClipboardEvent<HTMLInputElement>, startRow: number) => {
    e.preventDefault();
    const pasteData = e.clipboardData.getData("text");
    if (!pasteData) return;

    // Aplatit les tabulations et sauts de ligne pour un collage 1D fluide
    const cells = pasteData.split(/[\t\n\r]+/).filter(val => val.trim() !== "");

    setRowHeaders((prev) => {
      const newHeaders = [...prev];
      let hasChanges = false;

      for (let i = 0; i < cells.length; i++) {
        if (startRow + i >= newHeaders.length) break;
        const val = parseFloat(cells[i].replace(",", "."));
        if (!isNaN(val)) {
          newHeaders[startRow + i] = val;
          hasChanges = true;
        }
      }
      return hasChanges ? newHeaders : prev;
    });
  }, []);

  // ============================================================================
  // GESTION DU REDIMENSIONNEMENT
  // ============================================================================
  const handleRowsChange = (newRows: number) => {
    if (newRows < 2 || newRows > 50) return;
    setNumRows(newRows);
    if (newRows > gridData.length) {
      setGridData((prev) => [...prev, ...Array(newRows - prev.length).fill(null).map(() => Array(numCols).fill(50))]);
      setRowHeaders((prev) => [...prev, ...Array(newRows - prev.length).fill(null).map((_, i) => 100 + (i + 1) * 20)]);
    } else if (newRows < gridData.length) {
      setGridData((prev) => prev.slice(0, newRows));
      setRowHeaders((prev) => prev.slice(0, newRows));
    }
  };

  const handleColsChange = (newCols: number) => {
    if (newCols < 2 || newCols > 50) return;
    setNumCols(newCols);
    if (newCols > colHeaders.length) {
      setGridData((prev) => prev.map((row) => [...row, ...Array(newCols - row.length).fill(50)]));
      setColHeaders((prev) => [...prev, ...Array(newCols - prev.length).fill(null).map((_, i) => Math.max(...prev) + (i + 1) * 1000)]);
    } else if (newCols < colHeaders.length) {
      setGridData((prev) => prev.map((row) => row.slice(0, newCols)));
      setColHeaders((prev) => prev.slice(0, newCols));
    }
  };

  // ============================================================================
  // ACTIONS API
  // ============================================================================
  const handleSave = async () => {
    setIsSaving(true);
    setSaveMessage(null);
    const data: MapTuningData = { inputChannelX, inputChannelY, outputChannelName, gridData, rowHeaders, colHeaders };
    try {
      await saveMapTuning({ datasetId: datasetId!, ...data });
      setSaveMessage({ type: "success", text: `Map "${outputChannelName}" sauvegardée avec succès` });
      onSave?.(data);
    } catch (error) {
      setSaveMessage({ type: "error", text: `Erreur lors de la sauvegarde: ${error instanceof Error ? error.message : "Inconnue"}` });
    } finally {
      setIsSaving(false);
    }
  };

  const handleCalculate = async () => {
    if (!datasetId) return;
    setIsCalculating(true);
    setSaveMessage(null);
    const data: MapTuningData = { inputChannelX, inputChannelY, outputChannelName, gridData, rowHeaders, colHeaders };
    try {
      const result: any = await calculateMapTuning({ datasetId, ...data });
      setSaveMessage({ type: "success", text: `Cartographie calculée avec succès (${result.samplesProcessed} points)` });
      onCalculate?.(data);
      onSignalsUpdated?.(); // <-- On prévient le parent qu'il faut recharger la metadata
    } catch (error) {
      setSaveMessage({ type: "error", text: `Erreur lors du calcul: ${error instanceof Error ? error.message : "Inconnue"}` });
    } finally {
      setIsCalculating(false);
    }
  };

  // ============================================================================
  // RENDU
  // ============================================================================
  return (
    <div className="panel" style={{ height: "100%", overflow: "auto", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
      
      <div className="panel-header panel-header-tight">
        <h2>Tuning de Cartographie (Excel-like)</h2>
      </div>

      {saveMessage && (
        <div style={{
          padding: "0.75rem", borderRadius: "0.35rem",
          border: `1px solid ${saveMessage.type === "success" ? "var(--green)" : "var(--cyan)"}`,
          backgroundColor: saveMessage.type === "success" ? "rgba(255, 149, 164, 0.1)" : "rgba(255, 70, 93, 0.1)",
          color: saveMessage.type === "success" ? "var(--green)" : "var(--cyan)",
          fontSize: "0.85rem"
        }}>
          {saveMessage.text}
        </div>
      )}

      {/* Configuration */}
      <section className="map-tuning-section">
        <h3>Configuration des Channels</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem" }}>
          <div>
            <label className="field-label">Input X</label>
            <select className="mini-select" style={{ width: "100%" }} value={inputChannelX} onChange={(e) => setInputChannelX(e.target.value)}>
              {availableSignals.map((ch) => <option key={ch} value={ch}>{ch}</option>)}
            </select>
          </div>
          <div>
            <label className="field-label">Input Y</label>
            <select className="mini-select" style={{ width: "100%" }} value={inputChannelY} onChange={(e) => setInputChannelY(e.target.value)}>
              {availableSignals.map((ch) => <option key={ch} value={ch}>{ch}</option>)}
            </select>
          </div>
          <div>
            <label className="field-label">Nom du Channel Sortie</label>
            <input className="topbar-user-input" style={{ width: "100%", padding: "0.45rem" }} type="text" value={outputChannelName} onChange={(e) => setOutputChannelName(e.target.value)} />
          </div>
        </div>
      </section>

      {/* Contrôles de la grille */}
      <section className="map-tuning-section">
        <h3>Contrôle de la Grille</h3>
        <div className="map-tuning-grid-controls">
          <div style={{ display: "flex", gap: "1.5rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <label style={{ fontSize: "0.875rem", fontWeight: "600", color: "var(--fg-2)" }}>Lignes:</label>
              <button className="small-button" style={{ minWidth: "32px", padding: "0.2rem" }} onClick={() => handleRowsChange(numRows - 1)} disabled={numRows <= 2}>−</button>
              <span style={{ width: "2rem", textAlign: "center", fontWeight: "bold" }}>{numRows}</span>
              <button className="small-button" style={{ minWidth: "32px", padding: "0.2rem" }} onClick={() => handleRowsChange(numRows + 1)} disabled={numRows >= 50}>+</button>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <label style={{ fontSize: "0.875rem", fontWeight: "600", color: "var(--fg-2)" }}>Colonnes:</label>
              <button className="small-button" style={{ minWidth: "32px", padding: "0.2rem" }} onClick={() => handleColsChange(numCols - 1)} disabled={numCols <= 2}>−</button>
              <span style={{ width: "2rem", textAlign: "center", fontWeight: "bold" }}>{numCols}</span>
              <button className="small-button" style={{ minWidth: "32px", padding: "0.2rem" }} onClick={() => handleColsChange(numCols + 1)} disabled={numCols >= 50}>+</button>
            </div>
          </div>

          <div className="map-tuning-min-max">
            <span>Min: <strong style={{ color: "#10b981" }}>{minValue.toFixed(2)}</strong></span>
            <span>Max: <strong style={{ color: "var(--magenta)" }}>{maxValue.toFixed(2)}</strong></span>
          </div>
        </div>
      </section>

      {/* TABLEAU 2D (EXCEL-LIKE) */}
      <section className="map-tuning-section" style={{ flexGrow: 1, minHeight: 0, overflow: "auto" }}>
        <table className="map-tuning-table">
          <thead>
            <tr>
              <th style={{ position: "sticky", top: 0, zIndex: 10 }}>
                {inputChannelY} \ {inputChannelX}
              </th>
              {colHeaders.map((header, colIdx) => (
                <th key={`col-${colIdx}`} style={{ position: "sticky", top: 0, zIndex: 5 }}>
                  <NumberInput
                    value={header}
                    onChange={(val) => updateColHeader(colIdx, val)}
                    onPaste={(e) => handlePasteColHeaders(e, colIdx)}
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {gridData.map((row, rowIdx) => (
              <tr key={`row-${rowIdx}`}>
                {/* En-tête de ligne (Input Y) */}
                <td style={{ position: "sticky", left: 0, backgroundColor: "var(--bg-3)", zIndex: 2 }}>
                  <NumberInput
                    value={rowHeaders[rowIdx]}
                    onChange={(val) => updateRowHeader(rowIdx, val)}
                    onPaste={(e) => handlePasteRowHeaders(e, rowIdx)}
                  />
                </td>

                {/* Cellules de données */}
                {row.map((value, colIdx) => (
                  <td
                    key={`cell-${rowIdx}-${colIdx}`}
                    className="map-tuning-heatmap-cell"
                    style={{ backgroundColor: getHeatmapColor(value) }}
                  >
                    <NumberInput
                      value={value}
                      onChange={(val) => updateGridCell(rowIdx, colIdx, val)}
                      onPaste={(e) => handlePaste(e, rowIdx, colIdx)}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Légende Heatmap */}
      <div className="map-tuning-legend" style={{ marginTop: "auto", marginBottom: "1rem" }}>
        <strong>Heatmap :</strong>
        <div className="map-tuning-legend-item">
          <div className="map-tuning-legend-color" style={{ background: "rgba(100, 150, 255, 0.5)" }}></div>
          <span>Min</span>
        </div>
        <div className="map-tuning-legend-item">
          <div className="map-tuning-legend-color" style={{ background: "rgba(255, 43, 79, 0.5)" }}></div>
          <span>Mid</span>
        </div>
        <div className="map-tuning-legend-item">
          <div className="map-tuning-legend-color" style={{ background: "rgba(255, 180, 80, 0.5)" }}></div>
          <span>Max</span>
        </div>
        <span style={{ marginLeft: "auto", color: "var(--fg-2)", fontStyle: "italic" }}>
          Astuce: Sélectionnez une cellule ou un en-tête, puis "Ctrl+V" pour coller depuis Excel.
        </span>
      </div>

      {/* Actions */}
      <section style={{ display: "flex", gap: "1rem", justifyContent: "flex-end" }}>
        <button className="small-button" style={{ borderColor: "#10b981", color: "#10b981" }} onClick={handleSave} disabled={isSaving}>
          {isSaving ? "⏳ Sauvegarde..." : "💾 Sauvegarder"}
        </button>
        <button className="small-button" onClick={handleCalculate} disabled={isCalculating || !datasetId}>
          {isCalculating ? "⏳ Calcul..." : "🔄 Calculer"}
        </button>
      </section>
    </div>
  );
}