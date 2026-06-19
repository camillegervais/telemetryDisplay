import { useState, type CSSProperties } from "react";
import type { BreakpointObject } from "../types";

interface CartoImportModalProps {
  breakpoints: Record<string, BreakpointObject>;
  onConfirm: (selectedKeys: string[]) => void;
  onCancel: () => void;
  isLoading?: boolean;
}

export function CartoImportModal({
  breakpoints,
  onConfirm,
  onCancel,
  isLoading = false,
}: CartoImportModalProps) {
  const [selectedBreakpoints, setSelectedBreakpoints] = useState<Set<string>>(
    new Set(Object.keys(breakpoints))
  );

  const toggleBreakpoint = (key: string) => {
    const newSelected = new Set(selectedBreakpoints);
    if (newSelected.has(key)) {
      newSelected.delete(key);
    } else {
      newSelected.add(key);
    }
    setSelectedBreakpoints(newSelected);
  };

  const toggleAll = () => {
    if (selectedBreakpoints.size === Object.keys(breakpoints).length) {
      setSelectedBreakpoints(new Set());
    } else {
      setSelectedBreakpoints(new Set(Object.keys(breakpoints)));
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

  const stepIndicatorStyle: CSSProperties = {
    fontSize: "0.85rem",
    color: "rgba(156, 163, 175, 1)",
    marginBottom: "1rem",
    fontStyle: "italic",
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

  const bpNameStyle: CSSProperties = {
    fontWeight: "bold",
    color: "rgba(52, 211, 153, 0.9)",
    fontSize: "0.95rem",
  };

  const bpValuesStyle: CSSProperties = {
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
        <div style={headerStyle}>📊 Select Breakpoints to Import</div>
        <div style={stepIndicatorStyle}>Step 1 of 2: Select breakpoints (axes)</div>

        <div style={{ marginBottom: "1rem", fontSize: "0.9rem" }}>
          Select the breakpoints to import. These will be merged with existing
          breakpoints by name. You'll select cartos in the next step.
        </div>

        <div style={summaryStyle}>
          <div style={summaryItemStyle}>
            Total breakpoints: {Object.keys(breakpoints).length}
          </div>
          <div style={summaryItemStyle}>
            Selected: {selectedBreakpoints.size}
          </div>
        </div>

        <div>
          <button onClick={toggleAll} style={selectAllButtonStyle}>
            {selectedBreakpoints.size === Object.keys(breakpoints).length
              ? "Deselect All"
              : "Select All"}
          </button>
        </div>

        <div style={listContainerStyle}>
          {Object.entries(breakpoints).map(([key, bp]) => (
            <div
              key={key}
              style={itemStyle}
              onClick={() => toggleBreakpoint(key)}
            >
              <input
                type="checkbox"
                checked={selectedBreakpoints.has(key)}
                onChange={(e) => {
                  e.stopPropagation();
                  toggleBreakpoint(key);
                }}
                style={checkboxStyle}
              />
              <div style={{ flex: 1 }}>
                <div style={bpNameStyle}>{bp.name}</div>
                <div style={bpValuesStyle}>
                  {bp.values.length} values:{" "}
                  {bp.values
                    .slice(0, 3)
                    .map((v) => v.toFixed(2))
                    .join(", ")}
                  {bp.values.length > 3 ? "..." : ""}
                </div>
                {bp.unit && (
                  <div style={{ fontSize: "0.75rem", color: "rgba(156, 163, 175, 0.7)" }}>
                    Unit: {bp.unit}
                  </div>
                )}
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
            onClick={() => onConfirm(Array.from(selectedBreakpoints))}
            disabled={isLoading || selectedBreakpoints.size === 0}
          >
            {isLoading ? "Loading..." : "Next →"}
          </button>
        </div>
      </div>
    </div>
  );
}
