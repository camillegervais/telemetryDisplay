import type { CSSProperties } from "react";

interface ImportSummaryModalProps {
  summary: {
    breakpointsCreated: string[];
    breakpointsUpdated: string[];
    cartosCreated: string[];
    cartosUpdated: string[];
    cartosSkipped: string[];
    errors: string[];
  };
  onClose: () => void;
}

export function ImportSummaryModal({
  summary,
  onClose,
}: ImportSummaryModalProps) {
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
    border: "1px solid rgba(52, 211, 153, 0.3)",
    borderRadius: "8px",
    padding: "2rem",
    width: "50vw",
    maxHeight: "70vh",
    overflowY: "auto",
    boxShadow: "0 8px 32px rgba(0, 0, 0, 0.6)",
    fontFamily: '"Space Grotesk", monospace',
    color: "var(--fg-1)",
  };

  const headerStyle: CSSProperties = {
    fontSize: "1.3rem",
    fontWeight: "bold",
    marginBottom: "1.5rem",
    color: "rgba(52, 211, 153, 1)",
    textAlign: "center",
  };

  const sectionStyle: CSSProperties = {
    marginBottom: "1.5rem",
    paddingBottom: "1rem",
    borderBottom: "1px solid rgba(52, 211, 153, 0.2)",
  };

  const sectionTitleStyle: CSSProperties = {
    fontSize: "0.95rem",
    fontWeight: "bold",
    color: "rgba(251, 191, 36, 1)",
    marginBottom: "0.5rem",
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
  };

  const itemStyle: CSSProperties = {
    fontSize: "0.85rem",
    padding: "0.5rem 0 0.5rem 2rem",
    color: "rgba(209, 213, 219, 1)",
  };

  const errorStyle: CSSProperties = {
    color: "rgba(248, 113, 113, 1)",
    backgroundColor: "rgba(248, 113, 113, 0.08)",
    border: "1px solid rgba(248, 113, 113, 0.3)",
    borderRadius: "4px",
    padding: "1rem",
    marginBottom: "1rem",
    fontSize: "0.85rem",
  };

  const buttonContainerStyle: CSSProperties = {
    display: "flex",
    justifyContent: "center",
    marginTop: "2rem",
  };

  const buttonStyle: CSSProperties = {
    padding: "0.8rem 2rem",
    borderRadius: "4px",
    border: "none",
    backgroundColor: "rgba(52, 211, 153, 0.8)",
    color: "#000",
    cursor: "pointer",
    fontFamily: '"Space Grotesk", monospace',
    fontSize: "0.95rem",
    fontWeight: "bold",
    transition: "all 0.2s",
  };

  const hasErrors = summary.errors.length > 0;

  return (
    <div style={modalOverlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        <div style={headerStyle}>
          {hasErrors ? "⚠️ Import Completed with Issues" : "✅ Import Successful"}
        </div>

        {hasErrors && (
          <div style={errorStyle}>
            <div style={{ fontWeight: "bold", marginBottom: "0.5rem" }}>Errors encountered:</div>
            {summary.errors.map((err, i) => (
              <div key={i}>❌ {err}</div>
            ))}
          </div>
        )}

        {summary.breakpointsCreated.length > 0 && (
          <div style={sectionStyle}>
            <div style={sectionTitleStyle}>📊 Breakpoints Created</div>
            {summary.breakpointsCreated.map((key, i) => (
              <div key={i} style={itemStyle}>{key}</div>
            ))}
          </div>
        )}

        {summary.breakpointsUpdated.length > 0 && (
          <div style={sectionStyle}>
            <div style={sectionTitleStyle}>🔄 Breakpoints Updated</div>
            {summary.breakpointsUpdated.map((key, i) => (
              <div key={i} style={itemStyle}>{key}</div>
            ))}
          </div>
        )}

        {summary.cartosCreated.length > 0 && (
          <div style={sectionStyle}>
            <div style={sectionTitleStyle}>📈 Cartos Created</div>
            {summary.cartosCreated.map((key, i) => (
              <div key={i} style={itemStyle}>{key}</div>
            ))}
          </div>
        )}

        {summary.cartosUpdated.length > 0 && (
          <div style={sectionStyle}>
            <div style={sectionTitleStyle}>🔧 Cartos Updated</div>
            {summary.cartosUpdated.map((key, i) => (
              <div key={i} style={itemStyle}>{key}</div>
            ))}
          </div>
        )}

        {summary.cartosSkipped.length > 0 && (
          <div style={sectionStyle}>
            <div style={sectionTitleStyle}>⏭️ Cartos Skipped</div>
            {summary.cartosSkipped.map((key, i) => (
              <div key={i} style={itemStyle}>{key}</div>
            ))}
          </div>
        )}

        <div style={buttonContainerStyle}>
          <button style={buttonStyle} onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
