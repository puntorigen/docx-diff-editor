/**
 * Track Change Injector Service
 * Creates track change marks for insertions, deletions, and format changes.
 */

import { v4 as uuidv4 } from 'uuid';
import type { TrackChangeAuthor, ProseMirrorJSON, ProseMirrorMark } from '../types';
import { DEFAULT_AUTHOR } from '../constants';

/**
 * Ensure a color value is valid CSS (has # prefix for hex colors).
 * SuperDoc's Color extension renderDOM uses the color value directly in CSS,
 * so hex colors MUST have # prefix to be valid.
 * 
 * Examples:
 * - "ff0000" → "#ff0000"
 * - "#ff0000" → "#ff0000" (unchanged)
 * - "red" → "red" (named colors unchanged)
 * - "rgb(255,0,0)" → "rgb(255,0,0)" (rgb unchanged)
 */
function ensureValidCssColor(color: unknown): string | undefined {
  if (typeof color !== 'string' || !color) {
    return undefined;
  }
  
  // If it's a 6-character hex without #, add the #
  if (/^[0-9a-fA-F]{6}$/.test(color)) {
    return `#${color}`;
  }
  
  // If it's a 3-character hex without #, add the #
  if (/^[0-9a-fA-F]{3}$/.test(color)) {
    return `#${color}`;
  }
  
  // Already has # or is a named color/rgb/etc - return as-is
  return color;
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
 * Normalize an array of marks to ensure all have `attrs` property
 * and valid color formats.
 */
function normalizeMarks(marks: ProseMirrorMark[]): ProseMirrorMark[] {
  return marks.map(normalizeMark);
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
 * causing empty values in track change bubbles. We normalize marks here to ensure
 * all have at least an empty `attrs` object.
 */
export function createTrackFormatMark(
  before: ProseMirrorMark[],
  after: ProseMirrorMark[],
  author: TrackChangeAuthor = DEFAULT_AUTHOR
): ProseMirrorMark {
  // Normalize marks to ensure all have `attrs` property
  // This is required by SuperDoc's parseFormatList which filters marks without attrs
  const normalizedBefore = normalizeMarks(before);
  const normalizedAfter = normalizeMarks(after);

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

