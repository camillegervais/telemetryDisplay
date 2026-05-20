import { useState, type CSSProperties } from "react";
import type { ParsedTomlData, ImportSelection } from "../types/ConfigTypes";

interface ImportSelectionModalProps {
  data: ParsedTomlData;
  onConfirm: (selection: ImportSelection) => void;
  onCancel: () => void;
  isLoading?: boolean;
}

export function ImportSelectionModal({ data, onConfirm, onCancel, isLoading = false }: ImportSelectionModalProps) {
  const [selection, setSelection] = useState<ImportSelection>({
    layouts: {
      enabled: false,
      mode: "add",
      selectedIds: [],
    },
    mathChannels: {
      enabled: false,
      mode: "add",
    },
    mapConfigs: {
      enabled: false,
      mode: "add",
      selectedKeys: [],
    },
    softBlocks: {
      enabled: false,
      mode: "add",
      selectedIds: [],
    },
    telDataConfigs: {
      enabled: false,
      mode: "add",
      selectedIds: [],
    },
  });

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
    width: "50vw",
    maxHeight: "85vh",
    overflowY: "auto",
    boxShadow: "0 8px 32px rgba(0, 0, 0, 0.6)",
    fontFamily: '"Space Grotesk", monospace',
    color: "var(--fg-1)",
  };

  const headerStyle: CSSProperties = {
    fontSize: "1.2rem",
    fontWeight: "bold",
    marginBottom: "1rem",
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
  };

  const previewStyle: CSSProperties = {
    backgroundColor: "rgba(52, 211, 153, 0.08)",
    border: "1px solid rgba(52, 211, 153, 0.2)",
    borderRadius: "4px",
    padding: "0.8rem",
    marginBottom: "1.5rem",
    fontSize: "0.85rem",
  };

  const sectionStyle: CSSProperties = {
    marginBottom: "1.5rem",
    paddingBottom: "1rem",
    borderBottom: "1px solid rgba(255, 70, 93, 0.15)",
  };

  const sectionHeaderStyle: CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    marginBottom: "0.8rem",
    cursor: "pointer",
    userSelect: "none",
  };

  const checkboxStyle: CSSProperties = {
    cursor: "pointer",
    marginRight: "0.5rem",
  };

  const modeGroupStyle: CSSProperties = {
    display: "flex",
    gap: "1rem",
    marginLeft: "1.5rem",
    marginBottom: "0.8rem",
    fontSize: "0.85rem",
  };

  const radioGroupStyle: CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "0.3rem",
    cursor: "pointer",
  };

  const itemsListStyle: CSSProperties = {
    marginLeft: "1.5rem",
    maxHeight: "200px",
    overflowY: "auto",
    borderLeft: "2px solid rgba(255, 70, 93, 0.2)",
    paddingLeft: "0.8rem",
  };

  const itemCheckboxStyle: CSSProperties = {
    fontSize: "0.8rem",
    marginBottom: "0.4rem",
    display: "flex",
    alignItems: "center",
    gap: "0.4rem",
  };

  const footerStyle: CSSProperties = {
    display: "flex",
    gap: "1rem",
    justifyContent: "flex-end",
    marginTop: "1.5rem",
    paddingTop: "1rem",
    borderTop: "1px solid rgba(255, 70, 93, 0.15)",
  };

  const buttonStyle = (variant: "primary" | "secondary"): CSSProperties => ({
    padding: "0.6rem 1.2rem",
    border: `1px solid ${variant === "primary" ? "rgba(52, 211, 153, 0.6)" : "rgba(255, 70, 93, 0.6)"}`,
    borderRadius: "4px",
    background: variant === "primary" ? "rgba(52, 211, 153, 0.15)" : "rgba(22, 8, 12, 0.8)",
    color: "var(--fg-1)",
    cursor: "pointer",
    fontSize: "0.9rem",
    fontFamily: '"Space Grotesk", monospace',
    transition: "all 0.2s ease",
  });

  const handleSectionToggle = (section: keyof ImportSelection) => {
    setSelection((prev) => ({
      ...prev,
      [section]: {
        ...prev[section],
        enabled: !prev[section]?.enabled,
      },
    }));
  };

  const handleModeChange = (section: keyof ImportSelection, mode: "replace" | "add") => {
    setSelection((prev) => ({
      ...prev,
      [section]: {
        ...prev[section],
        mode,
      },
    }));
  };

  const handleLayoutSelect = (layoutId: string, checked: boolean) => {
    setSelection((prev) => ({
      ...prev,
      layouts: {
        ...prev.layouts!,
        selectedIds: checked
          ? [...(prev.layouts?.selectedIds || []), layoutId]
          : (prev.layouts?.selectedIds || []).filter((id) => id !== layoutId),
      },
    }));
  };

  const handleMapConfigSelect = (key: string, checked: boolean) => {
    setSelection((prev) => ({
      ...prev,
      mapConfigs: {
        ...prev.mapConfigs!,
        selectedKeys: checked
          ? [...(prev.mapConfigs?.selectedKeys || []), key]
          : (prev.mapConfigs?.selectedKeys || []).filter((k) => k !== key),
      },
    }));
  };

  const handleSoftBlockSelect = (blockId: string, checked: boolean) => {
    setSelection((prev) => ({
      ...prev,
      softBlocks: {
        ...prev.softBlocks!,
        selectedIds: checked
          ? [...(prev.softBlocks?.selectedIds || []), blockId]
          : (prev.softBlocks?.selectedIds || []).filter((id) => id !== blockId),
      },
    }));
  };

  const handleTelDataConfigSelect = (configId: string, checked: boolean) => {
    setSelection((prev) => ({
      ...prev,
      telDataConfigs: {
        ...prev.telDataConfigs!,
        selectedIds: checked
          ? [...(prev.telDataConfigs?.selectedIds || []), configId]
          : (prev.telDataConfigs?.selectedIds || []).filter((id) => id !== configId),
      },
    }));
  };

  const handleConfirm = () => {
    onConfirm(selection);
  };

  const renderSection = (
    title: string,
    section: keyof ImportSelection,
    itemCount: number,
    children?: React.ReactNode
  ) => {
    const isEnabled = selection[section]?.enabled ?? false;
    const mode = selection[section]?.mode ?? "add";

    return (
      <div style={sectionStyle}>
        <label style={sectionHeaderStyle} onClick={() => handleSectionToggle(section)}>
          <input
            type="checkbox"
            checked={isEnabled}
            onChange={() => {}}
            style={checkboxStyle}
          />
          <span>{title}</span>
          <span style={{ fontSize: "0.8rem", color: "rgba(255, 70, 93, 0.6)", marginLeft: "auto" }}>
            ({itemCount} élément{itemCount !== 1 ? "s" : ""})
          </span>
        </label>

        {isEnabled && itemCount > 0 && (
          <>
            <div style={modeGroupStyle}>
              <label style={radioGroupStyle}>
                <input
                  type="radio"
                  checked={mode === "replace"}
                  onChange={() => handleModeChange(section, "replace")}
                />
                <span>Remplacer</span>
              </label>
              <label style={radioGroupStyle}>
                <input
                  type="radio"
                  checked={mode === "add"}
                  onChange={() => handleModeChange(section, "add")}
                />
                <span>Ajouter</span>
              </label>
            </div>
            {children}
          </>
        )}
      </div>
    );
  };

  return (
    <div style={modalOverlayStyle} onClick={onCancel}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        <div style={headerStyle}>
          <span>📥 Importer Configuration</span>
        </div>

        {/* Preview */}
        <div style={previewStyle}>
          <div style={{ fontWeight: "bold", marginBottom: "0.4rem" }}>Aperçu du fichier:</div>
          <div>
            {data.layouts.count > 0 && <div>✓ {data.layouts.count} Layout{data.layouts.count !== 1 ? "s" : ""}</div>}
            {data.mathChannels.count > 0 && (
              <div>✓ {data.mathChannels.count} Canaux Math</div>
            )}
            {data.mapConfigs.count > 0 && <div>✓ {data.mapConfigs.count} Carto{data.mapConfigs.count !== 1 ? "s" : ""}</div>}
            {data.softBlocks.count > 0 && (
              <div>✓ {data.softBlocks.count} Soft Block{data.softBlocks.count !== 1 ? "s" : ""}</div>
            )}
            {data.telDataConfigs.count > 0 && (
              <div>✓ {data.telDataConfigs.count} Config TelData{data.telDataConfigs.count !== 1 ? "s" : ""}</div>
            )}
          </div>
        </div>

        {/* Layouts Section */}
        {renderSection("Layouts", "layouts", data.layouts.count, (
          <div style={itemsListStyle}>
            {data.layouts.items.map((layout) => (
              <label key={layout.id} style={itemCheckboxStyle}>
                <input
                  type="checkbox"
                  checked={selection.layouts?.selectedIds?.includes(layout.id) ?? false}
                  onChange={(e) => handleLayoutSelect(layout.id, e.target.checked)}
                />
                <span>{layout.name}</span>
              </label>
            ))}
          </div>
        ))}

        {/* Math Channels Section */}
        {renderSection("Canaux Math", "mathChannels", data.mathChannels.count)}

        {/* Map Configs Section */}
        {renderSection("Cartos", "mapConfigs", data.mapConfigs.count, (
          <div style={itemsListStyle}>
            {data.mapConfigs.keys.map((key) => (
              <label key={key} style={itemCheckboxStyle}>
                <input
                  type="checkbox"
                  checked={selection.mapConfigs?.selectedKeys?.includes(key) ?? false}
                  onChange={(e) => handleMapConfigSelect(key, e.target.checked)}
                />
                <span>{key}</span>
              </label>
            ))}
          </div>
        ))}

        {/* Soft Blocks Section */}
        {renderSection("Soft Blocks", "softBlocks", data.softBlocks.count, (
          <div style={itemsListStyle}>
            {data.softBlocks.items.map((block) => (
              <label key={block.id} style={itemCheckboxStyle}>
                <input
                  type="checkbox"
                  checked={(selection.softBlocks?.selectedIds || []).includes(block.id) ?? false}
                  onChange={(e) => handleSoftBlockSelect(block.id, e.target.checked)}
                />
                <span>{block.name}</span>
              </label>
            ))}
          </div>
        ))}

        {/* TelData Configs Section */}
        {renderSection("Configs TelData", "telDataConfigs", data.telDataConfigs.count, (
          <div style={itemsListStyle}>
            {data.telDataConfigs.items.map((cfg) => (
              <label key={cfg.id} style={itemCheckboxStyle}>
                <input
                  type="checkbox"
                  checked={(selection.telDataConfigs?.selectedIds || []).includes(cfg.id)}
                  onChange={(e) => handleTelDataConfigSelect(cfg.id, e.target.checked)}
                />
                <span>
                  {cfg.name}
                  <span style={{ opacity: 0.55, marginLeft: "0.4rem" }}>
                    ({cfg.channels.length} canaux — {cfg.targetFrequencyHz} Hz)
                  </span>
                </span>
              </label>
            ))}
          </div>
        ))}

        {/* Footer */}
        <div style={footerStyle}>
          <button
            style={buttonStyle("secondary")}
            onClick={onCancel}
            disabled={isLoading}
            onMouseEnter={(e) => {
              const btn = e.currentTarget;
              if (!isLoading) {
                btn.style.background = "rgba(22, 8, 12, 0.95)";
                btn.style.borderColor = "rgba(255, 70, 93, 0.8)";
              }
            }}
            onMouseLeave={(e) => {
              const btn = e.currentTarget;
              btn.style.background = "rgba(22, 8, 12, 0.8)";
              btn.style.borderColor = "rgba(255, 70, 93, 0.6)";
            }}
          >
            Annuler
          </button>
          <button
            style={buttonStyle("primary")}
            onClick={handleConfirm}
            disabled={isLoading}
            onMouseEnter={(e) => {
              const btn = e.currentTarget;
              if (!isLoading) {
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
            {isLoading ? "Import en cours..." : "Importer"}
          </button>
        </div>
      </div>
    </div>
  );
}
