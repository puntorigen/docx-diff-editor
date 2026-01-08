/**
 * Change Context Extractor
 * Extracts enriched changes with semantic context from merged document.
 * Provides surrounding text so the LLM can understand what the change is about.
 */

import type {
  ProseMirrorJSON,
  ProseMirrorNode,
  EnrichedChange,
  ChangeLocation,
  TraversalContext,
} from '../types';

/**
 * Main entry point - extract enriched changes from merged document
 */
export function extractEnrichedChanges(mergedJson: ProseMirrorJSON): EnrichedChange[] {
  const changes: EnrichedChange[] = [];
  const context: TraversalContext = {
    currentSection: null,
    currentParagraphText: '',
    currentNodeType: 'unknown',
  };

  traverseDocument(mergedJson, context, changes);
  return groupReplacements(changes);
}

/**
 * Recursively walk the document tree
 */
function traverseDocument(
  node: ProseMirrorNode,
  context: TraversalContext,
  changes: EnrichedChange[]
): void {
  if (!node) return;

  // Update context based on node type
  if (node.type === 'heading') {
    context.currentSection = extractAllText(node);
    context.headingLevel = node.attrs?.level || 1;
    context.currentNodeType = 'heading';
    context.currentParagraphText = context.currentSection;
  } else if (node.type === 'paragraph') {
    context.currentNodeType = 'paragraph';
    context.currentParagraphText = extractAllText(node);
  } else if (node.type === 'listItem') {
    context.currentNodeType = 'listItem';
    context.currentParagraphText = extractAllText(node);
  } else if (node.type === 'tableCell') {
    context.currentNodeType = 'tableCell';
    context.currentParagraphText = extractAllText(node);
  }

  // Check for track change marks on text nodes
  if (node.type === 'text' && node.marks) {
    const trackMark = findTrackChangeMark(node.marks);
    if (trackMark) {
      const change = createEnrichedChange(node, trackMark, context);
      if (change) changes.push(change);
    }
  }

  // Recurse into children
  if (node.content && Array.isArray(node.content)) {
    for (const child of node.content) {
      traverseDocument(child, context, changes);
    }
  }
}

/**
 * Extract ALL text from a node (including deleted text, for context)
 */
function extractAllText(node: ProseMirrorNode): string {
  if (!node) return '';
  if (node.type === 'text') {
    return node.text || '';
  }
  if (node.content && Array.isArray(node.content)) {
    return node.content.map(extractAllText).join('');
  }
  return '';
}

/**
 * Find trackInsert, trackDelete, or trackFormat mark
 */
function findTrackChangeMark(marks: ProseMirrorNode[]): ProseMirrorNode | null {
  return (
    marks.find(
      (m) =>
        m.type === 'trackInsert' || m.type === 'trackDelete' || m.type === 'trackFormat'
    ) || null
  );
}

/**
 * Create enriched change from node and track mark
 */
function createEnrichedChange(
  node: ProseMirrorNode,
  trackMark: ProseMirrorNode,
  context: TraversalContext
): EnrichedChange | null {
  const text = node.text || '';
  const location = buildLocation(context);
  const surroundingText = extractSurroundingSentence(text, context.currentParagraphText);

  if (trackMark.type === 'trackInsert') {
    return {
      type: 'insertion',
      text,
      location,
      surroundingText,
      charCount: text.length,
    };
  }

  if (trackMark.type === 'trackDelete') {
    return {
      type: 'deletion',
      text,
      location,
      surroundingText,
      charCount: text.length,
    };
  }

  if (trackMark.type === 'trackFormat') {
    const before = trackMark.attrs?.before || [];
    const after = trackMark.attrs?.after || [];
    return {
      type: 'format',
      text,
      location,
      surroundingText,
      formatDetails: {
        added: after
          .map((m: ProseMirrorNode) => m.type)
          .filter((t: string) => !before.some((b: ProseMirrorNode) => b.type === t)),
        removed: before
          .map((m: ProseMirrorNode) => m.type)
          .filter((t: string) => !after.some((a: ProseMirrorNode) => a.type === t)),
      },
      charCount: text.length,
    };
  }

  return null;
}

/**
 * Extract the sentence or clause containing the changed text
 */
function extractSurroundingSentence(changedText: string, paragraphText: string): string {
  if (!paragraphText || !changedText) return '';

  // Find where the change is in the paragraph
  const changeIndex = paragraphText.indexOf(changedText);
  if (changeIndex === -1) {
    // If exact match not found, return truncated paragraph
    return truncate(paragraphText, 150);
  }

  // Split into sentences (by period, semicolon, or significant punctuation)
  // But keep the delimiters for context
  const sentenceBreaks = /([.;!?]\s+)/g;
  const sentences: { text: string; start: number; end: number }[] = [];

  let lastEnd = 0;
  let match;

  while ((match = sentenceBreaks.exec(paragraphText)) !== null) {
    sentences.push({
      text: paragraphText.slice(lastEnd, match.index + match[0].length).trim(),
      start: lastEnd,
      end: match.index + match[0].length,
    });
    lastEnd = match.index + match[0].length;
  }

  // Add remaining text as final sentence
  if (lastEnd < paragraphText.length) {
    sentences.push({
      text: paragraphText.slice(lastEnd).trim(),
      start: lastEnd,
      end: paragraphText.length,
    });
  }

  // Find which sentence contains the change
  const changeEnd = changeIndex + changedText.length;
  for (const sentence of sentences) {
    if (changeIndex >= sentence.start && changeIndex < sentence.end) {
      // Found it - return this sentence (truncated if too long)
      return truncate(sentence.text, 200);
    }
  }

  // Fallback: return a window around the change
  const windowSize = 100;
  const start = Math.max(0, changeIndex - windowSize);
  const end = Math.min(paragraphText.length, changeEnd + windowSize);

  let result = paragraphText.slice(start, end);
  if (start > 0) result = '...' + result;
  if (end < paragraphText.length) result = result + '...';

  return result;
}

/**
 * Truncate text with ellipsis
 */
function truncate(text: string, maxLen: number): string {
  if (!text) return '';
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (cleaned.length <= maxLen) return cleaned;
  return cleaned.slice(0, maxLen - 3).trim() + '...';
}

/**
 * Build location info
 */
function buildLocation(context: TraversalContext): ChangeLocation {
  const nodeType = context.currentNodeType as ChangeLocation['nodeType'];

  let description: string;
  if (nodeType === 'heading') {
    description = context.headingLevel === 1 ? 'document title' : 'section heading';
  } else if (context.currentSection) {
    description = `"${truncate(context.currentSection, 50)}" section`;
  } else {
    description = 'document body';
  }

  return {
    nodeType,
    headingLevel: context.headingLevel,
    sectionTitle: context.currentSection || undefined,
    description,
  };
}

/**
 * Combine adjacent delete+insert into replacements
 */
function groupReplacements(changes: EnrichedChange[]): EnrichedChange[] {
  const result: EnrichedChange[] = [];
  let i = 0;

  while (i < changes.length) {
    const current = changes[i];
    const next = changes[i + 1];

    // Check if delete followed by insert (same section = likely replacement)
    if (
      current.type === 'deletion' &&
      next?.type === 'insertion' &&
      current.location.sectionTitle === next.location.sectionTitle
    ) {
      result.push({
        type: 'replacement',
        oldText: current.text,
        newText: next.text,
        location: current.location,
        surroundingText: current.surroundingText || next.surroundingText,
        charCount: (current.charCount || 0) + (next.charCount || 0),
      });
      i += 2;
    } else {
      result.push(current);
      i++;
    }
  }

  return result;
}

