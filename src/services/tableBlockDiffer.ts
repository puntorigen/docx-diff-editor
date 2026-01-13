/**
 * Table Block Differ Service
 * 
 * Specialized diffing logic for tables:
 * - Row insertions/deletions
 * - Column insertions/deletions
 * - Cell-level content changes
 * - Table/cell attribute changes
 */

import type {
  ProseMirrorJSON,
  StructuralChange,
  AttributeChange,
  NodeMatch,
  StructuralChangeType,
} from '../types';
import { v4 as uuidv4 } from 'uuid';
import { alignTableRows, alignTableCells } from './nodeAligner';
import { compareNodeAttrs } from './attrComparer';

// ============================================================================
// Types
// ============================================================================

/**
 * Result of diffing two tables
 */
export interface TableDiffResult {
  /** Row-level structural changes */
  rowChanges: StructuralChange[];
  /** Column-level structural changes (detected from cell patterns) */
  columnChanges: StructuralChange[];
  /** Cell-level matches for content diffing */
  cellMatches: NodeMatch[];
  /** Attribute changes on the table itself */
  tableAttrChanges: AttributeChange | null;
  /** Attribute changes on cells */
  cellAttrChanges: AttributeChange[];
}

// ============================================================================
// Table Analysis
// ============================================================================

/**
 * Get the number of columns in a table (based on first row).
 */
function getColumnCount(table: ProseMirrorJSON): number {
  if (!table.content || table.content.length === 0) return 0;
  const firstRow = table.content[0];
  return firstRow.content?.length || 0;
}

/**
 * Check if a column was inserted or deleted.
 * Compares cell counts across matched rows to detect consistent column changes.
 */
function detectColumnChanges(
  matchedRows: NodeMatch[],
  tableA: ProseMirrorJSON,
  tableB: ProseMirrorJSON,
  tablePathA: number[],
  tablePathB: number[]
): StructuralChange[] {
  const changes: StructuralChange[] = [];
  
  if (matchedRows.length === 0) return changes;

  // Get cell counts from first matched row pair
  const firstMatch = matchedRows[0];
  const rowIdxA = firstMatch.pathA[firstMatch.pathA.length - 1];
  const rowIdxB = firstMatch.pathB[firstMatch.pathB.length - 1];
  
  const rowA = tableA.content?.[rowIdxA];
  const rowB = tableB.content?.[rowIdxB];
  
  if (!rowA || !rowB) return changes;
  
  const cellCountA = rowA.content?.length || 0;
  const cellCountB = rowB.content?.length || 0;
  
  const diff = cellCountB - cellCountA;
  
  if (diff === 0) return changes;

  // Verify the pattern is consistent across all matched rows
  let consistent = true;
  for (const match of matchedRows) {
    const idxA = match.pathA[match.pathA.length - 1];
    const idxB = match.pathB[match.pathB.length - 1];
    const rA = tableA.content?.[idxA];
    const rB = tableB.content?.[idxB];
    
    if (!rA || !rB) continue;
    
    const countA = rA.content?.length || 0;
    const countB = rB.content?.length || 0;
    
    if (countB - countA !== diff) {
      consistent = false;
      break;
    }
  }

  if (!consistent) return changes;

  // Detected consistent column change
  if (diff > 0) {
    // Column(s) inserted
    for (let i = 0; i < diff; i++) {
      changes.push({
        id: uuidv4(),
        type: 'columnInsert',
        nodeType: 'tableColumn',
        path: [...tablePathB],
        node: { type: 'column', position: cellCountA + i },
      });
    }
  } else {
    // Column(s) deleted
    for (let i = 0; i < Math.abs(diff); i++) {
      changes.push({
        id: uuidv4(),
        type: 'columnDelete',
        nodeType: 'tableColumn',
        path: [...tablePathA],
        node: { type: 'column', position: cellCountB + i },
      });
    }
  }

  return changes;
}

// ============================================================================
// Main Table Diff Function
// ============================================================================

/**
 * Diff two tables and return all detected changes.
 */
export function diffTables(
  tableA: ProseMirrorJSON,
  tableB: ProseMirrorJSON,
  tablePathA: number[],
  tablePathB: number[]
): TableDiffResult {
  const result: TableDiffResult = {
    rowChanges: [],
    columnChanges: [],
    cellMatches: [],
    tableAttrChanges: null,
    cellAttrChanges: [],
  };

  // 1. Compare table-level attributes
  const tableAttrDiffs = compareNodeAttrs(tableA, tableB);
  if (tableAttrDiffs.length > 0) {
    result.tableAttrChanges = {
      id: uuidv4(),
      nodeType: 'table',
      pathA: tablePathA,
      pathB: tablePathB,
      changes: tableAttrDiffs,
    };
  }

  // 2. Align rows between tables
  const rowAlignment = alignTableRows(tableA, tableB, tablePathA, tablePathB);

  // 3. Process row insertions
  for (const inserted of rowAlignment.insertions) {
    result.rowChanges.push({
      id: uuidv4(),
      type: 'rowInsert',
      nodeType: 'tableRow',
      path: inserted.path,
      node: inserted.node,
    });
  }

  // 4. Process row deletions
  for (const deleted of rowAlignment.deletions) {
    result.rowChanges.push({
      id: uuidv4(),
      type: 'rowDelete',
      nodeType: 'tableRow',
      path: deleted.path,
      node: deleted.node,
    });
  }

  // 5. Detect column changes from matched rows
  result.columnChanges = detectColumnChanges(
    rowAlignment.matched,
    tableA,
    tableB,
    tablePathA,
    tablePathB
  );

  // 6. Process matched rows - align cells within each
  for (const rowMatch of rowAlignment.matched) {
    const rowIdxA = rowMatch.pathA[rowMatch.pathA.length - 1];
    const rowIdxB = rowMatch.pathB[rowMatch.pathB.length - 1];
    
    const rowA = tableA.content?.[rowIdxA];
    const rowB = tableB.content?.[rowIdxB];
    
    if (!rowA || !rowB) continue;

    // Align cells within this row pair
    const cellAlignment = alignTableCells(
      rowA,
      rowB,
      rowMatch.pathA,
      rowMatch.pathB
    );

    // Add cell matches for content diffing
    result.cellMatches.push(...cellAlignment.matched);

    // Check for cell attribute changes on matched cells
    for (const cellMatch of cellAlignment.matched) {
      const cellIdxA = cellMatch.pathA[cellMatch.pathA.length - 1];
      const cellIdxB = cellMatch.pathB[cellMatch.pathB.length - 1];
      
      const cellA = rowA.content?.[cellIdxA];
      const cellB = rowB.content?.[cellIdxB];
      
      if (!cellA || !cellB) continue;

      const cellAttrDiffs = compareNodeAttrs(cellA, cellB);
      if (cellAttrDiffs.length > 0) {
        result.cellAttrChanges.push({
          id: uuidv4(),
          nodeType: 'tableCell',
          pathA: cellMatch.pathA,
          pathB: cellMatch.pathB,
          changes: cellAttrDiffs,
        });
      }
    }
  }

  return result;
}

/**
 * Check if a node is a table.
 */
export function isTable(node: ProseMirrorJSON): boolean {
  return node?.type === 'table';
}

/**
 * Check if a node is a table row.
 */
export function isTableRow(node: ProseMirrorJSON): boolean {
  return node?.type === 'tableRow';
}

/**
 * Check if a node is a table cell.
 */
export function isTableCell(node: ProseMirrorJSON): boolean {
  return node?.type === 'tableCell' || node?.type === 'tableHeader';
}

/**
 * Get a human-readable location string for a table.
 */
export function getTableLocation(tablePath: number[], tableIndex: number): string {
  return `Table ${tableIndex + 1}`;
}

/**
 * Get a human-readable location string for a row.
 */
export function getRowLocation(
  tablePath: number[],
  rowIndex: number,
  tableIndex: number
): string {
  return `Table ${tableIndex + 1}, Row ${rowIndex + 1}`;
}

/**
 * Get a human-readable location string for a cell.
 */
export function getCellLocation(
  rowIndex: number,
  cellIndex: number,
  tableIndex: number
): string {
  // Convert to A1 notation for column
  const colLetter = String.fromCharCode(65 + cellIndex);
  return `Table ${tableIndex + 1}, Cell ${colLetter}${rowIndex + 1}`;
}

/**
 * Extract text preview from a table row.
 */
export function getRowPreview(row: ProseMirrorJSON, maxLength: number = 50): string {
  const cells: string[] = [];
  
  for (const cell of row.content || []) {
    const cellText = extractCellText(cell);
    if (cellText) {
      cells.push(cellText);
    }
  }
  
  const preview = cells.join(' | ');
  if (preview.length > maxLength) {
    return preview.substring(0, maxLength - 3) + '...';
  }
  return preview;
}

/**
 * Extract text from a table cell.
 */
function extractCellText(cell: ProseMirrorJSON): string {
  if (!cell.content) return '';
  
  const texts: string[] = [];
  
  for (const child of cell.content) {
    if (child.type === 'text') {
      texts.push(child.text || '');
    } else if (child.type === 'paragraph' && child.content) {
      for (const pChild of child.content) {
        if (pChild.type === 'text') {
          texts.push(pChild.text || '');
        }
      }
    }
  }
  
  return texts.join('').trim();
}
