/**
 * Track Change Injector Service
 * Creates track change marks for insertions, deletions, and format changes.
 */

import { v4 as uuidv4 } from 'uuid';
import type { TrackChangeAuthor, ProseMirrorJSON, ProseMirrorMark } from '../types';
import { DEFAULT_AUTHOR } from '../constants';
import { ensureValidCssColor } from './colorUtils';

/**
 * Check if a value is meaningful (not null, undefined, or empty string).
 */
function isMeaningfulValue(value: unknown): boolean {
  return value !== null && value !== undefined && value !== '';
}

/**
 * Clean attrs by removing null, undefined, and empty string values.
 * This prevents SuperDoc's translateFormatChangesToEnglish from showing
 * "Changed X from Y to undefined" when properties don't exist in one side.
 */
function cleanAttrs(attrs: Record<string, unknown>): Record<string, unknown> {
  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(attrs)) {
    if (isMeaningfulValue(value)) {
      cleaned[key] = value;
    }
  }
  return cleaned;
}

/**
 * Normalize a mark to ensure it has an `attrs` property and valid color format.
 * 
 * SuperDoc requirements:
 * 1. parseFormatList filters out marks without `attrs`
 * 2. Color extension renderDOM uses attrs.color directly in CSS (needs # for hex)
 */
function normalizeMark(mark: ProseMirrorMark): ProseMirrorMark {
  const attrs = { ...(mark.attrs || {}) };
  
  // Ensure color has valid CSS format (# prefix for hex colors)
  if (attrs.color !== undefined) {
    attrs.color = ensureValidCssColor(attrs.color);
  }
  
  return {
    type: mark.type,
    attrs,
  };
}

/**
 * Normalize a mark for use in trackFormat before/after arrays.
 * 
 * This is stricter than normalizeMark - it also cleans attrs to remove
 * null/undefined/empty values. This prevents SuperDoc's bubble display from
 * showing "Set font family to undefined" when comparing marks with different
 * property sets.
 * 
 * Example issue without cleaning:
 * - before: {fontFamily: "Arial", fontSize: "12pt"}
 * - after: {color: "#ff0000"}  (no fontFamily property)
 * - Object.keys merge: ["fontFamily", "fontSize", "color"]
 * - afterValue for fontFamily = undefined → shows "Changed font family from Arial to undefined"
 */
function normalizeMarkForTrackFormat(mark: ProseMirrorMark): ProseMirrorMark {
  let attrs = { ...(mark.attrs || {}) };
  
  // Ensure color has valid CSS format (# prefix for hex colors)
  if (attrs.color !== undefined) {
    attrs.color = ensureValidCssColor(attrs.color);
  }
  
  // Clean attrs to only include meaningful values
  attrs = cleanAttrs(attrs);
  
  return {
    type: mark.type,
    attrs,
  };
}

/**
 * Normalize an array of marks to ensure all have `attrs` property
 * and valid color formats.
 */
function normalizeMarks(marks: ProseMirrorMark[]): ProseMirrorMark[] {
  return marks.map(normalizeMark);
}

/**
 * Normalize an array of marks for use in trackFormat before/after arrays.
 * Cleans attrs to remove null/undefined/empty values.
 */
function normalizeMarksForTrackFormat(marks: ProseMirrorMark[]): ProseMirrorMark[] {
  return marks.map(normalizeMarkForTrackFormat);
}

/**
 * Normalize marks for DOM rendering.
 * Exported for use in other modules that apply marks to text nodes.
 */
export function normalizeMarksForRendering(marks: ProseMirrorMark[]): ProseMirrorMark[] {
  return normalizeMarks(marks);
}

/**
 * Create a trackInsert mark.
 * @param author - The author of the change
 * @param id - Optional ID to use (for linking with corresponding delete in replacements)
 */
export function createTrackInsertMark(
  author: TrackChangeAuthor = DEFAULT_AUTHOR,
  id?: string
): ProseMirrorMark {
  return {
    type: 'trackInsert',
    attrs: {
      id: id ?? uuidv4(),
      author: author.name,
      authorEmail: author.email,
      authorImage: '',
      date: new Date().toISOString(),
    },
  };
}

/**
 * Create a trackDelete mark.
 * @param author - The author of the change
 * @param id - Optional ID to use (for linking with corresponding insert in replacements)
 */
export function createTrackDeleteMark(
  author: TrackChangeAuthor = DEFAULT_AUTHOR,
  id?: string
): ProseMirrorMark {
  return {
    type: 'trackDelete',
    attrs: {
      id: id ?? uuidv4(),
      author: author.name,
      authorEmail: author.email,
      authorImage: '',
      date: new Date().toISOString(),
    },
  };
}

/**
 * Create a trackFormat mark.
 * 
 * Note: SuperDoc's parseFormatList requires all marks in before/after arrays
 * to have both `type` and `attrs` properties. Marks without `attrs` get filtered out,
 * causing empty values in track change bubbles.
 * 
 * We use normalizeMarksForTrackFormat which:
 * 1. Ensures all marks have `attrs` property (required by parseFormatList)
 * 2. Cleans attrs to remove null/undefined/empty values (prevents "Set X to undefined" bubbles)
 * 3. Normalizes color values to valid CSS format
 */
export function createTrackFormatMark(
  before: ProseMirrorMark[],
  after: ProseMirrorMark[],
  author: TrackChangeAuthor = DEFAULT_AUTHOR
): ProseMirrorMark {
  // Normalize marks for trackFormat - cleans attrs to only include meaningful values
  // This prevents SuperDoc's translateFormatChangesToEnglish from showing
  // "Changed X from Y to undefined" when comparing marks with different property sets
  const normalizedBefore = normalizeMarksForTrackFormat(before);
  const normalizedAfter = normalizeMarksForTrackFormat(after);

  return {
    type: 'trackFormat',
    attrs: {
      id: uuidv4(),
      author: author.name,
      authorEmail: author.email,
      authorImage: '',
      date: new Date().toISOString(),
      before: normalizedBefore,
      after: normalizedAfter,
    },
  };
}

/**
 * Add a mark to a text node, preserving existing marks.
 */
export function addMarkToTextNode(
  node: ProseMirrorJSON,
  mark: ProseMirrorMark
): ProseMirrorJSON {
  if (node.type !== 'text') {
    return node;
  }

  return {
    ...node,
    marks: [...(node.marks || []), mark],
  };
}

/**
 * Create a text node with specific marks.
 */
export function createTextNode(
  text: string,
  marks: ProseMirrorMark[] = []
): ProseMirrorJSON {
  const node: ProseMirrorJSON = {
    type: 'text',
    text,
  };

  if (marks.length > 0) {
    node.marks = marks;
  }

  return node;
}

/**
 * Apply trackDelete mark to all text in a node (recursively).
 */
export function markAllAsDeleted(
  node: ProseMirrorJSON,
  author: TrackChangeAuthor = DEFAULT_AUTHOR
): ProseMirrorJSON {
  if (node.type === 'text') {
    return addMarkToTextNode(node, createTrackDeleteMark(author));
  }

  if (node.content && Array.isArray(node.content)) {
    return {
      ...node,
      content: node.content.map((child: ProseMirrorJSON) =>
        markAllAsDeleted(child, author)
      ),
    };
  }

  return node;
}

/**
 * Apply trackInsert mark to all text in a node (recursively).
 */
export function markAllAsInserted(
  node: ProseMirrorJSON,
  author: TrackChangeAuthor = DEFAULT_AUTHOR
): ProseMirrorJSON {
  if (node.type === 'text') {
    return addMarkToTextNode(node, createTrackInsertMark(author));
  }

  if (node.content && Array.isArray(node.content)) {
    return {
      ...node,
      content: node.content.map((child: ProseMirrorJSON) =>
        markAllAsInserted(child, author)
      ),
    };
  }

  return node;
}

/**
 * Clone a node deeply.
 */
export function cloneNode(node: ProseMirrorJSON): ProseMirrorJSON {
  return JSON.parse(JSON.stringify(node));
}

