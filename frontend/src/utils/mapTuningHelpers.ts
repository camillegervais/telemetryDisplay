import type { CellHighlightInfo } from "../types/ConfigTypes";

/**
 * Finds which cell(s) in a 2D LUT map correspond to given channel values.
 *
 * The LUT axes:
 *   - colHeaders: breakpoints for input channel X (column axis)
 *   - rowHeaders: breakpoints for input channel Y (row axis)
 *
 * Matching strategy:
 *   - If both X and Y fall inside the breakpoint ranges, determine the
 *     interpolation cell (the cell whose bottom-left corner brackets the point).
 *     The four corners of that interpolation region are returned as `nearest`.
 *     If the point lands exactly on a breakpoint intersection, `exact` is set.
 *   - If the point is outside the breakpoint range on one or both axes, the
 *     closest boundary cell is returned as `exact` (clamped).
 *
 * @param channelX  Current value of the X-axis input channel
 * @param channelY  Current value of the Y-axis input channel
 * @param rowHeaders  Sorted (or unsorted) breakpoints for the Y axis
 * @param colHeaders  Sorted (or unsorted) breakpoints for the X axis
 */
export function findCellIndices(
  channelX: number,
  channelY: number,
  rowHeaders: number[],
  colHeaders: number[]
): CellHighlightInfo {
  if (rowHeaders.length === 0 || colHeaders.length === 0) {
    return { exact: null, nearest: null };
  }

  // Work on sorted copies (keep original indices via argsort)
  const sortedColIdx = argsort(colHeaders);
  const sortedRowIdx = argsort(rowHeaders);
  const sortedCols = sortedColIdx.map((i) => colHeaders[i]);
  const sortedRows = sortedRowIdx.map((i) => rowHeaders[i]);

  // Find bracketing indices in the sorted arrays
  const colBracket = findBracket(sortedCols, channelX);
  const rowBracket = findBracket(sortedRows, channelY);

  const colLow = sortedColIdx[colBracket.low];
  const colHigh = sortedColIdx[colBracket.high];
  const rowLow = sortedRowIdx[rowBracket.low];
  const rowHigh = sortedRowIdx[rowBracket.high];

  // Exact match: channel lands exactly on a breakpoint in both axes
  const exactCol = colBracket.exact ? colLow : null;
  const exactRow = rowBracket.exact ? rowLow : null;

  if (exactRow !== null && exactCol !== null) {
    return { exact: { row: exactRow, col: exactCol }, nearest: null };
  }

  // No exact match → return the surrounding cells
  // (up to 4 corners of the interpolation rectangle)
  const corners = deduplicateCells([
    { row: rowLow, col: colLow },
    { row: rowLow, col: colHigh },
    { row: rowHigh, col: colLow },
    { row: rowHigh, col: colHigh },
  ]);

  return { exact: null, nearest: corners };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Returns indices that would sort `arr` in ascending order */
function argsort(arr: number[]): number[] {
  return arr
    .map((val, idx) => ({ val, idx }))
    .sort((a, b) => a.val - b.val)
    .map(({ idx }) => idx);
}

type BracketResult = {
  low: number;  // index in sorted array
  high: number; // index in sorted array (== low when exact)
  exact: boolean;
};

/**
 * Given a sorted array of breakpoints and a target value, returns the
 * lower and upper bracket indices (clamped at boundaries).
 */
function findBracket(sorted: number[], target: number): BracketResult {
  const n = sorted.length;

  // Below the first breakpoint → clamp to index 0
  if (target <= sorted[0]) {
    return { low: 0, high: 0, exact: true };
  }

  // Above the last breakpoint → clamp to last index
  if (target >= sorted[n - 1]) {
    return { low: n - 1, high: n - 1, exact: true };
  }

  // Binary search for the bracket
  let lo = 0;
  let hi = n - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] <= target) {
      lo = mid;
    } else {
      hi = mid;
    }
  }

  // Exact match on lo
  if (sorted[lo] === target) {
    return { low: lo, high: lo, exact: true };
  }
  // Exact match on hi
  if (sorted[hi] === target) {
    return { low: hi, high: hi, exact: true };
  }

  return { low: lo, high: hi, exact: false };
}

/** Remove duplicate {row, col} entries */
function deduplicateCells(
  cells: Array<{ row: number; col: number }>
): Array<{ row: number; col: number }> {
  const seen = new Set<string>();
  return cells.filter(({ row, col }) => {
    const key = `${row},${col}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
