import { useEffect, useState } from "react";
import { ConfigManager } from "../store/ConfigManager";
import type { CSSProperties } from "react";

export function SignalColorManager() {
  const [signalColors, setSignalColors] = useState<Record<string, string>>(
    ConfigManager.get("signal-colors") || {}
  );
  const [newSignalName, setNewSignalName] = useState("");
  const [newSignalColor, setNewSignalColor] = useState("#00a8ff");

  // Subscribe to signal-colors changes
  useEffect(() => {
    const unsubscribe = ConfigManager.subscribe("signal-colors", (newValue) => {
      setSignalColors(newValue as Record<string, string>);
    });

    return () => unsubscribe();
  }, []);

  const handleAddColor = () => {
    const trimmedName = newSignalName.trim();
    if (!trimmedName) return;

    const updated = {
      ...signalColors,
      [trimmedName]: newSignalColor,
    };

    ConfigManager.set("signal-colors", updated);
    setNewSignalName("");
    setNewSignalColor("#00a8ff");
  };

  const handleRemoveColor = (signalName: string) => {
    const updated = { ...signalColors };
    delete updated[signalName];
    ConfigManager.set("signal-colors", updated);
  };

  const handleColorChange = (signalName: string, newColor: string) => {
    const updated = {
      ...signalColors,
      [signalName]: newColor,
    };
    ConfigManager.set("signal-colors", updated);
  };

  const containerStyle: CSSProperties = {
    padding: "0.8rem",
    border: "1px solid rgba(255, 70, 93, 0.2)",
    borderRadius: "4px",
    background: "rgba(22, 8, 12, 0.3)",
    marginBottom: "1rem",
  };

  const headerStyle: CSSProperties = {
    fontSize: "0.95rem",
    fontWeight: "bold",
    marginBottom: "0.6rem",
    color: "var(--fg-1)",
  };

  const listStyle: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: "0.5rem",
    marginBottom: "0.8rem",
    maxHeight: "200px",
    overflowY: "auto",
  };

  const itemStyle: CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    padding: "0.4rem",
    background: "rgba(22, 8, 12, 0.5)",
    borderRadius: "3px",
    fontSize: "0.8rem",
  };

  const swatchStyle: CSSProperties = {
    width: "24px",
    height: "24px",
    borderRadius: "2px",
    border: "1px solid rgba(255, 255, 255, 0.2)",
    cursor: "pointer",
    flexShrink: 0,
  };

  const signalNameStyle: CSSProperties = {
    flex: 1,
    color: "var(--fg-1)",
    fontFamily: '"Space Grotesk", monospace',
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  };

  const deleteButtonStyle: CSSProperties = {
    padding: "0.2rem 0.4rem",
    border: "1px solid rgba(255, 70, 93, 0.5)",
    background: "rgba(255, 70, 93, 0.1)",
    color: "rgba(255, 70, 93, 0.8)",
    borderRadius: "2px",
    cursor: "pointer",
    fontSize: "0.75rem",
    flexShrink: 0,
  };

  const inputContainerStyle: CSSProperties = {
    display: "grid",
    gridTemplateColumns: "1fr auto auto",
    gap: "0.4rem",
    marginBottom: "0.6rem",
  };

  const inputStyle: CSSProperties = {
    padding: "0.4rem",
    border: "1px solid rgba(255, 70, 93, 0.4)",
    borderRadius: "2px",
    background: "rgba(22, 8, 12, 0.8)",
    color: "var(--fg-1)",
    fontSize: "0.8rem",
    fontFamily: '"Space Grotesk", monospace',
  };

  const colorPickerStyle: CSSProperties = {
    width: "40px",
    height: "32px",
    border: "1px solid rgba(255, 70, 93, 0.4)",
    borderRadius: "2px",
    cursor: "pointer",
    padding: "2px",
    background: "transparent",
  };

  const addButtonStyle: CSSProperties = {
    padding: "0.4rem 0.8rem",
    border: "1px solid rgba(52, 211, 153, 0.6)",
    background: "rgba(52, 211, 153, 0.15)",
    color: "rgba(52, 211, 153, 0.9)",
    borderRadius: "2px",
    cursor: "pointer",
    fontSize: "0.8rem",
    fontFamily: '"Space Grotesk", monospace',
    fontWeight: "bold",
    transition: "all 0.2s ease",
  };

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>🎨 Couleurs Signaux</div>

      {/* List of existing colors */}
      {Object.keys(signalColors).length > 0 ? (
        <div style={listStyle}>
          {Object.entries(signalColors).map(([signalName, color]) => (
            <div key={signalName} style={itemStyle}>
              <input
                type="color"
                value={color}
                onChange={(e) => handleColorChange(signalName, e.target.value)}
                style={swatchStyle}
                title={`Couleur pour ${signalName}`}
              />
              <div style={signalNameStyle} title={signalName}>
                {signalName}
              </div>
              <button
                onClick={() => handleRemoveColor(signalName)}
                style={deleteButtonStyle}
                onMouseEnter={(e) => {
                  const btn = e.currentTarget;
                  btn.style.background = "rgba(255, 70, 93, 0.2)";
                  btn.style.borderColor = "rgba(255, 70, 93, 0.8)";
                }}
                onMouseLeave={(e) => {
                  const btn = e.currentTarget;
                  btn.style.background = "rgba(255, 70, 93, 0.1)";
                  btn.style.borderColor = "rgba(255, 70, 93, 0.5)";
                }}
              >
                Supprimer
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ fontSize: "0.8rem", color: "rgba(255, 70, 93, 0.6)", marginBottom: "0.6rem" }}>
          Aucune couleur définie
        </div>
      )}

      {/* Add new color form */}
      <div style={inputContainerStyle}>
        <input
          type="text"
          placeholder="Nom du signal..."
          value={newSignalName}
          onChange={(e) => setNewSignalName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              handleAddColor();
            }
          }}
          style={inputStyle}
        />
        <input
          type="color"
          value={newSignalColor}
          onChange={(e) => setNewSignalColor(e.target.value)}
          style={colorPickerStyle}
          title="Choisir une couleur"
        />
        <button
          onClick={handleAddColor}
          disabled={!newSignalName.trim()}
          style={{
            ...addButtonStyle,
            opacity: newSignalName.trim() ? 1 : 0.5,
            cursor: newSignalName.trim() ? "pointer" : "not-allowed",
          }}
          onMouseEnter={(e) => {
            const btn = e.currentTarget;
            if (newSignalName.trim()) {
              btn.style.background = "rgba(52, 211, 153, 0.25)";
              btn.style.borderColor = "rgba(52, 211, 153, 0.9)";
            }
          }}
          onMouseLeave={(e) => {
            const btn = e.currentTarget;
            btn.style.background = "rgba(52, 211, 153, 0.15)";
            btn.style.borderColor = "rgba(52, 211, 153, 0.6)";
          }}
        >
          Ajouter
        </button>
      </div>
    </div>
  );
}
