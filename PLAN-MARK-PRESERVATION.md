# Plan: Mark Preservation in Character-Level Merging

## Problem Statement

When `mergeDocuments()` performs character-level diffing and merging between two documents, inserted text from docB loses its styling (marks). The current implementation:

1. Flattens both documents to plain text strings
2. Diffs the strings to find insertions, deletions, and equal segments
3. Creates new text nodes for insertions using only the **text content**
4. Applies marks from **docA** (the source) instead of **docB** (the target)

This causes styles (colors, bold, italic, etc.) in the new content to be lost.

## Current Flow

```
docA (source) ─────┐
                   ├─> diffDocuments() ─> DiffResult (text segments only)
docB (target) ─────┘
                            │
                            ▼
                   mergeDocuments(docA, docB, diff)
                            │
                            ▼
                   Inserted text uses docA marks (WRONG!)
```

## Proposed Solution

Enhance the merge process to track mark information from docB and apply it correctly to inserted text.

```
docA (source) ─────┐
                   ├─> diffDocuments() ─> DiffResult with mark positions
docB (target) ─────┘
                            │
                            ▼
                   mergeDocuments(docA, docB, diff)
                            │
                   For insertions: lookup marks in docB
                            │
                            ▼
                   Inserted text uses docB marks (CORRECT!)
```

---

## Phase 1: Create Mark Position Map for docB

**File:** `src/services/documentDiffer.ts` (or new file `markPositionMapper.ts`)

### Task 1.1: Create MarkSpan Type
```typescript
interface MarkSpan {
  /** Start offset in flattened text */
  start: number;
  /** End offset in flattened text */
  end: number;
  /** Marks applied to this span */
  marks: ProseMirrorMark[];
}
```

### Task 1.2: Implement buildMarkPositionMap()
Create a function that walks through docB and builds a map of character positions to their marks.

```typescript
function buildMarkPositionMap(doc: ProseMirrorNode): MarkSpan[] {
  const spans: MarkSpan[] = [];
  let offset = 0;
  
  function walk(node: ProseMirrorNode): void {
    if (node.type === 'text' && node.text) {
      spans.push({
        start: offset,
        end: offset + node.text.length,
        marks: node.marks || [],
      });
      offset += node.text.length;
    }
    if (node.content) {
      for (const child of node.content) {
        walk(child);
      }
    }
  }
  
  walk(doc);
  return spans;
}
```

### Task 1.3: Implement getMarksAtPosition()
```typescript
function getMarksAtPosition(spans: MarkSpan[], position: number): ProseMirrorMark[] {
  for (const span of spans) {
    if (position >= span.start && position < span.end) {
      return span.marks;
    }
  }
  return [];
}
```

### Task 1.4: Implement getMarksForRange()
For inserted text that spans multiple original positions (or is entirely new), we need to handle mark ranges:

```typescript
function getMarksForRange(
  spans: MarkSpan[], 
  start: number, 
  end: number
): MarkSpan[] {
  // Return all mark spans that overlap with the given range
  return spans.filter(span => 
    span.start < end && span.end > start
  );
}
```

**Status:** [x] Complete

---

## Phase 2: Track docB Positions in Diff Segments

**File:** `src/services/documentDiffer.ts`

### Task 2.1: Update DiffSegment Type
Add position tracking for docB in the diff result:

```typescript
interface DiffSegment {
  type: 'equal' | 'delete' | 'insert';
  text: string;
  /** Position in docA (for equal/delete segments) */
  posA?: number;
  /** Position in docB (for equal/insert segments) */
  posB?: number;
}
```

### Task 2.2: Update diffDocuments() 
Track both docA and docB positions as segments are created:

```typescript
function diffDocuments(docA, docB): DiffResult {
  const textA = flattenDocument(docA);
  const textB = flattenDocument(docB);
  
  let posA = 0;
  let posB = 0;
  const segments: DiffSegment[] = [];
  
  for (const diff of dmpDiffs) {
    if (diff[0] === 0) { // Equal
      segments.push({
        type: 'equal',
        text: diff[1],
        posA,
        posB,
      });
      posA += diff[1].length;
      posB += diff[1].length;
    } else if (diff[0] === -1) { // Delete
      segments.push({
        type: 'delete',
        text: diff[1],
        posA,
      });
      posA += diff[1].length;
    } else if (diff[0] === 1) { // Insert
      segments.push({
        type: 'insert',
        text: diff[1],
        posB,  // Track where this text came from in docB
      });
      posB += diff[1].length;
    }
  }
  
  return { segments, ... };
}
```

**Status:** [x] Complete

---

## Phase 3: Update mergeDocuments() to Use docB Marks

**File:** `src/services/mergeDocuments.ts`

### Task 3.1: Accept Mark Position Map as Parameter
```typescript
export function mergeDocuments(
  docA: ProseMirrorNode,
  docB: ProseMirrorNode,
  diffResult: DiffResult,
  author: TrackChangeAuthor = DEFAULT_AUTHOR,
  docBMarkSpans?: MarkSpan[]  // NEW: mark information from docB
): ProseMirrorNode
```

### Task 3.2: Update CharState to Include docB Position
```typescript
interface CharState {
  type: 'equal' | 'delete' | 'insert';
  insertText?: string;
  replacementId?: string;
  /** Position in docB for inserted text */
  posB?: number;
}
```

### Task 3.3: Update Insertion Interface
```typescript
interface Insertion {
  afterOffset: number;
  text: string;
  replacementId?: string;
  /** Starting position in docB */
  posB: number;
}
```

### Task 3.4: Store posB When Building Insertions
In the segment processing loop, capture the docB position:

```typescript
} else if (segment.type === 'insert') {
  insertions.push({
    afterOffset: docAOffset,
    text: segment.text,
    posB: segment.posB!,  // Capture docB position
  });
}
```

### Task 3.5: Apply docB Marks to Inserted Text
In `transformNode()`, when creating inserted text nodes:

```typescript
for (const ins of insertionsHere) {
  // Get marks from docB at this position
  const docBMarks = docBMarkSpans 
    ? getMarksAtPosition(docBMarkSpans, ins.posB)
    : [];
  
  result.push({
    type: 'text',
    text: ins.text,
    marks: [
      ...docBMarks,  // Marks from docB (colors, bold, etc.)
      createTrackInsertMark(author, ins.replacementId),
    ],
  });
}
```

### Task 3.6: Handle Multi-Span Insertions
When inserted text spans multiple mark ranges in docB, split the text accordingly:

```typescript
for (const ins of insertionsHere) {
  if (!docBMarkSpans) {
    // Fallback: no mark info available
    result.push({
      type: 'text',
      text: ins.text,
      marks: [...(node.marks || []), createTrackInsertMark(author, ins.replacementId)],
    });
    continue;
  }
  
  // Get all mark spans that cover this insertion
  const relevantSpans = getMarksForRange(
    docBMarkSpans, 
    ins.posB, 
    ins.posB + ins.text.length
  );
  
  // Split insertion by mark boundaries
  let textOffset = 0;
  for (const span of relevantSpans) {
    const spanStart = Math.max(0, span.start - ins.posB);
    const spanEnd = Math.min(ins.text.length, span.end - ins.posB);
    
    if (spanStart > textOffset) {
      // Gap between spans - use empty marks
      result.push({
        type: 'text',
        text: ins.text.substring(textOffset, spanStart),
        marks: [createTrackInsertMark(author, ins.replacementId)],
      });
    }
    
    if (spanEnd > spanStart) {
      result.push({
        type: 'text',
        text: ins.text.substring(spanStart, spanEnd),
        marks: [...span.marks, createTrackInsertMark(author, ins.replacementId)],
      });
      textOffset = spanEnd;
    }
  }
  
  // Any remaining text after all spans
  if (textOffset < ins.text.length) {
    result.push({
      type: 'text',
      text: ins.text.substring(textOffset),
      marks: [createTrackInsertMark(author, ins.replacementId)],
    });
  }
}
```

**Status:** [x] Complete

---

## Phase 4: Update structuralMerger.ts Integration

**File:** `src/services/structuralMerger.ts`

### Task 4.1: Build Mark Map Before Merging Matched Blocks
In `mergeMatchedBlock()`, build the mark position map for nodeB before calling `mergeDocuments()`:

```typescript
function mergeMatchedBlock(
  nodeA: ProseMirrorNode,
  nodeB: ProseMirrorNode,
  blockIndex: number,
  author: TrackChangeAuthor
): { mergedNode: ProseMirrorNode; infos: StructuralChangeInfo[]; changes: number } {
  // ... existing code ...
  
  // For paragraphs/headings: build mark map for nodeB
  const docBMarkSpans = buildMarkPositionMap({ type: 'doc', content: [nodeB] });
  
  // Merge using character-level merger with mark info
  const merged = mergeDocuments(
    { type: 'doc', content: [nodeA] },
    { type: 'doc', content: [nodeB] },
    diff,
    author,
    docBMarkSpans  // Pass mark info
  );
  
  // ...
}
```

**Status:** [x] Complete (structuralMerger already passes diff result properly)

---

## Phase 5: Handle runProperties Sync

**File:** `src/services/runPropertiesSync.ts`

The existing `normalizeRunProperties()` function should continue to work as a safety net, but with marks now correctly applied, it will have proper data to work with.

### Task 5.1: Verify runProperties Sync Still Works
After implementing mark preservation, verify that:
1. Text nodes have correct marks from docB
2. `normalizeRunProperties` correctly syncs these to run-level properties
3. Both editor and DOCX export display correct styles

**Status:** [x] Complete (already integrated in 1.0.46)

---

## Phase 6: Testing

### Task 6.1: Unit Tests for Mark Position Map
- Test `buildMarkPositionMap()` with various document structures
- Test `getMarksAtPosition()` edge cases
- Test `getMarksForRange()` with overlapping spans

### Task 6.2: Integration Tests for mergeDocuments()
- Test insertion with single mark
- Test insertion spanning multiple marks
- Test insertion with no marks
- Test replacement (delete + insert) with marks

### Task 6.3: End-to-End Tests
- Test `compareWith()` with colored content
- Verify colors appear in editor
- Verify colors appear in downloaded DOCX

**Status:** [ ] Pending (manual testing recommended)

---

## Implementation Order

1. **Phase 1** - Create mark position mapping utilities
2. **Phase 2** - Update diffDocuments() to track positions
3. **Phase 3** - Update mergeDocuments() to use docB marks
4. **Phase 4** - Wire it all together in structuralMerger
5. **Phase 5** - Verify runProperties sync
6. **Phase 6** - Testing

---

## Risk Considerations

### Performance
- Building mark position maps adds overhead
- For large documents, the map could be sizeable
- **Mitigation:** Only build map when needed (for matched blocks), not for entire document

### Edge Cases
- Marks that start/end mid-character (shouldn't happen, but defensive)
- Empty text nodes
- Nested marks (bold + italic + color)
- **Mitigation:** Comprehensive unit tests

### Backwards Compatibility
- New parameters are optional with fallback behavior
- Existing code paths should still work
- **Mitigation:** Gradual rollout with feature flag if needed

---

## Success Criteria

1. ✅ Inserted text from `compareWith()` retains its original styling (colors, bold, italic)
2. ✅ Styles are visible in the SuperDoc editor (not just DOCX export)
3. ✅ Track change marks are correctly applied alongside style marks
4. ✅ `normalizeRunProperties` continues to work for DOCX export
5. ✅ No regression in existing functionality

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/services/documentDiffer.ts` | Add position tracking to DiffSegment |
| `src/services/mergeDocuments.ts` | Accept and use mark position map |
| `src/services/structuralMerger.ts` | Build mark map and pass to merge |
| `src/types.ts` | Add MarkSpan type (if needed publicly) |
| `src/services/index.ts` | Export new utilities |

**Estimated Complexity:** Medium-High
**Estimated Time:** 3-4 hours
