/**
 * Node Aligner Service
 * 
 * Aligns nodes between two documents using fingerprints and LCS algorithm.
 * Produces matched pairs, insertions, and deletions.
 */

import type { ProseMirrorJSON, FingerprintedNode, NodeMatch } from '../types';
import {
  extractBlockFingerprints,
  calculateSimilarity,
  getNodeTextSimilarity,
} from './nodeFingerprint';

// ============================================================================
// Types
// ============================================================================

/**
 * Result of aligning two node sequences
 */
export interface AlignmentResult {
  /** Nodes that match between documents */
  matched: NodeMatch[];
  /** Nodes only in document A (deleted) */
  deletions: FingerprintedNode[];
  /** Nodes only in document B (inserted) */
  insertions: FingerprintedNode[];
}

// ============================================================================
// Configuration
// ============================================================================

/** Minimum similarity threshold for fuzzy matching */
const SIMILARITY_THRESHOLD = 0.7;

// ============================================================================
// LCS-Based Alignment
// ============================================================================

/**
 * Find the Longest Common Subsequence of two fingerprint arrays.
 * Returns indices of matched elements.
 */
function findLCS(seqA: string[], seqB: string[]): [number, number][] {
  const m = seqA.length;
  const n = seqB.length;

  // Build LCS length table
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    Array(n + 1).fill(0)
  );

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (seqA[i - 1] === seqB[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to find the actual LCS
  const result: [number, number][] = [];
  let i = m;
  let j = n;

  while (i > 0 && j > 0) {
    if (seqA[i - 1] === seqB[j - 1]) {
      result.unshift([i - 1, j - 1]);
      i--;
      j--;
    } else if (dp[i - 1][j] > dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }

  return result;
}

/**
 * Find fuzzy matches for unmatched nodes.
 * Uses text similarity to find partial matches.
 */
function findFuzzyMatches(
  unmatchedA: FingerprintedNode[],
  unmatchedB: FingerprintedNode[],
  threshold: number = SIMILARITY_THRESHOLD
): { matches: [FingerprintedNode, FingerprintedNode, number][]; remainingA: FingerprintedNode[]; remainingB: FingerprintedNode[] } {
  const matches: [FingerprintedNode, FingerprintedNode, number][] = [];
  const usedA = new Set<number>();
  const usedB = new Set<number>();

  // Build similarity matrix
  const similarities: { i: number; j: number; sim: number }[] = [];
  
  for (let i = 0; i < unmatchedA.length; i++) {
    for (let j = 0; j < unmatchedB.length; j++) {
      // Quick check: same type prefix?
      const fpSim = calculateSimilarity(unmatchedA[i].fingerprint, unmatchedB[j].fingerprint);
      if (fpSim === 0) continue;

      // Calculate text similarity
      const textSim = getNodeTextSimilarity(unmatchedA[i].node, unmatchedB[j].node);
      if (textSim >= threshold) {
        similarities.push({ i, j, sim: textSim });
      }
    }
  }

  // Sort by similarity (highest first) and greedily match
  similarities.sort((a, b) => b.sim - a.sim);

  for (const { i, j, sim } of similarities) {
    if (!usedA.has(i) && !usedB.has(j)) {
      matches.push([unmatchedA[i], unmatchedB[j], sim]);
      usedA.add(i);
      usedB.add(j);
    }
  }

  // Collect remaining unmatched
  const remainingA = unmatchedA.filter((_, i) => !usedA.has(i));
  const remainingB = unmatchedB.filter((_, j) => !usedB.has(j));

  return { matches, remainingA, remainingB };
}

/**
 * Align two sequences of fingerprinted nodes.
 * Uses LCS for exact matches, then fuzzy matching for similar nodes.
 */
export function alignNodes(
  nodesA: FingerprintedNode[],
  nodesB: FingerprintedNode[]
): AlignmentResult {
  // Extract fingerprints
  const fpsA = nodesA.map((n) => n.fingerprint);
  const fpsB = nodesB.map((n) => n.fingerprint);

  // Find exact matches using LCS
  const lcsMatches = findLCS(fpsA, fpsB);
  const matchedIndicesA = new Set(lcsMatches.map(([i]) => i));
  const matchedIndicesB = new Set(lcsMatches.map(([, j]) => j));

  // Build matched pairs from LCS
  const matched: NodeMatch[] = lcsMatches.map(([i, j]) => ({
    pathA: nodesA[i].path,
    pathB: nodesB[j].path,
    fingerprint: nodesA[i].fingerprint,
    similarity: 1.0, // Exact match
  }));

  // Collect unmatched nodes
  const unmatchedA = nodesA.filter((_, i) => !matchedIndicesA.has(i));
  const unmatchedB = nodesB.filter((_, j) => !matchedIndicesB.has(j));

  // Try fuzzy matching on unmatched nodes
  const { matches: fuzzyMatches, remainingA, remainingB } = findFuzzyMatches(
    unmatchedA,
    unmatchedB
  );

  // Add fuzzy matches
  for (const [nodeA, nodeB, similarity] of fuzzyMatches) {
    matched.push({
      pathA: nodeA.path,
      pathB: nodeB.path,
      fingerprint: nodeA.fingerprint,
      similarity,
    });
  }

  return {
    matched,
    deletions: remainingA,
    insertions: remainingB,
  };
}

/**
 * Align top-level blocks between two documents.
 */
export function alignDocuments(
  docA: ProseMirrorJSON,
  docB: ProseMirrorJSON
): AlignmentResult {
  const blocksA = extractBlockFingerprints(docA);
  const blocksB = extractBlockFingerprints(docB);

  return alignNodes(blocksA, blocksB);
}

/**
 * Align children of two matched nodes.
 * Used for recursive alignment (e.g., table rows, list items).
 */
export function alignChildren(
  nodeA: ProseMirrorJSON,
  nodeB: ProseMirrorJSON,
  basePath: number[] = []
): AlignmentResult {
  const childrenA = (nodeA.content || []).map((child: ProseMirrorJSON, i: number) => ({
    node: child,
    fingerprint: '', // Will be computed
    path: [...basePath, i],
  }));

  const childrenB = (nodeB.content || []).map((child: ProseMirrorJSON, i: number) => ({
    node: child,
    fingerprint: '', // Will be computed
    path: [...basePath, i],
  }));

  // Compute fingerprints
  const { generateFingerprint } = require('./nodeFingerprint');
  for (const child of childrenA) {
    child.fingerprint = generateFingerprint(child.node);
  }
  for (const child of childrenB) {
    child.fingerprint = generateFingerprint(child.node);
  }

  return alignNodes(childrenA, childrenB);
}

// ============================================================================
// Table-Specific Alignment
// ============================================================================

/**
 * Align table rows between two tables.
 */
export function alignTableRows(
  tableA: ProseMirrorJSON,
  tableB: ProseMirrorJSON,
  tablePathA: number[],
  tablePathB: number[]
): AlignmentResult {
  const rowsA = (tableA.content || []).map((row: ProseMirrorJSON, i: number) => ({
    node: row,
    fingerprint: '', // Will be computed
    path: [...tablePathA, i],
  }));

  const rowsB = (tableB.content || []).map((row: ProseMirrorJSON, i: number) => ({
    node: row,
    fingerprint: '', // Will be computed
    path: [...tablePathB, i],
  }));

  // Compute fingerprints
  const { generateFingerprint } = require('./nodeFingerprint');
  for (const row of rowsA) {
    row.fingerprint = generateFingerprint(row.node);
  }
  for (const row of rowsB) {
    row.fingerprint = generateFingerprint(row.node);
  }

  return alignNodes(rowsA, rowsB);
}

/**
 * Align table cells between two rows.
 * Cells are typically position-based, but we still check for content matches.
 */
export function alignTableCells(
  rowA: ProseMirrorJSON,
  rowB: ProseMirrorJSON,
  rowPathA: number[],
  rowPathB: number[]
): AlignmentResult {
  const cellsA = (rowA.content || []).map((cell: ProseMirrorJSON, i: number) => ({
    node: cell,
    fingerprint: '', // Will be computed
    path: [...rowPathA, i],
  }));

  const cellsB = (rowB.content || []).map((cell: ProseMirrorJSON, i: number) => ({
    node: cell,
    fingerprint: '', // Will be computed
    path: [...rowPathB, i],
  }));

  // Compute fingerprints
  const { generateFingerprint } = require('./nodeFingerprint');
  for (const cell of cellsA) {
    cell.fingerprint = generateFingerprint(cell.node);
  }
  for (const cell of cellsB) {
    cell.fingerprint = generateFingerprint(cell.node);
  }

  // For cells, prefer position-based matching when counts are equal
  if (cellsA.length === cellsB.length) {
    const matched: NodeMatch[] = [];
    for (let i = 0; i < cellsA.length; i++) {
      const similarity = getNodeTextSimilarity(cellsA[i].node, cellsB[i].node);
      matched.push({
        pathA: cellsA[i].path,
        pathB: cellsB[i].path,
        fingerprint: cellsA[i].fingerprint,
        similarity,
      });
    }
    return { matched, deletions: [], insertions: [] };
  }

  // Different cell counts = use LCS-based alignment
  return alignNodes(cellsA, cellsB);
}

// ============================================================================
// List-Specific Alignment
// ============================================================================

/**
 * Align list items between two lists.
 */
export function alignListItems(
  listA: ProseMirrorJSON,
  listB: ProseMirrorJSON,
  listPathA: number[],
  listPathB: number[]
): AlignmentResult {
  const itemsA = (listA.content || []).map((item: ProseMirrorJSON, i: number) => ({
    node: item,
    fingerprint: '', // Will be computed
    path: [...listPathA, i],
  }));

  const itemsB = (listB.content || []).map((item: ProseMirrorJSON, i: number) => ({
    node: item,
    fingerprint: '', // Will be computed
    path: [...listPathB, i],
  }));

  // Compute fingerprints
  const { generateFingerprint } = require('./nodeFingerprint');
  for (const item of itemsA) {
    item.fingerprint = generateFingerprint(item.node);
  }
  for (const item of itemsB) {
    item.fingerprint = generateFingerprint(item.node);
  }

  return alignNodes(itemsA, itemsB);
}
