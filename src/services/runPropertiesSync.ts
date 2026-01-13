/**
 * Run Properties Sync Service
 * 
 * Ensures that ProseMirror marks on text nodes are synced to
 * runProperties on parent run nodes. This is required because
 * SuperDoc has a dual-layer architecture:
 * 
 * - ProseMirror marks on text nodes → used for editing interactions
 * - runProperties on run nodes → used for actual DOCX rendering
 * 
 * Both need to be in sync for styles to render correctly.
 * 
 * Based on SuperDoc's decodeRPrFromMarks logic in converter-BavE2jnW.js
 */

import type { ProseMirrorJSON, ProseMirrorNode } from '../types';

// ============================================================================
// Types
// ============================================================================

/**
 * A ProseMirror mark as it appears in JSON
 */
interface ProseMirrorMark {
  type: string;
  attrs?: Record<string, unknown>;
}

/**
 * SuperDoc's runProperties format
 */
interface RunProperties {
  bold?: boolean;
  italic?: boolean;
  strike?: boolean;
  underline?: {
    'w:val'?: string;
    'w:color'?: string;
  };
  highlight?: {
    'w:val': string;
  };
  color?: {
    val: string;
  };
  fontSize?: number;
  fontFamily?: {
    ascii: string;
    eastAsia: string;
    hAnsi: string;
    cs: string;
  };
  letterSpacing?: number;
  textTransform?: string;
  [key: string]: unknown;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Points to twips conversion (1 point = 20 twips)
 */
const PT_TO_TWIPS = 20;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Convert points string to twips number.
 * Example: "1pt" → 20
 */
function ptToTwips(ptValue: number): number {
  return Math.round(ptValue * PT_TO_TWIPS);
}

/**
 * Strip # from hex color if present.
 * Example: "#ff0000" → "ff0000"
 */
function stripHashFromColor(color: string): string {
  return color.replace(/^#/, '');
}

/**
 * Parse a font size string to points.
 * Handles: "12pt", "12", "16px" (approximates px to pt)
 */
function parseFontSizeToPoints(fontSize: string | number): number | null {
  if (typeof fontSize === 'number') {
    return fontSize;
  }
  
  const value = parseFloat(fontSize);
  if (isNaN(value)) {
    return null;
  }
  
  // Check for px suffix and convert (approximate: 1px ≈ 0.75pt)
  if (fontSize.toLowerCase().includes('px')) {
    return value * 0.75;
  }
  
  // Assume pt or no suffix
  return value;
}

/**
 * Clean font family string - take first font from comma-separated list
 * and remove quotes.
 * Example: "'Arial', sans-serif" → "Arial"
 */
function cleanFontFamily(fontFamily: string): string {
  return fontFamily
    .split(',')[0]
    .trim()
    .replace(/^["']|["']$/g, '');
}

// ============================================================================
// Main Conversion Function
// ============================================================================

/**
 * Convert an array of ProseMirror marks to SuperDoc runProperties format.
 * 
 * Based on SuperDoc's decodeRPrFromMarks logic.
 */
export function marksToRunProperties(marks: ProseMirrorMark[]): RunProperties {
  const runProperties: RunProperties = {};

  if (!marks || !Array.isArray(marks)) {
    return runProperties;
  }

  for (const mark of marks) {
    const type = mark.type;
    const attrs = mark.attrs || {};

    switch (type) {
      // Boolean marks: bold, italic, strike
      case 'bold':
      case 'italic':
      case 'strike': {
        // Check if mark is negated (value === "0" or false)
        const isNegated = attrs.value === '0' || attrs.value === false;
        runProperties[type] = !isNegated;
        break;
      }

      // Underline with optional type and color
      case 'underline': {
        const underlineAttrs: { 'w:val'?: string; 'w:color'?: string } = {};
        
        if (attrs.underlineType) {
          underlineAttrs['w:val'] = String(attrs.underlineType);
        } else {
          // Default underline type
          underlineAttrs['w:val'] = 'single';
        }
        
        if (attrs.underlineColor) {
          underlineAttrs['w:color'] = stripHashFromColor(String(attrs.underlineColor));
        }
        
        if (Object.keys(underlineAttrs).length > 0) {
          runProperties.underline = underlineAttrs;
        }
        break;
      }

      // Highlight (background color)
      case 'highlight': {
        if (attrs.color) {
          const color = String(attrs.color).toLowerCase();
          if (color === 'transparent') {
            runProperties.highlight = { 'w:val': 'none' };
          } else {
            runProperties.highlight = { 'w:val': color };
          }
        }
        break;
      }

      // textStyle contains multiple style attributes
      case 'textStyle': {
        // Color
        if (attrs.color != null) {
          runProperties.color = {
            val: stripHashFromColor(String(attrs.color)),
          };
        }

        // Font size (convert to half-points)
        if (attrs.fontSize != null) {
          const points = parseFontSizeToPoints(attrs.fontSize as string | number);
          if (points !== null) {
            runProperties.fontSize = points * 2; // Half-points
          }
        }

        // Font family (needs all 4 properties)
        if (attrs.fontFamily != null) {
          const cleanedFont = cleanFontFamily(String(attrs.fontFamily));
          runProperties.fontFamily = {
            ascii: cleanedFont,
            eastAsia: cleanedFont,
            hAnsi: cleanedFont,
            cs: cleanedFont,
          };
        }

        // Letter spacing (convert to twips)
        if (attrs.letterSpacing != null) {
          const ptValue = parseFloat(String(attrs.letterSpacing));
          if (!isNaN(ptValue)) {
            runProperties.letterSpacing = ptToTwips(ptValue);
          }
        }

        // Text transform (pass through)
        if (attrs.textTransform != null) {
          runProperties.textTransform = String(attrs.textTransform);
        }
        break;
      }

      // Unknown mark types are ignored
      default:
        break;
    }
  }

  return runProperties;
}

// ============================================================================
// Document Normalization
// ============================================================================

/**
 * Recursively collect all marks from text nodes within a node.
 * This handles cases where text is nested within inline elements inside a run.
 */
function collectMarksRecursively(node: ProseMirrorNode, allMarks: ProseMirrorMark[]): void {
  if (node.type === 'text' && node.marks && Array.isArray(node.marks)) {
    allMarks.push(...node.marks);
  }

  if (node.content && Array.isArray(node.content)) {
    for (const child of node.content) {
      collectMarksRecursively(child, allMarks);
    }
  }
}

/**
 * Collect all marks from text node descendants of a run node.
 * Recursively searches to handle nested inline content.
 */
function collectMarksFromRunChildren(runNode: ProseMirrorNode): ProseMirrorMark[] {
  const allMarks: ProseMirrorMark[] = [];

  if (!runNode.content || !Array.isArray(runNode.content)) {
    return allMarks;
  }

  // Recursively collect marks from all text nodes
  for (const child of runNode.content) {
    collectMarksRecursively(child, allMarks);
  }

  // Deduplicate marks by type (keep last occurrence for each type)
  const marksByType = new Map<string, ProseMirrorMark>();
  for (const mark of allMarks) {
    marksByType.set(mark.type, mark);
  }

  return Array.from(marksByType.values());
}

/**
 * Recursively walk a node and normalize runProperties on run nodes.
 */
function normalizeNode(node: ProseMirrorNode): ProseMirrorNode {
  // If this is a run node, sync runProperties from child text marks
  if (node.type === 'run') {
    const marks = collectMarksFromRunChildren(node);
    
    if (marks.length > 0) {
      const runPropsFromMarks = marksToRunProperties(marks);
      
      // Merge with existing runProperties (marks override)
      const existingRunProps = (node.attrs?.runProperties as RunProperties) || {};
      const mergedRunProps = {
        ...existingRunProps,
        ...runPropsFromMarks,
      };

      // Return node with updated runProperties
      return {
        ...node,
        attrs: {
          ...node.attrs,
          runProperties: mergedRunProps,
        },
        // Also recursively process children (though runs usually just have text)
        content: node.content?.map(normalizeNode),
      };
    }
  }

  // Recursively process children
  if (node.content && Array.isArray(node.content)) {
    return {
      ...node,
      content: node.content.map(normalizeNode),
    };
  }

  return node;
}

/**
 * Normalize a ProseMirror document by syncing runProperties on run nodes
 * from child text node marks.
 * 
 * This ensures that styles set via marks (from HTML parsing, etc.) are
 * properly reflected in runProperties for DOCX rendering.
 * 
 * This function is idempotent - running it multiple times produces the same result.
 */
export function normalizeRunProperties(doc: ProseMirrorJSON): ProseMirrorJSON {
  // Deep clone to avoid mutating original
  const cloned = JSON.parse(JSON.stringify(doc)) as ProseMirrorJSON;
  
  return normalizeNode(cloned) as ProseMirrorJSON;
}
