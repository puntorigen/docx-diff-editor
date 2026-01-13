/**
 * Block Level Merger Service
 * 
 * Handles merging of structural changes (tables, lists, images)
 * with shared IDs for all marks within a structural change.
 * 
 * This allows the Structural Changes Pane to accept/reject
 * entire structural units (e.g., a whole table row) with a single action.
 */

import { v4 as uuidv4 } from 'uuid';
import type {
  ProseMirrorJSON,
  ProseMirrorNode,
  StructuralChange,
  StructuralChangeInfo,
  TrackChangeAuthor,
  HybridDiffResult,
} from '../types';
import {
  createTrackInsertMark,
  createTrackDeleteMark,
} from './trackChangeInjector';
import { alignDocuments } from './nodeAligner';
import { diffTables, isTable, getRowLocation, getRowPreview } from './tableBlockDiffer';
import { diffLists, isList, getListItemLocation, getListItemPreview } from './listBlockDiffer';
import { diffImages, getImageLocation, getImagePreview } from './nonTextNodeDiffer';
import { DEFAULT_AUTHOR } from '../constants';

// ============================================================================
// Types
// ============================================================================

/**
 * Result of block-level merging
 */
export interface BlockMergeResult {
  /** The merged document */
  mergedDoc: ProseMirrorNode;
  /** Structural change metadata for the pane */
  structuralChangeInfos: StructuralChangeInfo[];
  /** Summary of structural changes */
  structuralChangeSummary: string[];
}

// ============================================================================
// Node Marking Functions
// ============================================================================

/**
 * Mark all text in a node as inserted (with shared ID).
 * Used for inserted blocks (rows, paragraphs, list items).
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

  return node;
}

/**
 * Mark all text in a node as deleted (with shared ID).
 * Used for deleted blocks (rows, paragraphs, list items).
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

  return node;
}

/**
 * Deep clone a node.
 */
function cloneNode(node: ProseMirrorNode): ProseMirrorNode {
  return JSON.parse(JSON.stringify(node));
}

/**
 * Extract text content from a node for preview.
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

// ============================================================================
// Block-Level Merge Functions
// ============================================================================

/**
 * Process structural changes and generate marked blocks with shared IDs.
 */
export function processStructuralChanges(
  docA: ProseMirrorNode,
  docB: ProseMirrorNode,
  author: TrackChangeAuthor = DEFAULT_AUTHOR
): { changes: StructuralChange[]; infos: StructuralChangeInfo[] } {
  const changes: StructuralChange[] = [];
  const infos: StructuralChangeInfo[] = [];

  // Align top-level blocks
  const alignment = alignDocuments(docA, docB);

  // Track table and list indices for location strings
  let tableIndex = 0;
  let listIndex = 0;
  let paragraphIndex = 0;

  // Process top-level insertions
  for (const inserted of alignment.insertions) {
    const node = inserted.node;
    const sharedId = uuidv4();
    const date = new Date().toISOString();

    let type: StructuralChangeInfo['type'] = 'paragraphInsert';
    let location = '';
    let preview = '';

    if (isTable(node)) {
      type = 'rowInsert'; // Treat as table insertion (could add 'tableInsert' type)
      location = `New table at position ${inserted.path[0] + 1}`;
      preview = `Table with ${node.content?.length || 0} rows`;
      tableIndex++;
    } else if (isList(node)) {
      type = 'listItemInsert';
      location = `New list at position ${inserted.path[0] + 1}`;
      preview = `List with ${node.content?.length || 0} items`;
      listIndex++;
    } else {
      type = 'paragraphInsert';
      paragraphIndex++;
      location = `Paragraph ${paragraphIndex}`;
      preview = extractTextPreview(node);
    }

    changes.push({
      id: sharedId,
      type,
      nodeType: node.type,
      path: inserted.path,
      node: markAllTextAsInserted(cloneNode(node), sharedId, author),
    });

    infos.push({
      id: sharedId,
      type,
      nodeType: node.type,
      location,
      preview,
      author,
      date,
    });
  }

  // Process top-level deletions
  for (const deleted of alignment.deletions) {
    const node = deleted.node;
    const sharedId = uuidv4();
    const date = new Date().toISOString();

    let type: StructuralChangeInfo['type'] = 'paragraphDelete';
    let location = '';
    let preview = '';

    if (isTable(node)) {
      type = 'rowDelete';
      location = `Deleted table at position ${deleted.path[0] + 1}`;
      preview = `Table with ${node.content?.length || 0} rows`;
    } else if (isList(node)) {
      type = 'listItemDelete';
      location = `Deleted list at position ${deleted.path[0] + 1}`;
      preview = `List with ${node.content?.length || 0} items`;
    } else {
      type = 'paragraphDelete';
      location = `Deleted paragraph`;
      preview = extractTextPreview(node);
    }

    changes.push({
      id: sharedId,
      type,
      nodeType: node.type,
      path: deleted.path,
      node: markAllTextAsDeleted(cloneNode(node), sharedId, author),
    });

    infos.push({
      id: sharedId,
      type,
      nodeType: node.type,
      location,
      preview,
      author,
      date,
    });
  }

  // Process matched blocks for internal changes (tables, lists)
  for (const match of alignment.matched) {
    const nodeA = docA.content?.[match.pathA[0]];
    const nodeB = docB.content?.[match.pathB[0]];

    if (!nodeA || !nodeB) continue;

    // Check for table-specific changes
    if (isTable(nodeA) && isTable(nodeB)) {
      tableIndex++;
      const tableResult = diffTables(nodeA, nodeB, match.pathA, match.pathB);

      // Process row changes
      for (const rowChange of tableResult.rowChanges) {
        const sharedId = rowChange.id;
        const date = new Date().toISOString();
        const rowIndex = rowChange.path[rowChange.path.length - 1];

        const isInsert = rowChange.type === 'rowInsert';
        const location = getRowLocation(rowChange.path, rowIndex, tableIndex - 1);
        const preview = getRowPreview(rowChange.node);

        // Update the node with marks
        const markedNode = isInsert
          ? markAllTextAsInserted(cloneNode(rowChange.node), sharedId, author)
          : markAllTextAsDeleted(cloneNode(rowChange.node), sharedId, author);

        changes.push({
          ...rowChange,
          node: markedNode,
        });

        infos.push({
          id: sharedId,
          type: rowChange.type,
          nodeType: 'tableRow',
          location,
          preview,
          author,
          date,
        });
      }
    }

    // Check for list-specific changes
    if (isList(nodeA) && isList(nodeB)) {
      listIndex++;
      const listResult = diffLists(nodeA, nodeB, match.pathA, match.pathB);

      // Process item changes
      for (const itemChange of listResult.itemChanges) {
        const sharedId = itemChange.id;
        const date = new Date().toISOString();
        const itemIndex = itemChange.path[itemChange.path.length - 1];

        const isInsert = itemChange.type === 'listItemInsert';
        const location = getListItemLocation(itemChange.path, itemIndex, listIndex - 1);
        const preview = getListItemPreview(itemChange.node);

        // Update the node with marks
        const markedNode = isInsert
          ? markAllTextAsInserted(cloneNode(itemChange.node), sharedId, author)
          : markAllTextAsDeleted(cloneNode(itemChange.node), sharedId, author);

        changes.push({
          ...itemChange,
          node: markedNode,
        });

        infos.push({
          id: sharedId,
          type: itemChange.type,
          nodeType: 'listItem',
          location,
          preview,
          author,
          date,
        });
      }
    }
  }

  // Process image changes
  const imageChanges = diffImages(docA, docB);

  for (const imgInsert of imageChanges.inserted) {
    const sharedId = imgInsert.id;
    const date = new Date().toISOString();

    infos.push({
      id: sharedId,
      type: 'imageInsert',
      nodeType: 'image',
      location: getImageLocation(imgInsert.path),
      preview: getImagePreview(imgInsert.node),
      author,
      date,
    });

    changes.push(imgInsert);
  }

  for (const imgDelete of imageChanges.deleted) {
    const sharedId = imgDelete.id;
    const date = new Date().toISOString();

    infos.push({
      id: sharedId,
      type: 'imageDelete',
      nodeType: 'image',
      location: getImageLocation(imgDelete.path),
      preview: getImagePreview(imgDelete.node),
      author,
      date,
    });

    changes.push(imgDelete);
  }

  return { changes, infos };
}

/**
 * Build the merged document with structural changes applied.
 * Combines the original character-level merge with block-level changes.
 */
export function buildMergedDocumentWithStructuralChanges(
  baseMergedDoc: ProseMirrorNode,
  structuralChanges: StructuralChange[],
  docA: ProseMirrorNode,
  docB: ProseMirrorNode
): ProseMirrorNode {
  // For now, the structural changes are already marked in processStructuralChanges
  // The merged document from the base merge already contains most changes
  // We need to integrate the structural changes into the document
  
  // Clone the base merged document
  const result = cloneNode(baseMergedDoc);

  // Insert structural insertions at appropriate positions
  // Delete structural deletions by including them with delete marks
  
  // This is a simplified approach - full implementation would need
  // careful position tracking. For now, structural changes are
  // handled through the existing merge process, and this function
  // serves as an integration point for future enhancements.

  return result;
}

/**
 * Generate a summary of structural changes.
 */
export function generateStructuralChangeSummary(
  infos: StructuralChangeInfo[]
): string[] {
  const summary: string[] = [];

  const rowInserts = infos.filter((i) => i.type === 'rowInsert').length;
  const rowDeletes = infos.filter((i) => i.type === 'rowDelete').length;
  const paragraphInserts = infos.filter((i) => i.type === 'paragraphInsert').length;
  const paragraphDeletes = infos.filter((i) => i.type === 'paragraphDelete').length;
  const listItemInserts = infos.filter((i) => i.type === 'listItemInsert').length;
  const listItemDeletes = infos.filter((i) => i.type === 'listItemDelete').length;
  const imageInserts = infos.filter((i) => i.type === 'imageInsert').length;
  const imageDeletes = infos.filter((i) => i.type === 'imageDelete').length;

  if (rowInserts > 0) summary.push(`${rowInserts} row(s) inserted`);
  if (rowDeletes > 0) summary.push(`${rowDeletes} row(s) deleted`);
  if (paragraphInserts > 0) summary.push(`${paragraphInserts} paragraph(s) inserted`);
  if (paragraphDeletes > 0) summary.push(`${paragraphDeletes} paragraph(s) deleted`);
  if (listItemInserts > 0) summary.push(`${listItemInserts} list item(s) inserted`);
  if (listItemDeletes > 0) summary.push(`${listItemDeletes} list item(s) deleted`);
  if (imageInserts > 0) summary.push(`${imageInserts} image(s) inserted`);
  if (imageDeletes > 0) summary.push(`${imageDeletes} image(s) deleted`);

  return summary;
}
