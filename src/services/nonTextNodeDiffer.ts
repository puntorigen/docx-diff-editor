/**
 * Non-Text Node Differ Service
 * 
 * Handles diffing of atomic non-text nodes:
 * - Images
 * - Horizontal rules
 * - Page breaks
 * - Embedded objects (equations, etc.)
 */

import type {
  ProseMirrorJSON,
  StructuralChange,
} from '../types';
import { v4 as uuidv4 } from 'uuid';

// ============================================================================
// Node Type Detection
// ============================================================================

/**
 * Check if a node is an image.
 */
export function isImage(node: ProseMirrorJSON): boolean {
  return node?.type === 'image';
}

/**
 * Check if a node is a horizontal rule.
 */
export function isHorizontalRule(node: ProseMirrorJSON): boolean {
  return node?.type === 'horizontalRule' || node?.type === 'hr';
}

/**
 * Check if a node is a hard break.
 */
export function isHardBreak(node: ProseMirrorJSON): boolean {
  return node?.type === 'hardBreak';
}

/**
 * Check if a node is a page break.
 */
export function isPageBreak(node: ProseMirrorJSON): boolean {
  return node?.type === 'pageBreak';
}

/**
 * Check if a node is an embedded object (equation, chart, etc.).
 */
export function isEmbedded(node: ProseMirrorJSON): boolean {
  const embeddedTypes = [
    'equation',
    'math',
    'embed',
    'chart',
    'drawing',
    'shape',
  ];
  return embeddedTypes.includes(node?.type);
}

/**
 * Check if a node is an atomic (non-text, leaf) node.
 */
export function isAtomicNode(node: ProseMirrorJSON): boolean {
  return (
    isImage(node) ||
    isHorizontalRule(node) ||
    isHardBreak(node) ||
    isPageBreak(node) ||
    isEmbedded(node)
  );
}

// ============================================================================
// Image Comparison
// ============================================================================

/**
 * Get image identifier for comparison.
 * Uses src URL or data hash.
 */
export function getImageIdentifier(node: ProseMirrorJSON): string {
  if (!isImage(node)) return '';
  
  const attrs = node.attrs || {};
  
  // Prefer src URL
  if (attrs.src) {
    return `src:${attrs.src}`;
  }
  
  // Fall back to data if available
  if (attrs.data) {
    // Hash the data for comparison
    return `data:${simpleHash(attrs.data)}`;
  }
  
  // Use alt text as last resort
  if (attrs.alt) {
    return `alt:${attrs.alt}`;
  }
  
  return 'unknown';
}

/**
 * Simple hash function for image data.
 */
function simpleHash(str: string): string {
  let hash = 5381;
  const sample = str.substring(0, 1000); // Sample first 1000 chars for speed
  for (let i = 0; i < sample.length; i++) {
    hash = ((hash << 5) + hash) ^ sample.charCodeAt(i);
  }
  return (hash >>> 0).toString(16);
}

/**
 * Compare two images and determine if they're the same.
 */
export function imagesMatch(imgA: ProseMirrorJSON, imgB: ProseMirrorJSON): boolean {
  if (!isImage(imgA) || !isImage(imgB)) return false;
  return getImageIdentifier(imgA) === getImageIdentifier(imgB);
}

// ============================================================================
// Image Diff Detection
// ============================================================================

/**
 * Find images in a document (at any depth).
 */
export function findImages(doc: ProseMirrorJSON, basePath: number[] = []): { node: ProseMirrorJSON; path: number[] }[] {
  const images: { node: ProseMirrorJSON; path: number[] }[] = [];
  
  function traverse(node: ProseMirrorJSON, path: number[]): void {
    if (!node) return;
    
    if (isImage(node)) {
      images.push({ node, path: [...path] });
    }
    
    if (node.content && Array.isArray(node.content)) {
      node.content.forEach((child: ProseMirrorJSON, i: number) => {
        traverse(child, [...path, i]);
      });
    }
  }
  
  traverse(doc, basePath);
  return images;
}

/**
 * Diff images between two documents.
 */
export function diffImages(
  docA: ProseMirrorJSON,
  docB: ProseMirrorJSON
): { inserted: StructuralChange[]; deleted: StructuralChange[] } {
  const imagesA = findImages(docA);
  const imagesB = findImages(docB);
  
  const inserted: StructuralChange[] = [];
  const deleted: StructuralChange[] = [];
  
  // Build identifier sets
  const idsA = new Map<string, { node: ProseMirrorJSON; path: number[] }>();
  const idsB = new Map<string, { node: ProseMirrorJSON; path: number[] }>();
  
  for (const img of imagesA) {
    const id = getImageIdentifier(img.node);
    idsA.set(id, img);
  }
  
  for (const img of imagesB) {
    const id = getImageIdentifier(img.node);
    idsB.set(id, img);
  }
  
  // Find deleted images (in A but not in B)
  for (const [id, img] of idsA) {
    if (!idsB.has(id)) {
      deleted.push({
        id: uuidv4(),
        type: 'imageDelete',
        nodeType: 'image',
        path: img.path,
        node: img.node,
      });
    }
  }
  
  // Find inserted images (in B but not in A)
  for (const [id, img] of idsB) {
    if (!idsA.has(id)) {
      inserted.push({
        id: uuidv4(),
        type: 'imageInsert',
        nodeType: 'image',
        path: img.path,
        node: img.node,
      });
    }
  }
  
  return { inserted, deleted };
}

// ============================================================================
// Location & Preview Functions
// ============================================================================

/**
 * Get a human-readable location for an image.
 */
export function getImageLocation(path: number[]): string {
  // Simple location based on path depth
  if (path.length <= 1) {
    return `Image at position ${path[0] + 1}`;
  }
  return `Image (nested at depth ${path.length})`;
}

/**
 * Get a preview/description for an image.
 */
export function getImagePreview(node: ProseMirrorJSON): string {
  if (!isImage(node)) return '';
  
  const attrs = node.attrs || {};
  
  // Use alt text if available
  if (attrs.alt) {
    return `"${attrs.alt}"`;
  }
  
  // Use filename from src if available
  if (attrs.src) {
    const src = attrs.src as string;
    const filename = src.split('/').pop()?.split('?')[0];
    if (filename) {
      return filename;
    }
  }
  
  return '(image)';
}

/**
 * Get a preview for an atomic node.
 */
export function getAtomicNodePreview(node: ProseMirrorJSON): string {
  if (isImage(node)) return getImagePreview(node);
  if (isHorizontalRule(node)) return '—— (horizontal rule)';
  if (isPageBreak(node)) return '⏎ (page break)';
  if (isHardBreak(node)) return '↵ (line break)';
  if (isEmbedded(node)) return `[${node.type}]`;
  return `[${node.type || 'unknown'}]`;
}
