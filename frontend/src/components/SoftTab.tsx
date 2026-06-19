/**
 * SoftTab - Soft computation blocks editor
 *
 * Each SoftBlock is an ordered pipeline of operations (math expressions or 2D LUTs).
 * Operations in a block run sequentially; the output of op N is available as input to op N+1.
 */
import React, { useState, useCallback, useMemo, useEffect } from "react";
import { analyzeMathExpression } from "../mathChannels";
import { getFunctionDocumentation, getOperatorDocumentation } from "../mathFunctions";
import { updateSignalMetadata } from "../api";
import type { SoftBlock, SoftOperation, SoftMathOp, SoftLutOp, MapTuningData, CartoObject } from "../types";

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
  /** New carto system configs (carto-configs) */
  cartoConfigs?: Record<string, CartoObject>;
  onSwitchToMapTuning?: () => void;
  /** Called when duplicating a block that contains lut2d ops — passes cloned map config entries to persist */
  onDuplicateMapConfigs?: (additions: Record<string, MapTuningData>) => void;
  /** Called when duplicating a block — passes cloned carto config entries to persist */
  onDuplicateCartoConfigs?: (additions: Record<string, CartoObject>) => void;
  /** Called after display_signal toggle to refresh metadata from backend */
  onRefreshDatasetMetadata?: () => Promise<void>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;
}

function defaultMathOp(): SoftMathOp {
  return {
    id: makeId("op"),
    kind: "math",
    name: "new_signal",
    expression: "",
    dependencies: [],
    displaySignal: true,
  };
}

function defaultLutOp(): SoftLutOp {
  return {
    id: makeId("op"),
    kind: "lut2d",
    name: "new_map",
    cartoKey: "",
    inputChannelX: "",
    inputChannelY: "",
    displaySignal: true,
  };
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
  cartoConfigs?: Record<string, CartoObject>;
  availableSignals: string[];
  onSwitchToMapTuning?: () => void;
}> = ({ op, onUpdate, mapConfigs, cartoConfigs, availableSignals, onSwitchToMapTuning }) => {
  // Determine active key and mode
  const useNewModel = !!cartoConfigs && Object.keys(cartoConfigs).length > 0;
  const activeCartoKey = op.cartoKey ?? op.mapConfigKey ?? "";

  // New model: select from carto-configs
  if (useNewModel) {
    const cartoKeys = Object.keys(cartoConfigs!);
    const selectedCarto = cartoConfigs![activeCartoKey];
    const is2D = selectedCarto ? !!selectedCarto.breakpointKeyY : true;

    return (
      <div className="soft-lut-editor">
        {cartoKeys.length === 0 ? (
          <p className="soft-expr-error-msg">
            Aucune carto sauvegardée.{" "}
            {onSwitchToMapTuning && (
              <button className="link-btn" onClick={onSwitchToMapTuning}>Go to Map Tuning →</button>
            )}
          </p>
        ) : (
          <label className="soft-field-row">
            <span>Carto</span>
            <select
              className="soft-select"
              value={activeCartoKey}
              onChange={e => onUpdate({ cartoKey: e.target.value, mapConfigKey: undefined })}
            >
              <option value="">— choisir une carto —</option>
              {[...cartoKeys]
                .sort((a, b) => a.localeCompare(b))
                .map(k => (
                  <option key={k} value={k}>
                    {k}{cartoConfigs![k] ? ` (${cartoConfigs![k].gridData.length}×${cartoConfigs![k].gridData[0]?.length ?? 1})` : ""}
                  </option>
              ))}
            </select>
          </label>
        )}

        {selectedCarto && (
          <>
            <div className="soft-lut-info">
              <span className="soft-deps">
                BP X: <strong>{selectedCarto.breakpointKeyX || "—"}</strong>
                {selectedCarto.breakpointKeyY && <>{" · "}BP Y: <strong>{selectedCarto.breakpointKeyY}</strong></>}
                {"  ·  "}Gain: <strong>{selectedCarto.gainVal}</strong>
                {"  ·  "}Offset: <strong>{selectedCarto.offsetVal}</strong>
              </span>
              {selectedCarto.braking_signal && (
                <span className="soft-deps" style={{ color: "#ff8a33" }}>⚠ active braking filtering</span>
              )}
            </div>

            {/* Channel selectors — these drive the actual calculation */}
            <div style={{ display: "flex", gap: "0.75rem", marginTop: "0.5rem", flexWrap: "wrap" }}>
              <label className="soft-field-row" style={{ flex: 1, minWidth: "160px" }}>
                <span>Channel X <span style={{ color: "var(--fg-2)", fontSize: "0.7rem" }}>(calcul)</span></span>
                <select
                  className="soft-select"
                  value={op.inputChannelX ?? ""}
                  onChange={e => onUpdate({ inputChannelX: e.target.value })}
                >
                  <option value="">— choisir un channel —</option>
                  {availableSignals.map(s => <option key={s} value={s}>{s}</option>)}
                  {op.inputChannelX && !availableSignals.includes(op.inputChannelX) && (
                    <option value={op.inputChannelX}>{op.inputChannelX}</option>
                  )}
                </select>
              </label>

              {is2D && (
                <label className="soft-field-row" style={{ flex: 1, minWidth: "160px" }}>
                  <span>Channel Y <span style={{ color: "var(--fg-2)", fontSize: "0.7rem" }}>(calcul)</span></span>
                  <select
                    className="soft-select"
                    value={op.inputChannelY ?? ""}
                    onChange={e => onUpdate({ inputChannelY: e.target.value })}
                  >
                    <option value="">— choisir un channel —</option>
                    {availableSignals.map(s => <option key={s} value={s}>{s}</option>)}
                    {op.inputChannelY && !availableSignals.includes(op.inputChannelY) && (
                      <option value={op.inputChannelY}>{op.inputChannelY}</option>
                    )}
                  </select>
                </label>
              )}
            </div>
          </>
        )}

        {activeCartoKey && !selectedCarto && (
          <p className="soft-expr-error-msg">Carto "{activeCartoKey}" introuvable — peut-être supprimée.</p>
        )}
      </div>
    );
  }

  // Legacy model: mapConfigKey (kept for backward compatibility during transition)
  const mapKeys = Object.keys(mapConfigs);
  const selected = mapConfigs[activeCartoKey];

  return (
    <div className="soft-lut-editor">
      {mapKeys.length === 0 ? (
        <p className="soft-expr-error-msg">
          Aucune map sauvegardée.{" "}
          {onSwitchToMapTuning && (
            <button className="link-btn" onClick={onSwitchToMapTuning}>Go to Map Tuning →</button>
          )}
        </p>
      ) : (
        <label className="soft-field-row">
          <span>Map (legacy)</span>
          <select
            className="soft-select"
            value={activeCartoKey}
            onChange={e => onUpdate({ mapConfigKey: e.target.value })}
          >
            <option value="">— choose a map —</option>
            {mapKeys.map(k => <option key={k} value={k}>{k}</option>)}
          </select>
        </label>
      )}

      {selected && (
        <div className="soft-lut-info">
          <span className="soft-deps">
            X: <strong>{selected.inputChannelX || "—"}</strong>
            {"  ·  "}Y: <strong>{selected.inputChannelY || "—"}</strong>
            {"  ·  "}Grid: <strong>{selected.rowHeaders.length} × {selected.colHeaders.length}</strong>
            {"  ·  "}Gain: <strong>{selected.gainVal}</strong>
            {"  ·  "}Offset: <strong>{selected.offsetVal}</strong>
          </span>
          {selected.braking_signal && (
            <span className="soft-deps" style={{ color: "#ff8a33" }}>⚠ active braking filtering</span>
          )}
        </div>
      )}

      {activeCartoKey && !selected && (
        <p className="soft-expr-error-msg">Map "{activeCartoKey}" unavailable — might be deleted.</p>
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
  cartoConfigs?: Record<string, CartoObject>;
  onSwitchToMapTuning?: () => void;
  datasetId?: string | null;
  onRefreshDatasetMetadata?: () => Promise<void>;
}> = ({ op, opIndex, availableSignals, onUpdate, onDelete, onMoveUp, onMoveDown, isFirst, isLast, mapConfigs, cartoConfigs, onSwitchToMapTuning, datasetId, onRefreshDatasetMetadata }) => {
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
          <span className="soft-op-preview" title={(op.cartoKey || op.mapConfigKey) || "not linked"}>
            {(op.cartoKey || op.mapConfigKey) || "— not linked —"}
          </span>
        )}
        <div className="soft-op-actions">
          <label className="ios-toggle" title={op.displaySignal ?? true ? "Hide this output" : "Show this output"}>
            <input
              type="checkbox"
              checked={!!op.displaySignal}
              onChange={async (e) => {
                const newValue = e.target.checked;
                onUpdate({ displaySignal: newValue });
                if (datasetId && op.name) {
                  try {
                    await updateSignalMetadata(datasetId, op.name, { display_signal: newValue });
                    await onRefreshDatasetMetadata?.();
                  } catch (error) {
                    console.error("Failed to update signal metadata:", error);
                  }
                }
              }}
            />
            <span className={`ios-switch ${op.displaySignal ? "ios-switch-on" : "ios-switch-off"}`} />
          </label>
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
              cartoConfigs={cartoConfigs}
              availableSignals={availableSignals}
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
  cartoConfigs?: Record<string, CartoObject>;
  onSwitchToMapTuning?: () => void;
  datasetId?: string | null;
  onRefreshDatasetMetadata?: () => Promise<void>;
}> = ({ block, blockIndex, allBlocks, baseSignals, status, onUpdate, onDelete, onCalculate, onDuplicate, mapConfigs, cartoConfigs, onSwitchToMapTuning, datasetId, onRefreshDatasetMetadata }) => {
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
                cartoConfigs={cartoConfigs}
                onSwitchToMapTuning={onSwitchToMapTuning}
                datasetId={datasetId}
                onRefreshDatasetMetadata={onRefreshDatasetMetadata}
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
  cartoConfigs,
  onSwitchToMapTuning,
  onDuplicateMapConfigs,
  onDuplicateCartoConfigs,
  onRefreshDatasetMetadata,
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

    const stripEvo = (s: string) => s.replace(/_Evo\d+$/, "");

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
    for (const key of Object.keys(mapConfigs)) {
      const mk = key.match(evoRe);
      if (mk) maxN = Math.max(maxN, parseInt(mk[1], 10));
    }
    for (const key of Object.keys(cartoConfigs ?? {})) {
      const mk = key.match(evoRe);
      if (mk) maxN = Math.max(maxN, parseInt(mk[1], 10));
    }

    const nextN = maxN + 1;
    const suffix = `_Evo${nextN}`;

    const baseBlockName = stripEvo(src.name || `Bloc ${idx + 1}`);
    let newBlockName = `${baseBlockName}${suffix}`;
    const existingNames = new Set(softBlocks.map((b) => b.name));
    let curN = nextN;
    while (existingNames.has(newBlockName)) { curN += 1; newBlockName = `${baseBlockName}_Evo${curN}`; }

    const nameMap: Record<string, string> = {};
    for (const op of src.operations) {
      nameMap[op.name] = `${stripEvo(op.name)}${suffix}`;
    }

    // Legacy map config duplication
    const mapKeyMap: Record<string, string> = {};
    const mapAdditions: Record<string, MapTuningData> = {};
    const existingMapKeys = new Set(Object.keys(mapConfigs));
    for (const op of src.operations) {
      if (op.kind !== "lut2d" || !(op as SoftLutOp).mapConfigKey) continue;
      const srcKey = (op as SoftLutOp).mapConfigKey!;
      if (mapKeyMap[srcKey]) continue;
      let newKey = `${stripEvo(srcKey)}${suffix}`;
      let mN = nextN;
      while (existingMapKeys.has(newKey)) { mN += 1; newKey = `${stripEvo(srcKey)}_Evo${mN}`; }
      existingMapKeys.add(newKey);
      mapKeyMap[srcKey] = newKey;
      if (mapConfigs[srcKey]) {
        const cloned = JSON.parse(JSON.stringify(mapConfigs[srcKey]));
        cloned.outputChannelName = newKey;
        mapAdditions[newKey] = cloned;
      }
    }

    // New carto duplication
    const cartoKeyMap: Record<string, string> = {};
    const cartoAdditions: Record<string, CartoObject> = {};
    const existingCartoKeys = new Set(Object.keys(cartoConfigs ?? {}));
    for (const op of src.operations) {
      if (op.kind !== "lut2d" || !(op as SoftLutOp).cartoKey) continue;
      const srcKey = (op as SoftLutOp).cartoKey!;
      if (cartoKeyMap[srcKey]) continue;
      let newKey = `${stripEvo(srcKey)}${suffix}`;
      let cN = nextN;
      while (existingCartoKeys.has(newKey)) { cN += 1; newKey = `${stripEvo(srcKey)}_Evo${cN}`; }
      existingCartoKeys.add(newKey);
      cartoKeyMap[srcKey] = newKey;
      const srcCarto = cartoConfigs?.[srcKey];
      if (srcCarto) {
        const cloned: CartoObject = { ...JSON.parse(JSON.stringify(srcCarto)), name: newKey };
        cartoAdditions[newKey] = cloned;
      }
    }

    const escapeRegExp = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    const newOps = src.operations.map((op) => {
      const newName = nameMap[op.name];
      let newExpr = op.kind === "math" ? (op as SoftMathOp).expression : undefined;
      if (newExpr) {
        for (const [oldName, newN] of Object.entries(nameMap)) {
          newExpr = newExpr.replace(new RegExp(`\\b${escapeRegExp(oldName)}\\b`, "g"), newN);
        }
      }
      const newDeps = (op as any).dependencies?.map((d: string) => nameMap[d] ?? d) ?? [];
      const lutOp = op as SoftLutOp;
      return {
        ...op,
        id: makeId("op"),
        name: newName,
        ...(op.kind === "math" ? { expression: newExpr, dependencies: newDeps } : {}),
        ...(op.kind === "lut2d" ? {
          mapConfigKey: lutOp.mapConfigKey ? (mapKeyMap[lutOp.mapConfigKey] ?? lutOp.mapConfigKey) : undefined,
          cartoKey: lutOp.cartoKey ? (cartoKeyMap[lutOp.cartoKey] ?? lutOp.cartoKey) : undefined,
        } : {}),
      } as SoftOperation;
    });

    const newBlock: SoftBlock = { ...src, id: makeId("blk"), name: newBlockName, operations: newOps };
    const next = [...softBlocks.slice(0, idx + 1), newBlock, ...softBlocks.slice(idx + 1)];

    if (Object.keys(mapAdditions).length > 0) onDuplicateMapConfigs?.(mapAdditions);
    if (Object.keys(cartoAdditions).length > 0) onDuplicateCartoConfigs?.(cartoAdditions);

    onChange(next);
  }, [softBlocks, onChange, mapConfigs, cartoConfigs, onDuplicateMapConfigs, onDuplicateCartoConfigs]);

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
              cartoConfigs={cartoConfigs}
              onSwitchToMapTuning={onSwitchToMapTuning}
              datasetId={datasetId}
              onRefreshDatasetMetadata={onRefreshDatasetMetadata}
            />
          ))}
        </div>
      )}
    </div>
  );
}
