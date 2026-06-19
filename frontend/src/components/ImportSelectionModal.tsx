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
    breakpoints: {
      enabled: false,
      mode: "add",
      selectedKeys: [],
    },
    cartos: {
      enabled: false,
      mode: "add",
      selectedKeys: [],
    },
    softBlocks: {
      enabled: false,
      mode: "add",
      selectedIds: [],
    },
    signalColors: {
      enabled: false,
      mode: "add",
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

  const smallButtonStyle: CSSProperties = {
    marginBottom: "0.6rem",
    padding: "0.3rem 0.6rem",
    fontSize: "0.75rem",
    cursor: "pointer",
    borderRadius: "4px",
    border: "1px solid rgba(52, 211, 153, 0.6)",
    background: "rgba(22, 8, 12, 0.6)",
    color: "var(--fg-1)",
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

  const handleBreakpointSelect = (key: string, checked: boolean) => {
    setSelection((prev) => ({
      ...prev,
      breakpoints: {
        ...prev.breakpoints!,
        selectedKeys: checked
          ? [...(prev.breakpoints?.selectedKeys || []), key]
          : (prev.breakpoints?.selectedKeys || []).filter((k) => k !== key),
      },
    }));
  };

  const handleCartoSelect = (key: string, checked: boolean) => {
    setSelection((prev) => ({
      ...prev,
      cartos: {
        ...prev.cartos!,
        selectedKeys: checked
          ? [...(prev.cartos?.selectedKeys || []), key]
          : (prev.cartos?.selectedKeys || []).filter((k) => k !== key),
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

  const handleSelectAllLayouts = () => {
    setSelection((prev) => {
      const allIds = data.layouts.items.map((l) => l.id);
      const currentlySelected = prev.layouts?.selectedIds || [];
      const allSelected = currentlySelected.length === allIds.length && allIds.length > 0;
      return {
        ...prev,
        layouts: {
          ...prev.layouts!,
          enabled: true,
          selectedIds: allSelected ? [] : allIds,
        },
      };
    });
  };

  const handleSelectAllBreakpoints = () => {
    setSelection((prev) => {
      const allKeys = data.breakpoints.keys || [];
      const currentlySelected = prev.breakpoints?.selectedKeys || [];
      const allSelected = currentlySelected.length === allKeys.length && allKeys.length > 0;
      return {
        ...prev,
        breakpoints: {
          ...prev.breakpoints!,
          enabled: true,
          selectedKeys: allSelected ? [] : allKeys,
        },
      };
    });
  };

  const handleSelectAllCartos = () => {
    setSelection((prev) => {
      const allKeys = data.cartos.keys || [];
      const currentlySelected = prev.cartos?.selectedKeys || [];
      const allSelected = currentlySelected.length === allKeys.length && allKeys.length > 0;
      return {
        ...prev,
        cartos: {
          ...prev.cartos!,
          enabled: true,
          selectedKeys: allSelected ? [] : allKeys,
        },
      };
    });
  };

  const handleSelectAllSoftBlocks = () => {
    setSelection((prev) => {
      const allIds = data.softBlocks.items.map((b) => b.id);
      const currentlySelected = prev.softBlocks?.selectedIds || [];
      const allSelected = currentlySelected.length === allIds.length && allIds.length > 0;
      return {
        ...prev,
        softBlocks: {
          ...prev.softBlocks!,
          enabled: true,
          selectedIds: allSelected ? [] : allIds,
        },
      };
    });
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
            ({itemCount} element{itemCount !== 1 ? "s" : ""})
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
                <span>Replace</span>
              </label>
              <label style={radioGroupStyle}>
                <input
                  type="radio"
                  checked={mode === "add"}
                  onChange={() => handleModeChange(section, "add")}
                />
                <span>Add</span>
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
          <span>📥 Import Configuration</span>
        </div>

        {/* Preview */}
        <div style={previewStyle}>
          <div style={{ fontWeight: "bold", marginBottom: "0.4rem" }}>File preview:</div>
          <div>
            {data.layouts.count > 0 && <div>✓ {data.layouts.count} Layout{data.layouts.count !== 1 ? "s" : ""}</div>}
            {data.mathChannels.count > 0 && (
              <div>✓ {data.mathChannels.count} Math Channel{data.mathChannels.count !== 1 ? "s" : ""}</div>
            )}
            {data.breakpoints.count > 0 && <div>✓ {data.breakpoints.count} Breakpoint{data.breakpoints.count !== 1 ? "s" : ""}</div>}
            {data.cartos.count > 0 && <div>✓ {data.cartos.count} Carto{data.cartos.count !== 1 ? "s" : ""} 2D</div>}
            {data.softBlocks.count > 0 && (
              <div>✓ {data.softBlocks.count} Soft Block{data.softBlocks.count !== 1 ? "s" : ""}</div>
            )}
            {data.signalColors.count > 0 && (
              <div>✓ {data.signalColors.count} Color{data.signalColors.count !== 1 ? "s" : ""} Signal</div>
            )}
            {data.telDataConfigs.count > 0 && (
              <div>✓ {data.telDataConfigs.count} Config TelData{data.telDataConfigs.count !== 1 ? "s" : ""}</div>
            )}
          </div>
        </div>

        {/* Layouts Section */}
        {renderSection("Layouts", "layouts", data.layouts.count, (
          <div style={itemsListStyle}>
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "0.5rem" }}>
              <button style={smallButtonStyle} onClick={handleSelectAllLayouts}>Select all</button>
            </div>

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

        {/* Breakpoints Section */}
        {renderSection("Breakpoints", "breakpoints", data.breakpoints.count, (
          <div style={itemsListStyle}>
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "0.5rem" }}>
              <button style={smallButtonStyle} onClick={handleSelectAllBreakpoints}>Select all</button>
            </div>

            {data.breakpoints.keys.map((key) => (
              <label key={key} style={itemCheckboxStyle}>
                <input
                  type="checkbox"
                  checked={selection.breakpoints?.selectedKeys?.includes(key) ?? false}
                  onChange={(e) => handleBreakpointSelect(key, e.target.checked)}
                />
                <span>{key}</span>
              </label>
            ))}
          </div>
        ))}

        {/* Cartos Section */}
        {renderSection("Cartos 2D", "cartos", data.cartos.count, (
          <div style={itemsListStyle}>
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "0.5rem" }}>
              <button style={smallButtonStyle} onClick={handleSelectAllCartos}>Select all</button>
            </div>

            {data.cartos.keys.map((key) => (
              <label key={key} style={itemCheckboxStyle}>
                <input
                  type="checkbox"
                  checked={selection.cartos?.selectedKeys?.includes(key) ?? false}
                  onChange={(e) => handleCartoSelect(key, e.target.checked)}
                />
                <span>{key}</span>
              </label>
            ))}
          </div>
        ))}

        {/* Soft Blocks Section */}
        {renderSection("Soft Blocks", "softBlocks", data.softBlocks.count, (
          <div style={itemsListStyle}>
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "0.5rem" }}>
              <button style={smallButtonStyle} onClick={handleSelectAllSoftBlocks}>Select all</button>
            </div>

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

        {/* Signal Colors Section */}
        {renderSection("Couleurs Signaux", "signalColors", data.signalColors.count)}
        
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
                    ({cfg.channels.length} channel{cfg.channels.length !== 1 ? 's' : ''} — {cfg.targetFrequencyHz} Hz)
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
            Return
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
            {isLoading ? "Import ongoing..." : "Import"}
          </button>
        </div>
      </div>
    </div>
  );
}