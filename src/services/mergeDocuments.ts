/**
 * Merge Documents Service
 * Applies track change marks to the original document structure
 * based on character-level diff segments.
 */

import { v4 as uuidv4 } from 'uuid';
import type {
  ProseMirrorJSON,
  ProseMirrorNode,
  ProseMirrorMark,
  DiffResult,
  FormatChange,
  TrackChangeAuthor,
  TextSpan,
} from '../types';
import {
  createTrackInsertMark,
  createTrackDeleteMark,
  createTrackFormatMark,
  normalizeMarksForRendering,
} from './trackChangeInjector';
import { DEFAULT_AUTHOR } from '../constants';

/**
 * Deep clone a node
 */
function cloneNode(node: ProseMirrorNode): ProseMirrorNode {
  return JSON.parse(JSON.stringify(node));
}

/**
 * Get marks from docB spans at a specific character position.
 * Used to preserve styling from the source document for inserted text.
 */
function getMarksFromSpansB(spansB: TextSpan[], position: number): ProseMirrorMark[] {
  for (const span of spansB) {
    if (position >= span.from && position < span.to) {
      return span.marks || [];
    }
  }
  return [];
}

/**
 * Get mark spans that cover a range of text in docB.
 * Used when inserted text spans multiple differently-styled regions.
 */
function getMarkSpansForRange(
  spansB: TextSpan[],
  start: number,
  end: number
): { relStart: number; relEnd: number; marks: ProseMirrorMark[] }[] {
  const result: { relStart: number; relEnd: number; marks: ProseMirrorMark[] }[] = [];
  
  for (const span of spansB) {
    // Check if span overlaps with our range
    if (span.to > start && span.from < end) {
      // Calculate relative positions within the insertion range
      const overlapStart = Math.max(span.from, start);
      const overlapEnd = Math.min(span.to, end);
      
      result.push({
        relStart: overlapStart - start,
        relEnd: overlapEnd - start,
        marks: span.marks || [],
      });
    }
  }
  
  return result;
}

/**
 * Create text nodes for inserted text, preserving marks from docB.
 * 
 * If the inserted text spans multiple mark regions in docB, this will
 * create multiple text nodes, each with the appropriate marks from docB
 * plus the trackInsert mark.
 * 
 * @param text - The inserted text content
 * @param posB - Position in docB where this text originated (undefined if unknown)
 * @param spansB - Text spans from docB with mark information
 * @param author - Author for track change marks
 * @param replacementId - Optional shared ID for replacement operations
 * @returns Array of text nodes with preserved marks
 */
function createInsertedTextNodes(
  text: string,
  posB: number | undefined,
  spansB: TextSpan[],
  author: TrackChangeAuthor,
  replacementId?: string
): ProseMirrorNode[] {
  const result: ProseMirrorNode[] = [];
  const trackMark = createTrackInsertMark(author, replacementId);
  
  // If we don't have position info or spans, create a simple node with just trackInsert
  if (posB === undefined || spansB.length === 0) {
    return [{
      type: 'text',
      text,
      marks: [trackMark],
    }];
  }
  
  // Get all mark spans that cover this inserted text range
  const markSpans = getMarkSpansForRange(spansB, posB, posB + text.length);
  
  // If no spans found, create simple node
  if (markSpans.length === 0) {
    return [{
      type: 'text',
      text,
      marks: [trackMark],
    }];
  }
  
  // Sort spans by start position
  markSpans.sort((a, b) => a.relStart - b.relStart);
  
  // Track how much text we've processed
  let processedUpTo = 0;
  
  for (const span of markSpans) {
    // If there's a gap before this span, create a node without marks
    if (span.relStart > processedUpTo) {
      result.push({
        type: 'text',
        text: text.substring(processedUpTo, span.relStart),
        marks: [trackMark],
      });
    }
    
    // Create node with marks from docB plus trackInsert
    // Normalize marks to ensure valid CSS color format (# prefix for hex colors)
    if (span.relEnd > span.relStart) {
      const spanText = text.substring(span.relStart, span.relEnd);
      const normalizedSpanMarks = normalizeMarksForRendering(span.marks);
      const marks = [...normalizedSpanMarks, trackMark];
      
      result.push({
        type: 'text',
        text: spanText,
        marks,
      });
      processedUpTo = span.relEnd;
    }
  }
  
  // Handle any remaining text after the last span
  if (processedUpTo < text.length) {
    result.push({
      type: 'text',
      text: text.substring(processedUpTo),
      marks: [trackMark],
    });
  }
  
  return result;
}

/**
 * Character state during merge
 */
interface CharState {
  type: 'equal' | 'delete' | 'insert';
  insertText?: string;
  /** Shared ID for replacement operations (delete + insert at same position) */
  replacementId?: string;
}

/**
 * Insertion point during merge
 */
interface Insertion {
  afterOffset: number;
  text: string;
  /** Shared ID for replacement operations (delete + insert at same position) */
  replacementId?: string;
  /** Position in docB where this inserted text originated (for mark lookup) */
  posB?: number;
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
  const segments = diffResult.segments;
  
  for (let segIdx = 0; segIdx < segments.length; segIdx++) {
    const segment = segments[segIdx];
    
    if (segment.type === 'equal') {
      // Mark these characters as equal
      for (let i = 0; i < segment.text.length; i++) {
        charStates[docAOffset + i] = { type: 'equal' };
      }
      docAOffset += segment.text.length;
    } else if (segment.type === 'delete') {
      // Check if next segment is an insert (replacement pattern)
      const nextSegment = segments[segIdx + 1];
      const isReplacement = nextSegment && nextSegment.type === 'insert';
      const replacementId = isReplacement ? uuidv4() : undefined;
      
      // Mark these characters as deleted
      for (let i = 0; i < segment.text.length; i++) {
        charStates[docAOffset + i] = { type: 'delete', replacementId };
      }
      docAOffset += segment.text.length;
      
      // If this is a replacement, process the insert segment now with the same ID
      if (isReplacement && nextSegment) {
        insertions.push({
          afterOffset: docAOffset,
          text: nextSegment.text,
          replacementId,
          posB: nextSegment.posB, // Capture docB position for mark lookup
        });
        segIdx++; // Skip the next segment since we processed it here
      }
    } else if (segment.type === 'insert') {
      // Standalone insert (not part of a replacement)
      insertions.push({
        afterOffset: docAOffset,
        text: segment.text,
        posB: segment.posB, // Capture docB position for mark lookup
      });
    }
  }

  // Get docB spans for mark preservation (if available)
  const spansB = diffResult.spansB || [];

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
          // Create inserted text nodes, preserving marks from docB
          const insertedNodes = createInsertedTextNodes(
            ins.text,
            ins.posB,
            spansB,
            author,
            ins.replacementId
          );
          result.push(...insertedNodes);
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
          marks.push(createTrackDeleteMark(author, charState.replacementId));
        } else if (charState.type === 'equal') {
          // Check if there's a format change at this position
          if (currentFormatChange) {
            // For format changes, use the NEW marks (after) plus trackFormat
            // Note: createTrackFormatMark already normalizes before/after marks
            const trackFormatMark = createTrackFormatMark(
              currentFormatChange.before,
              currentFormatChange.after,
              author
            );
            // Normalize the after marks to ensure valid CSS color format
            const normalizedAfterMarks = normalizeMarksForRendering(currentFormatChange.after);
            marks = [...normalizedAfterMarks, trackFormatMark];
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
          // Create inserted text nodes, preserving marks from docB
          const insertedNodes = createInsertedTextNodes(
            ins.text,
            ins.posB,
            spansB,
            author,
            ins.replacementId
          );
          result.push(...insertedNodes);
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
      // Create text nodes with preserved marks from docB
      const insertedNodes = createInsertedTextNodes(
        ins.text,
        ins.posB,
        spansB,
        author,
        ins.replacementId
      );
      
      const insertNode = {
        type: 'paragraph',
        content: [
          {
            type: 'run',
            content: insertedNodes,
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

