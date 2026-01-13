/**
 * List Block Differ Service
 * 
 * Specialized diffing logic for lists:
 * - List item insertions/deletions
 * - List item reordering detection
 * - Nested list handling
 */

import type {
  ProseMirrorJSON,
  StructuralChange,
  NodeMatch,
} from '../types';
import { v4 as uuidv4 } from 'uuid';
import { alignListItems } from './nodeAligner';

// ============================================================================
// Types
// ============================================================================

/**
 * Result of diffing two lists
 */
export interface ListDiffResult {
  /** Item-level structural changes */
  itemChanges: StructuralChange[];
  /** Item matches for content diffing */
  itemMatches: NodeMatch[];
  /** Nested list changes (recursive) */
  nestedChanges: ListDiffResult[];
}

// ============================================================================
// List Analysis
// ============================================================================

/**
 * Check if a node is a list (ordered or unordered).
 */
export function isList(node: ProseMirrorJSON): boolean {
  return node?.type === 'bulletList' || node?.type === 'orderedList';
}

/**
 * Check if a node is a list item.
 */
export function isListItem(node: ProseMirrorJSON): boolean {
  return node?.type === 'listItem';
}

/**
 * Get the list type string.
 */
export function getListType(node: ProseMirrorJSON): 'ordered' | 'unordered' | null {
  if (node?.type === 'orderedList') return 'ordered';
  if (node?.type === 'bulletList') return 'unordered';
  return null;
}

/**
 * Extract text content from a list item.
 */
function extractListItemText(item: ProseMirrorJSON): string {
  const texts: string[] = [];
  
  function extract(node: ProseMirrorJSON): void {
    if (!node) return;
    
    if (node.type === 'text') {
      texts.push(node.text || '');
    }
    
    if (node.content && Array.isArray(node.content)) {
      for (const child of node.content) {
        // Skip nested lists when extracting text
        if (!isList(child)) {
          extract(child);
        }
      }
    }
  }
  
  extract(item);
  return texts.join('').trim();
}

/**
 * Find nested lists within a list item.
 */
function findNestedLists(item: ProseMirrorJSON): ProseMirrorJSON[] {
  const lists: ProseMirrorJSON[] = [];
  
  if (!item.content) return lists;
  
  for (const child of item.content) {
    if (isList(child)) {
      lists.push(child);
    }
  }
  
  return lists;
}

// ============================================================================
// Main List Diff Function
// ============================================================================

/**
 * Diff two lists and return all detected changes.
 */
export function diffLists(
  listA: ProseMirrorJSON,
  listB: ProseMirrorJSON,
  listPathA: number[],
  listPathB: number[],
  depth: number = 0
): ListDiffResult {
  const result: ListDiffResult = {
    itemChanges: [],
    itemMatches: [],
    nestedChanges: [],
  };

  // Align list items
  const alignment = alignListItems(listA, listB, listPathA, listPathB);

  // Process insertions
  for (const inserted of alignment.insertions) {
    result.itemChanges.push({
      id: uuidv4(),
      type: 'listItemInsert',
      nodeType: 'listItem',
      path: inserted.path,
      node: inserted.node,
    });
  }

  // Process deletions
  for (const deleted of alignment.deletions) {
    result.itemChanges.push({
      id: uuidv4(),
      type: 'listItemDelete',
      nodeType: 'listItem',
      path: deleted.path,
      node: deleted.node,
    });
  }

  // Store matches for content diffing
  result.itemMatches = alignment.matched;

  // Process nested lists in matched items
  for (const match of alignment.matched) {
    const itemIdxA = match.pathA[match.pathA.length - 1];
    const itemIdxB = match.pathB[match.pathB.length - 1];
    
    const itemA = listA.content?.[itemIdxA];
    const itemB = listB.content?.[itemIdxB];
    
    if (!itemA || !itemB) continue;

    // Find nested lists
    const nestedA = findNestedLists(itemA);
    const nestedB = findNestedLists(itemB);

    // Diff nested lists (simple 1:1 matching by position for now)
    const maxNested = Math.max(nestedA.length, nestedB.length);
    
    for (let i = 0; i < maxNested; i++) {
      const nA = nestedA[i];
      const nB = nestedB[i];
      
      if (nA && nB) {
        // Both exist - recurse
        const nestedResult = diffLists(
          nA,
          nB,
          [...match.pathA, i],
          [...match.pathB, i],
          depth + 1
        );
        result.nestedChanges.push(nestedResult);
      } else if (!nA && nB) {
        // Nested list inserted
        result.itemChanges.push({
          id: uuidv4(),
          type: 'listItemInsert',
          nodeType: 'nestedList',
          path: [...match.pathB, i],
          node: nB,
        });
      } else if (nA && !nB) {
        // Nested list deleted
        result.itemChanges.push({
          id: uuidv4(),
          type: 'listItemDelete',
          nodeType: 'nestedList',
          path: [...match.pathA, i],
          node: nA,
        });
      }
    }
  }

  return result;
}

// ============================================================================
// Location & Preview Functions
// ============================================================================

/**
 * Get a human-readable location string for a list.
 */
export function getListLocation(listPath: number[], listIndex: number): string {
  return `List ${listIndex + 1}`;
}

/**
 * Get a human-readable location string for a list item.
 */
export function getListItemLocation(
  listPath: number[],
  itemIndex: number,
  listIndex: number,
  depth: number = 0
): string {
  const depthStr = depth > 0 ? ` (nested, level ${depth + 1})` : '';
  return `List ${listIndex + 1}, Item ${itemIndex + 1}${depthStr}`;
}

/**
 * Get a text preview from a list item.
 */
export function getListItemPreview(item: ProseMirrorJSON, maxLength: number = 50): string {
  const text = extractListItemText(item);
  if (text.length > maxLength) {
    return text.substring(0, maxLength - 3) + '...';
  }
  return text || '(empty item)';
}

/**
 * Count total items in a list (including nested).
 */
export function countListItems(list: ProseMirrorJSON): number {
  let count = 0;
  
  function countRecursive(node: ProseMirrorJSON): void {
    if (isListItem(node)) {
      count++;
    }
    if (node.content) {
      for (const child of node.content) {
        countRecursive(child);
      }
    }
  }
  
  countRecursive(list);
  return count;
}
