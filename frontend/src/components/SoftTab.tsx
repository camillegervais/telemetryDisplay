/**
 * SoftTab - Soft computation blocks editor
 *
 * Each SoftBlock is an ordered pipeline of operations (math expressions or 2D LUTs).
 * Operations in a block run sequentially; the output of op N is available as input to op N+1.
 */
import React, { useState, useCallback, useMemo, useEffect } from "react";
import { analyzeMathExpression } from "../mathChannels";
import { getFunctionDocumentation, getOperatorDocumentation } from "../mathFunctions";
import type { SoftBlock, SoftOperation, SoftMathOp, SoftLutOp, MapTuningData } from "../types";

// ── Status ────────────────────────────────────────────────────────────────────

export type BlockStatus = {
  state: "idle" | "running" | "done" | "error";
  error?: string;
};

// ── Props ─────────────────────────────────────────────────────────────────────

interface SoftTabProps {
  availableSignals: string[];
  datasetId: string | null;
  softBlocks: SoftBlock[];
  onChange: (blocks: SoftBlock[]) => void;
  onCalculateBlock: (blockId: string) => void;
  blockStatuses: Record<string, BlockStatus>;
  mapConfigs: Record<string, MapTuningData>;
  onSwitchToMapTuning?: () => void;
  /** Called when duplicating a block that contains lut2d ops — passes cloned map config entries to persist */
  onDuplicateMapConfigs?: (additions: Record<string, MapTuningData>) => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;
}

function defaultMathOp(): SoftMathOp {
  return { id: makeId("op"), kind: "math", name: "new_signal", expression: "", dependencies: [] };
}

function defaultLutOp(): SoftLutOp {
  return { id: makeId("op"), kind: "lut2d", name: "new_map", mapConfigKey: "" };
}

/** Signals available BEFORE operation at opIndex in the given block */
function signalsBeforeOp(
  baseSignals: string[],
  block: SoftBlock,
  opIndex: number,
  allBlocks: SoftBlock[],
  currentBlockIndex: number
): string[] {
  const result = new Set(baseSignals);
  // Add outputs from all preceding blocks
  for (let bi = 0; bi < currentBlockIndex; bi++) {
    for (const op of allBlocks[bi].operations) result.add(op.name);
  }
  // Add outputs from preceding ops in current block
  for (let oi = 0; oi < opIndex; oi++) {
    result.add(block.operations[oi].name);
  }
  return Array.from(result);
}

// ── Compact number input ──────────────────────────────────────────────────────

// const NumInput: React.FC<{
//   value: number;
//   onChange: (v: number) => void;
//   style?: React.CSSProperties;
//   onPaste?: (e: React.ClipboardEvent<HTMLInputElement>) => void;
// }> = ({ value, onChange, style, onPaste }) => {
//   const [local, setLocal] = useState(String(value));
//   const [focused, setFocused] = useState(false);

//   useEffect(() => {
//     if (!focused) setLocal(String(value));
//   }, [value, focused]);

//   return (
//     <input
//       type="text"
//       value={local}
//       style={style}
//       className="table-input"
//       onChange={(e) => setLocal(e.target.value)}
//       onFocus={(e) => { setFocused(true); e.target.select(); }}
//       onBlur={() => {
//         setFocused(false);
//         const v = parseFloat(local.replace(",", "."));
//         if (!isNaN(v)) { onChange(v); setLocal(String(v)); }
//         else setLocal(String(value));
//       }}
//       onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
//       onPaste={onPaste}
//     />
//   );
// };

// ── LUT map reference editor ──────────────────────────────────────────────────

const LutRefEditor: React.FC<{
  op: SoftLutOp;
  onUpdate: (patch: Partial<SoftLutOp>) => void;
  mapConfigs: Record<string, MapTuningData>;
  onSwitchToMapTuning?: () => void;
}> = ({ op, onUpdate, mapConfigs, onSwitchToMapTuning }) => {
  const mapKeys = Object.keys(mapConfigs);
  const selected = mapConfigs[op.mapConfigKey];

  return (
    <div className="soft-lut-editor">
      {mapKeys.length === 0 ? (
        <p className="soft-expr-error-msg">
          Aucune map sauvegardée.{" "}
          {onSwitchToMapTuning && (
            <button className="link-btn" onClick={onSwitchToMapTuning}>
              Go to Map Tuning →
            </button>
          )}
        </p>
      ) : (
        <label className="soft-field-row">
          <span>Map</span>
          <select
            className="soft-select"
            value={op.mapConfigKey}
            onChange={(e) => onUpdate({ mapConfigKey: e.target.value })}
          >
            <option value="">— choose a map —</option>
            {mapKeys.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        </label>
      )}

      {selected && (
        <div className="soft-lut-info">
          <span className="soft-deps">
            X: <strong>{selected.inputChannelX || "—"}</strong>
            {"  ·  "}
            Y: <strong>{selected.inputChannelY || "—"}</strong>
            {"  ·  "}
            Grid: <strong>{selected.rowHeaders.length} × {selected.colHeaders.length}</strong>
            {"  ·  "}
            Gain: <strong>{selected.gainVal}</strong>
            {"  ·  "}
            Offset: <strong>{selected.offsetVal}</strong>
          </span>
          {selected.braking_signal && (
            <span className="soft-deps" style={{ color: "#ff8a33" }}>⚠ active braking filtering</span>
          )}
        </div>
      )}

      {op.mapConfigKey && !selected && (
        <p className="soft-expr-error-msg">Map "{op.mapConfigKey}" unavailable — might be deleted.</p>
      )}
    </div>
  );
};

// ── Math help panel ─────────────────────────────────────────────────────────

const MathHelpPanel: React.FC = () => {
  const functions = useMemo(() => getFunctionDocumentation(), []);
  const operators = useMemo(() => getOperatorDocumentation(), []);

  return (
    <div className="soft-help-panel">
      <div className="soft-help-section">
        <span className="soft-help-section-title">Functions</span>
        <table className="soft-help-table">
          <tbody>
            {functions.map(({ name, description }) => (
              <tr key={name}>
                <td className="soft-help-name">{name}</td>
                <td className="soft-help-desc">{description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="soft-help-section">
        <span className="soft-help-section-title">Operators</span>
        <table className="soft-help-table">
          <tbody>
            {operators.map(({ symbol, description }) => (
              <tr key={symbol}>
                <td className="soft-help-name">{symbol}</td>
                <td className="soft-help-desc">{description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ── Math operation editor ─────────────────────────────────────────────────────

const MathOpEditor: React.FC<{
  op: SoftMathOp;
  availableSignals: string[];
  onUpdate: (patch: Partial<SoftMathOp>) => void;
}> = ({ op, availableSignals, onUpdate }) => {
  const [exprDraft, setExprDraft] = useState(op.expression);
  const [exprError, setExprError] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => { setExprDraft(op.expression); }, [op.expression]);

  const validateAndCommit = () => {
    const { dependencies, error } = analyzeMathExpression(exprDraft, availableSignals);
    setExprError(error);
    if (!error) {
      onUpdate({ expression: exprDraft, dependencies });
    }
  };

  return (
    <div className="soft-math-editor">
      <div className="soft-field-row">
        <span>Expression</span>
        <input
          type="text"
          className={`soft-expr-input ${exprError ? "soft-expr-error" : ""}`}
          value={exprDraft}
          onChange={(e) => { setExprDraft(e.target.value); setExprError(null); }}
          onBlur={validateAndCommit}
          onKeyDown={(e) => { if (e.key === "Enter") { e.currentTarget.blur(); } }}
          placeholder="ex: RPM * TPS / 100"
          spellCheck={false}
        />
        <button
          className={`soft-help-btn ${showHelp ? "soft-help-btn-active" : ""}`}
          onClick={() => setShowHelp((p) => !p)}
          title="Aide — fonctions et opérateurs disponibles"
          type="button"
        >
          ?
        </button>
      </div>
      {exprError && <p className="soft-expr-error-msg">{exprError}</p>}
      {op.dependencies.length > 0 && !exprError && (
        <p className="soft-deps">Dependencies: {op.dependencies.join(", ")}</p>
      )}
      {showHelp && <MathHelpPanel />}
    </div>
  );
};

// ── Single operation row ──────────────────────────────────────────────────────

const OperationRow: React.FC<{
  op: SoftOperation;
  opIndex: number;
  availableSignals: string[];
  onUpdate: (patch: Partial<SoftOperation>) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  isFirst: boolean;
  isLast: boolean;
  mapConfigs: Record<string, MapTuningData>;
  onSwitchToMapTuning?: () => void;
}> = ({ op, opIndex, availableSignals, onUpdate, onDelete, onMoveUp, onMoveDown, isFirst, isLast, mapConfigs, onSwitchToMapTuning }) => {
  const [expanded, setExpanded] = useState(false);
  const [nameEdit, setNameEdit] = useState(op.name);
  const [nameError, setNameError] = useState<string | null>(null);

  useEffect(() => { setNameEdit(op.name); }, [op.name]);

  const validateName = (name: string): string | null => {
    if (!name.trim()) return "Nom requis";
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name.trim())) return "Lettres/chiffres/underscore";
    return null;
  };

  const commitName = () => {
    const err = validateName(nameEdit);
    setNameError(err);
    if (!err && nameEdit.trim() !== op.name) {
      onUpdate({ name: nameEdit.trim() } as Partial<SoftOperation>);
    }
  };

  return (
    <div className={`soft-op-row ${expanded ? "soft-op-row-expanded" : ""}`}>
      <div className="soft-op-header">
        <span className={`soft-op-badge soft-op-badge-${op.kind}`}>
          {op.kind === "math" ? "MATH" : "MAP"}
        </span>
        <span className="soft-op-index">{opIndex + 1}</span>
        <input
          type="text"
          className={`soft-op-name-input ${nameError ? "soft-expr-error" : ""}`}
          value={nameEdit}
          onChange={(e) => { setNameEdit(e.target.value); setNameError(null); }}
          onBlur={commitName}
          onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
          title={nameError ?? "Nom du signal de sortie"}
        />
        {op.kind === "math" && (
          <span className="soft-op-preview" title={op.expression}>= {op.expression || "…"}</span>
        )}
        {op.kind === "lut2d" && (
          <span className="soft-op-preview" title={op.mapConfigKey || "not linked"}>
            {op.mapConfigKey || "— not linked —"}
          </span>
        )}
        <div className="soft-op-actions">
          <button className="soft-icon-btn" onClick={onMoveUp} disabled={isFirst} title="Go up">↑</button>
          <button className="soft-icon-btn" onClick={onMoveDown} disabled={isLast} title="Go down">↓</button>
          <button className="soft-icon-btn" onClick={() => setExpanded((p) => !p)} title="Edit">
            {expanded ? "▲" : "▼"}
          </button>
          <button className="soft-icon-btn soft-icon-btn-danger" onClick={onDelete} title="Delete">×</button>
        </div>
      </div>

      {expanded && (
        <div className="soft-op-body">
          {op.kind === "math" ? (
            <MathOpEditor
              op={op}
              availableSignals={availableSignals}
              onUpdate={(patch) => onUpdate(patch as Partial<SoftOperation>)}
            />
          ) : (
            <LutRefEditor
              op={op}
              mapConfigs={mapConfigs}
              onSwitchToMapTuning={onSwitchToMapTuning}
              onUpdate={(patch) => onUpdate(patch as Partial<SoftOperation>)}
            />
          )}
        </div>
      )}
    </div>
  );
};

// ── Single block card ─────────────────────────────────────────────────────────

const BlockCard: React.FC<{
  block: SoftBlock;
  blockIndex: number;
  allBlocks: SoftBlock[];
  baseSignals: string[];
  status: BlockStatus;
  onUpdate: (patch: Partial<SoftBlock>) => void;
  onDelete: () => void;
  onCalculate: () => void;
  onDuplicate?: () => void;
  mapConfigs: Record<string, MapTuningData>;
  onSwitchToMapTuning?: () => void;
}> = ({ block, blockIndex, allBlocks, baseSignals, status, onUpdate, onDelete, onCalculate, onDuplicate, mapConfigs, onSwitchToMapTuning }) => {
  const [collapsed, setCollapsed] = useState(true);
  const [nameEdit, setNameEdit] = useState(block.name);

  useEffect(() => { setNameEdit(block.name); }, [block.name]);

  const updateOp = useCallback((opId: string, patch: Partial<SoftOperation>) => {
    onUpdate({
      operations: block.operations.map((op) =>
        op.id === opId ? ({ ...op, ...patch } as SoftOperation) : op
      ),
    });
  }, [block.operations, onUpdate]);

  const deleteOp = useCallback((opId: string) => {
    onUpdate({ operations: block.operations.filter((op) => op.id !== opId) });
  }, [block.operations, onUpdate]);

  const moveOp = useCallback((opIndex: number, direction: -1 | 1) => {
    const ops = [...block.operations];
    const targetIndex = opIndex + direction;
    if (targetIndex < 0 || targetIndex >= ops.length) return;
    [ops[opIndex], ops[targetIndex]] = [ops[targetIndex], ops[opIndex]];
    onUpdate({ operations: ops });
  }, [block.operations, onUpdate]);

  const addMathOp = () => onUpdate({ operations: [...block.operations, defaultMathOp()] });
  const addLutOp = () => onUpdate({ operations: [...block.operations, defaultLutOp()] });

  // Insert a math op just after the given op index
  const insertMathAfter = (opIndex: number) => {
    const ops = [...block.operations];
    ops.splice(opIndex + 1, 0, defaultMathOp());
    onUpdate({ operations: ops });
  };

  // Append a LUT op at the end of the block
  const appendLutAtEnd = () => onUpdate({ operations: [...block.operations, defaultLutOp()] });

  const GapBetweenOps: React.FC<{ index: number }> = ({ index }) => {
    const [hover, setHover] = useState(false);
    return (
      <div
        className="soft-op-gap"
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{ display: "flex", justifyContent: "center", padding: 4 }}
      >
        {hover && (
          <div className="gap-operation">
            <button className="small-button" onClick={() => insertMathAfter(index)} style={{ marginRight: 8 }}>+ Math after</button>
            <button className="small-button" onClick={appendLutAtEnd}>+ LUT 2D after</button>
          </div>
        )}
      </div>
    );
  };
  const statusLabel = status.state === "running" ? "…"
    : status.state === "done" ? "✓"
    : status.state === "error" ? "!"
    : "";

  const statusClass = `soft-block-status-${status.state}`;

  const enabled = block.enabled !== false;

  return (
    <div className={`soft-block-card${enabled ? "" : " soft-block-card-disabled"}`}>
      <div className="soft-block-header">
        <input
          type="checkbox"
          className="soft-block-enable-checkbox"
          checked={enabled}
          onChange={(e) => onUpdate({ enabled: e.target.checked })}
          title={enabled ? "Deactivate this bloc" : "Activate this bloc"}
        />
        <button
          className="soft-block-collapse-btn"
          onClick={() => setCollapsed((p) => !p)}
          title={collapsed ? "Expand" : "Minimize"}
        >
          {collapsed ? "▶" : "▼"}
        </button>
        <input
          type="text"
          className="soft-block-name-input"
          value={nameEdit}
          onChange={(e) => setNameEdit(e.target.value)}
          onBlur={() => {
            if (nameEdit.trim() && nameEdit.trim() !== block.name) {
              onUpdate({ name: nameEdit.trim() });
            } else {
              setNameEdit(block.name);
            }
          }}
          onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
        />
        <span className="soft-block-op-count">{block.operations.length} op{block.operations.length !== 1 ? "s" : ""}</span>
        <span className={`soft-block-status ${statusClass}`} title={status.error}>{statusLabel}</span>
        <button
          className="small-button soft-run-btn"
          onClick={onCalculate}
          disabled={!enabled || status.state === "running" || block.operations.length === 0}
          title={enabled ? "Compute this bloc" : "Bloc deactivated"}
        >
          {status.state === "running" ? "…" : "▶ Run"}
        </button>
        <button className="soft-icon-btn" onClick={onDuplicate} title="Duplicate this bloc">⧉</button>
        <button className="soft-icon-btn soft-icon-btn-danger" onClick={onDelete} title="Delete this bloc">×</button>
      </div>

      {!collapsed && (
        <div className="soft-block-body">
          {block.operations.length === 0 && (
            <p className="soft-empty-msg">No operation — add one below.</p>
          )}
          {block.operations.map((op, opIndex) => {
            const sigsBefore = signalsBeforeOp(baseSignals, block, opIndex, allBlocks, blockIndex);
            return (

            <div key={op.id}> 
              <OperationRow
                key={op.id}
                op={op}
                opIndex={opIndex}
                availableSignals={sigsBefore}
                onUpdate={(patch) => updateOp(op.id, patch)}
                onDelete={() => deleteOp(op.id)}
                onMoveUp={() => moveOp(opIndex, -1)}
                onMoveDown={() => moveOp(opIndex, 1)}
                isFirst={opIndex === 0}
                isLast={opIndex === block.operations.length - 1}
                mapConfigs={mapConfigs}
                onSwitchToMapTuning={onSwitchToMapTuning}
              />
              <GapBetweenOps index={opIndex} />
            </div>
            )
          })}

          {status.state === "error" && status.error && (
            <p className="soft-block-error">{status.error}</p>
          )}

          <div className="soft-add-op-row">
            <button className="small-button" onClick={addMathOp}>+ MATH</button>
            <button className="small-button" onClick={addLutOp}>+ MAP</button>
          </div>
        </div>
      )}
    </div>
  );
};

// ── Main SoftTab component ────────────────────────────────────────────────────

export default function SoftTab({
  availableSignals,
  datasetId,
  softBlocks,
  onChange,
  onCalculateBlock,
  blockStatuses,
  mapConfigs,
  onSwitchToMapTuning,
  onDuplicateMapConfigs,
}: SoftTabProps) {
  const addBlock = () => {
    onChange([
      ...softBlocks,
      {
        id: makeId("blk"),
        name: `Bloc ${softBlocks.length + 1}`,
        enabled: true,
        operations: [],
      },
    ]);
  };

  const updateBlock = useCallback((blockId: string, patch: Partial<SoftBlock>) => {
    onChange(softBlocks.map((b) => (b.id === blockId ? { ...b, ...patch } : b)));
  }, [softBlocks, onChange]);

  const deleteBlock = useCallback((blockId: string) => {
    onChange(softBlocks.filter((b) => b.id !== blockId));
  }, [softBlocks, onChange]);

  const duplicateBlock = useCallback((blockId: string) => {
    const idx = softBlocks.findIndex((b) => b.id === blockId);
    if (idx === -1) return;
    const src = softBlocks[idx];

    // Helper: strip existing _EvoN suffix if present
    const stripEvo = (s: string) => s.replace(/_Evo\d+$/, "");

    // Find next global Evo counter by scanning all block/operation names AND map config keys
    let maxN = 0;
    const evoRe = /_Evo(\d+)$/;
    for (const b of softBlocks) {
      const m = b.name.match(evoRe);
      if (m) maxN = Math.max(maxN, parseInt(m[1], 10));
      for (const op of b.operations) {
        const mo = op.name.match(evoRe);
        if (mo) maxN = Math.max(maxN, parseInt(mo[1], 10));
      }
    }
    // Also scan existing map config keys for _EvoN to avoid collisions
    for (const key of Object.keys(mapConfigs)) {
      const mk = key.match(evoRe);
      if (mk) maxN = Math.max(maxN, parseInt(mk[1], 10));
    }

    const nextN = maxN + 1;
    const suffix = `_Evo${nextN}`;

    const baseBlockName = stripEvo(src.name || `Bloc ${idx + 1}`);
    let newBlockName = `${baseBlockName}${suffix}`;

    // Ensure uniqueness (rare): increment nextN if collision
    const existingNames = new Set(softBlocks.map((b) => b.name));
    let curN = nextN;
    while (existingNames.has(newBlockName)) {
      curN += 1;
      newBlockName = `${baseBlockName}_Evo${curN}`;
    }

    // Build mapping oldOpName -> newOpName (strip old Evo suffixes first)
    const nameMap: Record<string, string> = {};
    for (const op of src.operations) {
      const baseOpName = stripEvo(op.name);
      nameMap[op.name] = `${baseOpName}${suffix}`;
    }

    // Build mapping oldMapKey -> newMapKey for lut2d ops, and clone the map configs
    const mapKeyMap: Record<string, string> = {};
    const mapAdditions: Record<string, MapTuningData> = {};
    const existingMapKeys = new Set(Object.keys(mapConfigs));
    for (const op of src.operations) {
      if (op.kind !== "lut2d" || !op.mapConfigKey) continue;
      const srcMapKey = op.mapConfigKey;
      if (mapKeyMap[srcMapKey]) continue; // already handled (shared key across multiple ops)
      const baseMapKey = stripEvo(srcMapKey);
      let newMapKey = `${baseMapKey}${suffix}`;
      let mCurN = nextN;
      while (existingMapKeys.has(newMapKey)) {
        mCurN += 1;
        newMapKey = `${baseMapKey}_Evo${mCurN}`;
      }
      existingMapKeys.add(newMapKey); // reserve it
      mapKeyMap[srcMapKey] = newMapKey;
      if (mapConfigs[srcMapKey]) {
        // Deep-clone the map config under the new key and update its internal name
        const cloned = JSON.parse(JSON.stringify(mapConfigs[srcMapKey]));
        cloned.outputChannelName = newMapKey;
        mapAdditions[newMapKey] = cloned;
      }
    }

    const escapeRegExp = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    // Clone operations: new ids, new names, replace references in expressions & dependencies
    const newOps = src.operations.map((op) => {
      const newName = nameMap[op.name];
      let newExpr = op.kind === "math" && typeof op.expression === "string" ? op.expression : (op as any).expression;
      if (newExpr && typeof newExpr === "string") {
        // Replace occurrences of any old op names with their new names (word boundaries)
        for (const [oldName, newN] of Object.entries(nameMap)) {
          const re = new RegExp(`\\b${escapeRegExp(oldName)}\\b`, "g");
          newExpr = newExpr.replace(re, newN);
        }
      }

      const newDeps = (op as any).dependencies?.map((d: string) => {
        return nameMap[d] ?? d;
      }) ?? [];

      const newMapConfigKey = op.kind === "lut2d"
        ? (mapKeyMap[op.mapConfigKey] ?? op.mapConfigKey)
        : undefined;

      return {
        ...op,
        id: makeId("op"),
        name: newName,
        expression: newExpr,
        dependencies: newDeps,
        ...(op.kind === "lut2d" ? { mapConfigKey: newMapConfigKey } : {}),
      } as SoftOperation;
    });

    const newBlock: SoftBlock = {
      ...src,
      id: makeId("blk"),
      name: newBlockName,
      operations: newOps,
    };

    const next = [...softBlocks.slice(0, idx + 1), newBlock, ...softBlocks.slice(idx + 1)];

    // Persist cloned map configs before updating soft blocks
    if (Object.keys(mapAdditions).length > 0) {
      onDuplicateMapConfigs?.(mapAdditions);
    }

    onChange(next);
  }, [softBlocks, onChange, mapConfigs, onDuplicateMapConfigs]);

  const runAll = useCallback(() => {
    softBlocks.forEach((b) => onCalculateBlock(b.id));
  }, [softBlocks, onCalculateBlock]);

  return (
    <div className="soft-tab">
      <div className="soft-tab-header">
        <div className="soft-tab-title">
          <h3>Software blocs</h3>
          {!datasetId && <span className="soft-no-dataset">Dataset required to compute</span>}
        </div>
        <div className="soft-tab-actions">
          <button
            className="small-button"
            onClick={runAll}
            disabled={!datasetId || softBlocks.length === 0}
            title="Calculer tous les blocs"
          >
            ▶▶ Compute all
          </button>
          <button className="small-button" onClick={addBlock}>
            + Bloc
          </button>
        </div>
      </div>

      {softBlocks.length === 0 ? (
        <div className="soft-empty-state">
          <p>No software bloc defined.</p>
          <p>Create a bloc to define a computation pipeline (Math epxression and/or MAP).</p>
          <button className="small-button" onClick={addBlock}>+ Create a bloc</button>
        </div>
      ) : (
        <div className="soft-block-list">
          {softBlocks.map((block, blockIndex) => (
            <BlockCard
              key={block.id}
              block={block}
              blockIndex={blockIndex}
              allBlocks={softBlocks}
              baseSignals={availableSignals}
              status={blockStatuses[block.id] ?? { state: "idle" }}
              onUpdate={(patch) => updateBlock(block.id, patch)}
              onDelete={() => deleteBlock(block.id)}
              onCalculate={() => onCalculateBlock(block.id)}
              onDuplicate={() => duplicateBlock(block.id)}
              mapConfigs={mapConfigs}
              onSwitchToMapTuning={onSwitchToMapTuning}
            />
          ))}
        </div>
      )}
    </div>
  );
}
