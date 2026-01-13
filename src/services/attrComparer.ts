/**
 * Attribute Comparer Service
 * 
 * Deep comparison of node attributes to detect style/formatting changes.
 * Handles nested objects and default value normalization.
 */

import type { AttrDiff } from '../types';

// ============================================================================
// Types
// ============================================================================

type AttrValue = unknown;
type AttrObject = Record<string, AttrValue>;

// ============================================================================
// Default Values
// ============================================================================

/**
 * Known default values for common ProseMirror node attributes.
 * Used to normalize comparisons (e.g., missing attr vs explicit default).
 */
const KNOWN_DEFAULTS: Record<string, Record<string, AttrValue>> = {
  paragraph: {
    textAlign: 'left',
    indent: 0,
    lineSpacing: 1,
  },
  heading: {
    level: 1,
    textAlign: 'left',
  },
  table: {
    alignment: 'left',
    borderStyle: 'single',
  },
  tableCell: {
    verticalAlign: 'top',
    colspan: 1,
    rowspan: 1,
  },
  listItem: {
    indent: 0,
  },
  image: {
    width: 'auto',
    height: 'auto',
  },
};

/**
 * Attributes to ignore during comparison.
 * These are internal/computed values that don't represent user changes.
 */
const IGNORED_ATTRS = new Set([
  'id',
  'class',
  'data-id',
  'data-pm-slice',
  '__trackAttrChanges',
]);

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Check if a value is a plain object (not array, null, etc.).
 */
function isPlainObject(value: unknown): value is AttrObject {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.prototype.toString.call(value) === '[object Object]'
  );
}

/**
 * Check if two values are deeply equal.
 */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return a === b;

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((val, i) => deepEqual(val, b[i]));
  }

  if (isPlainObject(a) && isPlainObject(b)) {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;
    return keysA.every((key) => deepEqual(a[key], b[key]));
  }

  return false;
}

/**
 * Normalize an attribute value using known defaults.
 * Returns the default value if the input is undefined/null.
 */
function normalizeValue(
  value: AttrValue,
  key: string,
  nodeType: string
): AttrValue {
  if (value !== undefined && value !== null) {
    return value;
  }

  // Look up default
  const defaults = KNOWN_DEFAULTS[nodeType];
  if (defaults && key in defaults) {
    return defaults[key];
  }

  return value;
}

/**
 * Format a value for display in diff output.
 */
function formatValue(value: unknown): string {
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return JSON.stringify(value);
}

// ============================================================================
// Comparison Functions
// ============================================================================

/**
 * Compare two attribute objects and return differences.
 * 
 * @param attrsA - Attributes from original node
 * @param attrsB - Attributes from new node
 * @param nodeType - Type of node (for default normalization)
 * @param prefix - Key prefix for nested comparisons
 * @returns Array of attribute differences
 */
export function compareAttrs(
  attrsA: AttrObject | undefined,
  attrsB: AttrObject | undefined,
  nodeType: string = '',
  prefix: string = ''
): AttrDiff[] {
  const diffs: AttrDiff[] = [];
  
  const a = attrsA || {};
  const b = attrsB || {};

  // Collect all keys from both objects
  const allKeys = new Set([...Object.keys(a), ...Object.keys(b)]);

  for (const key of allKeys) {
    // Skip ignored attributes
    if (IGNORED_ATTRS.has(key)) continue;

    const fullKey = prefix ? `${prefix}.${key}` : key;
    const valueA = normalizeValue(a[key], key, nodeType);
    const valueB = normalizeValue(b[key], key, nodeType);

    // If both are objects, recurse
    if (isPlainObject(valueA) && isPlainObject(valueB)) {
      const nestedDiffs = compareAttrs(
        valueA as AttrObject,
        valueB as AttrObject,
        nodeType,
        fullKey
      );
      diffs.push(...nestedDiffs);
      continue;
    }

    // Compare values
    if (!deepEqual(valueA, valueB)) {
      diffs.push({
        key: fullKey,
        before: valueA,
        after: valueB,
      });
    }
  }

  return diffs;
}

/**
 * Compare attributes of two nodes and return differences.
 * Convenience wrapper that extracts attrs from nodes.
 */
export function compareNodeAttrs(
  nodeA: { type?: string; attrs?: AttrObject },
  nodeB: { type?: string; attrs?: AttrObject }
): AttrDiff[] {
  const nodeType = nodeA.type || nodeB.type || '';
  return compareAttrs(nodeA.attrs, nodeB.attrs, nodeType);
}

/**
 * Check if two nodes have different attributes.
 */
export function hasAttrChanges(
  nodeA: { type?: string; attrs?: AttrObject },
  nodeB: { type?: string; attrs?: AttrObject }
): boolean {
  const diffs = compareNodeAttrs(nodeA, nodeB);
  return diffs.length > 0;
}

// ============================================================================
// Formatting Functions
// ============================================================================

/**
 * Format attribute differences for display.
 * Returns human-readable strings like "Border: black → blue".
 */
export function formatAttrDiffs(diffs: AttrDiff[]): string[] {
  return diffs.map((diff) => {
    const before = formatValue(diff.before);
    const after = formatValue(diff.after);
    
    // Prettify the key name
    const keyParts = diff.key.split('.');
    const prettyKey = keyParts
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');

    return `${prettyKey}: ${before} → ${after}`;
  });
}

/**
 * Get a short summary of attribute changes.
 */
export function summarizeAttrChanges(diffs: AttrDiff[]): string {
  if (diffs.length === 0) return '';
  if (diffs.length === 1) {
    const diff = diffs[0];
    return `${diff.key}: ${formatValue(diff.before)} → ${formatValue(diff.after)}`;
  }
  return `${diffs.length} formatting changes`;
}
