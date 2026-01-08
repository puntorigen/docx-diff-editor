/**
 * Track Change Injector Service
 * Creates track change marks for insertions, deletions, and format changes.
 */

import { v4 as uuidv4 } from 'uuid';
import type { TrackChangeAuthor, ProseMirrorJSON, ProseMirrorMark } from '../types';
import { DEFAULT_AUTHOR } from '../constants';

/**
 * Create a trackInsert mark.
 */
export function createTrackInsertMark(author: TrackChangeAuthor = DEFAULT_AUTHOR): ProseMirrorMark {
  return {
    type: 'trackInsert',
    attrs: {
      id: uuidv4(),
      author: author.name,
      authorEmail: author.email,
      authorImage: '',
      date: new Date().toISOString(),
    },
  };
}

/**
 * Create a trackDelete mark.
 */
export function createTrackDeleteMark(author: TrackChangeAuthor = DEFAULT_AUTHOR): ProseMirrorMark {
  return {
    type: 'trackDelete',
    attrs: {
      id: uuidv4(),
      author: author.name,
      authorEmail: author.email,
      authorImage: '',
      date: new Date().toISOString(),
    },
  };
}

/**
 * Create a trackFormat mark.
 */
export function createTrackFormatMark(
  before: ProseMirrorMark[],
  after: ProseMirrorMark[],
  author: TrackChangeAuthor = DEFAULT_AUTHOR
): ProseMirrorMark {
  return {
    type: 'trackFormat',
    attrs: {
      id: uuidv4(),
      author: author.name,
      authorEmail: author.email,
      authorImage: '',
      date: new Date().toISOString(),
      before,
      after,
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

