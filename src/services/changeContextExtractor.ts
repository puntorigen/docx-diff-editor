/**
 * Change Context Extractor
 * Extracts enriched changes with semantic context from merged document.
 * Provides surrounding text so the LLM can understand what the change is about.
 * 
 * Updated to include structural change information (tables, lists, images).
 */

import type {
  ProseMirrorJSON,
  ProseMirrorNode,
  EnrichedChange,
  ChangeLocation,
  TraversalContext,
  StructuralChangeInfo,
  StructuralChangeType,
} from '../types';

/**
 * Extended traversal context with table/list tracking
 */
interface ExtendedContext extends TraversalContext {
  tableIndex?: number;
  rowIndex?: number;
  cellIndex?: number;
  listIndex?: number;
  listItemIndex?: number;
  listDepth?: number;
}

/**
 * Main entry point - extract enriched changes from merged document
 */
export function extractEnrichedChanges(mergedJson: ProseMirrorJSON): EnrichedChange[] {
  const changes: EnrichedChange[] = [];
  const context: ExtendedContext = {
    currentSection: null,
    currentParagraphText: '',
    currentNodeType: 'unknown',
    tableIndex: 0,
    listIndex: 0,
    listDepth: 0,
  };

  traverseDocument(mergedJson, context, changes);
  return groupReplacements(changes);
}

/**
 * Extract enriched changes with structural change infos included.
 * This merges inline text changes with structural change metadata.
 */
export function extractEnrichedChangesWithStructural(
  mergedJson: ProseMirrorJSON,
  structuralInfos: StructuralChangeInfo[]
): EnrichedChange[] {
  // Get inline text changes
  const textChanges = extractEnrichedChanges(mergedJson);

  // Convert structural infos to enriched changes
  const structuralChanges: EnrichedChange[] = structuralInfos.map((info) => {
    const location = buildLocationFromStructural(info);
    
    return {
      type: info.type.includes('Insert') ? 'insertion' : 'deletion',
      text: info.preview,
      location,
      surroundingText: info.preview,
      structuralType: info.type,
      charCount: info.preview.length,
    };
  });

  // Combine and sort (structural changes typically more significant)
  return [...structuralChanges, ...textChanges];
}

/**
 * Build location from structural change info
 */
function buildLocationFromStructural(info: StructuralChangeInfo): ChangeLocation {
  const nodeType = mapNodeTypeToLocation(info.nodeType);
  
  return {
    nodeType,
    description: info.location,
    sectionTitle: undefined,
  };
}

/**
 * Map node types to ChangeLocation nodeType
 */
function mapNodeTypeToLocation(nodeType: string): ChangeLocation['nodeType'] {
  switch (nodeType) {
    case 'tableRow':
    case 'tableCell':
    case 'table':
      return 'table';
    case 'listItem':
      return 'listItem';
    case 'paragraph':
      return 'paragraph';
    case 'heading':
      return 'heading';
    case 'image':
      return 'image';
    default:
      return 'unknown';
  }
}

/**
 * Recursively walk the document tree
 */
function traverseDocument(
  node: ProseMirrorNode,
  context: ExtendedContext,
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
    context.listItemIndex = (context.listItemIndex || 0) + 1;
  } else if (node.type === 'tableCell' || node.type === 'tableHeader') {
    context.currentNodeType = 'tableCell';
    context.currentParagraphText = extractAllText(node);
    context.cellIndex = (context.cellIndex || 0) + 1;
  } else if (node.type === 'tableRow') {
    context.rowIndex = (context.rowIndex || 0) + 1;
    context.cellIndex = 0;
  } else if (node.type === 'table') {
    context.tableIndex = (context.tableIndex || 0) + 1;
    context.rowIndex = 0;
  } else if (node.type === 'bulletList' || node.type === 'orderedList') {
    context.listIndex = (context.listIndex || 0) + 1;
    context.listItemIndex = 0;
    context.listDepth = (context.listDepth || 0) + 1;
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

  // Reset depth counters when exiting lists
  if (node.type === 'bulletList' || node.type === 'orderedList') {
    context.listDepth = Math.max(0, (context.listDepth || 1) - 1);
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
  context: ExtendedContext
): EnrichedChange | null {
  const text = node.text || '';
  const location = buildLocation(context);
  const surroundingText = extractSurroundingSentence(text, context.currentParagraphText);

  // Add table/list position info if applicable
  const tablePosition = context.currentNodeType === 'tableCell' && context.rowIndex !== undefined
    ? { row: context.rowIndex, column: context.cellIndex || 0 }
    : undefined;
  
  const listPosition = context.currentNodeType === 'listItem' && context.listItemIndex !== undefined
    ? { index: context.listItemIndex, depth: context.listDepth || 0 }
    : undefined;

  if (trackMark.type === 'trackInsert') {
    return {
      type: 'insertion',
      text,
      location,
      surroundingText,
      charCount: text.length,
      tablePosition,
      listPosition,
    };
  }

  if (trackMark.type === 'trackDelete') {
    return {
      type: 'deletion',
      text,
      location,
      surroundingText,
      charCount: text.length,
      tablePosition,
      listPosition,
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
      tablePosition,
      listPosition,
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
function buildLocation(context: ExtendedContext): ChangeLocation {
  const nodeType = context.currentNodeType as ChangeLocation['nodeType'];

  let description: string;
  if (nodeType === 'heading') {
    description = context.headingLevel === 1 ? 'document title' : 'section heading';
  } else if (nodeType === 'tableCell' && context.tableIndex !== undefined) {
    const colLetter = String.fromCharCode(65 + (context.cellIndex || 0));
    description = `Table ${context.tableIndex}, Cell ${colLetter}${context.rowIndex || 1}`;
  } else if (nodeType === 'listItem' && context.listIndex !== undefined) {
    const depthStr = (context.listDepth || 0) > 1 ? ` (nested, level ${context.listDepth})` : '';
    description = `List ${context.listIndex}, Item ${context.listItemIndex || 1}${depthStr}`;
  } else if (context.currentSection) {
    description = `"${truncate(context.currentSection, 50)}" section`;
  } else {
    description = 'document body';
  }

  // Add table/list coordinates to location
  const tableCoords = context.currentNodeType === 'tableCell' && context.rowIndex !== undefined
    ? { row: context.rowIndex, column: context.cellIndex || 0 }
    : undefined;

  return {
    nodeType,
    headingLevel: context.headingLevel,
    sectionTitle: context.currentSection || undefined,
    description,
    tableCoords,
    listIndex: context.currentNodeType === 'listItem' ? context.listItemIndex : undefined,
    listDepth: context.currentNodeType === 'listItem' ? context.listDepth : undefined,
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

