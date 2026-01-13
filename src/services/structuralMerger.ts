/**
 * Structural Merger Service
 * 
 * Implements structure-aware document merging. Unlike character-level merging,
 * this service aligns blocks first, then applies the appropriate merge strategy
 * for each alignment type:
 * 
 * - Matched blocks: Apply character-level diff internally
 * - Inserted blocks: Insert entire node with trackInsert marks
 * - Deleted blocks: Keep node with trackDelete marks
 * 
 * This is the CRITICAL piece that makes structural changes visible and actionable.
 */

import { v4 as uuidv4 } from 'uuid';
import type {
  ProseMirrorJSON,
  ProseMirrorNode,
  StructuralChange,
  StructuralChangeInfo,
  TrackChangeAuthor,
  DiffResult,
} from '../types';
import {
  createTrackInsertMark,
  createTrackDeleteMark,
} from './trackChangeInjector';
import { alignDocuments, alignTableRows, alignListItems } from './nodeAligner';
import { diffDocuments } from './documentDiffer';
import { mergeDocuments } from './mergeDocuments';
import { isTable, isTableRow } from './tableBlockDiffer';
import { isList, isListItem } from './listBlockDiffer';
import { isImage } from './nonTextNodeDiffer';
import { DEFAULT_AUTHOR } from '../constants';

// ============================================================================
// Types
// ============================================================================

/**
 * Result of structural merge
 */
export interface StructuralMergeResult {
  /** The merged document with all changes applied */
  mergedDoc: ProseMirrorNode;
  /** Metadata for the structural changes pane */
  structuralInfos: StructuralChangeInfo[];
  /** Summary strings for reporting */
  summary: string[];
  /** Count of text-level changes within matched blocks */
  textChangeCount: number;
}

/**
 * Operation to perform during merge
 */
interface MergeOperation {
  type: 'matched' | 'inserted' | 'deleted';
  nodeA?: ProseMirrorNode;
  nodeB?: ProseMirrorNode;
  pathA?: number[];
  pathB?: number[];
}

// ============================================================================
// Node Marking Functions
// ============================================================================

/**
 * Deep clone a node
 */
function cloneNode(node: ProseMirrorNode): ProseMirrorNode {
  return JSON.parse(JSON.stringify(node));
}

/**
 * Mark all text in a node as inserted (with shared ID).
 */
function markAllTextAsInserted(
  node: ProseMirrorNode,
  sharedId: string,
  author: TrackChangeAuthor
): ProseMirrorNode {
  if (node.type === 'text') {
    return {
      ...node,
      marks: [...(node.marks || []), createTrackInsertMark(author, sharedId)],
    };
  }

  if (node.content && Array.isArray(node.content)) {
    return {
      ...node,
      content: node.content.map((child: ProseMirrorNode) =>
        markAllTextAsInserted(child, sharedId, author)
      ),
    };
  }

  return { ...node };
}

/**
 * Mark all text in a node as deleted (with shared ID).
 */
function markAllTextAsDeleted(
  node: ProseMirrorNode,
  sharedId: string,
  author: TrackChangeAuthor
): ProseMirrorNode {
  if (node.type === 'text') {
    return {
      ...node,
      marks: [...(node.marks || []), createTrackDeleteMark(author, sharedId)],
    };
  }

  if (node.content && Array.isArray(node.content)) {
    return {
      ...node,
      content: node.content.map((child: ProseMirrorNode) =>
        markAllTextAsDeleted(child, sharedId, author)
      ),
    };
  }

  return { ...node };
}

/**
 * Extract text preview from a node.
 */
function extractTextPreview(node: ProseMirrorNode, maxLength: number = 50): string {
  const texts: string[] = [];
  
  function extract(n: ProseMirrorNode): void {
    if (n.type === 'text') {
      texts.push(n.text || '');
    }
    if (n.content) {
      for (const child of n.content) {
        extract(child);
      }
    }
  }
  
  extract(node);
  const text = texts.join('').trim();
  
  if (text.length > maxLength) {
    return text.substring(0, maxLength - 3) + '...';
  }
  return text || '(empty)';
}

/**
 * Get human-readable node type description.
 */
function getNodeTypeDescription(node: ProseMirrorNode): string {
  if (isTable(node)) return 'Table';
  if (isList(node)) return 'List';
  if (isListItem(node)) return 'List item';
  if (isTableRow(node)) return 'Table row';
  if (isImage(node)) return 'Image';
  if (node.type === 'heading') return `Heading ${node.attrs?.level || 1}`;
  if (node.type === 'paragraph') return 'Paragraph';
  if (node.type === 'blockquote') return 'Blockquote';
  if (node.type === 'codeBlock') return 'Code block';
  return node.type || 'Block';
}

// ============================================================================
// Main Structural Merge Function
// ============================================================================

/**
 * Merge two documents with structural awareness.
 * 
 * This is the main entry point that replaces the character-level-only merge.
 * It aligns blocks first, then processes each alignment appropriately.
 */
export function mergeWithStructuralAwareness(
  docA: ProseMirrorJSON,
  docB: ProseMirrorJSON,
  author: TrackChangeAuthor = DEFAULT_AUTHOR
): StructuralMergeResult {
  const structuralInfos: StructuralChangeInfo[] = [];
  const summary: string[] = [];
  let textChangeCount = 0;

  // Align top-level blocks
  const alignment = alignDocuments(docA, docB);

  // Build merge operations in document order
  const operations = buildMergeOperations(alignment, docA, docB);

  // Process each operation to build merged content
  const mergedContent: ProseMirrorNode[] = [];
  let blockIndex = 0;

  for (const op of operations) {
    blockIndex++;

    switch (op.type) {
      case 'matched': {
        // Matched blocks: merge content (character-level or recursive structural)
        const { mergedNode, infos, changes } = mergeMatchedBlock(
          op.nodeA!,
          op.nodeB!,
          blockIndex,
          author
        );
        mergedContent.push(mergedNode);
        structuralInfos.push(...infos);
        textChangeCount += changes;
        break;
      }

      case 'inserted': {
        // Inserted blocks: add with trackInsert marks
        const { markedNode, info } = createInsertedBlock(
          op.nodeB!,
          blockIndex,
          author
        );
        mergedContent.push(markedNode);
        if (info) {
          structuralInfos.push(info);
        }
        break;
      }

      case 'deleted': {
        // Deleted blocks: keep with trackDelete marks
        const { markedNode, info } = createDeletedBlock(
          op.nodeA!,
          blockIndex,
          author
        );
        mergedContent.push(markedNode);
        if (info) {
          structuralInfos.push(info);
        }
        break;
      }
    }
  }

  // Build merged document
  const mergedDoc: ProseMirrorNode = {
    type: 'doc',
    content: mergedContent,
  };

  // Generate summary
  const insertCount = structuralInfos.filter(i => i.type.includes('Insert')).length;
  const deleteCount = structuralInfos.filter(i => i.type.includes('Delete')).length;
  
  if (insertCount > 0) summary.push(`${insertCount} block(s) inserted`);
  if (deleteCount > 0) summary.push(`${deleteCount} block(s) deleted`);
  if (textChangeCount > 0) summary.push(`${textChangeCount} text change(s)`);

  return {
    mergedDoc,
    structuralInfos,
    summary,
    textChangeCount,
  };
}

// ============================================================================
// Build Merge Operations
// ============================================================================

/**
 * Build ordered list of merge operations from alignment result.
 * 
 * This determines the order of blocks in the merged document:
 * - Walk through docB to get the "new" order
 * - Insert deletions from docA at their relative positions
 */
function buildMergeOperations(
  alignment: ReturnType<typeof alignDocuments>,
  docA: ProseMirrorJSON,
  docB: ProseMirrorJSON
): MergeOperation[] {
  const operations: MergeOperation[] = [];
  
  // Create maps for quick lookup
  const matchedFromA = new Map<number, { pathB: number[]; similarity: number }>();
  const matchedFromB = new Map<number, { pathA: number[]; similarity: number }>();
  
  for (const match of alignment.matched) {
    const idxA = match.pathA[0];
    const idxB = match.pathB[0];
    matchedFromA.set(idxA, { pathB: match.pathB, similarity: match.similarity });
    matchedFromB.set(idxB, { pathA: match.pathA, similarity: match.similarity });
  }

  // Track which deletions we've processed
  const deletedIndices = new Set(alignment.deletions.map(d => d.path[0]));
  const processedDeletions = new Set<number>();

  // Walk through docB in order
  const contentB = docB.content || [];
  const contentA = docA.content || [];

  for (let idxB = 0; idxB < contentB.length; idxB++) {
    const nodeB = contentB[idxB];
    
    // Check if this B position is matched to an A position
    const match = matchedFromB.get(idxB);
    
    if (match) {
      const idxA = match.pathA[0];
      const nodeA = contentA[idxA];
      
      // Before adding the matched block, check for deletions that came before it in A
      // This handles the case where deleted content should appear before matched content
      for (let checkIdx = 0; checkIdx < idxA; checkIdx++) {
        if (deletedIndices.has(checkIdx) && !processedDeletions.has(checkIdx)) {
          operations.push({
            type: 'deleted',
            nodeA: contentA[checkIdx],
            pathA: [checkIdx],
          });
          processedDeletions.add(checkIdx);
        }
      }
      
      // Add matched block
      operations.push({
        type: 'matched',
        nodeA,
        nodeB,
        pathA: match.pathA,
        pathB: [idxB],
      });
    } else {
      // This is an insertion (only in B)
      operations.push({
        type: 'inserted',
        nodeB,
        pathB: [idxB],
      });
    }
  }

  // Add any remaining deletions that weren't processed
  for (const deletion of alignment.deletions) {
    const idxA = deletion.path[0];
    if (!processedDeletions.has(idxA)) {
      operations.push({
        type: 'deleted',
        nodeA: deletion.node,
        pathA: deletion.path,
      });
    }
  }

  return operations;
}

// ============================================================================
// Process Matched Blocks
// ============================================================================

/**
 * Merge a matched block pair.
 * For simple blocks (paragraphs), uses character-level diff.
 * For complex blocks (tables, lists), recurses into children.
 */
function mergeMatchedBlock(
  nodeA: ProseMirrorNode,
  nodeB: ProseMirrorNode,
  blockIndex: number,
  author: TrackChangeAuthor
): { mergedNode: ProseMirrorNode; infos: StructuralChangeInfo[]; changes: number } {
  const infos: StructuralChangeInfo[] = [];
  let changes = 0;

  // Handle tables: recurse into rows
  if (isTable(nodeA) && isTable(nodeB)) {
    const { mergedTable, tableInfos, changeCount } = mergeMatchedTable(
      nodeA,
      nodeB,
      blockIndex,
      author
    );
    return { mergedNode: mergedTable, infos: tableInfos, changes: changeCount };
  }

  // Handle lists: recurse into items
  if (isList(nodeA) && isList(nodeB)) {
    const { mergedList, listInfos, changeCount } = mergeMatchedList(
      nodeA,
      nodeB,
      blockIndex,
      author
    );
    return { mergedNode: mergedList, infos: listInfos, changes: changeCount };
  }

  // For other blocks (paragraphs, headings, etc.): use character-level diff
  const diff = diffDocuments(
    { type: 'doc', content: [nodeA] },
    { type: 'doc', content: [nodeB] }
  );

  // Count changes
  changes = diff.segments.filter(s => s.type !== 'equal').length;
  changes += diff.formatChanges?.length || 0;

  // Merge using existing character-level merger
  const merged = mergeDocuments(
    { type: 'doc', content: [nodeA] },
    { type: 'doc', content: [nodeB] },
    diff,
    author
  );

  // Extract the merged node (first content item)
  const mergedNode = merged.content?.[0] || cloneNode(nodeB);

  return { mergedNode, infos, changes };
}

// ============================================================================
// Table Merging
// ============================================================================

/**
 * Merge matched tables by aligning and processing rows.
 */
function mergeMatchedTable(
  tableA: ProseMirrorNode,
  tableB: ProseMirrorNode,
  tableIndex: number,
  author: TrackChangeAuthor
): { mergedTable: ProseMirrorNode; tableInfos: StructuralChangeInfo[]; changeCount: number } {
  const tableInfos: StructuralChangeInfo[] = [];
  let changeCount = 0;

  // Align rows
  const rowAlignment = alignTableRows(tableA, tableB, [tableIndex - 1], [tableIndex - 1]);

  // Build merge operations for rows
  const mergedRows: ProseMirrorNode[] = [];
  
  // Create index maps
  const matchedFromA = new Map<number, number>();
  const matchedFromB = new Map<number, number>();
  
  for (const match of rowAlignment.matched) {
    const idxA = match.pathA[match.pathA.length - 1];
    const idxB = match.pathB[match.pathB.length - 1];
    matchedFromA.set(idxA, idxB);
    matchedFromB.set(idxB, idxA);
  }

  const deletedIndices = new Set(rowAlignment.deletions.map(d => d.path[d.path.length - 1]));
  const processedDeletions = new Set<number>();
  
  const rowsA = tableA.content || [];
  const rowsB = tableB.content || [];

  // Process rows in B's order
  for (let idxB = 0; idxB < rowsB.length; idxB++) {
    const rowB = rowsB[idxB];
    const matchedIdxA = matchedFromB.get(idxB);

    if (matchedIdxA !== undefined) {
      const rowA = rowsA[matchedIdxA];
      
      // Insert any deletions that should appear before this row
      for (let checkIdx = 0; checkIdx < matchedIdxA; checkIdx++) {
        if (deletedIndices.has(checkIdx) && !processedDeletions.has(checkIdx)) {
          const deletedRow = rowsA[checkIdx];
          const changeId = uuidv4();
          
          mergedRows.push(markAllTextAsDeleted(cloneNode(deletedRow), changeId, author));
          
          tableInfos.push({
            id: changeId,
            type: 'rowDelete',
            nodeType: 'tableRow',
            location: `Table ${tableIndex}, Row ${checkIdx + 1}`,
            preview: extractTextPreview(deletedRow),
            author,
            date: new Date().toISOString(),
          });
          
          processedDeletions.add(checkIdx);
        }
      }
      
      // Merge matched row (character-level diff on cells)
      const { mergedNode, changes } = mergeMatchedBlock(rowA, rowB, idxB, author);
      mergedRows.push(mergedNode);
      changeCount += changes;
    } else {
      // Inserted row
      const changeId = uuidv4();
      mergedRows.push(markAllTextAsInserted(cloneNode(rowB), changeId, author));
      
      tableInfos.push({
        id: changeId,
        type: 'rowInsert',
        nodeType: 'tableRow',
        location: `Table ${tableIndex}, Row ${idxB + 1}`,
        preview: extractTextPreview(rowB),
        author,
        date: new Date().toISOString(),
      });
    }
  }

  // Add remaining deletions
  for (const deletion of rowAlignment.deletions) {
    const idxA = deletion.path[deletion.path.length - 1];
    if (!processedDeletions.has(idxA)) {
      const changeId = uuidv4();
      
      mergedRows.push(markAllTextAsDeleted(cloneNode(deletion.node), changeId, author));
      
      tableInfos.push({
        id: changeId,
        type: 'rowDelete',
        nodeType: 'tableRow',
        location: `Table ${tableIndex}, Row ${idxA + 1}`,
        preview: extractTextPreview(deletion.node),
        author,
        date: new Date().toISOString(),
      });
    }
  }

  const mergedTable: ProseMirrorNode = {
    ...tableB,
    content: mergedRows,
  };

  return { mergedTable, tableInfos, changeCount };
}

// ============================================================================
// List Merging
// ============================================================================

/**
 * Merge matched lists by aligning and processing items.
 */
function mergeMatchedList(
  listA: ProseMirrorNode,
  listB: ProseMirrorNode,
  listIndex: number,
  author: TrackChangeAuthor
): { mergedList: ProseMirrorNode; listInfos: StructuralChangeInfo[]; changeCount: number } {
  const listInfos: StructuralChangeInfo[] = [];
  let changeCount = 0;

  // Align list items
  const itemAlignment = alignListItems(listA, listB, [listIndex - 1], [listIndex - 1]);

  // Build merge operations for items
  const mergedItems: ProseMirrorNode[] = [];
  
  // Create index maps
  const matchedFromA = new Map<number, number>();
  const matchedFromB = new Map<number, number>();
  
  for (const match of itemAlignment.matched) {
    const idxA = match.pathA[match.pathA.length - 1];
    const idxB = match.pathB[match.pathB.length - 1];
    matchedFromA.set(idxA, idxB);
    matchedFromB.set(idxB, idxA);
  }

  const deletedIndices = new Set(itemAlignment.deletions.map(d => d.path[d.path.length - 1]));
  const processedDeletions = new Set<number>();
  
  const itemsA = listA.content || [];
  const itemsB = listB.content || [];

  // Process items in B's order
  for (let idxB = 0; idxB < itemsB.length; idxB++) {
    const itemB = itemsB[idxB];
    const matchedIdxA = matchedFromB.get(idxB);

    if (matchedIdxA !== undefined) {
      const itemA = itemsA[matchedIdxA];
      
      // Insert any deletions that should appear before this item
      for (let checkIdx = 0; checkIdx < matchedIdxA; checkIdx++) {
        if (deletedIndices.has(checkIdx) && !processedDeletions.has(checkIdx)) {
          const deletedItem = itemsA[checkIdx];
          const changeId = uuidv4();
          
          mergedItems.push(markAllTextAsDeleted(cloneNode(deletedItem), changeId, author));
          
          listInfos.push({
            id: changeId,
            type: 'listItemDelete',
            nodeType: 'listItem',
            location: `List ${listIndex}, Item ${checkIdx + 1}`,
            preview: extractTextPreview(deletedItem),
            author,
            date: new Date().toISOString(),
          });
          
          processedDeletions.add(checkIdx);
        }
      }
      
      // Merge matched item (character-level diff on content)
      const { mergedNode, changes } = mergeMatchedBlock(itemA, itemB, idxB, author);
      mergedItems.push(mergedNode);
      changeCount += changes;
    } else {
      // Inserted item
      const changeId = uuidv4();
      mergedItems.push(markAllTextAsInserted(cloneNode(itemB), changeId, author));
      
      listInfos.push({
        id: changeId,
        type: 'listItemInsert',
        nodeType: 'listItem',
        location: `List ${listIndex}, Item ${idxB + 1}`,
        preview: extractTextPreview(itemB),
        author,
        date: new Date().toISOString(),
      });
    }
  }

  // Add remaining deletions
  for (const deletion of itemAlignment.deletions) {
    const idxA = deletion.path[deletion.path.length - 1];
    if (!processedDeletions.has(idxA)) {
      const changeId = uuidv4();
      
      mergedItems.push(markAllTextAsDeleted(cloneNode(deletion.node), changeId, author));
      
      listInfos.push({
        id: changeId,
        type: 'listItemDelete',
        nodeType: 'listItem',
        location: `List ${listIndex}, Item ${idxA + 1}`,
        preview: extractTextPreview(deletion.node),
        author,
        date: new Date().toISOString(),
      });
    }
  }

  const mergedList: ProseMirrorNode = {
    ...listB,
    content: mergedItems,
  };

  return { mergedList, listInfos, changeCount };
}

// ============================================================================
// Create Inserted/Deleted Blocks
// ============================================================================

/**
 * Create an inserted block with trackInsert marks on all text.
 */
function createInsertedBlock(
  node: ProseMirrorNode,
  blockIndex: number,
  author: TrackChangeAuthor
): { markedNode: ProseMirrorNode; info: StructuralChangeInfo | null } {
  const changeId = uuidv4();
  const markedNode = markAllTextAsInserted(cloneNode(node), changeId, author);
  
  const nodeDesc = getNodeTypeDescription(node);
  
  const info: StructuralChangeInfo = {
    id: changeId,
    type: isTable(node) ? 'rowInsert' : 
          isList(node) ? 'listItemInsert' : 
          isImage(node) ? 'imageInsert' : 'paragraphInsert',
    nodeType: node.type || 'unknown',
    location: `${nodeDesc} inserted at position ${blockIndex}`,
    preview: extractTextPreview(node),
    author,
    date: new Date().toISOString(),
  };

  return { markedNode, info };
}

/**
 * Create a deleted block with trackDelete marks on all text.
 */
function createDeletedBlock(
  node: ProseMirrorNode,
  blockIndex: number,
  author: TrackChangeAuthor
): { markedNode: ProseMirrorNode; info: StructuralChangeInfo | null } {
  const changeId = uuidv4();
  const markedNode = markAllTextAsDeleted(cloneNode(node), changeId, author);
  
  const nodeDesc = getNodeTypeDescription(node);
  
  const info: StructuralChangeInfo = {
    id: changeId,
    type: isTable(node) ? 'rowDelete' : 
          isList(node) ? 'listItemDelete' : 
          isImage(node) ? 'imageDelete' : 'paragraphDelete',
    nodeType: node.type || 'unknown',
    location: `${nodeDesc} deleted from position ${blockIndex}`,
    preview: extractTextPreview(node),
    author,
    date: new Date().toISOString(),
  };

  return { markedNode, info };
}
