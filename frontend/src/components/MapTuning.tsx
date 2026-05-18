import React, { useState, useMemo, useEffect, useCallback } from "react";
import { calculateMapTuning } from "../api";
import { ConfigManager } from "../store/ConfigManager";
import { useHoverToLutCell } from "../hooks/useHoverToLutCell";

// ============================================================================
// TYPES
// ============================================================================
import { MapTuningData } from "../types";

interface MapTuningProps {
  availableSignals?: string[];
  datasetId?: string | null;
  onSave?: (data: MapTuningData) => void;
  onCalculate?: (data: MapTuningData) => void;
  onSignalsUpdated?: () => void;
}

// ============================================================================
// COMPOSANT INPUT SUR-MESURE
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

  useEffect(() => {
    if (!isFocused) {
      setLocalVal(String(value));
    }
  }, [value, isFocused]);

  const handleBlur = () => {
    setIsFocused(false);
    const parsed = parseFloat(localVal.replace(",", "."));
    if (!isNaN(parsed)) {
      onChange(parsed);
      setLocalVal(String(parsed));
    } else {
      setLocalVal(String(value));
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") e.currentTarget.blur();
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
  onSave,
  onCalculate,
  onSignalsUpdated,
}: MapTuningProps) {
  // State: Configuration
  const [inputChannelX, setInputChannelX] = useState<string>(availableSignals[0] || "");
  const [inputChannelY, setInputChannelY] = useState<string>(availableSignals[1] || availableSignals[0] || "");
  const [outputChannelName, setOutputChannelName] = useState<string>("Ma_Nouvelle_Map");
  const [braking_signal, setBraking_signal] = useState<boolean>(false);

  // State: Grid
  const [numRows, setNumRows] = useState<number>(5);
  const [numCols, setNumCols] = useState<number>(5);
  const [gainVal, setGainVal] = useState<number>(1);
  const [offsetVal, setOffsetVal] = useState<number>(0);
  const [gridData, setGridData] = useState<number[][]>(
    Array(5).fill(null).map(() => Array(5).fill(50.0))
  );
  const [rowHeaders, setRowHeaders] = useState<number[]>([20.0, 40.0, 60.0, 80.0, 100.0]);
  const [colHeaders, setColHeaders] = useState<number[]>([1000.0, 2000.0, 3000.0, 4000.0, 5000.0]);

  // State: UI feedback
  const [isSaving, setIsSaving] = useState(false);
  const [isCalculating, setIsCalculating] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [savedConfigs, setSavedConfigs] = useState<string[]>([]);
  const [showConfigMenu, setShowConfigMenu] = useState(false);

  // Calcul min/max pour la heatmap
  const { minValue, maxValue } = useMemo(() => {
    const flat = gridData.flat();
    return {
      minValue: Math.min(...flat),
      maxValue: Math.max(...flat),
    };
  }, [gridData]);

  // Highlight de la cellule LUT correspondant au sLap survolé dans SignalWorkspace
  const highlightInfo = useHoverToLutCell({
    datasetId,
    inputChannelX,
    inputChannelY,
    rowHeaders,
    colHeaders,
  });

  // Charger les noms de configs au montage
  useEffect(() => {
    const configs = ConfigManager.get<Record<string, MapTuningData>>("map-configs") ?? {};
    setSavedConfigs(Object.keys(configs));
    // Charger la dernière config chargée au montage
    const lastConfig = ConfigManager.get<string | null>("current-map-config");
    handleLoadConfig(lastConfig ? lastConfig : "");
  }, []);


  // Dégradé Vert -> Orange -> Rouge
  const getHeatmapColor = useCallback((value: number): string => {
    if (maxValue === minValue) return "rgba(34, 197, 94, 0.2)";
    const normalized = (value - minValue) / (maxValue - minValue);
    
    if (normalized < 0.5) {
      // Vert vers Orange
      const t = normalized * 2;
      const r = Math.round(34 + (249 - 34) * t);
      const g = Math.round(197 + (115 - 197) * t);
      const b = Math.round(94 + (22 - 94) * t);
      return `rgba(${r}, ${g}, ${b}, 0.5)`;
    } else {
      // Orange vers Rouge
      const t = (normalized - 0.5) * 2;
      const r = Math.round(249 + (239 - 249) * t);
      const g = Math.round(115 + (68 - 115) * t);
      const b = Math.round(22 + (68 - 22) * t);
      return `rgba(${r}, ${g}, ${b}, 0.5)`;
    }
  }, [minValue, maxValue]);

  const updateGridCell = (row: number, col: number, value: number) => {
    setGridData((prev) => {
      const newGrid = prev.map((r) => [...r]);
      newGrid[row][col] = value;
      return newGrid;
    });
  };

  // ============================================================================
  // LOGIQUE DE COPIER-COLLER EXCEL
  // ============================================================================

  const handlePaste = useCallback((e: React.ClipboardEvent, startRow: number, startCol: number) => {
    e.preventDefault();
    const pasteData = e.clipboardData.getData("text");
    if (!pasteData) return;
    const rows = pasteData.split(/\r?\n/).map((row) => row.split("\t"));
    setGridData((prev) => {
      const newGrid = prev.map(r => [...r]);
      rows.forEach((row, i) => {
        if (startRow + i < newGrid.length) {
          row.forEach((cell, j) => {
            if (startCol + j < newGrid[0].length) {
              const val = parseFloat(cell.replace(",", "."));
              if (!isNaN(val)) newGrid[startRow + i][startCol + j] = val;
            }
          });
        }
      });
      return newGrid;
    });
  }, []);

  const handlePasteColHeaders = useCallback((e: React.ClipboardEvent, startCol: number) => {
    e.preventDefault();
    const pasteData = e.clipboardData.getData("text");
    if (!pasteData) return;
    const cells = pasteData.split(/[\t\n\r]+/).filter(val => val.trim() !== "");

    setColHeaders((prev) => {
      const newHeaders = [...prev];
      cells.forEach((cell, i) => {
        if (startCol + i < newHeaders.length) {
          const val = parseFloat(cell.replace(",", "."));
          if (!isNaN(val)) newHeaders[startCol + i] = val;
        }
      });
      return newHeaders;
    });
  }, []);

  const handlePasteRowHeaders = useCallback((e: React.ClipboardEvent, startRow: number) => {
    e.preventDefault();
    const pasteData = e.clipboardData.getData("text");
    if (!pasteData) return;
    const cells = pasteData.split(/[\t\n\r]+/).filter(val => val.trim() !== "");

    setRowHeaders((prev) => {
      const newHeaders = [...prev];
      cells.forEach((cell, i) => {
        if (startRow + i < newHeaders.length) {
          const val = parseFloat(cell.replace(",", "."));
          if (!isNaN(val)) newHeaders[startRow + i] = val;
        }
      });
      return newHeaders;
    });
  }, []);

  // ============================================================================
  // GESTION DU REDIMENSIONNEMENT
  // ============================================================================

  const handleRowsChange = (newRows: number) => {
    if (newRows < 1 || newRows > 50) return;
    setNumRows(newRows);
    if (newRows > gridData.length) {
      setGridData(p => [...p, ...Array(newRows - p.length).fill(null).map(() => Array(numCols).fill(50))]);
      setRowHeaders(p => [...p, ...Array(newRows - p.length).fill(0).map((_, i) => (p[p.length - 1] || 0) + (i + 1) * 20)]);
    } else {
      setGridData(p => p.slice(0, newRows));
      setRowHeaders(p => p.slice(0, newRows));
    }
  };

  const handleColsChange = (newCols: number) => {
    if (newCols < 1 || newCols > 50) return;
    setNumCols(newCols);
    if (newCols > colHeaders.length) {
      setGridData(p => p.map(row => [...row, ...Array(newCols - row.length).fill(50)]));
      setColHeaders(p => [...p, ...Array(newCols - p.length).fill(0).map((_, i) => (p[p.length - 1] || 0) + (i + 1) * 1000)]);
    } else {
      setGridData(p => p.map(row => row.slice(0, newCols)));
      setColHeaders(p => p.slice(0, newCols));
    }
  };

  const handleGainChange = (newGain: number) => {
    if (newGain < -50 || newGain > 50) return;
    setGainVal(newGain);
  };

  const handleOffsetChange = (newOffset: number) => {
    if (newOffset < -50 || newOffset > 50) return;
    setOffsetVal(newOffset);
  };

  // ============================================================================
  // ACTIONS (API & LOCALSTORAGE)
  // ============================================================================
  
  const handleSave = () => {
    setIsSaving(true);
    const data: MapTuningData = { 
      inputChannelX, 
      inputChannelY, 
      outputChannelName, 
      gridData, 
      rowHeaders, 
      colHeaders,
      braking_signal,
      gainVal,
      offsetVal
    };
    try {
      // Save to ConfigManager (persists to localStorage with cross-tab sync)
      const existingConfigs = ConfigManager.get<Record<string, MapTuningData>>("map-configs") ?? {};
      ConfigManager.set("map-configs", {
        ...existingConfigs,
        [outputChannelName]: data,
      });
      const configs = ConfigManager.get<Record<string, MapTuningData>>("map-configs") ?? {};
      setSavedConfigs(Object.keys(configs));
      setSaveMessage({ type: "success", text: `Configuration "${outputChannelName}" sauvegardée.` });
      onSave?.(data);
      // Reload signals in all tabs when config is saved
      onSignalsUpdated?.();
    } catch (e) {
      setSaveMessage({ type: "error", text: "Erreur lors de la sauvegarde." });
    } finally {
      setIsSaving(false);
    }
  };

  const handleCalculate = async () => {
    if (!datasetId) return;
    setIsCalculating(true);
    setSaveMessage(null);
    const data: MapTuningData = { 
      inputChannelX, 
      inputChannelY, 
      outputChannelName, 
      gridData, 
      rowHeaders, 
      colHeaders,
      braking_signal,
      gainVal,
      offsetVal
    };
    try {
      const result: any = await calculateMapTuning({ datasetId, ...data });
      // Update ConfigManager for cross-tab sync
      const existingConfigs = ConfigManager.get<Record<string, MapTuningData>>("map-configs") ?? {};
      ConfigManager.set("map-configs", {
        ...existingConfigs,
        [outputChannelName]: data,
      });
      setSaveMessage({ 
        type: "success", 
        text: `Calcul terminé avec succès (${result.samplesProcessed} points).` 
      });
      onCalculate?.(data);
      // Recalculer tous les maths channels une fois le channel de cartographie calculé
      onSignalsUpdated?.();
    } catch (error) {
      setSaveMessage({ 
        type: "error", 
        text: `Erreur lors du calcul: ${error instanceof Error ? error.message : "Inconnue"}` 
      });
    } finally {
      setIsCalculating(false);
    }
  };

  const handleLoadConfig = (name: string) => {
    const configs = ConfigManager.get<Record<string, MapTuningData>>("map-configs") ?? {};
    ConfigManager.set("current-map-config", name);
    const config = configs[name];
    if (config) {
      setInputChannelX(config.inputChannelX);
      setInputChannelY(config.inputChannelY);
      setOutputChannelName(config.outputChannelName);
      setGridData(config.gridData);
      setRowHeaders(config.rowHeaders);
      setColHeaders(config.colHeaders);
      setNumRows(config.rowHeaders.length);
      setNumCols(config.colHeaders.length);
      setBraking_signal(config.braking_signal || false);
      setGainVal(config.gainVal ?? 1);
      setOffsetVal(config.offsetVal ?? 0);
      setShowConfigMenu(false);
      setSaveMessage({ type: "success", text: `Configuration "${name}" chargée.` });
    }
  };

  const handleDeleteConfig = (e: React.MouseEvent, name: string) => {
    e.stopPropagation();
    const configs = ConfigManager.get<Record<string, MapTuningData>>("map-configs") ?? {};
    delete configs[name];
    ConfigManager.set("map-configs", configs);
    setSavedConfigs(Object.keys(ConfigManager.get<Record<string, MapTuningData>>("map-configs") ?? {}));
  };

  return (
    <div className="panel" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      
      <div className="panel-header panel-header-tight">
        <h2>Tuning de Cartographie</h2>
        <div className="panel-badge">{outputChannelName}</div>
      </div>

      {saveMessage && (
        <div style={{
          padding: "0.5rem",
          fontSize: "0.75rem",
          border: `1px solid ${saveMessage.type === "success" ? "var(--green)" : "var(--magenta)"}`,
          background: saveMessage.type === "success" ? "rgba(255, 149, 164, 0.1)" : "rgba(255, 43, 79, 0.1)",
          color: saveMessage.type === "success" ? "var(--green)" : "var(--magenta)"
        }}>
          {saveMessage.text}
        </div>
      )}

      {/* Configuration des Channels */}
      <section className="map-tuning-section">
        <h3>Configuration des Channels</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem" }}>
          <div>
            <label className="field-label">Entrée X (Colonnes)</label>
            <select className="mini-select" style={{ width: "100%" }} value={inputChannelX} onChange={(e) => setInputChannelX(e.target.value)}>
              {availableSignals.map((ch) => <option key={ch} value={ch}>{ch}</option>)}
            </select>
          </div>
          <div>
            <label className="field-label">Entrée Y (Lignes)</label>
            <select className="mini-select" style={{ width: "100%" }} value={inputChannelY} onChange={(e) => setInputChannelY(e.target.value)}>
              {availableSignals.map((ch) => <option key={ch} value={ch}>{ch}</option>)}
            </select>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <div>
              <label className="field-label">Nom de Sortie</label>
              <input className="topbar-user-input" style={{ width: "100%" }} type="text" value={outputChannelName} onChange={(e) => setOutputChannelName(e.target.value)} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <input 
                type="checkbox" 
                id="isBrakeSignal" 
                checked={braking_signal} 
                onChange={(e) => setBraking_signal(e.target.checked)} 
                style={{ cursor: "pointer", accentColor: "var(--cyan)" }}
              />
              <label htmlFor="isBrakeSignal" className="field-label" style={{ margin: 0, cursor: "pointer" }}>
                Signal lié au frein ?
              </label>
            </div>
          </div>
        </div>
      </section>

      {/* Bibliothèque Locale */}
      <section className="map-tuning-section" style={{ position: "relative" }}>
        <h3>Bibliothèque de Sauvegardes (LocalStorage)</h3>
        <button 
          className="small-button" 
          style={{ width: "100%" }} 
          onClick={() => setShowConfigMenu(!showConfigMenu)}
        >
          📂 {savedConfigs.length} configuration(s) stockée(s) localement
        </button>
        
        {showConfigMenu && (
          <div style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            background: "var(--bg-3)",
            border: "1px solid var(--line)",
            zIndex: 100,
            maxHeight: "200px",
            overflowY: "auto",
            marginTop: "2px"
          }}>
            {savedConfigs.length === 0 ? (
              <div style={{ padding: "1rem", textAlign: "center", fontSize: "0.8rem", color: "var(--fg-2)" }}>Aucune sauvegarde</div>
            ) : (
              savedConfigs.map(name => (
                <div 
                  key={name} 
                  onClick={() => handleLoadConfig(name)}
                  style={{ 
                    padding: "0.5rem", 
                    cursor: "pointer", 
                    display: "flex", 
                    justifyContent: "space-between", 
                    borderBottom: "1px solid var(--line)",
                    fontSize: "0.8rem"
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255, 70, 93, 0.15)"}
                  onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                >
                  <span>{name}</span>
                  <button 
                    onClick={(e) => handleDeleteConfig(e, name)}
                    style={{ background: "none", border: "none", color: "var(--magenta)", cursor: "pointer" }}
                  >✕</button>
                </div>
              ))
            )}
          </div>
        )}
      </section>

      {/* Contrôles Grille */}
      <section className="map-tuning-section">
        <div className="map-tuning-grid-controls">
          <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
            <span className="field-label" style={{ margin: 0 }}>Lignes:</span>
            <button className="small-button" onClick={() => handleRowsChange(numRows - 1)}>−</button>
            <span style={{ minWidth: "20px", textAlign: "center" }}>{numRows}</span>
            <button className="small-button" onClick={() => handleRowsChange(numRows + 1)}>+</button>
          </div>
          <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
            <span className="field-label" style={{ margin: 0 }}>Colonnes:</span>
            <button className="small-button" onClick={() => handleColsChange(numCols - 1)}>−</button>
            <span style={{ minWidth: "20px", textAlign: "center" }}>{numCols}</span>
            <button className="small-button" onClick={() => handleColsChange(numCols + 1)}>+</button>
          </div>
          <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
            <span className="field-label" style={{ margin: 0 }}>Gain:</span>
            <button className="small-button" onClick={() => handleGainChange(gainVal - 1)}>−</button>
            <span style={{ minWidth: "20px", textAlign: "center" }}>{gainVal}</span>
            <button className="small-button" onClick={() => handleGainChange(gainVal + 1)}>+</button>
          </div>
          <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
            <span className="field-label" style={{ margin: 0 }}>Offset:</span>
            <button className="small-button" onClick={() => handleOffsetChange(offsetVal - 1)}>−</button>
            <span style={{ minWidth: "20px", textAlign: "center" }}>{offsetVal}</span>
            <button className="small-button" onClick={() => handleOffsetChange(offsetVal + 1)}>+</button>
          </div>
          <div className="map-tuning-min-max">
            <span>Min: <strong style={{ color: "#22c55e" }}>{minValue.toFixed(2)}</strong></span>
            <span>Max: <strong style={{ color: "#ef4444" }}>{maxValue.toFixed(2)}</strong></span>
          </div>
        </div>
      </section>

      {/* Table de Tuning */}
      <section style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
        <table className="map-tuning-table">
          <thead>
            <tr>
              <th style={{ position: "sticky", top: 0, left: 0, zIndex: 10 }}>{inputChannelX} \ {inputChannelY}</th>
              {colHeaders.map((h, i) => (
                <th key={i} style={{ position: "sticky", top: 0, zIndex: 5 }}>
                  <NumberInput 
                    value={h} 
                    onChange={val => {
                      const newH = [...colHeaders]; newH[i] = val; setColHeaders(newH);
                    }} 
                    onPaste={(e) => handlePasteColHeaders(e, i)}
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {gridData.map((row, rIdx) => (
              <tr key={rIdx}>
                <td style={{ position: "sticky", left: 0, background: "var(--bg-3)", zIndex: 2 }}>
                  <NumberInput 
                    value={rowHeaders[rIdx]} 
                    onChange={val => {
                      const newH = [...rowHeaders]; newH[rIdx] = val; setRowHeaders(newH);
                    }} 
                    onPaste={(e) => handlePasteRowHeaders(e, rIdx)}
                  />
                </td>
                {row.map((val, cIdx) => {
                  const isExact =
                    highlightInfo?.exact?.row === rIdx &&
                    highlightInfo?.exact?.col === cIdx;
                  const isNearest =
                    !isExact &&
                    (highlightInfo?.nearest?.some(
                      (c) => c.row === rIdx && c.col === cIdx
                    ) ?? false);
                  return (
                    <td
                      key={cIdx}
                      className={[
                        "map-tuning-heatmap-cell",
                        isExact ? "lut-cell-active" : "",
                        isNearest ? "lut-cell-nearby" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      style={{ backgroundColor: getHeatmapColor(val) }}
                    >
                      <NumberInput
                        value={val}
                        onChange={v => updateGridCell(rIdx, cIdx, v)}
                        onPaste={e => handlePaste(e, rIdx, cIdx)}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Légende et Actions */}
      <footer style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: "1rem" }}>
        <div className="map-tuning-legend">
          <span>Légende Heatmap :</span>
          <div className="map-tuning-legend-item">
            <div className="map-tuning-legend-color" style={{ background: "rgba(34, 197, 94, 0.5)" }}></div>
            <span>Min</span>
          </div>
          <div className="map-tuning-legend-item">
            <div className="map-tuning-legend-color" style={{ background: "rgba(249, 115, 22, 0.5)" }}></div>
            <span>Mid</span>
          </div>
          <div className="map-tuning-legend-item">
            <div className="map-tuning-legend-color" style={{ background: "rgba(239, 68, 68, 0.5)" }}></div>
            <span>Max</span>
          </div>
          <span style={{ marginLeft: "auto", fontStyle: "italic", fontSize: "0.7rem" }}>Astuce: Ctrl+V pour coller depuis Excel sur une cellule ou un en-tête.</span>
        </div>

        <div style={{ display: "flex", gap: "1rem", justifyContent: "flex-end" }}>
          <button className="small-button" onClick={handleSave} disabled={isSaving || isCalculating}>
            {isSaving ? "⏳ En cours..." : "💾 Sauvegarder"}
          </button>
          <button 
            className="small-button" 
            style={{ borderColor: "var(--cyan)", background: "rgba(255, 70, 93, 0.3)" }} 
            onClick={handleCalculate} 
            disabled={isCalculating || !datasetId}
          >
            {isCalculating ? "⏳ Calcul..." : "🔄 Calculer"}
          </button>
        </div>
      </footer>
    </div>
  );
}