/**
 * Document Differ Service
 * Diffs two ProseMirror JSON documents at the character level,
 * including text changes and formatting changes.
 */

import DiffMatchPatch from 'diff-match-patch';
import type {
  ProseMirrorJSON,
  ProseMirrorMark,
  DiffSegment,
  DiffResult,
  FormatChange,
  TextSpan,
} from '../types';

const dmp = new DiffMatchPatch();

// Diff operation types
const DIFF_DELETE = -1;
const DIFF_INSERT = 1;
const DIFF_EQUAL = 0;

/**
 * Extract text spans with their marks from a ProseMirror node.
 */
function extractTextSpans(node: ProseMirrorJSON, offset: number = 0): TextSpan[] {
  const spans: TextSpan[] = [];

  if (!node) return spans;

  if (node.type === 'text' && node.text) {
    spans.push({
      text: node.text,
      from: offset,
      to: offset + node.text.length,
      marks: node.marks || [],
    });
    return spans;
  }

  if (node.content && Array.isArray(node.content)) {
    let currentOffset = offset;
    for (const child of node.content) {
      const childSpans = extractTextSpans(child, currentOffset);
      spans.push(...childSpans);
      // Calculate consumed length
      for (const span of childSpans) {
        currentOffset = Math.max(currentOffset, span.to);
      }
      // If no spans, check if it's a text node for offset
      if (childSpans.length === 0 && child.type === 'text' && child.text) {
        currentOffset += child.text.length;
      }
    }
  }

  return spans;
}

/**
 * Extract text content from a ProseMirror node recursively.
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
 * Deep compare two values.
 */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (typeof a !== 'object' || a === null || b === null) return false;

  const objA = a as Record<string, unknown>;
  const objB = b as Record<string, unknown>;
  const keysA = Object.keys(objA);
  const keysB = Object.keys(objB);

  if (keysA.length !== keysB.length) return false;

  for (const key of keysA) {
    if (!keysB.includes(key)) return false;
    if (!deepEqual(objA[key], objB[key])) return false;
  }

  return true;
}

/**
 * Compare marks arrays to check if they're equivalent.
 */
function marksEqual(marksA: ProseMirrorMark[], marksB: ProseMirrorMark[]): boolean {
  if (marksA.length !== marksB.length) return false;

  // Sort by type for consistent comparison
  const sortedA = [...marksA].sort((a, b) => (a.type || '').localeCompare(b.type || ''));
  const sortedB = [...marksB].sort((a, b) => (a.type || '').localeCompare(b.type || ''));

  return deepEqual(sortedA, sortedB);
}

/**
 * Get marks at a specific character position from spans.
 */
function getMarksAtPosition(spans: TextSpan[], pos: number): ProseMirrorMark[] {
  for (const span of spans) {
    if (pos >= span.from && pos < span.to) {
      return span.marks;
    }
  }
  return [];
}

/**
 * Check if marks have any defined (non-undefined/null) attribute values.
 * Returns false if marks array is empty or all marks have only undefined attrs.
 */
function hasDefinedAttributes(marks: ProseMirrorMark[]): boolean {
  if (!marks || marks.length === 0) return false;

  for (const mark of marks) {
    // Marks without attrs (like simple bold/italic) are considered defined
    if (!mark.attrs) continue;

    for (const value of Object.values(mark.attrs)) {
      if (value !== undefined && value !== null) {
        return true;
      }
    }
  }

  // If we only have marks without attrs, they count as defined
  return marks.some((m) => !m.attrs);
}

/**
 * Detect format changes on equal text segments.
 */
function detectFormatChanges(
  spansA: TextSpan[],
  spansB: TextSpan[],
  segments: DiffSegment[]
): FormatChange[] {
  const formatChanges: FormatChange[] = [];

  let posA = 0;
  let posB = 0;

  for (const segment of segments) {
    if (segment.type === 'equal') {
      // For equal text, compare marks character by character
      // Group consecutive chars with same mark difference
      let i = 0;
      while (i < segment.text.length) {
        const marksA = getMarksAtPosition(spansA, posA + i);
        const marksB = getMarksAtPosition(spansB, posB + i);

        if (!marksEqual(marksA, marksB)) {
          // Found a format difference - find the extent
          const startI = i;
          const startMarksA = marksA;
          const startMarksB = marksB;

          // Extend while marks remain the same different pattern
          while (i < segment.text.length) {
            const currentMarksA = getMarksAtPosition(spansA, posA + i);
            const currentMarksB = getMarksAtPosition(spansB, posB + i);

            if (marksEqual(currentMarksA, startMarksA) && marksEqual(currentMarksB, startMarksB)) {
              i++;
            } else {
              break;
            }
          }

          // Skip format changes where "after" marks have no defined values
          // This avoids showing "changed to undefined" for missing styles
          if (hasDefinedAttributes(startMarksB) || hasDefinedAttributes(startMarksA)) {
            // Only record if at least one side has meaningful values
            // and the "after" side isn't just undefined values
            if (hasDefinedAttributes(startMarksB)) {
              formatChanges.push({
                from: posA + startI,
                to: posA + i,
                text: segment.text.substring(startI, i),
                before: startMarksA,
                after: startMarksB,
              });
            }
          }
        } else {
          i++;
        }
      }

      posA += segment.text.length;
      posB += segment.text.length;
    } else if (segment.type === 'delete') {
      // Deleted text exists only in docA, so only advance posA
      posA += segment.text.length;
    } else if (segment.type === 'insert') {
      // Inserted text exists only in docB, so only advance posB
      posB += segment.text.length;
    }
  }

  return formatChanges;
}

/**
 * Diff two ProseMirror JSON documents at the character level.
 * Detects both text changes and formatting changes.
 * 
 * Now also tracks positions in both documents for mark preservation:
 * - posA: position in docA (for equal/delete segments)
 * - posB: position in docB (for equal/insert segments)
 */
export function diffDocuments(
  docA: ProseMirrorJSON,
  docB: ProseMirrorJSON
): DiffResult {
  // Extract full text from both documents
  const textA = extractTextContent(docA);
  const textB = extractTextContent(docB);

  // Perform character-level diff on the entire document
  const diffs = dmp.diff_main(textA, textB);
  dmp.diff_cleanupSemantic(diffs);

  // Convert to our DiffSegment format with position tracking
  const segments: DiffSegment[] = [];
  let insertCount = 0;
  let deleteCount = 0;
  
  // Track positions in both documents
  let posA = 0;
  let posB = 0;

  for (const [op, text] of diffs) {
    if (op === DIFF_EQUAL) {
      // Equal segments exist in both documents
      segments.push({ type: 'equal', text, posA, posB });
      posA += text.length;
      posB += text.length;
    } else if (op === DIFF_INSERT) {
      // Inserted text exists only in docB
      segments.push({ type: 'insert', text, posB });
      posB += text.length;
      insertCount++;
    } else if (op === DIFF_DELETE) {
      // Deleted text exists only in docA
      segments.push({ type: 'delete', text, posA });
      posA += text.length;
      deleteCount++;
    }
  }

  // Extract text spans with marks for format comparison
  const spansA = extractTextSpans(docA);
  const spansB = extractTextSpans(docB);

  // Detect format changes on equal segments
  const formatChanges = detectFormatChanges(spansA, spansB, segments);

  // Build summary
  const summary: string[] = [];
  if (insertCount > 0) {
    summary.push(`${insertCount} insertion(s)`);
  }
  if (deleteCount > 0) {
    summary.push(`${deleteCount} deletion(s)`);
  }
  if (formatChanges.length > 0) {
    summary.push(`${formatChanges.length} format change(s)`);
  }
  if (insertCount === 0 && deleteCount === 0 && formatChanges.length === 0) {
    summary.push('No changes detected');
  }

  return {
    segments,
    formatChanges,
    textA,
    textB,
    summary,
    spansB, // Include docB spans for mark preservation during merge
  };
}

