/**
 * SoftTab - Soft computation blocks editor
 *
 * Each SoftBlock is an ordered pipeline of operations (math expressions or 2D LUTs).
 * Operations in a block run sequentially; the output of op N is available as input to op N+1.
 */
import React, { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { analyzeMathExpression } from "../mathChannels";
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

const NumInput: React.FC<{
  value: number;
  onChange: (v: number) => void;
  style?: React.CSSProperties;
  onPaste?: (e: React.ClipboardEvent<HTMLInputElement>) => void;
}> = ({ value, onChange, style, onPaste }) => {
  const [local, setLocal] = useState(String(value));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setLocal(String(value));
  }, [value, focused]);

  return (
    <input
      type="text"
      value={local}
      style={style}
      className="table-input"
      onChange={(e) => setLocal(e.target.value)}
      onFocus={(e) => { setFocused(true); e.target.select(); }}
      onBlur={() => {
        setFocused(false);
        const v = parseFloat(local.replace(",", "."));
        if (!isNaN(v)) { onChange(v); setLocal(String(v)); }
        else setLocal(String(value));
      }}
      onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
      onPaste={onPaste}
    />
  );
};

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
              Aller à Rejeu Cartos →
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
            <option value="">— choisir une map —</option>
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
            Grille: <strong>{selected.rowHeaders.length} × {selected.colHeaders.length}</strong>
            {"  ·  "}
            Gain: <strong>{selected.gainVal}</strong>
            {"  ·  "}
            Offset: <strong>{selected.offsetVal}</strong>
          </span>
          {selected.braking_signal && (
            <span className="soft-deps" style={{ color: "#ff8a33" }}>⚠ filtrage freinage actif</span>
          )}
        </div>
      )}

      {op.mapConfigKey && !selected && (
        <p className="soft-expr-error-msg">Map "{op.mapConfigKey}" introuvable — elle a peut-être été supprimée.</p>
      )}
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
      <label className="soft-field-row">
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
      </label>
      {exprError && <p className="soft-expr-error-msg">{exprError}</p>}
      {op.dependencies.length > 0 && !exprError && (
        <p className="soft-deps">Dépendances: {op.dependencies.join(", ")}</p>
      )}
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
          {op.kind === "math" ? "MATH" : "LUT2D"}
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
          <span className="soft-op-preview" title={op.mapConfigKey || "non lié"}>
            {op.mapConfigKey || "— non lié —"}
          </span>
        )}
        <div className="soft-op-actions">
          <button className="soft-icon-btn" onClick={onMoveUp} disabled={isFirst} title="Monter">↑</button>
          <button className="soft-icon-btn" onClick={onMoveDown} disabled={isLast} title="Descendre">↓</button>
          <button className="soft-icon-btn" onClick={() => setExpanded((p) => !p)} title="Éditer">
            {expanded ? "▲" : "▼"}
          </button>
          <button className="soft-icon-btn soft-icon-btn-danger" onClick={onDelete} title="Supprimer">×</button>
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
  mapConfigs: Record<string, MapTuningData>;
  onSwitchToMapTuning?: () => void;
}> = ({ block, blockIndex, allBlocks, baseSignals, status, onUpdate, onDelete, onCalculate, mapConfigs, onSwitchToMapTuning }) => {
  const [collapsed, setCollapsed] = useState(false);
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

  const statusLabel = status.state === "running" ? "…"
    : status.state === "done" ? "✓"
    : status.state === "error" ? "!"
    : "";

  const statusClass = `soft-block-status-${status.state}`;

  return (
    <div className="soft-block-card">
      <div className="soft-block-header">
        <button
          className="soft-block-collapse-btn"
          onClick={() => setCollapsed((p) => !p)}
          title={collapsed ? "Déployer" : "Réduire"}
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
          disabled={status.state === "running" || block.operations.length === 0}
          title="Calculer ce bloc"
        >
          {status.state === "running" ? "…" : "▶ Run"}
        </button>
        <button className="soft-icon-btn soft-icon-btn-danger" onClick={onDelete} title="Supprimer le bloc">×</button>
      </div>

      {!collapsed && (
        <div className="soft-block-body">
          {block.operations.length === 0 && (
            <p className="soft-empty-msg">Aucune opération — ajoutez-en une ci-dessous.</p>
          )}
          {block.operations.map((op, opIndex) => {
            const sigsBefore = signalsBeforeOp(baseSignals, block, opIndex, allBlocks, blockIndex);
            return (
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
            );
          })}

          {status.state === "error" && status.error && (
            <p className="soft-block-error">{status.error}</p>
          )}

          <div className="soft-add-op-row">
            <button className="small-button" onClick={addMathOp}>+ Math</button>
            <button className="small-button" onClick={addLutOp}>+ LUT 2D</button>
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
}: SoftTabProps) {
  const addBlock = () => {
    onChange([
      ...softBlocks,
      {
        id: makeId("blk"),
        name: `Bloc ${softBlocks.length + 1}`,
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

  const runAll = useCallback(() => {
    softBlocks.forEach((b) => onCalculateBlock(b.id));
  }, [softBlocks, onCalculateBlock]);

  return (
    <div className="soft-tab">
      <div className="soft-tab-header">
        <div className="soft-tab-title">
          <h3>Blocs Soft</h3>
          {!datasetId && <span className="soft-no-dataset">Dataset requis pour calculer</span>}
        </div>
        <div className="soft-tab-actions">
          <button
            className="small-button"
            onClick={runAll}
            disabled={!datasetId || softBlocks.length === 0}
            title="Calculer tous les blocs"
          >
            ▶▶ Tout calculer
          </button>
          <button className="small-button" onClick={addBlock}>
            + Bloc
          </button>
        </div>
      </div>

      {softBlocks.length === 0 ? (
        <div className="soft-empty-state">
          <p>Aucun bloc soft défini.</p>
          <p>Créez un bloc pour définir un pipeline de calcul (expressions math et/ou LUT 2D).</p>
          <button className="small-button" onClick={addBlock}>+ Créer un bloc</button>
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
              mapConfigs={mapConfigs}
              onSwitchToMapTuning={onSwitchToMapTuning}
            />
          ))}
        </div>
      )}
    </div>
  );
}
