import React, { useState, useMemo, useEffect, useCallback, useRef } from "react";

import { queryDataset } from "../api";
import { ConfigManager } from "../store/ConfigManager";
import { useHoverToLutCell } from "../hooks/useHoverToLutCell";
import { use1DMapUsageStats } from "../hooks/use1DMapUsageStats";
import Map3DViewer from "./Map3DViewer";
import { CartoImportPanel } from "./CartoImportPanel";

// ============================================================================
// TYPES
// ============================================================================
import { MapTuningData, BreakpointObject, CartoObject } from "../types";

const INTERPOLATION_OPTIONS: Array<CartoObject["interpolation"]> = ["floor", "nearest", "linear", "round"];
const EXTRAPOLATION_OPTIONS: Array<CartoObject["extrapolation"]> = ["clamp", "linear"];

interface MapTuningProps {
  availableSignals?: string[];
  datasetId?: string | null;
  onSave?: (data: MapTuningData) => void;
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
  onSignalsUpdated,
}: MapTuningProps) {
  // ── Breakpoints state ──────────────────────────────────────────────────────
  const [breakpointConfigs, setBreakpointConfigs] = useState<Record<string, BreakpointObject>>(
    () => ConfigManager.get<Record<string, BreakpointObject>>("breakpoint-configs") ?? {}
  );
  // Which breakpoint is being edited in section A
  const [activeBpKey, setActiveBpKey] = useState<string | null>(null);
  const [newBpName, setNewBpName] = useState("");
  const [showBpSection, setShowBpSection] = useState(false);

  // ── Carto state ────────────────────────────────────────────────────────────
  const [searchTerm, setSearchTerm] = useState("");
  const [breakpointKeyX, setBreakpointKeyX] = useState<string>("");
  const [breakpointKeyY, setBreakpointKeyY] = useState<string>("");
  const [defaultInputChannelX, setDefaultInputChannelX] = useState<string>(availableSignals[0] || "");
  const [defaultInputChannelY, setDefaultInputChannelY] = useState<string>(availableSignals[1] || availableSignals[0] || "");
  const [outputChannelName, setOutputChannelName] = useState<string>("Ma_Nouvelle_Map");
  const [braking_signal, setBraking_signal] = useState<boolean>(false);
  const [interpolation, setInterpolation] = useState<CartoObject["interpolation"]>("linear");
  const [extrapolation, setExtrapolation] = useState<CartoObject["extrapolation"]>("clamp");

  // ── Channel filter (for indicative channel selectors) ─────────────────────
  const [channelFilter, setChannelFilter] = useState("");

  // ── Grid state (values derived from selected breakpoints) ─────────────────
  const [numRows, setNumRows] = useState<number>(5);
  const [numCols, setNumCols] = useState<number>(5);
  const [gainVal, setGainVal] = useState<number>(1);
  const [offsetVal, setOffsetVal] = useState<number>(0);
  const [gridData, setGridData] = useState<number[][]>(
    Array(5).fill(null).map(() => Array(5).fill(50.0))
  );
  // rowHeaders/colHeaders are the local working copy — they mirror the selected breakpoint values
  // Changes here propagate back to the breakpoint object (debounced)
  const [rowHeaders, setRowHeaders] = useState<number[]>([20.0, 40.0, 60.0, 80.0, 100.0]);
  const [colHeaders, setColHeaders] = useState<number[]>([1000.0, 2000.0, 3000.0, 4000.0, 5000.0]);

  // ── 1D Map sLap Range Filter ───────────────────────────────────────────────
  const [sLapMin, setSLapMin] = useState<number>(0);
  const [sLapMax, setSLapMax] = useState<number>(5000);

  // ── Debounce refs ──────────────────────────────────────────────────────────
  const autoSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bpSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── UI feedback ────────────────────────────────────────────────────────────
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [savedConfigs, setSavedConfigs] = useState<string[]>([]);
  const [showConfigMenu, setShowConfigMenu] = useState(false);
  const [show3DViewer, setShow3DViewer] = useState<boolean>(false);
  const [showExportPanel, setShowExportPanel] = useState<boolean>(false);
  const [configFilter, setConfigFilter] = useState<string>("");

  // ── Derived: validate breakpoint/grid coherence ───────────────────────────
  const bpXValues = breakpointConfigs[breakpointKeyX]?.values ?? rowHeaders;
  const bpYValues = breakpointConfigs[breakpointKeyY]?.values ?? colHeaders;

  const bpCoherenceError = useMemo((): string | null => {
    if (breakpointKeyX && breakpointConfigs[breakpointKeyX]) {
      if (breakpointConfigs[breakpointKeyX].values.length !== gridData.length) {
        return `Breakpoint X "${breakpointKeyX}" (${breakpointConfigs[breakpointKeyX].values.length} pts) incompatible avec la grille (${gridData.length} lignes).`;
      }
    }
    if (breakpointKeyY && breakpointConfigs[breakpointKeyY]) {
      if (breakpointConfigs[breakpointKeyY].values.length !== (gridData[0]?.length ?? 0)) {
        return `Breakpoint Y "${breakpointKeyY}" (${breakpointConfigs[breakpointKeyY].values.length} pts) incompatible avec la grille (${gridData[0]?.length ?? 0} colonnes).`;
      }
    }
    return null;
  }, [breakpointKeyX, breakpointKeyY, breakpointConfigs, gridData]);

  // ── Derived: which cartos use a given breakpoint ──────────────────────────
  const cartoConfigsAll = useMemo(
    () => ConfigManager.get<Record<string, CartoObject>>("carto-configs") ?? {},
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [savedConfigs] // refresh when carto list changes
  );

  const bpUsage = useCallback(
    (bpKey: string): string[] =>
      Object.entries(cartoConfigsAll)
        .filter(([, c]) => c.breakpointKeyX === bpKey || c.breakpointKeyY === bpKey)
        .map(([k]) => k),
    [cartoConfigsAll]
  );

  // ── Heatmap min/max ────────────────────────────────────────────────────────
  const { minValue, maxValue } = useMemo(() => {
    const flat = gridData.flat();
    return { minValue: Math.min(...flat), maxValue: Math.max(...flat) };
  }, [gridData]);

  // ── LUT cell highlight (uses indicative channels) ─────────────────────────
  const highlightInfo = useHoverToLutCell({
    datasetId,
    inputChannelX: defaultInputChannelX,
    inputChannelY: defaultInputChannelY,
    rowHeaders,
    colHeaders,
  });

  // ── 1D map detection ───────────────────────────────────────────────────────
  const is1DMap = numRows === 1 || numCols === 1;
  const is1DByRows = numRows === 1;
  const breakpoints1D = is1DByRows ? colHeaders : rowHeaders;
  const inputChannel1D = is1DByRows ? defaultInputChannelY : defaultInputChannelX;

  const usageStats = use1DMapUsageStats({
    datasetId,
    inputChannel: inputChannel1D,
    breakpoints: breakpoints1D,
    minSLap: sLapMin,
    maxSLap: sLapMax,
    enabled: is1DMap,
  });

  // ── Subscribe to breakpoint-configs ───────────────────────────────────────
  useEffect(() => {
    const unsub = ConfigManager.subscribe<Record<string, BreakpointObject>>("breakpoint-configs", (v) => {
      setBreakpointConfigs(v ?? {});
    });
    return unsub;
  }, []);

  // 1. Filtrage classique basé sur la recherche
  const filteredBreakpointKeys = Object.keys(breakpointConfigs).filter(k =>
    k.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // 2. Garantir que la sélection actuelle de X est toujours dans la liste
  const optionsX = breakpointKeyX && !filteredBreakpointKeys.includes(breakpointKeyX)
    ? [breakpointKeyX, ...filteredBreakpointKeys] 
    : filteredBreakpointKeys;

  // 3. Garantir que la sélection actuelle de Y est toujours dans la liste
  const optionsY = breakpointKeyY && !filteredBreakpointKeys.includes(breakpointKeyY)
    ? [breakpointKeyY, ...filteredBreakpointKeys] 
    : filteredBreakpointKeys;

  // ── Synchronise rowHeaders/colHeaders when selected BP changes ─────────────
  useEffect(() => {
    const bp = breakpointConfigs[breakpointKeyX];
    if (bp && bp.values.length > 0 && bp.values.length !== rowHeaders.length) {
      setRowHeaders(bp.values);
      setNumRows(bp.values.length);
      // Resize grid if needed
      setGridData((prev) => {
        if (prev.length === bp.values.length) return prev;
        const cols = prev[0]?.length ?? numCols;
        if (bp.values.length < prev.length) return prev.slice(0, bp.values.length);
        return [...prev, ...Array(bp.values.length - prev.length).fill(null).map(() => Array(cols).fill(50))];
      });
    } else if (bp && bp.values.length === rowHeaders.length) {
      setRowHeaders(bp.values);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [breakpointKeyX, breakpointConfigs]);

  useEffect(() => {
    const bp = breakpointConfigs[breakpointKeyY];
    if (bp && bp.values.length > 0 && bp.values.length !== colHeaders.length) {
      setColHeaders(bp.values);
      setNumCols(bp.values.length);
      setGridData((prev) =>
        prev.map((row) => {
          if (row.length === bp.values.length) return row;
          if (bp.values.length < row.length) return row.slice(0, bp.values.length);
          return [...row, ...Array(bp.values.length - row.length).fill(50)];
        })
      );
    } else if (bp && bp.values.length === colHeaders.length) {
      setColHeaders(bp.values);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [breakpointKeyY, breakpointConfigs]);

  // ── Load initial data ──────────────────────────────────────────────────────
  useEffect(() => {
    const cartoConfigs = ConfigManager.get<Record<string, CartoObject>>("carto-configs") ?? {};
    setSavedConfigs(Object.keys(cartoConfigs));
    const lastConfig = ConfigManager.get<string | null>("current-carto-config");
    if (lastConfig) handleLoadConfig(lastConfig);
  }, []);

  // ── Load max sLap ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!datasetId) { setSLapMax(5000); return; }
    let alive = true;
    (async () => {
      try {
        const response = await queryDataset({ datasetId, signals: [], startDistance: 0, endDistance: 100000, maxPoints: 1 });
        if (alive && response.lap_distance?.length > 0) setSLapMax(Math.max(...response.lap_distance));
      } catch { if (alive) setSLapMax(5000); }
    })();
    return () => { alive = false; };
  }, [datasetId]);

  // ── Debounced back-write of rowHeaders → breakpoint object ────────────────
  const propagateHeadersToBp = useCallback((axis: "X" | "Y", values: number[]) => {
    const key = axis === "X" ? breakpointKeyX : breakpointKeyY;
    if (!key) return;
    if (bpSaveTimeoutRef.current) clearTimeout(bpSaveTimeoutRef.current);
    bpSaveTimeoutRef.current = setTimeout(() => {
      bpSaveTimeoutRef.current = null;
      const existing = ConfigManager.get<Record<string, BreakpointObject>>("breakpoint-configs") ?? {};
      if (!existing[key]) return;
      ConfigManager.set("breakpoint-configs", { ...existing, [key]: { ...existing[key], values } });
    }, 300);
  }, [breakpointKeyX, breakpointKeyY]);

  const setRowHeadersAndPropagate = useCallback((newHeaders: number[]) => {
    setRowHeaders(newHeaders);
    propagateHeadersToBp("X", newHeaders);
  }, [propagateHeadersToBp]);

  const setColHeadersAndPropagate = useCallback((newHeaders: number[]) => {
    setColHeaders(newHeaders);
    propagateHeadersToBp("Y", newHeaders);
  }, [propagateHeadersToBp]);

  // ── Heatmap color ──────────────────────────────────────────────────────────
  const getHeatmapColor = useCallback((value: number): string => {
    if (maxValue === minValue) return "rgba(34, 197, 94, 0.2)";
    const normalized = (value - minValue) / (maxValue - minValue);
    if (normalized < 0.5) {
      const t = normalized * 2;
      return `rgba(${Math.round(34 + (249 - 34) * t)}, ${Math.round(197 + (115 - 197) * t)}, ${Math.round(94 + (22 - 94) * t)}, 0.5)`;
    } else {
      const t = (normalized - 0.5) * 2;
      return `rgba(${Math.round(249 + (239 - 249) * t)}, ${Math.round(115 + (68 - 115) * t)}, ${Math.round(22 + (68 - 22) * t)}, 0.5)`;
    }
  }, [minValue, maxValue]);

  const updateGridCell = (row: number, col: number, value: number) => {
    setGridData((prev) => { const g = prev.map(r => [...r]); g[row][col] = value; return g; });
  };

  // Export grid with gain & offset applied (readonly view for Excel copy)
  const exportGrid: number[][] = useMemo(() => {
    return gridData.map((row) => row.map((v) => (Number.isFinite(v) ? v * gainVal + offsetVal : NaN)));
  }, [gridData, gainVal, offsetVal]);

  const exportDataToTsv = useCallback(() => {
    const lines: string[] = [];
    // header: empty corner + column headers
    for (let r = 0; r < exportGrid.length; r++) {
      const row = exportGrid[r];
      const cells = row.map((v) => (Number.isFinite(v) ? v.toFixed(6) : ""));
      lines.push(cells.join("\t"));
    }
    return lines.join("\n");
  }, [exportGrid, colHeaders, rowHeaders]);

  const copyXBreakpoints = useCallback(async () => {
    try {
      const text = rowHeaders.map((h) => String(h)).join("\t");
      await navigator.clipboard.writeText(text);
      setSaveMessage({ type: "success", text: "Breakpoints X copiés." });
      setTimeout(() => setSaveMessage(null), 1500);
    } catch {
      setSaveMessage({ type: "error", text: "Impossible de copier les breakpoints X." });
      setTimeout(() => setSaveMessage(null), 1500);
    }
  }, [rowHeaders]);

  const copyYBreakpoints = useCallback(async () => {
    try {
      const text = colHeaders.map((h) => String(h)).join("\t");
      await navigator.clipboard.writeText(text);
      setSaveMessage({ type: "success", text: "Breakpoints Y copiés." });
      setTimeout(() => setSaveMessage(null), 1500);
    } catch {
      setSaveMessage({ type: "error", text: "Impossible de copier les breakpoints Y." });
      setTimeout(() => setSaveMessage(null), 1500);
    }
  }, [colHeaders]);

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
      propagateHeadersToBp("Y", newHeaders);
      return newHeaders;
    });
  }, [propagateHeadersToBp]);

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
      propagateHeadersToBp("X", newHeaders);
      return newHeaders;
    });
  }, [propagateHeadersToBp]);

  // ============================================================================
  // GESTION DU REDIMENSIONNEMENT
  // ============================================================================

  const handleRowsChange = (newRows: number) => {
    if (newRows < 1 || newRows > 50) return;
    setNumRows(newRows);
    if (newRows > gridData.length) {
      const extra = Array(newRows - gridData.length).fill(null).map(() => Array(numCols).fill(50));
      setGridData(p => [...p, ...extra]);
      const extraH = Array(newRows - rowHeaders.length).fill(0).map((_, i) => (rowHeaders[rowHeaders.length - 1] || 0) + (i + 1) * 20);
      const newH = [...rowHeaders, ...extraH];
      setRowHeaders(newH);
      propagateHeadersToBp("X", newH);
    } else {
      setGridData(p => p.slice(0, newRows));
      const newH = rowHeaders.slice(0, newRows);
      setRowHeaders(newH);
      propagateHeadersToBp("X", newH);
    }
  };

  const handleColsChange = (newCols: number) => {
    if (newCols < 1 || newCols > 50) return;
    setNumCols(newCols);
    if (newCols > colHeaders.length) {
      setGridData(p => p.map(row => [...row, ...Array(newCols - row.length).fill(50)]));
      const extraH = Array(newCols - colHeaders.length).fill(0).map((_, i) => (colHeaders[colHeaders.length - 1] || 0) + (i + 1) * 1000);
      const newH = [...colHeaders, ...extraH];
      setColHeaders(newH);
      propagateHeadersToBp("Y", newH);
    } else {
      setGridData(p => p.map(row => row.slice(0, newCols)));
      const newH = colHeaders.slice(0, newCols);
      setColHeaders(newH);
      propagateHeadersToBp("Y", newH);
    }
  };

  const handleGainChange = (newGain: number) => { if (newGain < -50 || newGain > 50) return; setGainVal(newGain); };
  const handleOffsetChange = (newOffset: number) => { if (newOffset < -50 || newOffset > 50) return; setOffsetVal(newOffset); };

  // ============================================================================
  // BREAKPOINT MANAGEMENT
  // ============================================================================

  const handleCreateBreakpoint = () => {
    if (!newBpName.trim()) return;
    const name = newBpName.trim();
    const existing = ConfigManager.get<Record<string, BreakpointObject>>("breakpoint-configs") ?? {};
    if (existing[name]) {
      setSaveMessage({ type: "error", text: `Breakpoint "${name}" existe déjà.` });
      return;
    }
    const bp: BreakpointObject = { name, values: [0, 50, 100] };
    const updated = { ...existing, [name]: bp };
    ConfigManager.set("breakpoint-configs", updated);
    setBreakpointConfigs(updated);
    setActiveBpKey(name);
    setNewBpName("");
  };

  const handleDeleteBreakpoint = (key: string) => {
    const usage = bpUsage(key);
    if (usage.length > 0) {
      setSaveMessage({ type: "error", text: `Breakpoint "${key}" utilisé par : ${usage.join(", ")}. Retirez-le des cartos d'abord.` });
      return;
    }
    const existing = ConfigManager.get<Record<string, BreakpointObject>>("breakpoint-configs") ?? {};
    const updated = { ...existing };
    delete updated[key];
    ConfigManager.set("breakpoint-configs", updated);
    setBreakpointConfigs(updated);
    if (activeBpKey === key) setActiveBpKey(null);
  };

  const handleBpValuesChange = (key: string, raw: string) => {
    const values = raw.split(/[\t\n\r,;]+/)
      .map(v => parseFloat(v.replace(",", ".")))
      .filter(v => !isNaN(v));
    if (values.length === 0) return;
    const existing = ConfigManager.get<Record<string, BreakpointObject>>("breakpoint-configs") ?? {};
    if (!existing[key]) return;
    const updated = { ...existing, [key]: { ...existing[key], values } };
    ConfigManager.set("breakpoint-configs", updated);
    setBreakpointConfigs(updated);
  };

  // ============================================================================
  // ACTIONS (SAVE / LOAD / DELETE CARTO)
  // ============================================================================

  const handleSave = () => {
    setIsSaving(true);
    try {
      const existingCartos = ConfigManager.get<Record<string, CartoObject>>("carto-configs") ?? {};
      const carto: CartoObject = {
        name: outputChannelName,
        breakpointKeyX,
        breakpointKeyY: breakpointKeyY || undefined,
        gridData,
        gainVal,
        offsetVal,
        interpolation,
        extrapolation,
        braking_signal,
        defaultInputChannelX: defaultInputChannelX || undefined,
        defaultInputChannelY: defaultInputChannelY || undefined,
      };
      ConfigManager.set("carto-configs", { ...existingCartos, [outputChannelName]: carto });
      const updated = ConfigManager.get<Record<string, CartoObject>>("carto-configs") ?? {};
      setSavedConfigs(Object.keys(updated));
      setSaveMessage({ type: "success", text: `Carto "${outputChannelName}" sauvegardée.` });
      // Emit a legacy MapTuningData for onSave consumers (backward compat)
      onSave?.({
        inputChannelX: defaultInputChannelX,
        inputChannelY: defaultInputChannelY,
        outputChannelName,
        gridData,
        rowHeaders,
        colHeaders,
        braking_signal,
        gainVal,
        offsetVal,
        interpolation,
        extrapolation,
      });
      onSignalsUpdated?.();
    } catch {
      setSaveMessage({ type: "error", text: "Erreur lors de la sauvegarde." });
    } finally {
      setIsSaving(false);
    }
  };

  const handleImportComplete = useCallback(() => {
    // Refresh breakpoint configs
    const updated = ConfigManager.get<Record<string, BreakpointObject>>("breakpoint-configs") ?? {};
    setBreakpointConfigs(updated);
    setSaveMessage({ type: "success", text: "Cartos importées avec succès!" });
  }, []);

  // Debounced auto-save
  useEffect(() => {
    if (!outputChannelName) return;
    if (autoSaveTimeoutRef.current !== null) clearTimeout(autoSaveTimeoutRef.current);
    autoSaveTimeoutRef.current = setTimeout(() => {
      autoSaveTimeoutRef.current = null;
      try {
        const existing = ConfigManager.get<Record<string, CartoObject>>("carto-configs") ?? {};
        if (!existing[outputChannelName]) return; // Only update, never create from auto-save
        const carto: CartoObject = {
          name: outputChannelName,
          breakpointKeyX,
          breakpointKeyY: breakpointKeyY || undefined,
          gridData,
          gainVal,
          offsetVal,
          interpolation,
          extrapolation,
          braking_signal,
          defaultInputChannelX: defaultInputChannelX || undefined,
          defaultInputChannelY: defaultInputChannelY || undefined,
        };
        ConfigManager.set("carto-configs", { ...existing, [outputChannelName]: carto });
      } catch { /* ignore */ }
    }, 300);
    return () => { if (autoSaveTimeoutRef.current !== null) { clearTimeout(autoSaveTimeoutRef.current); autoSaveTimeoutRef.current = null; } };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultInputChannelX, defaultInputChannelY, outputChannelName, gridData, rowHeaders, colHeaders, braking_signal, gainVal, offsetVal, interpolation, extrapolation, breakpointKeyX, breakpointKeyY]);

  const handleLoadConfig = (name: string) => {
    const cartoConfigs = ConfigManager.get<Record<string, CartoObject>>("carto-configs") ?? {};
    const bpConfigs = ConfigManager.get<Record<string, BreakpointObject>>("breakpoint-configs") ?? {};
    ConfigManager.set("current-carto-config", name);
    const carto = cartoConfigs[name];
    if (carto) {
      setOutputChannelName(name);
      setBreakpointKeyX(carto.breakpointKeyX ?? "");
      setBreakpointKeyY(carto.breakpointKeyY ?? "");
      setDefaultInputChannelX(carto.defaultInputChannelX ?? "");
      setDefaultInputChannelY(carto.defaultInputChannelY ?? "");
      setGridData(carto.gridData);
      setNumRows(carto.gridData.length);
      setNumCols(carto.gridData[0]?.length ?? 1);
      // Load breakpoint values
      const rh = bpConfigs[carto.breakpointKeyX]?.values ?? carto.gridData.map((_, i) => i);
      const ch = (carto.breakpointKeyY ? bpConfigs[carto.breakpointKeyY]?.values : null) ?? (carto.gridData[0]?.map((_, i) => i) ?? []);
      setRowHeaders(rh);
      setColHeaders(ch);
      setBraking_signal(carto.braking_signal ?? false);
      setGainVal(carto.gainVal ?? 1);
      setOffsetVal(carto.offsetVal ?? 0);
      setInterpolation(carto.interpolation ?? "linear");
      setExtrapolation(carto.extrapolation ?? "clamp");
      setShowConfigMenu(false);
      setSaveMessage({ type: "success", text: `Carto "${name}" chargée.` });
    }
  };

  const handleDeleteConfig = (e: React.MouseEvent, name: string) => {
    e.stopPropagation();
    const cartoConfigs = ConfigManager.get<Record<string, CartoObject>>("carto-configs") ?? {};
    const updated = { ...cartoConfigs };
    delete updated[name];
    ConfigManager.set("carto-configs", updated);
    setSavedConfigs(Object.keys(updated));
  };

  return (
    <div className="panel" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      
      <div className="panel-header panel-header-tight">
        <h2>Map tuning</h2>
        <div style={{display: "flex", alignItems: "center"}}>
          <CartoImportPanel onImportComplete={handleImportComplete} />
          <div className="panel-badge">{outputChannelName}</div>
        </div>
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

      {/* ================================================================
          SECTION A — Bibliothèque locale de cartos
          ================================================================ */}
      <section className="map-tuning-section" style={{ position: "relative" }}>
        <h3>Cartos sauvegardées</h3>
        <button
          className="small-button"
          style={{ width: "100%" }}
          onClick={() => setShowConfigMenu(!showConfigMenu)}
        >
          📂 {savedConfigs.length} carto{savedConfigs.length !== 1 ? "s" : ""} sauvegardée{savedConfigs.length !== 1 ? "s" : ""}
        </button>

        {showConfigMenu && (
          <div style={{
            position: "absolute", top: "100%", left: 0, right: 0,
            background: "var(--bg-3)", border: "1px solid var(--line)",
            zIndex: 100, maxHeight: "50vh", overflowY: "auto", marginTop: "2px"
          }}>
            <input
              type="text"
              placeholder="Filtrer..."
              value={configFilter}
              onChange={e => setConfigFilter(e.target.value)}
              style={{
                width: "100%", padding: "0.5rem", borderBottom: "1px solid var(--line)",
                background: "var(--bg-2)", color: "var(--fg-1)", border: "none",
                boxSizing: "border-box", fontSize: "0.8rem"
              }}
            />
            {savedConfigs.length === 0 ? (
              <div style={{ padding: "1rem", textAlign: "center", fontSize: "0.8rem", color: "var(--fg-2)" }}>Aucune carto</div>
            ) : (
              savedConfigs
                .filter(name => name.toLowerCase().includes(configFilter.toLowerCase()))
                .map(name => {
                  const c = cartoConfigsAll[name];
                  return (
                    <div
                      key={name}
                      onClick={() => handleLoadConfig(name)}
                      style={{
                        padding: "0.5rem", cursor: "pointer", display: "flex",
                        justifyContent: "space-between", borderBottom: "1px solid var(--line)", fontSize: "0.8rem"
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = "rgba(255, 70, 93, 0.15)"}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                    >
                      <div>
                        <span>{name}</span>
                        {c && (
                          <span style={{ fontSize: "0.7rem", color: "var(--fg-2)", marginLeft: "0.5rem" }}>
                            {c.gridData.length}×{c.gridData[0]?.length ?? 1}
                            {" · "}{c.breakpointKeyX || "—"}{c.breakpointKeyY ? ` × ${c.breakpointKeyY}` : ""}
                          </span>
                        )}
                      </div>
                      <button
                        onClick={e => handleDeleteConfig(e, name)}
                        style={{ background: "none", border: "none", color: "var(--magenta)", cursor: "pointer" }}
                      >✕</button>
                    </div>
                  );
                })
            )}
          </div>
        )}
      </section>

      {/* ================================================================
          SECTION B — Configuration de la carto sélectionnée
          ================================================================ */}

      {/* Coherence warning */}
      {bpCoherenceError && (
        <div style={{
          padding: "0.5rem", fontSize: "0.75rem", border: "1px solid var(--magenta)",
          background: "rgba(255,43,79,0.1)", color: "var(--magenta)", borderRadius: "3px"
        }}>
          ⚠ {bpCoherenceError}
        </div>
      )}

      {/* Breakpoint selectors */}
      <section className="map-tuning-section">
        <h3>Configuration de la carto</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem" }}>
          {/* Champ de recherche pour les Breakpoints */}
          <div style={{ marginBottom: "1rem" }}>
            <label className="field-label">Rechercher un Breakpoint</label>
            <input
              type="text"
              placeholder="Ex: bp_vitesse..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ width: "100%", padding: "0.25rem", boxSizing: "border-box" }}
            />
          </div>

          {/* Breakpoint X */}
          <div>
            <label className="field-label">Breakpoint X (lignes)</label>
            <select
              className="mini-select"
              style={{ width: "100%" }}
              value={breakpointKeyX}
              onChange={e => setBreakpointKeyX(e.target.value)}
            >
              <option value="">— Aucun —</option>
              {optionsX.map(k => (
                <option key={k} value={k}>{k} ({breakpointConfigs[k].values.length} pts)</option>
              ))}
            </select>
            {breakpointKeyX && breakpointConfigs[breakpointKeyX] && (
              <p style={{ fontSize: "0.7rem", color: "var(--fg-2)", margin: "0.25rem 0 0" }}>
                [{breakpointConfigs[breakpointKeyX].values.slice(0, 5).join(", ")}{breakpointConfigs[breakpointKeyX].values.length > 5 ? ", …" : ""}]
              </p>
            )}
          </div>

          {/* Breakpoint Y */}
          <div>
            <label className="field-label">Breakpoint Y (colonnes)</label>
            <select
              className="mini-select"
              style={{ width: "100%" }}
              value={breakpointKeyY}
              onChange={e => setBreakpointKeyY(e.target.value)}
            >
              <option value="">— Aucun (1D) —</option>
              {optionsY.map(k => (
                <option key={k} value={k}>{k} ({breakpointConfigs[k].values.length} pts)</option>
              ))}
            </select>
            {breakpointKeyY && breakpointConfigs[breakpointKeyY] && (
              <p style={{ fontSize: "0.7rem", color: "var(--fg-2)", margin: "0.25rem 0 0" }}>
                [{breakpointConfigs[breakpointKeyY].values.slice(0, 5).join(", ")}{breakpointConfigs[breakpointKeyY].values.length > 5 ? ", …" : ""}]
              </p>
            )}
          </div>

          {/* Carto name + interp/extrap */}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <div>
              <label className="field-label">Nom de la carto</label>
              <input className="topbar-user-input" style={{ width: "100%" }} type="text" value={outputChannelName} onChange={e => setOutputChannelName(e.target.value)} />
            </div>
            <div>
              <label className="field-label">Interpolation</label>
              <select className="mini-select" style={{ width: "100%" }} value={interpolation}
                onChange={e => setInterpolation(e.target.value as CartoObject["interpolation"])}>
                {INTERPOLATION_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label className="field-label">Extrapolation (hors breakpoints)</label>
              <select className="mini-select" style={{ width: "100%" }} value={extrapolation}
                onChange={e => setExtrapolation(e.target.value as CartoObject["extrapolation"])}>
                {EXTRAPOLATION_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <input type="checkbox" id="isBrakeSignal" checked={braking_signal}
                onChange={e => setBraking_signal(e.target.checked)}
                style={{ cursor: "pointer", accentColor: "var(--cyan)" }} />
              <label htmlFor="isBrakeSignal" className="field-label" style={{ margin: 0, cursor: "pointer" }}>Braking signal ?</label>
            </div>
          </div>
        </div>

        {/* Indicative channels */}
        <div style={{ marginTop: "0.75rem", padding: "0.5rem", background: "var(--bg-2)", borderRadius: "3px", border: "1px solid var(--line)" }}>
          <p style={{ fontSize: "0.75rem", color: "var(--fg-2)", margin: "0 0 0.5rem" }}>
            🔍 <em>Channels indicatifs — visualisation uniquement (highlight cellule, statistiques 1D). Le calcul réel utilise les channels déclarés dans le bloc SoftTab.</em>
          </p>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <div>
              <label className="field-label">Filter channels</label>
              <input type="text" className="signals-filter-input" value={channelFilter}
                onChange={e => setChannelFilter(e.target.value)} placeholder="Filtrer..." />
            </div>
            <div>
              <label className="field-label">Channel X indicatif</label>
              <select className="mini-select" value={defaultInputChannelX} onChange={e => setDefaultInputChannelX(e.target.value)}>
                <option value="">— Aucun —</option>
                {availableSignals.filter(ch => ch.toLowerCase().includes(channelFilter.toLowerCase()))
                  .map(ch => <option key={ch} value={ch}>{ch}</option>)}
                {defaultInputChannelX && !availableSignals.includes(defaultInputChannelX) &&
                  <option value={defaultInputChannelX}>{defaultInputChannelX}</option>}
              </select>
            </div>
            <div>
              <label className="field-label">Channel Y indicatif</label>
              <select className="mini-select" value={defaultInputChannelY} onChange={e => setDefaultInputChannelY(e.target.value)}>
                <option value="">— Aucun —</option>
                {availableSignals.filter(ch => ch.toLowerCase().includes(channelFilter.toLowerCase()))
                  .map(ch => <option key={ch} value={ch}>{ch}</option>)}
                {defaultInputChannelY && !availableSignals.includes(defaultInputChannelY) &&
                  <option value={defaultInputChannelY}>{defaultInputChannelY}</option>}
              </select>
            </div>
          </div>
        </div>
      </section>

      {/* Contrôles Grille */}
      <section className="map-tuning-section">
        <div className="map-tuning-grid-controls">
          <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
            <span className="field-label" style={{ margin: 0 }}>Lines:</span>
            <button className="small-button" onClick={() => handleRowsChange(numRows - 1)}>−</button>
            <span style={{ minWidth: "20px", textAlign: "center" }}>{numRows}</span>
            <button className="small-button" onClick={() => handleRowsChange(numRows + 1)}>+</button>
          </div>
          <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
            <span className="field-label" style={{ margin: 0 }}>Columns:</span>
            <button className="small-button" onClick={() => handleColsChange(numCols - 1)}>−</button>
            <span style={{ minWidth: "20px", textAlign: "center" }}>{numCols}</span>
            <button className="small-button" onClick={() => handleColsChange(numCols + 1)}>+</button>
          </div>
          <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
            <span className="field-label" style={{ margin: 0 }}>Gain:</span>
            <button className="small-button" onClick={() => handleGainChange(gainVal - 0.1)}>−</button>
            <span style={{ minWidth: "20px", textAlign: "center" }}>{gainVal}</span>
            <button className="small-button" onClick={() => handleGainChange(gainVal + 0.1)}>+</button>
          </div>
          <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
            <span className="field-label" style={{ margin: 0 }}>Offset:</span>
            <button className="small-button" onClick={() => handleOffsetChange(offsetVal - 0.1)}>−</button>
            <span style={{ minWidth: "20px", textAlign: "center" }}>{offsetVal}</span>
            <button className="small-button" onClick={() => handleOffsetChange(offsetVal + 0.1)}>+</button>
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
              <th style={{ position: "sticky", top: 0, left: 0, zIndex: 10 }}>
                {breakpointKeyX || "X"} \ {breakpointKeyY || "Y"}
              </th>
              {colHeaders.map((h, i) => (
                <th key={i} style={{ position: "sticky", top: 0, zIndex: 5 }}>
                  <NumberInput
                    value={h}
                    onChange={val => {
                      const newH = [...colHeaders]; newH[i] = val;
                      setColHeadersAndPropagate(newH);
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
                      const newH = [...rowHeaders]; newH[rIdx] = val;
                      setRowHeadersAndPropagate(newH);
                    }}
                    onPaste={(e) => handlePasteRowHeaders(e, rIdx)}
                  />
                </td>
                {row.map((val, cIdx) => {
                  const isExact = highlightInfo?.exact?.row === rIdx && highlightInfo?.exact?.col === cIdx;
                  const isNearest = !isExact && (highlightInfo?.nearest?.some(c => c.row === rIdx && c.col === cIdx) ?? false);
                  return (
                    <td key={cIdx}
                      className={["map-tuning-heatmap-cell", isExact ? "lut-cell-active" : "", isNearest ? "lut-cell-nearby" : ""].filter(Boolean).join(" ")}
                      style={{ backgroundColor: getHeatmapColor(val) }}>
                      <NumberInput value={val} onChange={v => updateGridCell(rIdx, cIdx, v)} onPaste={e => handlePaste(e, rIdx, cIdx)} />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* 1D Map Usage Coverage Panel */}
      {is1DMap && (
        <section className="map-tuning-section">
          {usageStats.loading && (
            <div style={{ padding: "1rem", fontSize: "0.8rem", color: "var(--fg-2)" }}>
              ⏳ Calculating usage statistics...
            </div>
          )}

          {usageStats.error && (
            <div style={{ 
              padding: "0.5rem", 
              fontSize: "0.8rem", 
              border: "1px solid var(--magenta)", 
              background: "rgba(255, 43, 79, 0.1)",
              color: "var(--magenta)",
              borderRadius: "4px"
            }}>
              Error: {usageStats.error}
            </div>
          )}

          {usageStats.stats && usageStats.stats.length > 0 && (
            <>
              <div style={{
                display: "flex",
                flexDirection: is1DByRows ? "row" : "column",
                gap: "0.5rem",
                alignItems: is1DByRows ? "flex-end" : "center",
                justifyContent: "space-between",
                borderRadius: "4px",
                marginBottom: "1rem",
                width: "100%",
                boxSizing: "border-box"
              }}>
                <div  
                  key='def'
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: "0.25rem",
                    flexGrow: '1'
                  }}></div>
                {usageStats.stats.map((stat) => {
                  const maxPercent = Math.max(...usageStats.stats!.map(s => s.usagePercentage));
                  const normalized = maxPercent > 0 ? stat.usagePercentage / maxPercent : 0;
                  
                  // Gradient: green (low) -> orange (mid) -> red (high)
                  let bgColor: string;
                  if (normalized < 0.5) {
                    const t = normalized * 2;
                    const r = Math.round(34 + (249 - 34) * t);
                    const g = Math.round(197 + (115 - 197) * t);
                    const b = Math.round(94 + (22 - 94) * t);
                    bgColor = `rgb(${r}, ${g}, ${b})`;
                  } else {
                    const t = (normalized - 0.5) * 2;
                    const r = Math.round(249 + (239 - 249) * t);
                    const g = Math.round(115 + (68 - 115) * t);
                    const b = Math.round(22 + (68 - 22) * t);
                    bgColor = `rgb(${r}, ${g}, ${b})`;
                  }
                  
                  return (
                    <div
                      key={stat.cellIndex}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: "0.25rem",
                        flex: '1 0 0'
                      }}
                    >
                      <div style={{
                        padding: "0.5rem",
                        background: bgColor,
                        border: "1px solid var(--line)",
                        borderRadius: "2px",
                        minWidth: "50px",
                        textAlign: "center",
                        fontSize: "0.75rem",
                        color: "var(--fg-1)",
                        fontWeight: "500",
                        width: "100%",
                        height: `${20 * Number(stat.usagePercentage.toFixed(1)) / 100 + 2}rem`
                      }}>
                        {stat.usagePercentage.toFixed(1)}%
                      </div>
                      <div style={{
                        fontSize: "0.7rem",
                        fontWeight: "bold",
                        color: "var(--fg-1)",
                        textAlign: "center",
                      }}>
                        {is1DByRows ? colHeaders[stat.cellIndex] : rowHeaders[stat.cellIndex].toFixed(2)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {usageStats.stats && usageStats.stats.length === 0 && !usageStats.loading && (
            <div style={{ padding: "1rem", fontSize: "0.8rem", color: "var(--fg-2)", textAlign: "center" }}>
              No data in the selected sLap range
            </div>
          )}
          <h3>1D Map Usage Coverage</h3>
          
          <div style={{ display: "flex", gap: "1rem", marginBottom: "1rem", alignItems: "center" }}>
            <div>
              <label className="field-label">sLap Min (m)</label>
              <NumberInput 
                value={sLapMin}
                onChange={(val) => setSLapMin(Math.max(0, val))}
              />
            </div>
            <div>
              <label className="field-label">sLap Max (m)</label>
              <NumberInput 
                value={sLapMax}
                onChange={(val) => setSLapMax(Math.max(sLapMin, val))}
              />
            </div>
          </div>
        </section>
      )}

      {/* Légende et Actions */}
      <footer style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: "1rem" }}>
        {/* Action Bar */}
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", justifyContent: "space-between" }}>
          <button className="small-button" onClick={handleSave} disabled={isSaving}>
            {isSaving ? "⏳ Loading..." : "💾 Save"}
          </button>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button
              className="small-button"
              onClick={() => setShow3DViewer((s) => !s)}
              aria-expanded={show3DViewer}
              style={{
                background: show3DViewer ? "rgba(255, 70, 93, 0.2)" : undefined,
                borderColor: show3DViewer ? "var(--magenta)" : undefined,
              }}
            >
              {show3DViewer ? "Hide 3D" : "View 3D"}
            </button>
            <button
              className="small-button"
              onClick={() => setShowExportPanel((s) => !s)}
              aria-expanded={showExportPanel}
              style={{
                background: showExportPanel ? "rgba(255, 70, 93, 0.2)" : undefined,
                borderColor: showExportPanel ? "var(--magenta)" : undefined,
              }}
            >
              {showExportPanel ? "Hide export" : "Show export"}
            </button>
          </div>
        </div>

        {/* Heatmap Legend */}
        <div className="map-tuning-legend">
          <span>Legend Heatmap :</span>
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
        </div>

        {/* 3D Viewer Panel */}
        {show3DViewer && (
          <div style={{ 
            border: "1px solid var(--line)", 
            borderRadius: "4px", 
            padding: "0.5rem",
            background: "var(--bg-2)",
            minHeight: "400px",
            maxHeight: "50vh",
            overflow: "auto"
          }}>
            <Map3DViewer
              gridData={gridData}
              rowHeaders={rowHeaders}
              colHeaders={colHeaders}
              inputChannelX={defaultInputChannelX || breakpointKeyX}
              inputChannelY={defaultInputChannelY || breakpointKeyY}
              outputChannelName={outputChannelName}
              gainVal={gainVal}
              offsetVal={offsetVal}
            />
          </div>
        )}

        {/* Export Panel */}
        {showExportPanel && (
          <div style={{ marginTop: "0.5rem" }}>
            <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem", alignItems: "center" }}>
              <button
                className="small-button"
                onClick={async () => {
                  try {
                    const tsv = exportDataToTsv();
                    await navigator.clipboard.writeText(tsv);
                    setSaveMessage({ type: "success", text: "Table copied in clipboard" });
                    setTimeout(() => setSaveMessage(null), 1500);
                  } catch {
                    setSaveMessage({ type: "error", text: "Impossible to copy the table." });
                    setTimeout(() => setSaveMessage(null), 1500);
                  }
                }}
              >
                Copy values
              </button>

              <button className="small-button" onClick={copyXBreakpoints}>Copy breakpoints X</button>
              <button className="small-button" onClick={copyYBreakpoints}>Copy breakpoints Y</button>
              <span style={{ marginLeft: "auto", fontSize: "0.85rem", color: "var(--fg-2)" }}>Values = cell * gain + offset</span>
            </div>

            <div style={{ overflowX: "auto" }}>
              <table className="map-tuning-export-table">
                <thead>
                  <tr>
                    <th>{breakpointKeyX || "X"} \ {breakpointKeyY || "Y"}</th>
                    {colHeaders.map((h, i) => (
                      <th key={i}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {exportGrid.map((rowVals, rIdx) => (
                    <tr key={rIdx}>
                      <td className="export-row-header">{rowHeaders[rIdx]}</td>
                      {rowVals.map((v, cIdx) => (
                        <td key={cIdx}>{Number.isFinite(v) ? v.toFixed(6) : ""}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </footer>

      {/* ================================================================
          SECTION A — Gestionnaire de breakpoints
          ================================================================ */}
      <section className="map-tuning-section">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}
             onClick={() => setShowBpSection(s => !s)}>
          <h3 style={{ margin: 0 }}>Breakpoints ({Object.keys(breakpointConfigs).length})</h3>
          <span style={{ fontSize: "0.8rem", color: "var(--fg-2)" }}>{showBpSection ? "▲ Masquer" : "▼ Afficher"}</span>
        </div>

        {showBpSection && (
          <div style={{ marginTop: "0.75rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {/* Create new breakpoint */}
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <input
                type="text"
                className="topbar-user-input"
                placeholder="Nom du breakpoint (ex : BP_N_Engine)"
                value={newBpName}
                onChange={e => setNewBpName(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") handleCreateBreakpoint(); }}
                style={{ flex: 1 }}
              />
              <button className="small-button" onClick={handleCreateBreakpoint} disabled={!newBpName.trim()}>
                + Créer
              </button>
            </div>

            {/* List of breakpoints */}
            {Object.keys(breakpointConfigs).length === 0 ? (
              <p style={{ fontSize: "0.8rem", color: "var(--fg-2)" }}>Aucun breakpoint. Créez-en un ci-dessus.</p>
            ) : (
              Object.entries(breakpointConfigs).map(([key, bp]) => {
                const usedBy = bpUsage(key);
                const isActive = activeBpKey === key;
                return (
                  <div key={key} style={{
                    border: `1px solid ${isActive ? "var(--accent)" : "var(--line)"}`,
                    borderRadius: "4px",
                    padding: "0.5rem",
                    background: isActive ? "rgba(255,70,93,0.05)" : "transparent"
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <button
                        className="small-button"
                        style={{ padding: "0 6px" }}
                        onClick={() => setActiveBpKey(isActive ? null : key)}
                        title="Éditer les valeurs"
                      >{isActive ? "▲" : "▼"}</button>
                      <strong style={{ fontSize: "0.85rem", flex: 1 }}>{key}</strong>
                      <span style={{ fontSize: "0.75rem", color: "var(--fg-2)" }}>
                        {bp.values.length} pts
                        {usedBy.length > 0 && ` · utilisé par : ${usedBy.join(", ")}`}
                      </span>
                      <button
                        className="soft-icon-btn soft-icon-btn-danger"
                        onClick={() => handleDeleteBreakpoint(key)}
                        title="Supprimer ce breakpoint"
                        disabled={usedBy.length > 0}
                      >×</button>
                    </div>

                    {isActive && (
                      <div style={{ marginTop: "0.5rem" }}>
                        <label className="field-label" style={{ fontSize: "0.75rem" }}>
                          Valeurs (séparées par tabulation, virgule, espace ou nouvelle ligne)
                        </label>
                        <textarea
                          style={{
                            width: "100%", fontFamily: "monospace", fontSize: "0.75rem",
                            background: "var(--bg-2)", color: "var(--fg-1)",
                            border: "1px solid var(--line)", borderRadius: "3px",
                            padding: "0.25rem", boxSizing: "border-box", resize: "vertical", minHeight: "48px"
                          }}
                          defaultValue={bp.values.join("\t")}
                          onBlur={e => handleBpValuesChange(key, e.target.value)}
                          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleBpValuesChange(key, (e.target as HTMLTextAreaElement).value); } }}
                        />
                        <p style={{ fontSize: "0.7rem", color: "var(--fg-2)", margin: "0.25rem 0 0" }}>
                          Modifier les valeurs ici les propagera à toutes les cartos qui utilisent ce breakpoint.
                        </p>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}
      </section>
    </div>
  );
}