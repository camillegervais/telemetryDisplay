import { useState, type CSSProperties } from "react";
import type { CartoObject } from "../types";

interface CartoSelectionModalProps {
  cartos: Record<string, CartoObject>;
  onConfirm: (selectedKeys: string[]) => void;
  onCancel: () => void;
  isLoading?: boolean;
}

export function CartoSelectionModal({
  cartos,
  onConfirm,
  onCancel,
  isLoading = false,
}: CartoSelectionModalProps) {
  const [selectedCartos, setSelectedCartos] = useState<Set<string>>(
    new Set(Object.keys(cartos))
  );

  const toggleCarto = (key: string) => {
    const newSelected = new Set(selectedCartos);
    if (newSelected.has(key)) {
      newSelected.delete(key);
    } else {
      newSelected.add(key);
    }
    setSelectedCartos(newSelected);
  };

  const toggleAll = () => {
    if (selectedCartos.size === Object.keys(cartos).length) {
      setSelectedCartos(new Set());
    } else {
      setSelectedCartos(new Set(Object.keys(cartos)));
    }
  };

  const modalOverlayStyle: CSSProperties = {
    position: "fixed",
    inset: 0,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 9999,
  };

  const modalStyle: CSSProperties = {
    backgroundColor: "rgba(22, 8, 12, 0.95)",
    border: "1px solid rgba(255, 70, 93, 0.3)",
    borderRadius: "8px",
    padding: "1.5rem",
    width: "60vw",
    maxHeight: "80vh",
    overflowY: "auto",
    boxShadow: "0 8px 32px rgba(0, 0, 0, 0.6)",
    fontFamily: '"Space Grotesk", monospace',
    color: "var(--fg-1)",
  };

  const headerStyle: CSSProperties = {
    fontSize: "1.2rem",
    fontWeight: "bold",
    marginBottom: "1rem",
    color: "rgba(52, 211, 153, 1)",
  };

  const summaryStyle: CSSProperties = {
    backgroundColor: "rgba(52, 211, 153, 0.08)",
    border: "1px solid rgba(52, 211, 153, 0.2)",
    borderRadius: "4px",
    padding: "1rem",
    marginBottom: "1.5rem",
    fontSize: "0.9rem",
  };

  const summaryItemStyle: CSSProperties = {
    marginBottom: "0.5rem",
    display: "flex",
    gap: "0.5rem",
  };

  const listContainerStyle: CSSProperties = {
    maxHeight: "35vh",
    overflowY: "auto",
    marginBottom: "1.5rem",
    border: "1px solid rgba(255, 70, 93, 0.2)",
    borderRadius: "4px",
  };

  const itemStyle: CSSProperties = {
    padding: "0.8rem",
    borderBottom: "1px solid rgba(255, 70, 93, 0.1)",
    display: "flex",
    alignItems: "flex-start",
    gap: "0.8rem",
    cursor: "pointer",
  };

  const checkboxStyle: CSSProperties = {
    cursor: "pointer",
    marginTop: "0.2rem",
    accentColor: "rgba(52, 211, 153, 1)",
  };

  const cartoNameStyle: CSSProperties = {
    fontWeight: "bold",
    color: "rgba(52, 211, 153, 0.9)",
    fontSize: "0.95rem",
  };

  const cartoInfoStyle: CSSProperties = {
    fontSize: "0.8rem",
    color: "rgba(167, 139, 250, 0.7)",
    marginTop: "0.3rem",
  };

  const buttonContainerStyle: CSSProperties = {
    display: "flex",
    gap: "1rem",
    justifyContent: "flex-end",
    marginTop: "1.5rem",
  };

  const buttonStyle: CSSProperties = {
    padding: "0.6rem 1.2rem",
    borderRadius: "4px",
    border: "none",
    cursor: "pointer",
    fontFamily: '"Space Grotesk", monospace',
    fontSize: "0.9rem",
    fontWeight: "bold",
    transition: "all 0.2s",
  };

  const confirmButtonStyle: CSSProperties = {
    ...buttonStyle,
    backgroundColor: "rgba(52, 211, 153, 0.8)",
    color: "#000",
  };

  const cancelButtonStyle: CSSProperties = {
    ...buttonStyle,
    backgroundColor: "rgba(255, 70, 93, 0.2)",
    color: "rgba(255, 70, 93, 1)",
  };

  const selectAllButtonStyle: CSSProperties = {
    ...buttonStyle,
    backgroundColor: "rgba(167, 139, 250, 0.2)",
    color: "rgba(167, 139, 250, 1)",
    fontSize: "0.85rem",
    padding: "0.4rem 0.8rem",
    marginBottom: "0.8rem",
  };

  return (
    <div style={modalOverlayStyle} onClick={onCancel}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        <div style={headerStyle}>📊 Select 2D Cartos to Import</div>

        <div style={{ marginBottom: "1rem", fontSize: "0.9rem" }}>
          Step 2: Select the 2D cartos to import. These will be linked to the breakpoints and merged with existing cartos by name.
        </div>

        <div style={summaryStyle}>
          <div style={summaryItemStyle}>
            Total cartos: {Object.keys(cartos).length}
          </div>
          <div style={summaryItemStyle}>
            Selected: {selectedCartos.size}
          </div>
        </div>

        <div>
          <button
            onClick={toggleAll}
            style={selectAllButtonStyle}
          >
            {selectedCartos.size === Object.keys(cartos).length
              ? "Deselect All"
              : "Select All"}
          </button>
        </div>

        <div style={listContainerStyle}>
          {Object.entries(cartos).map(([key, carto]) => (
            <div
              key={key}
              style={itemStyle}
              onClick={() => toggleCarto(key)}
            >
              <input
                type="checkbox"
                checked={selectedCartos.has(key)}
                onChange={(e) => {
                  e.stopPropagation();
                  toggleCarto(key);
                }}
                style={checkboxStyle}
              />
              <div style={{ flex: 1 }}>
                <div style={cartoNameStyle}>{carto.name}</div>
                <div style={cartoInfoStyle}>
                  Grid: {carto.gridData.length} rows × {carto.gridData[0]?.length || 0} cols
                </div>
                <div style={{ fontSize: "0.75rem", color: "rgba(156, 163, 175, 0.7)" }}>
                  Gain: {carto.gainVal}, Offset: {carto.offsetVal}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div style={buttonContainerStyle}>
          <button style={cancelButtonStyle} onClick={onCancel} disabled={isLoading}>
            Cancel
          </button>
          <button
            style={confirmButtonStyle}
            onClick={() => onConfirm(Array.from(selectedCartos))}
            disabled={isLoading || selectedCartos.size === 0}
          >
            {isLoading ? "Importing..." : "Import"}
          </button>
        </div>
      </div>
    </div>
  );
}
