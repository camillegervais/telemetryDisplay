import { useState, useMemo } from "react";

interface MapTuningProps {
  availableSignals?: string[];
  datasetId?: string | null;
  onSave?: (data: {
    inputChannelX: string;
    inputChannelY: string;
    outputChannelName: string;
    gridData: number[][];
    rowHeaders: number[];
    colHeaders: number[];
  }) => void;
  onCalculate?: (data: {
    inputChannelX: string;
    inputChannelY: string;
    outputChannelName: string;
    gridData: number[][];
    rowHeaders: number[];
    colHeaders: number[];
  }) => void;
}

export default function MapTuning({
  availableSignals = [],
  datasetId = null,
  onSave,
  onCalculate,
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
    Array(5)
      .fill(null)
      .map(() => Array(5).fill(50.0))
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

  // Fonction pour calculer la couleur (bleu → rouge)
  const getHeatmapColor = (value: number): string => {
    if (maxValue === minValue) {
      return "rgba(100, 150, 255, 0.5)"; // Bleu par défaut si pas de variation
    }

    const normalized = (value - minValue) / (maxValue - minValue);

    // Gradient: bleu (0) → violet → rouge (1)
    if (normalized < 0.5) {
      const t = normalized * 2; // 0 à 1 pour la première moitié
      const r = Math.round(100 + (255 - 100) * t);
      const g = Math.round(150 + (100 - 150) * t);
      const b = Math.round(255 + (0 - 255) * t);
      return `rgba(${r}, ${g}, ${b}, 0.5)`;
    } else {
      const t = (normalized - 0.5) * 2; // 0 à 1 pour la deuxième moitié
      const r = Math.round(255);
      const g = Math.round(100 - 100 * t);
      const b = Math.round(0);
      return `rgba(${r}, ${g}, ${b}, 0.5)`;
    }
  };

  // Mise à jour de la cellule de données
  const updateGridCell = (row: number, col: number, value: number) => {
    const newGrid = gridData.map((r) => [...r]);
    newGrid[row][col] = value;
    setGridData(newGrid);
  };

  // Mise à jour du header de ligne
  const updateRowHeader = (row: number, value: number) => {
    const newHeaders = [...rowHeaders];
    newHeaders[row] = value;
    setRowHeaders(newHeaders);
  };

  // Mise à jour du header de colonne
  const updateColHeader = (col: number, value: number) => {
    const newHeaders = [...colHeaders];
    newHeaders[col] = value;
    setColHeaders(newHeaders);
  };

  // Modifier le nombre de lignes
  const handleRowsChange = (newRows: number) => {
    if (newRows < 2 || newRows > 10) return;

    setNumRows(newRows);

    // Adapter la grille
    if (newRows > gridData.length) {
      // Ajouter des lignes
      const newGrid = [
        ...gridData,
        ...Array(newRows - gridData.length)
          .fill(null)
          .map(() => Array(numCols).fill(50)),
      ];
      setGridData(newGrid);

      // Ajouter des headers
      const newRowHeaders = [
        ...rowHeaders,
        ...Array(newRows - rowHeaders.length)
          .fill(null)
          .map((_, i) => 100 + (i + 1) * 20),
      ];
      setRowHeaders(newRowHeaders);
    } else if (newRows < gridData.length) {
      // Supprimer des lignes
      setGridData(gridData.slice(0, newRows));
      setRowHeaders(rowHeaders.slice(0, newRows));
    }
  };

  // Modifier le nombre de colonnes
  const handleColsChange = (newCols: number) => {
    if (newCols < 2 || newCols > 10) return;

    setNumCols(newCols);

    // Adapter la grille
    if (newCols > colHeaders.length) {
      // Ajouter des colonnes
      const newGrid = gridData.map((row) => [
        ...row,
        ...Array(newCols - row.length).fill(50),
      ]);
      setGridData(newGrid);

      // Ajouter des headers
      const newColHeaders = [
        ...colHeaders,
        ...Array(newCols - colHeaders.length)
          .fill(null)
          .map((_, i) => Math.max(...colHeaders) + (i + 1) * 1000),
      ];
      setColHeaders(newColHeaders);
    } else if (newCols < colHeaders.length) {
      // Supprimer des colonnes
      const newGrid = gridData.map((row) => row.slice(0, newCols));
      setGridData(newGrid);
      setColHeaders(colHeaders.slice(0, newCols));
    }
  };

  // Handler Save
  const handleSave = async () => {
    setIsSaving(true);
    setSaveMessage(null);

    const data = {
      inputChannelX,
      inputChannelY,
      outputChannelName,
      gridData,
      rowHeaders,
      colHeaders,
    };

    try {
      // Appel API pour sauvegarder la cartographie
      const response = await fetch("/api/map-tuning/save", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          datasetId,
          ...data,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const result = await response.json();
      console.log("📊 Map Tuning - Save successful:", result);
      setSaveMessage({
        type: "success",
        text: `Map "${outputChannelName}" sauvegardée avec succès`,
      });
      onSave?.(data);
    } catch (error) {
      console.error("❌ Map Tuning - Save error:", error);
      setSaveMessage({
        type: "error",
        text: `Erreur lors de la sauvegarde: ${error instanceof Error ? error.message : "Erreur inconnue"}`,
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Handler Calculate
  const handleCalculate = async () => {
    if (!datasetId) {
      setSaveMessage({ type: "error", text: "Aucun dataset chargé" });
      return;
    }

    setIsCalculating(true);
    setSaveMessage(null);

    const data = {
      inputChannelX,
      inputChannelY,
      outputChannelName,
      gridData,
      rowHeaders,
      colHeaders,
    };

    try {
      // Appel API pour calculer la sortie
      const response = await fetch("/api/map-tuning/calculate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          datasetId,
          ...data,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const result = await response.json();
      console.log("🔄 Map Tuning - Calculate successful:", result);
      setSaveMessage({
        type: "success",
        text: `Cartographie calculée avec succès (${result.samplesProcessed || 0} points)`,
      });
      onCalculate?.(data);
    } catch (error) {
      console.error("❌ Map Tuning - Calculate error:", error);
      setSaveMessage({
        type: "error",
        text: `Erreur lors du calcul: ${error instanceof Error ? error.message : "Erreur inconnue"}`,
      });
    } finally {
      setIsCalculating(false);
    }
  };

  return (
    <div className="panel" style={{ maxHeight: "100%", overflow: "auto", padding: "1rem" }}>
      <h2 style={{ fontSize: "1.5rem", fontWeight: "bold", marginBottom: "1.5rem" }}>
        Tuning de Cartographie (Lookup Table 2D)
      </h2>

      {/* Feedback Message */}
      {saveMessage && (
        <div
          style={{
            marginBottom: "1rem",
            padding: "0.75rem",
            borderRadius: "0.35rem",
            border: `1px solid ${saveMessage.type === "success" ? "#34d399" : "#ff2d4f"}`,
            backgroundColor:
              saveMessage.type === "success"
                ? "rgba(52, 211, 153, 0.1)"
                : "rgba(255, 45, 79, 0.1)",
            color: saveMessage.type === "success" ? "#34d399" : "#ff2d4f",
            fontSize: "0.875rem",
          }}
        >
          {saveMessage.text}
        </div>
      )}

      {/* ===== SECTION 1: Configuration des Channels ===== */}
      <section className="meta-grid" style={{ marginBottom: "1.5rem" }}>
        <h3 style={{ fontSize: "1rem", fontWeight: "600", marginBottom: "1rem" }}>
          Configuration des Channels
        </h3>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem" }}>
          {/* Input Channel X */}
          <div>
            <label className="field-label">Input X</label>
            <select
              value={inputChannelX}
              onChange={(e) => setInputChannelX(e.target.value)}
              className="mini-select"
              style={{ width: "100%" }}
            >
              {availableSignals.map((ch) => (
                <option key={ch} value={ch}>
                  {ch}
                </option>
              ))}
            </select>
          </div>

          {/* Input Channel Y */}
          <div>
            <label className="field-label">Input Y</label>
            <select
              value={inputChannelY}
              onChange={(e) => setInputChannelY(e.target.value)}
              className="mini-select"
              style={{ width: "100%" }}
            >
              {availableSignals.map((ch) => (
                <option key={ch} value={ch}>
                  {ch}
                </option>
              ))}
            </select>
          </div>

          {/* Output Channel Name */}
          <div>
            <label className="field-label">Nom du Channel de Sortie</label>
            <input
              type="text"
              value={outputChannelName}
              onChange={(e) => setOutputChannelName(e.target.value)}
              placeholder="e.g., MapOutput"
              className="topbar-user-input"
              style={{ width: "100%", padding: "0.45rem" }}
            />
          </div>
        </div>
      </section>

      {/* ===== SECTION 2: Contrôle de la Grille ===== */}
      <section style={{ marginBottom: "1.5rem" }}>
        <h3 style={{ fontSize: "1rem", fontWeight: "600", marginBottom: "1rem" }}>Contrôle de la Grille</h3>

        <div style={{ display: "flex", gap: "2rem", flexWrap: "wrap", alignItems: "center" }}>
          {/* Rows Control */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <label style={{ fontSize: "0.875rem", fontWeight: "500" }}>Lignes:</label>
            <button
              onClick={() => handleRowsChange(numRows - 1)}
              className="small-button"
              disabled={numRows <= 2}
            >
              −
            </button>
            <span style={{ width: "2rem", textAlign: "center", fontWeight: "600" }}>{numRows}</span>
            <button onClick={() => handleRowsChange(numRows + 1)} className="small-button" disabled={numRows >= 10}>
              +
            </button>
          </div>

          {/* Cols Control */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <label style={{ fontSize: "0.875rem", fontWeight: "500" }}>Colonnes:</label>
            <button
              onClick={() => handleColsChange(numCols - 1)}
              className="small-button"
              disabled={numCols <= 2}
            >
              −
            </button>
            <span style={{ width: "2rem", textAlign: "center", fontWeight: "600" }}>{numCols}</span>
            <button onClick={() => handleColsChange(numCols + 1)} className="small-button" disabled={numCols >= 10}>
              +
            </button>
          </div>

          {/* Display Min/Max */}
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "1rem", fontSize: "0.875rem" }}>
            <span>
              Min: <span style={{ fontWeight: "600", color: "#00a8ff" }}>{minValue.toFixed(2)}</span>
            </span>
            <span>
              Max: <span style={{ fontWeight: "600", color: "#ff2d4f" }}>{maxValue.toFixed(2)}</span>
            </span>
          </div>
        </div>
      </section>

      {/* ===== SECTION 3: Grille 2D (Lookup Table) ===== */}
      <section style={{ marginBottom: "1.5rem", overflowX: "auto" }}>
        <h3 style={{ fontSize: "1rem", fontWeight: "600", marginBottom: "1rem" }}>Grille 2D (Lookup Table)</h3>

        <div style={{ display: "inline-block" }}>
          <table
            style={{
              borderCollapse: "collapse",
              border: "1px solid #4d1b24",
              backgroundColor: "rgba(20, 6, 7, 0.5)",
            }}
          >
            {/* Header Row: Col Headers */}
            <thead>
              <tr>
                <th
                  style={{
                    width: "4rem",
                    height: "3rem",
                    border: "1px solid #4d1b24",
                    backgroundColor: "rgba(20, 6, 7, 0.8)",
                    fontSize: "0.65rem",
                    fontWeight: "600",
                    padding: "0.25rem",
                    color: "#b8a1a6",
                  }}
                >
                  {inputChannelY} / {inputChannelX}
                </th>
                {colHeaders.map((header, colIdx) => (
                  <th
                    key={`col-header-${colIdx}`}
                    style={{
                      width: "3.5rem",
                      height: "3rem",
                      border: "1px solid #4d1b24",
                      backgroundColor: "rgba(20, 6, 7, 0.8)",
                      padding: "0.25rem",
                      fontSize: "0.65rem",
                    }}
                  >
                    <input
                      type="number"
                      step="0.01"
                      value={header}
                      onChange={(e) => updateColHeader(colIdx, parseFloat(e.target.value) || 0)}
                      style={{
                        width: "100%",
                        height: "2rem",
                        backgroundColor: "rgba(77, 27, 36, 0.6)",
                        border: "1px solid #4d1b24",
                        borderRadius: "0.2rem",
                        color: "#f4e8ea",
                        textAlign: "center",
                        fontSize: "0.65rem",
                        padding: "0.2rem",
                      }}
                    />
                  </th>
                ))}
              </tr>
            </thead>

            {/* Data Rows */}
            <tbody>
              {gridData.map((row, rowIdx) => (
                <tr key={`row-${rowIdx}`}>
                  {/* Row Header */}
                  <td
                    style={{
                      width: "4rem",
                      height: "2.5rem",
                      border: "1px solid #4d1b24",
                      backgroundColor: "rgba(20, 6, 7, 0.8)",
                      padding: "0.25rem",
                      fontSize: "0.65rem",
                    }}
                  >
                    <input
                      type="number"
                      step="0.01"
                      value={rowHeaders[rowIdx]}
                      onChange={(e) => updateRowHeader(rowIdx, parseFloat(e.target.value) || 0)}
                      style={{
                        width: "100%",
                        height: "2rem",
                        backgroundColor: "rgba(77, 27, 36, 0.6)",
                        border: "1px solid #4d1b24",
                        borderRadius: "0.2rem",
                        color: "#f4e8ea",
                        textAlign: "center",
                        fontSize: "0.65rem",
                        padding: "0.2rem",
                      }}
                    />
                  </td>

                  {/* Data Cells */}
                  {row.map((value, colIdx) => (
                    <td
                      key={`cell-${rowIdx}-${colIdx}`}
                      style={{
                        width: "3.5rem",
                        height: "2.5rem",
                        border: "1px solid #4d1b24",
                        padding: "0.25rem",
                        backgroundColor: getHeatmapColor(value),
                      }}
                    >
                      <input
                        type="number"
                        step="0.01"
                        value={value}
                        onChange={(e) =>
                          updateGridCell(rowIdx, colIdx, parseFloat(e.target.value) || 0)
                        }
                        style={{
                          width: "100%",
                          height: "2rem",
                          backgroundColor: "rgba(30, 10, 14, 0.7)",
                          border: "1px solid #4d1b24",
                          borderRadius: "0.2rem",
                          color: "#f4e8ea",
                          textAlign: "center",
                          fontSize: "0.65rem",
                          padding: "0.2rem",
                        }}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Heatmap Legend */}
        <div style={{ marginTop: "1rem", display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.75rem" }}>
          <span style={{ fontWeight: "600" }}>Heatmap:</span>
          <div style={{ display: "flex", gap: "0.25rem", alignItems: "center" }}>
            <div
              style={{
                width: "1.5rem",
                height: "1rem",
                borderRadius: "0.2rem",
                border: "1px solid #4d1b24",
                backgroundColor: "rgba(100, 150, 255, 0.5)",
              }}
            />
            <span>Min</span>
          </div>
          <div style={{ display: "flex", gap: "0.25rem", alignItems: "center" }}>
            <div
              style={{
                width: "1.5rem",
                height: "1rem",
                borderRadius: "0.2rem",
                border: "1px solid #4d1b24",
                backgroundColor: "rgba(200, 100, 255, 0.5)",
              }}
            />
            <span>Mid</span>
          </div>
          <div style={{ display: "flex", gap: "0.25rem", alignItems: "center" }}>
            <div
              style={{
                width: "1.5rem",
                height: "1rem",
                borderRadius: "0.2rem",
                border: "1px solid #4d1b24",
                backgroundColor: "rgba(255, 0, 0, 0.5)",
              }}
            />
            <span>Max</span>
          </div>
        </div>
      </section>

      {/* ===== SECTION 4: Actions (Boutons) ===== */}
      <section style={{ display: "flex", gap: "1rem", justifyContent: "flex-end" }}>
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="small-button"
          style={{
            backgroundColor: "#2d5c3d",
            borderColor: "#34d399",
            color: "#34d399",
            opacity: isSaving ? 0.6 : 1,
            cursor: isSaving ? "not-allowed" : "pointer",
          }}
        >
          {isSaving ? "⏳ Sauvegarde..." : "💾 Sauvegarder"}
        </button>
        <button
          onClick={handleCalculate}
          disabled={isCalculating || !datasetId}
          className="small-button"
          style={{
            backgroundColor: "#1e3a4c",
            borderColor: "#00a8ff",
            color: "#00a8ff",
            opacity: isCalculating || !datasetId ? 0.6 : 1,
            cursor: isCalculating || !datasetId ? "not-allowed" : "pointer",
          }}
        >
          {isCalculating ? "⏳ Calcul..." : "🔄 Calculer"}
        </button>
      </section>
    </div>
  );
}
