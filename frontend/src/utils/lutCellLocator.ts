/**
 * Lightweight LUT cell locator
 * Pure functions for finding highlight cells without complex dependencies
 */

export interface LutCellLocation {
  rowIndices: number[];
  colIndices: number[];
  mode: "exact" | "interpolated";
}

/**
 * Find which cells in a LUT should be highlighted based on X,Y values
 * @param xValue Current X channel value
 * @param yValue Current Y channel value
 * @param colHeaders Breakpoints along X axis
 * @param rowHeaders Breakpoints along Y axis
 * @returns Cell indices to highlight, or null if out of bounds
 */
export function findLutCells(
  xValue: number,
  yValue: number,
  colHeaders: number[],
  rowHeaders: number[]
): LutCellLocation | null {
  if (colHeaders.length === 0 || rowHeaders.length === 0) {
    return null;
  }

  // Find X (column) indices
  let colIdx1: number | null = null;
  let colIdx2: number | null = null;

  for (let i = 0; i < colHeaders.length - 1; i++) {
    if (xValue >= colHeaders[i] && xValue <= colHeaders[i + 1]) {
      colIdx1 = i;
      colIdx2 = i + 1;
      break;
    }
  }

  // If out of bounds, use closest
  if (colIdx1 === null) {
    const closest = xValue < colHeaders[0] ? 0 : colHeaders.length - 1;
    colIdx1 = closest;
  }

  // Find Y (row) indices
  let rowIdx1: number | null = null;
  let rowIdx2: number | null = null;

  for (let i = 0; i < rowHeaders.length - 1; i++) {
    if (yValue >= rowHeaders[i] && yValue <= rowHeaders[i + 1]) {
      rowIdx1 = i;
      rowIdx2 = i + 1;
      break;
    }
  }

  // If out of bounds, use closest
  if (rowIdx1 === null) {
    const closest = yValue < rowHeaders[0] ? 0 : rowHeaders.length - 1;
    rowIdx1 = closest;
  }

  // Check if it's an exact match
  const isExactX = colIdx2 !== null && xValue === colHeaders[colIdx1];
  const isExactY = rowIdx2 !== null && yValue === rowHeaders[rowIdx1];

  if (isExactX && isExactY) {
    // Exact breakpoint match
    return {
      rowIndices: [rowIdx1],
      colIndices: [colIdx1],
      mode: "exact",
    };
  }

  // Interpolated: return surrounding cells
  const colIndices = colIdx2 !== null ? [colIdx1, colIdx2] : [colIdx1];
  const rowIndices = rowIdx2 !== null ? [rowIdx1, rowIdx2] : [rowIdx1];

  return {
    rowIndices,
    colIndices,
    mode: "interpolated",
  };
}

/**
 * Check if a cell should be highlighted
 */
export function isCellHighlighted(
  rowIdx: number,
  colIdx: number,
  highlight: LutCellLocation | null
): boolean {
  if (!highlight) return false;
  return (
    highlight.rowIndices.includes(rowIdx) &&
    highlight.colIndices.includes(colIdx)
  );
}
