import { useRef, useState } from "react";
import { ConfigManager } from "../store/ConfigManager";
import { ImportSelectionModal } from "./ImportSelectionModal";
import type { CSSProperties } from "react";
import type { ParsedTomlData, ImportSelection, WorkspaceSessionSnapshot, SavedWorkspaceConfig } from "../types/ConfigTypes";

type ExportImportProps = {
  onImportSuccess?: () => void;
};

export function ConfigExportImport({ onImportSuccess }: ExportImportProps) {
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [parsedData, setParsedData] = useState<ParsedTomlData | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExport = () => {
    try {
      // Ensure any current session edits are persisted into the saved layouts
      try {
        const session = ConfigManager.get<WorkspaceSessionSnapshot | null>("session");
        const layouts = ConfigManager.get<SavedWorkspaceConfig[]>("layouts") ?? [];

        if (session && session.currentConfigId) {
          const idx = layouts.findIndex((l) => l.id === session.currentConfigId);
          if (idx !== -1) {
            const sessionTabs = (session.tabs ?? []).map((tab) => ({
              ...tab,
              widgets: (tab.widgets ?? []).map((w) => ({ ...w, menuOpen: false })),
            }));

            const serializedLayout = JSON.stringify(layouts[idx].tabs || []);
            const serializedSession = JSON.stringify(sessionTabs);
            if (serializedLayout !== serializedSession) {
              const nextLayouts = [...layouts];
              nextLayouts[idx] = { ...nextLayouts[idx], tabs: sessionTabs, activeTabId: session.activeTabId };
              ConfigManager.set("layouts", nextLayouts);
            }
          }
        }
      } catch (err) {
        // Non-fatal: log and continue with export using stored layouts
        console.error("Failed to sync session to layouts before export:", err);
      }

      const tomlContent = ConfigManager.exportToToml();
      const blob = new Blob([tomlContent], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `telemetry-config-${new Date().toISOString().slice(0, 10)}.toml`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setMessage({ type: "success", text: "✓ Configuration exportée avec succès" });
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      setMessage({
        type: "error",
        text: `Erreur d'export: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const content = await file.text();
      const parsed = ConfigManager.parseTomlForImport(content);
      setParsedData(parsed);
      setShowImportModal(true);
    } catch (error) {
      setMessage({
        type: "error",
        text: `Erreur de lecture: ${error instanceof Error ? error.message : String(error)}`,
      });
    } finally {
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleImportConfirm = async (selection: ImportSelection) => {
    if (!parsedData) return;

    setIsImporting(true);
    try {
      ConfigManager.importFromTomlPartial(parsedData, selection);
      setMessage({ type: "success", text: "✓ Configuration importée et appliquée" });
      setShowImportModal(false);
      setParsedData(null);
      onImportSuccess?.();
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      setMessage({
        type: "error",
        text: `Erreur d'import: ${error instanceof Error ? error.message : String(error)}`,
      });
    } finally {
      setIsImporting(false);
    }
  };

  const handleImportCancel = () => {
    setShowImportModal(false);
    setParsedData(null);
  };

  const buttonStyle: CSSProperties = {
    padding: "0.2rem 0.3rem",
    marginLeft: "0.2rem",
    border: "1px solid rgba(255, 70, 93, 0.6)",
    borderRadius: "4px",
    background: "rgba(22, 8, 12, 0.8)",
    color: "var(--fg-1)",
    cursor: "pointer",
    fontSize: "0.85rem",
    fontFamily: '"Space Grotesk", monospace',
    transition: "all 0.2s ease",
  };

  const containerStyle: CSSProperties = {
    display: "flex",
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    padding: "0.3rem 1rem",
    border: "1px solid rgba(255, 70, 93, 0.3)",
    borderRadius: "4px",
    background: "rgba(22, 8, 12, 0.4)",
  };

  const messageStyle: CSSProperties = {
    padding: "0.5rem",
    borderRadius: "4px",
    fontSize: "0.85rem",
    marginLeft: "0.5rem",
    background:
      message?.type === "success"
        ? "rgba(52, 211, 153, 0.1)"
        : "rgba(255, 70, 93, 0.1)",
    color:
      message?.type === "success"
        ? "rgba(52, 211, 153, 0.9)"
        : "rgba(255, 70, 93, 0.9)",
    border: `1px solid ${
      message?.type === "success"
        ? "rgba(52, 211, 153, 0.3)"
        : "rgba(255, 70, 93, 0.3)"
    }`,
  };

  return (
    <>
      {showImportModal && parsedData && (
        <ImportSelectionModal
          data={parsedData}
          onConfirm={handleImportConfirm}
          onCancel={handleImportCancel}
          isLoading={isImporting}
        />
      )}
      <div style={containerStyle}>
        <div style={{ fontSize: "0.9rem", fontWeight: "bold", marginRight: "0.5rem" }}>
          Configuration
        </div>
        <button
          onClick={handleExport}
          style={buttonStyle}
          onMouseEnter={(e) => {
            const btn = e.currentTarget;
            btn.style.background = "rgba(52, 211, 153, 0.15)";
            btn.style.borderColor = "rgba(52, 211, 153, 0.8)";
          }}
          onMouseLeave={(e) => {
            const btn = e.currentTarget;
            btn.style.background = "rgba(22, 8, 12, 0.8)";
            btn.style.borderColor = "rgba(255, 70, 93, 0.6)";
          }}
        >
          📥 Export
        </button>
        <button
          onClick={handleImportClick}
          style={buttonStyle}
          onMouseEnter={(e) => {
            const btn = e.currentTarget;
            btn.style.background = "rgba(0, 168, 255, 0.15)";
            btn.style.borderColor = "rgba(0, 168, 255, 0.8)";
          }}
          onMouseLeave={(e) => {
            const btn = e.currentTarget;
            btn.style.background = "rgba(22, 8, 12, 0.8)";
            btn.style.borderColor = "rgba(255, 70, 93, 0.6)";
          }}
        >
          📤 Import
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".toml"
          onChange={handleFileSelected}
          style={{ display: "none" }}
        />
        {message && <div style={messageStyle}>{message.text}</div>}
      </div>
    </>
  );
}
