/**
 * Node Fingerprint Service
 * 
 * Generates content-based fingerprints for ProseMirror nodes.
 * Fingerprints are used to match nodes between documents during diffing.
 * 
 * Key principle: Two nodes with the same content (ignoring styles/attrs)
 * should produce the same or similar fingerprints.
 */

import type { ProseMirrorJSON, FingerprintedNode } from '../types';

// ============================================================================
// Fingerprint Generation
// ============================================================================

/**
 * Extract text content from a node recursively.
 * Used as the basis for fingerprint generation.
 */
function extractTextContent(node: ProseMirrorJSON): string {
  if (!node) return '';

  if (node.type === 'text' && node.text) {
    return node.text;
  }

  if (node.content && Array.isArray(node.content)) {
    return node.content.map(extractTextContent).join('');
  }

  return '';
}

/**
 * Simple hash function for strings.
 * Uses djb2 algorithm - fast and produces reasonably distributed hashes.
 */
function simpleHash(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
  }
  // Convert to unsigned 32-bit and then to hex
  return (hash >>> 0).toString(16);
}

/**
 * Normalize text for fingerprinting.
 * Removes extra whitespace, lowercases, trims.
 */
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Generate a fingerprint for a single node.
 * 
 * Fingerprint format by node type:
 * - text: "t:{hash}"
 * - paragraph: "p:{hash}"
 * - heading: "h{level}:{hash}"
 * - table: "table:{rowCount}:{hash}"
 * - tableRow: "tr:{cellCount}:{hash}"
 * - tableCell: "tc:{hash}"
 * - listItem: "li:{hash}"
 * - image: "img:{srcHash}"
 * - hardBreak: "br"
 * - horizontalRule: "hr"
 * - other: "{type}:{hash}"
 */
export function generateFingerprint(node: ProseMirrorJSON): string {
  if (!node) return '';

  const type = node.type || 'unknown';

  switch (type) {
    case 'text': {
      const text = normalizeText(node.text || '');
      return `t:${simpleHash(text)}`;
    }

    case 'paragraph': {
      const text = normalizeText(extractTextContent(node));
      return `p:${simpleHash(text)}`;
    }

    case 'heading': {
      const level = node.attrs?.level || 1;
      const text = normalizeText(extractTextContent(node));
      return `h${level}:${simpleHash(text)}`;
    }

    case 'table': {
      const rowCount = node.content?.length || 0;
      // Include child fingerprints for more accurate matching
      const childFps = (node.content || [])
        .map((child: ProseMirrorJSON) => generateFingerprint(child))
        .join('|');
      return `table:${rowCount}:${simpleHash(childFps)}`;
    }

    case 'tableRow': {
      const cellCount = node.content?.length || 0;
      const childFps = (node.content || [])
        .map((child: ProseMirrorJSON) => generateFingerprint(child))
        .join('|');
      return `tr:${cellCount}:${simpleHash(childFps)}`;
    }

    case 'tableCell':
    case 'tableHeader': {
      const text = normalizeText(extractTextContent(node));
      return `tc:${simpleHash(text)}`;
    }

    case 'bulletList':
    case 'orderedList': {
      const itemCount = node.content?.length || 0;
      const childFps = (node.content || [])
        .map((child: ProseMirrorJSON) => generateFingerprint(child))
        .join('|');
      return `list:${itemCount}:${simpleHash(childFps)}`;
    }

    case 'listItem': {
      const text = normalizeText(extractTextContent(node));
      return `li:${simpleHash(text)}`;
    }

    case 'image': {
      // Use src attribute as the basis for image fingerprint
      const src = node.attrs?.src || '';
      return `img:${simpleHash(src)}`;
    }

    case 'hardBreak':
      return 'br';

    case 'horizontalRule':
      return 'hr';

    case 'codeBlock': {
      const text = normalizeText(extractTextContent(node));
      const lang = node.attrs?.language || '';
      return `code:${lang}:${simpleHash(text)}`;
    }

    case 'blockquote': {
      const text = normalizeText(extractTextContent(node));
      return `bq:${simpleHash(text)}`;
    }

    // For doc and other container types, fingerprint based on content
    case 'doc': {
      const childFps = (node.content || [])
        .map((child: ProseMirrorJSON) => generateFingerprint(child))
        .join('|');
      return `doc:${simpleHash(childFps)}`;
    }

    // Default: use type and text content
    default: {
      const text = normalizeText(extractTextContent(node));
      return `${type}:${simpleHash(text)}`;
    }
  }
}

// ============================================================================
// Fingerprinted Node Tree
// ============================================================================

/**
 * Build a tree of fingerprinted nodes from a document.
 * Each node gets a fingerprint and path for later reference.
 */
export function buildFingerprintTree(
  node: ProseMirrorJSON,
  path: number[] = []
): FingerprintedNode {
  const fingerprint = generateFingerprint(node);
  
  const result: FingerprintedNode = {
    node,
    fingerprint,
    path: [...path],
  };

  if (node.content && Array.isArray(node.content)) {
    result.children = node.content.map((child: ProseMirrorJSON, index: number) =>
      buildFingerprintTree(child, [...path, index])
    );
  }

  return result;
}

/**
 * Extract top-level block nodes with their fingerprints.
 * These are the nodes we'll align between documents.
 */
export function extractBlockFingerprints(doc: ProseMirrorJSON): FingerprintedNode[] {
  if (!doc || !doc.content || !Array.isArray(doc.content)) {
    return [];
  }

  return doc.content.map((child: ProseMirrorJSON, index: number) => ({
    node: child,
    fingerprint: generateFingerprint(child),
    path: [index],
  }));
}

// ============================================================================
// Similarity Calculation
// ============================================================================

/**
 * Calculate similarity between two fingerprints.
 * Returns a value between 0.0 (completely different) and 1.0 (identical).
 * 
 * For identical fingerprints, returns 1.0.
 * For fingerprints of the same type, calculates content similarity.
 */
export function calculateSimilarity(fpA: string, fpB: string): number {
  // Identical fingerprints = perfect match
  if (fpA === fpB) return 1.0;

  // Extract type prefix
  const typeA = fpA.split(':')[0];
  const typeB = fpB.split(':')[0];

  // Different types = no match
  if (typeA !== typeB) return 0.0;

  // Same type but different content = partial match
  // Use simple heuristic based on prefix length
  // This is a simplified approach - could be enhanced with actual content comparison
  
  // For now, same type gives a base similarity
  // The actual matching will use this along with content comparison
  return 0.3;
}

/**
 * Calculate text similarity using Levenshtein distance.
 * Returns a value between 0.0 and 1.0.
 */
export function calculateTextSimilarity(textA: string, textB: string): number {
  const a = normalizeText(textA);
  const b = normalizeText(textB);

  if (a === b) return 1.0;
  if (a.length === 0 || b.length === 0) return 0.0;

  // For very different lengths, quick reject
  const lenRatio = Math.min(a.length, b.length) / Math.max(a.length, b.length);
  if (lenRatio < 0.3) return lenRatio;

  // Calculate Levenshtein distance
  const distance = levenshteinDistance(a, b);
  const maxLen = Math.max(a.length, b.length);
  
  return 1 - (distance / maxLen);
}

/**
 * Levenshtein distance implementation.
 * Optimized for memory by only keeping two rows.
 */
function levenshteinDistance(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  // Use two rows for memory efficiency
  let prevRow = Array.from({ length: b.length + 1 }, (_, i) => i);
  let currRow = new Array(b.length + 1);

  for (let i = 1; i <= a.length; i++) {
    currRow[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      currRow[j] = Math.min(
        prevRow[j] + 1,       // deletion
        currRow[j - 1] + 1,   // insertion
        prevRow[j - 1] + cost // substitution
      );
    }
    [prevRow, currRow] = [currRow, prevRow];
  }

  return prevRow[b.length];
}

/**
 * Get full text similarity between two nodes.
 */
export function getNodeTextSimilarity(nodeA: ProseMirrorJSON, nodeB: ProseMirrorJSON): number {
  const textA = extractTextContent(nodeA);
  const textB = extractTextContent(nodeB);
  return calculateTextSimilarity(textA, textB);
}
