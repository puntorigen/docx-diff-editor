/**
 * Merge Documents Service
 * Applies track change marks to the original document structure
 * based on character-level diff segments.
 */

import type {
  ProseMirrorJSON,
  ProseMirrorNode,
  DiffResult,
  FormatChange,
  TrackChangeAuthor,
} from '../types';
import {
  createTrackInsertMark,
  createTrackDeleteMark,
  createTrackFormatMark,
} from './trackChangeInjector';
import { DEFAULT_AUTHOR } from '../constants';

/**
 * Deep clone a node
 */
function cloneNode(node: ProseMirrorNode): ProseMirrorNode {
  return JSON.parse(JSON.stringify(node));
}

/**
 * Character state during merge
 */
interface CharState {
  type: 'equal' | 'delete' | 'insert';
  insertText?: string;
}

/**
 * Insertion point during merge
 */
interface Insertion {
  afterOffset: number;
  text: string;
}

/**
 * Build a merged document by applying diff segments to the original structure.
 *
 * Strategy:
 * 1. Clone docA (original)
 * 2. Walk through diff segments
 * 3. For 'equal' segments: keep original content as-is
 * 4. For 'delete' segments: add trackDelete mark to the corresponding text
 * 5. For 'insert' segments: insert new text nodes with trackInsert mark
 */
export function mergeDocuments(
  docA: ProseMirrorNode,
  docB: ProseMirrorNode,
  diffResult: DiffResult,
  author: TrackChangeAuthor = DEFAULT_AUTHOR
): ProseMirrorNode {
  // Clone the original document
  const merged = cloneNode(docA);

  // Build a map of character offset -> segment type
  // This tells us for each character what its state is
  const charStates: CharState[] = [];
  let insertions: Insertion[] = [];

  // Store format changes as array for range lookups
  const formatChanges: FormatChange[] = diffResult.formatChanges || [];

  // Helper to find format change at a position
  function getFormatChangeAt(pos: number): FormatChange | null {
    for (const fc of formatChanges) {
      if (pos >= fc.from && pos < fc.to) {
        return fc;
      }
    }
    return null;
  }

  let docAOffset = 0;
  for (const segment of diffResult.segments) {
    if (segment.type === 'equal') {
      // Mark these characters as equal
      for (let i = 0; i < segment.text.length; i++) {
        charStates[docAOffset + i] = { type: 'equal' };
      }
      docAOffset += segment.text.length;
    } else if (segment.type === 'delete') {
      // Mark these characters as deleted
      for (let i = 0; i < segment.text.length; i++) {
        charStates[docAOffset + i] = { type: 'delete' };
      }
      docAOffset += segment.text.length;
    } else if (segment.type === 'insert') {
      // Insert doesn't consume docA characters, it adds new text
      // We need to track where to insert
      insertions.push({
        afterOffset: docAOffset,
        text: segment.text,
      });
    }
  }

  // Now we need to transform the document
  // For each text span in the original:
  // 1. Split it based on character states (equal vs delete)
  // 2. Apply trackDelete marks to deleted parts
  // 3. Insert new content where insertions occur

  function transformNode(
    node: ProseMirrorNode,
    nodeOffset: number,
    path: number[]
  ): { nodes: ProseMirrorNode[]; consumedLength: number } {
    if (node.type === 'text' && node.text) {
      const text = node.text;
      const result: ProseMirrorNode[] = [];
      let i = 0;

      while (i < text.length) {
        const charOffset = nodeOffset + i;
        const charState = charStates[charOffset] || { type: 'equal' };

        // Check for insertions at this position
        const insertionsHere = insertions.filter((ins) => ins.afterOffset === charOffset);
        for (const ins of insertionsHere) {
          result.push({
            type: 'text',
            text: ins.text,
            marks: [...(node.marks || []), createTrackInsertMark(author)],
          });
        }

        // Find run of same state AND same format change status
        const currentFormatChange = getFormatChangeAt(nodeOffset + i);
        let j = i + 1;
        while (j < text.length) {
          const nextState = charStates[nodeOffset + j] || { type: 'equal' };
          if (nextState.type !== charState.type) break;
          // Also break if there's an insertion point here
          if (insertions.some((ins) => ins.afterOffset === nodeOffset + j)) break;
          // Break if format change status changes
          const nextFormatChange = getFormatChangeAt(nodeOffset + j);
          if (currentFormatChange !== nextFormatChange) break;
          j++;
        }

        const chunk = text.substring(i, j);
        let marks = [...(node.marks || [])];

        if (charState.type === 'delete') {
          marks.push(createTrackDeleteMark(author));
        } else if (charState.type === 'equal') {
          // Check if there's a format change at this position
          if (currentFormatChange) {
            // For format changes, use the NEW marks (after) plus trackFormat
            const trackFormatMark = createTrackFormatMark(
              currentFormatChange.before,
              currentFormatChange.after,
              author
            );
            marks = [...currentFormatChange.after, trackFormatMark];
          }
        }

        result.push({
          type: 'text',
          text: chunk,
          marks: marks.length > 0 ? marks : undefined,
        });

        i = j;
      }

      // Check for insertions at the end of this text node
      const endOffset = nodeOffset + text.length;
      const endInsertions = insertions.filter((ins) => ins.afterOffset === endOffset);
      for (const ins of endInsertions) {
        result.push({
          type: 'text',
          text: ins.text,
          marks: [...(node.marks || []), createTrackInsertMark(author)],
        });
      }

      // Remove processed insertions
      insertions = insertions.filter(
        (ins) => ins.afterOffset < nodeOffset || ins.afterOffset > endOffset
      );

      return { nodes: result, consumedLength: text.length };
    }

    // Non-text node: recursively transform children
    if (node.content && Array.isArray(node.content)) {
      const newContent: ProseMirrorNode[] = [];
      let offset = nodeOffset;

      for (const child of node.content) {
        const { nodes, consumedLength } = transformNode(child, offset, path);
        newContent.push(...nodes);
        offset += consumedLength;
      }

      return {
        nodes: [{ ...node, content: newContent }],
        consumedLength: offset - nodeOffset,
      };
    }

    // Node without content (like hard break)
    return { nodes: [node], consumedLength: 0 };
  }

  // Transform the document content
  if (merged.content && Array.isArray(merged.content)) {
    const newContent: ProseMirrorNode[] = [];
    let offset = 0;

    for (let i = 0; i < merged.content.length; i++) {
      const child = merged.content[i];
      const { nodes, consumedLength } = transformNode(child, offset, [i]);
      newContent.push(...nodes);
      offset += consumedLength;
    }

    merged.content = newContent;
  }

  // Handle any remaining insertions (at the very end)
  if (insertions.length > 0) {
    for (const ins of insertions) {
      const insertNode = {
        type: 'paragraph',
        content: [
          {
            type: 'run',
            content: [
              {
                type: 'text',
                text: ins.text,
                marks: [createTrackInsertMark(author)],
              },
            ],
          },
        ],
      };
      if (!merged.content) merged.content = [];
      merged.content.push(insertNode);
    }
  }

  return merged;
}

/**
 * Export for compatibility
 */
export function createSimpleMergedDocument(
  docA: ProseMirrorNode,
  docB: ProseMirrorNode,
  diffResult: DiffResult,
  author: TrackChangeAuthor = DEFAULT_AUTHOR
): ProseMirrorNode {
  return mergeDocuments(docA, docB, diffResult, author);
}

