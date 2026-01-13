# Block-Level Diffing Enhancement Plan

> **Goal**: Extend `compareWith()` to support comparing changes within tables, lists, images, and other non-paragraph nodes.

---

## Table of Contents

1. [Problem Statement](#problem-statement)
2. [Current Limitations](#current-limitations)
3. [Proposed Solution: Hybrid Approach](#proposed-solution-hybrid-approach)
4. [Implementation Phases](#implementation-phases)
5. [Technical Design](#technical-design)
6. [File Changes](#file-changes)
7. [New Types](#new-types)
8. [UI Representation](#ui-representation)
9. [Testing Plan](#testing-plan)
10. [Timeline Estimate](#timeline-estimate)

---

## Problem Statement

The current `compareWith()` implementation flattens entire documents into plain text strings before diffing. This approach:

- Loses structural boundaries (table cells, list items, etc.)
- Cannot detect structural changes (row/column added or removed)
- Misses block-level attribute changes (table borders, paragraph alignment)
- Cannot properly handle non-text nodes (images, embeds)

**Example**: A table with cells `[A, B, C]` becomes `"ABC"`. If a new cell is inserted making it `[A, X, B, C]` → `"AXBC"`, the diff sees "insert X" but doesn't know it's a new cell.

---

## Current Limitations

### What Works Today ✅

| Feature | Status |
|---------|--------|
| Text insertions within paragraphs | ✅ Works |
| Text deletions within paragraphs | ✅ Works |
| Text replacements | ✅ Works |
| Inline format changes (bold, italic) | ✅ Works |
| Character-level precision | ✅ Works |

### What Doesn't Work Today ❌

| Feature | Current Behavior |
|---------|------------------|
| Table row added/removed | Appears as scattered text changes |
| Table column added/removed | Appears as scattered text changes |
| Table cell boundary awareness | Lost in flattening |
| Table/cell style changes | Completely invisible |
| List item reordering | Appears as delete + insert |
| Image added/removed | Not detected (no text) |
| Paragraph alignment changes | Invisible (attribute, not mark) |
| Block-level formatting | Invisible (not inline marks) |

### Root Cause

In `documentDiffer.ts`:

```typescript
function extractTextContent(node: ProseMirrorJSON): string {
  // Recursively joins ALL text, losing structure
  if (node.content) {
    return node.content.map(extractTextContent).join('');
  }
}
```

The entire document becomes one string, losing all structural information.

---

## Proposed Solution: Hybrid Approach

Combine **fingerprinting** (for node matching) with **block-level alignment** (for structural diffing):

```
┌─────────────────────────────────────────────────────────────────┐
│  1. FINGERPRINT: Generate content signatures for all blocks    │
│     (ignoring attributes, for matching purposes)               │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  2. ALIGN: Match nodes between documents using fingerprints    │
│     Result: matched pairs + unmatched (inserted/deleted)       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  3. COMPARE MATCHED NODES:                                     │
│     a) Compare attrs → attribute changes                       │
│     b) Compare content → text/inline changes (existing logic)  │
│     c) Recurse into children                                   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  4. MERGE: Build result document with all change annotations   │
└─────────────────────────────────────────────────────────────────┘
```

### Why This Approach?

| Requirement | Solution Component |
|-------------|-------------------|
| Match nodes even if reordered | Fingerprinting |
| Detect structural changes | Block-level alignment |
| Handle partial text changes | Existing text diffing |
| Detect style/attr changes | Attribute comparison |
| Handle images/embeds | Fingerprint by content hash |

---

## Implementation Phases

### Phase 1: Foundation (Core Infrastructure)

**Goal**: Establish fingerprinting and basic node alignment

- [x] Create `nodeFingerprint.ts` service
- [x] Implement fingerprint generation for all node types
- [x] Implement basic LCS-based node alignment
- [x] Add new types (`StructuralChange`, `AttributeChange`, etc.)
- [ ] Unit tests for fingerprinting and alignment

**Deliverable**: Can match nodes between documents

### Phase 2: Attribute Comparison

**Goal**: Detect block-level attribute/style changes

- [x] Implement deep attribute comparison
- [x] Handle default value normalization
- [x] Create `AttributeChange` detection for matched nodes
- [x] Extend `DiffResult` with attribute changes
- [ ] Unit tests for attribute comparison

**Deliverable**: Detects "table border changed", "paragraph alignment changed"

### Phase 3: Table Support

**Goal**: Full table diffing support

- [x] Implement table-specific alignment (rows, columns)
- [x] Detect row insertions/deletions
- [x] Detect column insertions/deletions
- [x] Cell-level content diffing within matched cells
- [x] Cell-level attribute diffing (background, borders)
- [ ] Integration tests with real DOCX tables

**Deliverable**: Tables diff correctly with structural awareness

### Phase 4: List Support

**Goal**: Full list diffing support

- [x] Implement list item alignment by fingerprint
- [x] Detect list item insertions/deletions
- [x] Detect list item reordering (moved, not delete+insert)
- [x] Handle nested lists recursively
- [ ] Integration tests with ordered/unordered lists

**Deliverable**: Lists diff correctly, reordering detected as moves

### Phase 5: Non-Text Nodes (Images, Embeds)

**Goal**: Handle atomic non-text nodes

- [x] Fingerprint images by src URL or data hash
- [x] Detect image added/removed/replaced
- [x] Handle other atomic nodes (horizontal rule, page break)
- [x] Handle embedded objects (equations, etc.)
- [ ] Integration tests

**Deliverable**: Images and embeds tracked as changes

### Phase 6: Merge & Output

**Goal**: Generate merged document with all change types, using shared IDs for structural changes

#### Phase 6a: Detection & Metadata (✅ Complete)

- [x] Generate shared IDs for structural changes
- [x] Build `StructuralChangeInfo[]` metadata for the pane
- [x] Return extended result with structural change metadata
- [x] Create marking functions (`markAllTextAsInserted`, `markAllTextAsDeleted`)

#### Phase 6b: Structural Merge Integration (❌ CRITICAL - Not Implemented)

> **BLOCKER**: The current implementation DETECTS structural changes but does NOT APPLY them to the merged document. The character-level merge (`mergeDocuments`) doesn't know about structural changes, and `processStructuralChanges` creates metadata but never modifies the document.

- [ ] Create `structuralMerger.ts` - Structure-aware merge service
- [ ] Implement structure-first merge flow (align → merge per block)
- [ ] For matched blocks: apply character-level diff internally
- [ ] For inserted blocks: insert entire node structure with `trackInsert` marks
- [ ] For deleted blocks: keep node with all text marked `trackDelete`
- [ ] Handle nested structures (table → rows → cells)
- [ ] Ensure marks use the same IDs as `StructuralChangeInfo`
- [ ] Update `compareWith()` to use new merge flow
- [ ] Preserve document structure integrity
- [ ] Integration tests for full round-trip

**Current State**: 
- `processStructuralChanges()` creates `StructuralChange[]` with marked nodes
- But those marked nodes are NEVER inserted into the actual merged document
- Result: Pane shows changes, but document doesn't reflect them

**Deliverable**: Merged document with structural changes ACTUALLY APPLIED (not just detected)

### Phase 7: Context Extraction

**Goal**: Update LLM context extraction for new change types

- [x] Extend `changeContextExtractor.ts` for structural changes
- [x] Include attribute changes in enriched output
- [x] Provide table/list coordinates in location info
- [x] Update `EnrichedChange` type
- [ ] Integration tests

**Deliverable**: `getEnrichedChangesContext()` returns all change types

### Phase 8: Structural Changes Pane

**Goal**: Build the floating reviewing pane for structural changes

- [x] Create `StructuralChangesPane` component
- [x] Implement floating, positioned container (bottom-right default)
- [x] Implement collapsible behavior (minimize to header)
- [x] Implement dismissible behavior (close button)
- [x] Add slide in/out animation for show/hide
- [x] Style to match SuperDoc bubble appearance
- [x] Render list of structural changes with icons, location, preview
- [x] Implement Accept button → `editor.commands.acceptTrackedChangeById(id)`
- [x] Implement Reject button → `editor.commands.rejectTrackedChangeById(id)`
- [x] Implement Accept All / Reject All bulk actions
- [x] Implement navigation (click to scroll to change in document)
- [x] Add counter badge showing remaining changes
- [x] Auto-hide when no structural changes remain
- [x] Sync state when user accepts/rejects via SuperDoc bubbles
- [x] Add optional props: `structuralPanePosition`, `structuralPaneCollapsed`, `hideStructuralPane`
- [ ] Unit tests for pane component
- [ ] Integration tests for accept/reject flow

**Deliverable**: Fully functional Structural Changes Pane integrated into DocxDiffEditor

---

## Technical Design

### Fingerprinting Strategy

#### What Goes Into a Fingerprint

| Include | Exclude |
|---------|---------|
| Node type (`table`, `paragraph`) | Node attributes (styles) |
| Text content (normalized) | Mark attributes (color values) |
| Child structure (count, types) | Position in document |
| Mark types (bold presence) | IDs, timestamps |

#### Fingerprint Format by Node Type

```
paragraph    → "p:{hash(text content)}"
heading      → "h{level}:{hash(text content)}"
table        → "table:{rowCount}:{hash(row fingerprints)}"
tableRow     → "tr:{hash(cell fingerprints)}"
tableCell    → "tc:{hash(content fingerprint)}"
listItem     → "li:{hash(content fingerprint)}"
image        → "img:{hash(src or data)}"
hardBreak    → "br"
horizontalRule → "hr"
```

#### Similarity Matching

For fuzzy matching (handling minor text edits):

```typescript
interface MatchResult {
  nodeA: ProseMirrorNode;
  nodeB: ProseMirrorNode;
  similarity: number;  // 0.0 - 1.0
}

const MATCH_THRESHOLD = 0.7;  // 70% similarity = match
```

Use Levenshtein distance or similar on content for similarity scoring.

### Node Alignment Algorithm

Use **Longest Common Subsequence (LCS)** on fingerprint arrays:

```
Doc A nodes: [P1, P2, T1, P3]     (paragraphs + table)
Fingerprints: [fp1, fp2, fpT, fp3]

Doc B nodes: [P1, P4, T1, P2, P3]
Fingerprints: [fp1, fp4, fpT, fp2, fp3]

LCS alignment:
  P1 ↔ P1 (matched)
  -- ↔ P4 (inserted)
  T1 ↔ T1 (matched)
  P2 ↔ P2 (matched, different position = moved)
  P3 ↔ P3 (matched)
```

### Attribute Comparison

After nodes are matched, compare their `attrs`:

```typescript
function compareAttrs(
  attrsA: Record<string, unknown>,
  attrsB: Record<string, unknown>,
  schema?: NodeSchema  // For default value normalization
): AttrDiff[] {
  // 1. Normalize both against schema defaults
  // 2. Deep compare all keys
  // 3. Return list of differences
}
```

#### Handling Nested Attributes

```json
{
  "attrs": {
    "borders": {
      "top": { "width": 1, "color": "black" },
      "bottom": { "width": 2, "color": "blue" }
    }
  }
}
```

Produce path-based diffs:
- `borders.bottom.width: 1 → 2`
- `borders.bottom.color: black → blue`

### Table-Specific Logic

#### Row Alignment

```
Table A rows: [R1, R2, R3]
Table B rows: [R1, R4, R2, R3]

Alignment by row fingerprints:
  R1 ↔ R1 (matched)
  -- ↔ R4 (inserted row)
  R2 ↔ R2 (matched)
  R3 ↔ R3 (matched)
```

#### Column Detection

Columns are implicit in DOCX/ProseMirror (cells per row). Detect by:

1. Compare cell count per matched row
2. If all matched rows have same cell delta → column change
3. Else → mixed cell changes

```
Row 1: [A, B, C] → [A, X, B, C]  (+1 cell at position 1)
Row 2: [D, E, F] → [D, Y, E, F]  (+1 cell at position 1)
→ Column inserted at position 1
```

### Merge Strategy

#### For Matched Nodes with Attribute Changes

Store attribute changes as metadata:

```json
{
  "type": "table",
  "attrs": {
    "borderColor": "blue",
    "__trackAttrChanges": {
      "borderColor": { "before": "black", "after": "blue" }
    }
  }
}
```

Or use a separate change registry (side-channel):

```typescript
interface MergeResult {
  document: ProseMirrorJSON;
  attributeChanges: AttributeChange[];
  structuralChanges: StructuralChange[];
}
```

#### For Inserted Blocks

Mark all text content with `trackInsert`:

```typescript
function markBlockAsInserted(node: ProseMirrorNode, author: Author): ProseMirrorNode {
  // Recursively add trackInsert to all text nodes
}
```

#### For Deleted Blocks

Include in merged document with all text marked `trackDelete`:

```typescript
function markBlockAsDeleted(node: ProseMirrorNode, author: Author): ProseMirrorNode {
  // Recursively add trackDelete to all text nodes
}
```

---

## Phase 6b: Structural Merge Implementation (CRITICAL)

This section details the missing piece that makes structural changes actually work.

### The Problem

Current flow in `compareWith()`:
```
1. diffDocuments(sourceJson, newJson)           → character-level diff
2. mergeDocuments(sourceJson, newJson, diff)    → merged doc (character-level only!)
3. processStructuralChanges(sourceJson, newJson) → detects changes, creates metadata
4. setEditorContent(merged)                      → shows document
```

**Issue**: Step 3 creates `StructuralChange[]` with marked nodes, but those nodes are never integrated into the merged document from Step 2.

### The Solution: Structure-First Merge

Replace Steps 1-3 with a structure-aware merge:

```
1. alignDocuments(sourceJson, newJson)          → matched/inserted/deleted blocks
2. For each block alignment:
   ├── Matched: mergeMatchedBlock(blockA, blockB) → character-level diff inside
   ├── Inserted: createInsertedBlock(blockB)      → all text marked trackInsert
   └── Deleted: createDeletedBlock(blockA)        → all text marked trackDelete
3. Combine into merged document
4. Generate StructuralChangeInfo[] from the changes
```

### New Service: `structuralMerger.ts`

```typescript
/**
 * Structure-aware document merge.
 * Aligns blocks first, then applies appropriate merge strategy per block.
 */

interface StructuralMergeResult {
  mergedDoc: ProseMirrorJSON;
  structuralInfos: StructuralChangeInfo[];
  // Character-level changes for matched blocks
  textChanges: { blockPath: number[]; segments: DiffSegment[] }[];
}

function mergeWithStructuralAwareness(
  docA: ProseMirrorJSON,
  docB: ProseMirrorJSON,
  author: TrackChangeAuthor
): StructuralMergeResult {
  // 1. Align top-level blocks
  const alignment = alignDocuments(docA, docB);
  
  // 2. Process each alignment
  const mergedBlocks: ProseMirrorJSON[] = [];
  const structuralInfos: StructuralChangeInfo[] = [];
  
  // Process in merged order (combining A's position with B's insertions)
  // ...
  
  return { mergedDoc, structuralInfos, textChanges };
}
```

### Core Functions Needed

| Function | Purpose |
|----------|---------|
| `mergeWithStructuralAwareness()` | Main entry point, orchestrates the merge |
| `processAlignment()` | Converts alignment result to merge operations |
| `mergeMatchedBlock()` | Character-level diff within a matched block |
| `createInsertedBlock()` | Mark all text with trackInsert, generate ID |
| `createDeletedBlock()` | Mark all text with trackDelete, generate ID |
| `mergeMatchedTable()` | Recurse into table rows, apply same logic |
| `mergeMatchedList()` | Recurse into list items, apply same logic |

### Merge Order Algorithm

Key challenge: Maintaining correct document order when combining matched, inserted, and deleted blocks.

```typescript
function computeMergeOrder(
  alignment: AlignmentResult,
  docA: ProseMirrorJSON,
  docB: ProseMirrorJSON
): MergeOperation[] {
  const operations: MergeOperation[] = [];
  
  // Build position map: for each position in docB, what's there?
  // - If matched to A: use merged result
  // - If inserted: use B's node with insert marks
  // - Deleted nodes from A: insert with delete marks
  
  // Algorithm:
  // 1. Walk through docB positions
  // 2. For each position, check if it's a match or insertion
  // 3. Track which A positions haven't been used (deletions)
  // 4. Insert deletions at their original relative positions
  
  return operations;
}

interface MergeOperation {
  type: 'matched' | 'inserted' | 'deleted';
  nodeA?: ProseMirrorJSON;  // For matched/deleted
  nodeB?: ProseMirrorJSON;  // For matched/inserted
  changeId?: string;         // For structural changes
}
```

### Handling Nested Structures

For tables and lists, recurse the same pattern:

```
Table matched (A.table[0] ↔ B.table[0]):
  ├── Row matched (A.row[0] ↔ B.row[0]):
  │     └── Apply character-level merge to cells
  ├── Row inserted (-- ↔ B.row[1]):
  │     └── Insert row with all text marked trackInsert
  └── Row matched (A.row[1] ↔ B.row[2]):
        └── Apply character-level merge to cells
```

### Updated `compareWith()` Flow

```typescript
async compareWith(content: DocxContent): Promise<ComparisonResult> {
  // ... resolve content to JSON ...
  
  // NEW: Use structure-aware merge instead of character-level
  const { mergedDoc, structuralInfos, textChanges } = mergeWithStructuralAwareness(
    sourceJson,
    newJson,
    author
  );
  
  // Store for pane
  setStructuralChanges(structuralInfos);
  setMergedJson(mergedDoc);
  
  // Update editor
  setEditorContent(superdocRef.current.activeEditor, mergedDoc);
  enableReviewMode(superdocRef.current);
  
  // Trigger comment creation for track marks
  // (existing code for processLoadedDocxComments)
  
  // Build result
  const result: ComparisonResult = {
    totalChanges: textChanges.length + structuralInfos.length,
    // ...
  };
  
  return result;
}
```

### File Changes for Phase 6b

| File | Changes |
|------|---------|
| **New: `services/structuralMerger.ts`** | Core structural merge implementation |
| `DocxDiffEditor.tsx` | Update `compareWith()` to use new merge |
| `blockLevelMerger.ts` | Refactor to support new flow, or deprecate |
| `services/index.ts` | Export new service |

### Phase 6b Implementation Status: ✅ Complete

The `structuralMerger.ts` service was implemented on 2026-01-13 with the following capabilities:

1. **Block alignment at document level**: Uses `alignDocuments()` to match paragraphs, tables, lists
2. **Recursive structural merge for tables**: `mergeMatchedTable()` aligns and merges rows
3. **Recursive structural merge for lists**: `mergeMatchedList()` aligns and merges items
4. **Character-level diff for matched blocks**: Uses existing `mergeDocuments()` within matched blocks
5. **Insert/delete marking**: New blocks get `trackInsert` marks, deleted blocks get `trackDelete` marks
6. **Shared IDs for pane integration**: Each structural change gets a UUID for accept/reject

The `DocxDiffEditor.tsx` `compareWith()` method now uses `mergeWithStructuralAwareness()` instead of the previous character-level-only approach.

### Testing Phase 6b

| Test | Description |
|------|-------------|
| Paragraph insert | New paragraph appears with green text |
| Paragraph delete | Deleted paragraph shows with strikethrough |
| Table row insert | New row appears with green text in all cells |
| Table row delete | Deleted row shows with strikethrough |
| Mixed changes | Both structural and character-level changes work |
| Accept via pane | Structural change accepted, marks removed |
| Reject via pane | Structural change rejected, content reverted |

---

## File Changes

### New Files

| File | Purpose | Status |
|------|---------|--------|
| `services/nodeFingerprint.ts` | Fingerprint generation for all node types | ✅ Done |
| `services/nodeAligner.ts` | LCS-based node alignment algorithm | ✅ Done |
| `services/attrComparer.ts` | Deep attribute comparison with defaults | ✅ Done |
| `services/tableBlockDiffer.ts` | Table-specific diffing logic | ✅ Done |
| `services/listBlockDiffer.ts` | List-specific diffing logic | ✅ Done |
| `services/nonTextNodeDiffer.ts` | Image and atomic node diffing | ✅ Done |
| `services/blockLevelMerger.ts` | Structural change detection and metadata | ✅ Done |
| `services/structuralMerger.ts` | Structure-aware document merge | ✅ Done |
| `components/StructuralChangesPane.tsx` | Floating pane for structural changes UI | ✅ Done |
| `styles/structural-pane.css` | Styles for the structural changes pane | ✅ Done |

### Modified Files

| File | Changes |
|------|---------|
| `types.ts` | Add new types (see below) |
| `documentDiffer.ts` | Integrate block-level diffing, return extended result |
| `mergeDocuments.ts` | Handle structural changes with shared IDs, build metadata |
| `trackChangeInjector.ts` | Add shared ID support for structural marks |
| `changeContextExtractor.ts` | Extract structural/attr changes for LLM |
| `DocxDiffEditor.tsx` | Integrate pane, manage structural changes state |
| `styles/index.css` | Import structural-pane.css |

### File Dependency Graph

```
nodeFingerprint.ts
        │
        ▼
nodeAligner.ts ◄──── attrComparer.ts
        │
        ├───► tableBlockDiffer.ts
        │
        ├───► listBlockDiffer.ts
        │
        ▼
documentDiffer.ts (orchestrator)
        │
        ▼
mergeDocuments.ts ──► StructuralChangeInfo[]
        │
        ▼
DocxDiffEditor.tsx
        │
        ├───► StructuralChangesPane.tsx
        │
        └───► changeContextExtractor.ts
```

---

## New Types

### Core Diff Types

```typescript
/**
 * Extended diff result with structural awareness
 */
interface HybridDiffResult {
  // Existing (text-level)
  segments: DiffSegment[];
  formatChanges: FormatChange[];
  textA: string;
  textB: string;
  summary: string[];
  
  // New (block-level)
  structuralChanges: StructuralChange[];
  attributeChanges: AttributeChange[];
  nodeMatches: NodeMatch[];
}

/**
 * A structural change (node added/removed/moved)
 */
interface StructuralChange {
  type: 'nodeInsert' | 'nodeDelete' | 'nodeMove';
  nodeType: string;
  path: number[];
  node: ProseMirrorJSON;
  // For moves
  fromPath?: number[];
  toPath?: number[];
}

/**
 * An attribute change on a matched node
 */
interface AttributeChange {
  nodeType: string;
  pathA: number[];
  pathB: number[];
  changes: AttrDiff[];
}

/**
 * Single attribute difference
 */
interface AttrDiff {
  key: string;           // e.g., "borders.top.color"
  before: unknown;
  after: unknown;
}

/**
 * Record of matched nodes between documents
 */
interface NodeMatch {
  pathA: number[];
  pathB: number[];
  fingerprint: string;
  similarity: number;
}
```

### Fingerprint Types

```typescript
/**
 * Node with computed fingerprint
 */
interface FingerprintedNode {
  node: ProseMirrorJSON;
  fingerprint: string;
  path: number[];
  children?: FingerprintedNode[];
}

/**
 * Fingerprint options
 */
interface FingerprintOptions {
  includeMarks?: boolean;      // Include mark types in fingerprint
  normalizeWhitespace?: boolean;
  hashAlgorithm?: 'simple' | 'md5';
}
```

### Structural Change Info (For Pane)

```typescript
/**
 * Metadata for the Structural Changes Pane
 * Generated during merge, stored in component state
 */
interface StructuralChangeInfo {
  /** Shared ID across all marks in this structural change */
  id: string;
  
  /** Type of structural change */
  type: 'rowInsert' | 'rowDelete' | 'columnInsert' | 'columnDelete' |
        'paragraphInsert' | 'paragraphDelete' |
        'listItemInsert' | 'listItemDelete' |
        'imageInsert' | 'imageDelete' |
        'attrChange';
  
  /** The node type affected */
  nodeType: string;  // 'tableRow', 'paragraph', 'listItem', 'table', etc.
  
  /** Human-readable location */
  location: string;  // "Table 1, Row 3" or "Page 2, after Introduction"
  
  /** Truncated content preview */
  preview: string;
  
  /** Author of the change */
  author: TrackChangeAuthor;
  
  /** ISO timestamp */
  date: string;
  
  /** For attribute changes, the specific diffs */
  attrChanges?: AttrDiff[];
}
```

### Extended EnrichedChange (For LLM Context)

```typescript
/**
 * Enhanced change type for LLM context
 */
interface EnrichedChange {
  // Existing
  type: 'insertion' | 'deletion' | 'replacement' | 'format';
  text?: string;
  oldText?: string;
  newText?: string;
  location: ChangeLocation;
  surroundingText?: string;
  formatDetails?: FormatDetails;
  charCount?: number;
  
  // New
  structuralType?: 'rowInsert' | 'rowDelete' | 'columnInsert' | 'columnDelete' | 
                   'listItemInsert' | 'listItemDelete' | 'listItemMove' |
                   'imageInsert' | 'imageDelete' | 'blockInsert' | 'blockDelete';
  attributeChanges?: AttrDiff[];
  tablePosition?: { row: number; column: number };
  listPosition?: { index: number; depth: number };
}

/**
 * Enhanced location info
 */
interface ChangeLocation {
  nodeType: 'heading' | 'paragraph' | 'listItem' | 'tableCell' | 'table' | 'image' | 'unknown';
  headingLevel?: number;
  sectionTitle?: string;
  description: string;
  
  // New
  tableCoords?: { row: number; column: number };
  listIndex?: number;
  listDepth?: number;
}
```

---

## UI Representation

### Design Philosophy: Mimic Word/LibreOffice

Based on how MS Word and LibreOffice handle track changes:

1. **Text changes** → Inline marks (SuperDoc bubbles handle accept/reject)
2. **Structural changes** → Mark all text in block + **Reviewing Pane** for grouped view
3. **Attribute-only changes** → Reviewing Pane (not shown inline in Word either)

This matches user expectations from established word processors.

---

### For Inline Text Changes (Existing — No Changes)

| Change | Visual | Accept/Reject |
|--------|--------|---------------|
| Text insertion | Green text, underline | SuperDoc bubbles |
| Text deletion | Red text, strikethrough | SuperDoc bubbles |
| Format change | Gold highlight | SuperDoc bubbles |

---

### For Structural Changes (Marks + Pane)

**Document Display:**
- All text in inserted blocks marked with `trackInsert` (appears green)
- All text in deleted blocks marked with `trackDelete` (appears red/struck)
- Users can accept/reject via SuperDoc bubbles OR via the Structural Changes Pane

**Structural Changes Pane:**
- Groups related marks into logical units ("Row inserted" instead of N text changes)
- Provides better context and overview
- Uses SuperDoc's `acceptTrackedChangeById` / `rejectTrackedChangeById` commands

| Change | Document Visual | Pane Entry |
|--------|----------------|------------|
| Row inserted | All cells' text green/underlined | "➕ Row inserted (Table 1, Row 3)" |
| Row deleted | All cells' text red/struck | "➖ Row deleted (Table 1, Row 2)" |
| Paragraph inserted | All text green | "➕ Paragraph inserted" |
| Paragraph deleted | All text red/struck | "➖ Paragraph deleted" |
| List item inserted | Text green | "➕ List item inserted" |
| List item deleted | Text red/struck | "➖ List item deleted" |
| Image inserted | (via pane) | "➕ Image inserted" |
| Image deleted | (via pane) | "➖ Image deleted" |

---

### Structural Changes Pane Design

A floating, collapsible panel that appears when structural changes are detected:

```
┌─────────────────────────────────────────────────────┐
│  📋 Structural Changes (3)              [−] [×]    │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ➕ Row inserted                                    │
│     Table 1, Row 3                                  │
│     "New product | $99 | Available"                 │
│                                    [Accept] [Reject]│
│  ─────────────────────────────────────────────────  │
│  ➖ Paragraph deleted                               │
│     Page 2, after "Introduction"                    │
│     "This section has been removed..."              │
│                                    [Accept] [Reject]│
│  ─────────────────────────────────────────────────  │
│  ✏️ Table formatting changed                        │
│     Table 1                                         │
│     Border: black → blue                            │
│                                    [Accept] [Reject]│
│                                                     │
├─────────────────────────────────────────────────────┤
│           [Accept All]  [Reject All]                │
└─────────────────────────────────────────────────────┘
```

#### Pane Behavior

| Behavior | Description |
|----------|-------------|
| **Visibility** | Only appears when structural changes exist |
| **Position** | Floating, bottom-right corner of editor |
| **Collapsible** | Can minimize to header: `📋 (3) [+]` |
| **Dismissible** | Can close entirely (changes remain in document) |
| **Animation** | Slide in/out on show/hide |
| **Styling** | Match SuperDoc bubble styling for consistency |
| **Scrollable** | If many changes, internal scroll |
| **Navigation** | Click change to scroll to it in document |

#### Pane Features

| Feature | Description |
|---------|-------------|
| Change icon | ➕ insert, ➖ delete, ✏️ format, 🔄 move |
| Location | Human-readable: "Table 1, Row 3" |
| Preview | Truncated content of the change |
| Accept button | Calls `editor.commands.acceptTrackedChangeById(id)` |
| Reject button | Calls `editor.commands.rejectTrackedChangeById(id)` |
| Accept All | Accepts all structural changes |
| Reject All | Rejects all structural changes |
| Counter badge | Shows remaining changes count |

---

### ID Strategy for Structural Changes

All marks within a single structural change share the same ID:

```
Inserted Row (ID: "struct-abc123"):
  Cell 1 text → trackInsert { id: "struct-abc123", author: "...", ... }
  Cell 2 text → trackInsert { id: "struct-abc123", author: "...", ... }
  Cell 3 text → trackInsert { id: "struct-abc123", author: "...", ... }
```

**Why this works:**
- SuperDoc's `acceptTrackedChangeById("struct-abc123")` accepts ALL marks with that ID
- One click in pane accepts/rejects the entire structural unit
- Users can also accept via individual bubbles (same effect)

**Verified:** SuperDoc's accept/reject commands find and process all marks with the given ID.

---

### For Attribute Changes (Pane Only)

Attribute-only changes (borders, alignment, spacing) cannot be shown inline — this matches Word/LibreOffice behavior where such changes appear in the Reviewing Pane.

| Change | Pane Entry |
|--------|------------|
| Table border changed | "✏️ Table formatting: Border black → blue" |
| Paragraph alignment | "✏️ Paragraph: Alignment left → center" |
| Cell background | "✏️ Cell formatting: Background white → yellow" |

**Accept/Reject for Attribute Changes:**
- Apply `trackFormat` mark to representative text node in the block
- Store attribute info in mark's `before`/`after` attrs
- Accept: SuperDoc removes mark, new attrs stay (already applied)
- Reject: Custom logic reads `before` values, reverts node attrs, removes mark

---

### Structural Change Metadata

Stored in component state for the pane to render:

```typescript
interface StructuralChangeInfo {
  id: string;                    // Shared across all marks in this change
  type: 'rowInsert' | 'rowDelete' | 'columnInsert' | 'columnDelete' |
        'paragraphInsert' | 'paragraphDelete' |
        'listItemInsert' | 'listItemDelete' |
        'imageInsert' | 'imageDelete' |
        'attrChange';
  nodeType: string;              // 'tableRow', 'paragraph', 'listItem', etc.
  location: string;              // "Table 1, Row 3"
  preview: string;               // Truncated content
  author: TrackChangeAuthor;
  date: string;
  attrChanges?: AttrDiff[];      // For attribute changes
}

// In DocxDiffEditor state:
const [structuralChanges, setStructuralChanges] = useState<StructuralChangeInfo[]>([]);
```

---

### Pane Visibility Logic

```typescript
// Show pane only if structural changes exist
const showStructuralPane = structuralChanges.length > 0;

// User can dismiss
const [paneDismissed, setPaneDismissed] = useState(false);

// User can collapse
const [paneCollapsed, setPaneCollapsed] = useState(false);

const paneVisible = showStructuralPane && !paneDismissed;
```

After all structural changes are accepted/rejected:
- `structuralChanges` becomes empty
- Pane auto-hides

---

### Accept/Reject Flow

#### User Accepts via Pane

1. User clicks "Accept" on "Row inserted" entry
2. Pane calls `editor.commands.acceptTrackedChangeById(change.id)`
3. SuperDoc removes `trackInsert` marks from all cells in that row
4. Row remains in document, unmarked
5. We remove this change from `structuralChanges` state
6. Pane updates (or auto-hides if no more changes)

#### User Rejects via Pane

1. User clicks "Reject" on "Row inserted" entry
2. Pane calls `editor.commands.rejectTrackedChangeById(change.id)`
3. SuperDoc removes the inserted content (entire row)
4. We remove from state
5. Pane updates

#### User Uses SuperDoc Bubbles Instead

- User can still accept/reject via inline bubbles
- We listen for document changes and update `structuralChanges` state accordingly
- Pane stays in sync

---

### Optional Props for Pane Customization

```typescript
interface DocxDiffEditorProps {
  // ... existing props
  
  /** Position of structural changes pane */
  structuralPanePosition?: 'top-right' | 'bottom-right' | 'top-left' | 'bottom-left';
  
  /** Initially collapsed? */
  structuralPaneCollapsed?: boolean;
  
  /** Hide pane entirely (user handles structural changes via bubbles only) */
  hideStructuralPane?: boolean;
}
```

---

## Testing Plan

### Unit Tests

#### Fingerprinting (`nodeFingerprint.test.ts`)

- [ ] Simple paragraph fingerprint
- [ ] Heading with level in fingerprint
- [ ] Table fingerprint includes rows/cells
- [ ] Image fingerprint by data hash
- [ ] Fingerprint ignores attributes
- [ ] Fingerprint ignores position
- [ ] Similar content produces similar fingerprints

#### Node Alignment (`nodeAligner.test.ts`)

- [ ] Identical documents = all matched
- [ ] Simple insertion detected
- [ ] Simple deletion detected
- [ ] Reordering detected as move
- [ ] Partial similarity matching
- [ ] Empty documents handled

#### Attribute Comparison (`attrComparer.test.ts`)

- [ ] Identical attrs = no changes
- [ ] Simple value change detected
- [ ] Nested object change detected
- [ ] Missing key (with default) = no change
- [ ] New key added detected
- [ ] Key removed detected

### Integration Tests

#### Tables (`table.integration.test.ts`)

- [ ] Cell content change within table
- [ ] Row inserted at beginning
- [ ] Row inserted at middle
- [ ] Row inserted at end
- [ ] Row deleted
- [ ] Multiple rows changed
- [ ] Column inserted
- [ ] Column deleted
- [ ] Cell merged/split
- [ ] Table border color changed
- [ ] Cell background changed
- [ ] Mixed content + style changes

#### Lists (`list.integration.test.ts`)

- [ ] List item added
- [ ] List item removed
- [ ] List item content changed
- [ ] List items reordered
- [ ] Nested list item added
- [ ] Mixed list changes

#### Images (`image.integration.test.ts`)

- [ ] Image added to document
- [ ] Image removed from document
- [ ] Image replaced (same position, different content)
- [ ] Image moved to different position
- [ ] Multiple images changed

#### Full Document (`document.integration.test.ts`)

- [ ] Mixed paragraphs, tables, lists, images
- [ ] Large document performance
- [ ] DOCX round-trip with track changes

#### Structural Changes Pane (`structuralPane.test.ts`)

- [ ] Pane appears when structural changes exist
- [ ] Pane hidden when no structural changes
- [ ] Pane displays correct count badge
- [ ] Each change shows icon, location, preview
- [ ] Accept button calls `acceptTrackedChangeById`
- [ ] Reject button calls `rejectTrackedChangeById`
- [ ] Accept All processes all changes
- [ ] Reject All processes all changes
- [ ] Pane auto-hides when all changes processed
- [ ] Collapse/expand behavior
- [ ] Dismiss behavior
- [ ] Click navigates to change in document
- [ ] State syncs when user accepts via SuperDoc bubble

---

## Timeline Estimate

| Phase | Effort | Status | Dependencies |
|-------|--------|--------|--------------|
| Phase 1: Foundation | 3-4 days | ✅ Done | None |
| Phase 2: Attribute Comparison | 2-3 days | ✅ Done | Phase 1 |
| Phase 3: Table Support | 4-5 days | ✅ Done | Phases 1, 2 |
| Phase 4: List Support | 3-4 days | ✅ Done | Phase 1 |
| Phase 5: Non-Text Nodes | 2-3 days | ✅ Done | Phase 1 |
| Phase 6a: Detection & Metadata | 1-2 days | ✅ Done | Phases 1-5 |
| **Phase 6b: Structural Merge** | **3-4 days** | **❌ BLOCKER** | Phase 6a |
| Phase 7: Context Extraction | 2-3 days | ✅ Done | Phase 6a |
| Phase 8: Structural Changes Pane | 4-5 days | ⚠️ UI Done | Phase 6b for functionality |

**Current State**: 
- Phases 1-5: Complete (detection infrastructure)
- Phase 6a: Complete (metadata generation)
- **Phase 6b: NOT DONE** (structural merge not implemented)
- Phase 7: Complete (context extraction)
- Phase 8: UI complete, but non-functional without Phase 6b

**Remaining Effort**:
- Phase 6b: ~3-4 days (critical path)
- Testing: ~2 days

### Recommended Order

```
Week 1: Phase 1 + Phase 2
Week 2: Phase 3 (Tables)
Week 3: Phase 4 + Phase 5 (Lists + Images)
Week 4: Phase 6 + Phase 7 (Merge + Context)
Week 5: Phase 8 (Structural Changes Pane)
```

### Phase 8 Breakdown

| Task | Effort |
|------|--------|
| `StructuralChangesPane` component structure | 0.5 day |
| Floating/positioned container | 0.5 day |
| Collapse/dismiss behavior | 0.5 day |
| Slide in/out animations | 0.5 day |
| SuperDoc bubble-matching styles | 0.5 day |
| Accept/Reject buttons + commands | 0.5 day |
| Accept All / Reject All | 0.25 day |
| Navigation (scroll to change) | 0.5 day |
| State sync with SuperDoc bubbles | 0.5 day |
| Testing | 0.75 day |
| **Total** | **~4-5 days** |

---

## Open Questions

### Answered ✅

1. ~~**SuperDoc Support**: Does SuperDoc have built-in support for block-level track changes?~~
   
   **Answer**: SuperDoc exposes `editor.commands.acceptTrackedChangeById(id)` and `editor.commands.rejectTrackedChangeById(id)` which accept/reject ALL marks with the given ID. We can use shared IDs for structural changes.

2. ~~**Accept/Reject**: How do we accept/reject a structural change?~~
   
   **Answer**: Use shared IDs across all marks in a structural change. Call `acceptTrackedChangeById(sharedId)` or `rejectTrackedChangeById(sharedId)` to process all related marks at once. Build a Structural Changes Pane to provide grouped UI for these actions.

### Critical Issue Found

> ⚠️ **Phase 6b BLOCKER**: The structural merge is not integrated. Detection works, but the merged document doesn't contain the structural changes. See Phase 6b above.

**Symptoms:**
1. Structural Changes Pane shows detected changes
2. Accept/Reject does nothing (no marks exist in document with those IDs)
3. Tables added in `compareWith` JSON don't appear in editor (structure lost in character-level merge)

**Root Cause:**
- `mergeDocuments()` only handles character-level text changes
- `processStructuralChanges()` creates metadata but doesn't modify the document
- The marked nodes in `StructuralChange.node` are never inserted into the merged document

**Solution Required:**
- Implement Phase 6b: Structure-aware merge that actually applies structural changes
- See `PLAN-DEFENSIVE-REJECT.md` for related reject fallback strategy

### Remaining Questions

3. **Performance**: For large documents with many tables, will recursive fingerprinting be fast enough? May need memoization or incremental computation.

4. **Column Changes**: DOCX doesn't have explicit columns — they're implicit by cell count. How to handle irregular tables (merged cells)?

5. **Move vs Delete+Insert**: Should we show moved content as a single "move" change, or keep it as separate delete + insert?

6. **Bubble Sync**: ✅ RESOLVED - Using SuperDoc's `onCommentsUpdate` callback. When `event.type === 'resolved'` and the `commentId` matches one of our structural change IDs, we remove it from state.

7. **Attribute Reject Logic**: For attribute-only changes using `trackFormat`, SuperDoc's reject may not know how to revert node attributes. May need custom reject handler for attribute changes.

8. **Structure-First Merge**: Need to implement a merge that processes aligned blocks, not just character positions. This is prerequisite for structural changes to work.

---

## References

- [diff-match-patch](https://github.com/google/diff-match-patch) - Current text diffing library
- [LCS Algorithm](https://en.wikipedia.org/wiki/Longest_common_subsequence_problem) - For node alignment
- [ProseMirror Schema](https://prosemirror.net/docs/guide/#schema) - Node/mark structure
- Word Track Changes behavior - Reference for expected UX
