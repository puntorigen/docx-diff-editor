# Defensive Reject Strategy for Structural Changes

## Overview

This document outlines the implementation plan for a robust reject mechanism for structural changes in the Structural Changes Pane. The strategy uses SuperDoc's native commands when possible, with a manual fallback using the stored source JSON.

---

## Problem Statement

When a user rejects a structural change from our custom pane, we call `editor.commands.rejectTrackedChangeById(id)`. However:

1. **Uncertainty**: We don't know if SuperDoc will correctly handle all text nodes sharing the same structural change ID
2. **Attribute Changes**: SuperDoc's `rejectTrackedChangeById` cannot restore node attributes — it only knows about mark changes
3. **No Verification**: Currently, we optimistically remove the change from state without verifying the reject actually worked

---

## Proposed Solution

A **defensive two-phase approach**:

1. **Phase 1**: Try SuperDoc's native reject command
2. **Phase 2**: Verify success via `onCommentsUpdate`, fallback to manual JSON manipulation if needed

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    User clicks "Reject" in Pane                  │
└─────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│              Check change type (insert/delete/attr)              │
└─────────────────────────────────────────────────────────────────┘
                                  │
                    ┌─────────────┴─────────────┐
                    ▼                           ▼
         ┌──────────────────┐        ┌──────────────────┐
         │ Attribute Change │        │ Structural I/D   │
         │   (attr only)    │        │ (insert/delete)  │
         └────────┬─────────┘        └────────┬─────────┘
                  │                           │
                  ▼                           ▼
         ┌──────────────────┐        ┌──────────────────┐
         │ Manual Fallback  │        │ Try SuperDoc     │
         │ (immediate)      │        │ rejectById(id)   │
         └────────┬─────────┘        └────────┬─────────┘
                  │                           │
                  │                           ▼
                  │               ┌──────────────────────┐
                  │               │ Start verify timeout │
                  │               │ (e.g., 500ms)        │
                  │               └────────┬─────────────┘
                  │                        │
                  │         ┌──────────────┴──────────────┐
                  │         ▼                             ▼
                  │  ┌─────────────────┐        ┌─────────────────┐
                  │  │ onCommentsUpdate│        │ Timeout fired   │
                  │  │ received (OK)   │        │ (no event)      │
                  │  └────────┬────────┘        └────────┬────────┘
                  │           │                          │
                  │           │                          ▼
                  │           │               ┌──────────────────┐
                  │           │               │ Manual Fallback  │
                  │           │               └────────┬─────────┘
                  │           │                        │
                  └───────────┴────────────────────────┘
                                  │
                                  ▼
                   ┌──────────────────────────┐
                   │ Remove from state        │
                   │ Update UI                │
                   └──────────────────────────┘
```

---

## Implementation Phases

### Phase 1: Pending Reject Tracking

**Goal**: Track rejects that are awaiting verification

- [ ] Create `pendingRejects` state/ref to track IDs awaiting confirmation
- [ ] Store timeout IDs for cleanup
- [ ] Define verification timeout duration (500ms recommended)

**Data Structure**:
```typescript
interface PendingReject {
  id: string;
  changeInfo: StructuralChangeInfo;
  timeoutId: NodeJS.Timeout;
  startedAt: number;
}
```

### Phase 2: Enhanced Reject Handler

**Goal**: Implement the two-phase reject logic

- [ ] Check change type before calling SuperDoc
- [ ] For attribute changes: skip SuperDoc, go directly to manual fallback
- [ ] For structural insert/delete: try SuperDoc first
- [ ] Add to `pendingRejects` with timeout
- [ ] On timeout: trigger manual fallback

**Handler Flow**:
```typescript
const handleRejectStructuralChange = (changeId: string) => {
  const change = structuralChanges.find(c => c.id === changeId);
  if (!change) return;

  // Attribute changes: immediate manual fallback
  if (change.type === 'attrChange') {
    applyManualReject(change);
    return;
  }

  // Structural changes: try SuperDoc first
  const editor = superdocRef.current?.activeEditor;
  if (editor?.commands?.rejectTrackedChangeById) {
    editor.commands.rejectTrackedChangeById(changeId);
    
    // Add to pending with timeout
    const timeoutId = setTimeout(() => {
      // SuperDoc didn't handle it — fallback
      applyManualReject(change);
      removePendingReject(changeId);
    }, REJECT_VERIFY_TIMEOUT);
    
    addPendingReject({ id: changeId, changeInfo: change, timeoutId });
  } else {
    // No SuperDoc command available — immediate fallback
    applyManualReject(change);
  }
};
```

### Phase 3: Enhanced `onCommentsUpdate` Handler

**Goal**: Clear pending rejects when SuperDoc confirms

- [ ] Check if resolved comment ID is in `pendingRejects`
- [ ] If found: clear timeout, remove from pending, remove from state
- [ ] If not found but in structuralChanges: existing behavior (bubble sync)

**Handler Enhancement**:
```typescript
const handleCommentsUpdate = (event: any) => {
  if (event?.type === 'resolved' && event?.comment?.trackedChange) {
    const commentId = event.comment.commentId;
    
    // Check if this was a pending reject
    const pending = pendingRejects.get(commentId);
    if (pending) {
      clearTimeout(pending.timeoutId);
      removePendingReject(commentId);
      setStructuralChanges(prev => prev.filter(c => c.id !== commentId));
      return;
    }
    
    // Existing bubble sync logic
    if (structuralChangeIdsRef.current.has(commentId)) {
      setStructuralChanges(prev => prev.filter(c => c.id !== commentId));
    }
  }
};
```

### Phase 4: Manual Reject Implementation

**Goal**: Implement direct JSON manipulation for reject

- [ ] Create `applyManualReject(change: StructuralChangeInfo)` function
- [ ] Handle each change type appropriately
- [ ] Use ProseMirror transactions to modify document
- [ ] Remove from structuralChanges state after success

**Change Type Handling**:

| Change Type | Manual Reject Action |
|-------------|---------------------|
| `rowInsert` | Remove the row node at path |
| `rowDelete` | Re-insert original row from `sourceJson` |
| `paragraphInsert` | Remove the paragraph node |
| `paragraphDelete` | Re-insert original paragraph from `sourceJson` |
| `listItemInsert` | Remove the list item node |
| `listItemDelete` | Re-insert original list item from `sourceJson` |
| `imageInsert` | Remove the image node |
| `imageDelete` | Re-insert original image from `sourceJson` |
| `attrChange` | Replace node attrs with original from `sourceJson` |

### Phase 5: Source Path Tracking Enhancement

**Goal**: Ensure we can locate original nodes in `sourceJson`

- [ ] Verify `StructuralChangeInfo` includes source path (for deletions)
- [ ] For insertions: no source path needed (we just remove)
- [ ] For attribute changes: need both source and current paths

**Enhanced StructuralChangeInfo**:
```typescript
interface StructuralChangeInfo {
  id: string;
  type: StructuralChangeType;
  nodeType: string;
  location: string;
  preview: string;
  author: TrackChangeAuthor;
  date: string;
  attrChanges?: AttrDiff[];
  
  // New fields for manual reject
  sourcePath?: number[];   // Path in original sourceJson (for deletions)
  currentPath?: number[];  // Path in current merged doc
}
```

### Phase 6: ProseMirror Transaction Helpers

**Goal**: Create utility functions for document manipulation

- [ ] `removeNodeAtPath(editor, path)` — delete a node
- [ ] `insertNodeAtPath(editor, path, node)` — insert a node
- [ ] `replaceNodeAttrsAtPath(editor, path, attrs)` — update attributes
- [ ] `getNodeAtPath(json, path)` — retrieve node from JSON

**Helper Functions**:
```typescript
// Get node from JSON by path
function getNodeAtPath(doc: ProseMirrorJSON, path: number[]): ProseMirrorJSON | null {
  let current = doc;
  for (const index of path) {
    if (!current.content || !current.content[index]) return null;
    current = current.content[index];
  }
  return current;
}

// Remove node using ProseMirror transaction
function removeNodeAtPath(editor: Editor, path: number[]): boolean {
  // Convert path to ProseMirror position
  // Create delete transaction
  // Dispatch
}

// Insert node using ProseMirror transaction
function insertNodeAtPath(editor: Editor, path: number[], node: ProseMirrorJSON): boolean {
  // Convert path to ProseMirror position
  // Create insert transaction
  // Dispatch
}
```

---

## Edge Cases

### 1. Document Modified Between Compare and Reject

**Problem**: User edits the document, then clicks reject — paths may be stale.

**Mitigation**:
- Track document version/modification count
- Warn user if document was modified since comparison
- Option: Disable reject after manual edits (require re-compare)

### 2. Nested Structural Changes

**Problem**: Rejecting a parent (e.g., list) when children also have changes.

**Mitigation**:
- Process changes in reverse path order (deepest first)
- Or: When rejecting parent, also reject all children with matching path prefix

### 3. Concurrent Accept/Reject

**Problem**: User clicks accept in bubble while reject is pending in pane.

**Mitigation**:
- `onCommentsUpdate` handler clears pending rejects
- Check if change still exists before applying manual fallback

### 4. SuperDoc Partially Handles Change

**Problem**: SuperDoc removes some but not all text with the shared ID.

**Mitigation**:
- After timeout, check if marks still exist in document
- If any remain, apply full manual fallback

---

## Testing Plan

### Unit Tests

- [ ] `getNodeAtPath` returns correct node
- [ ] `removeNodeAtPath` removes correct node
- [ ] `insertNodeAtPath` inserts at correct position
- [ ] Pending reject timeout triggers fallback
- [ ] `onCommentsUpdate` clears pending correctly

### Integration Tests

- [ ] Reject row insertion via pane
- [ ] Reject row deletion via pane
- [ ] Reject paragraph insertion
- [ ] Reject list item change
- [ ] Reject image insertion
- [ ] Attribute change reject (manual fallback)
- [ ] Mixed: some via SuperDoc, some via fallback
- [ ] Race condition: bubble accept during pending reject

### Manual Tests

- [ ] Verify document looks correct after reject
- [ ] Verify pane updates correctly
- [ ] Verify no console errors
- [ ] Test with large documents (performance)

---

## Timeline Estimate

| Phase | Effort | Priority |
|-------|--------|----------|
| Phase 1: Pending Reject Tracking | 1 hour | High |
| Phase 2: Enhanced Reject Handler | 2 hours | High |
| Phase 3: Enhanced onCommentsUpdate | 1 hour | High |
| Phase 4: Manual Reject Implementation | 3 hours | High |
| Phase 5: Source Path Tracking | 1 hour | Medium |
| Phase 6: ProseMirror Helpers | 2 hours | High |
| Testing | 2 hours | High |
| **Total** | **~12 hours** | |

---

## Success Criteria

1. **All structural change types can be rejected** from the pane
2. **Document state matches expected** after reject (verified visually)
3. **Pane syncs correctly** — rejected changes disappear
4. **No regression** in SuperDoc bubble accept/reject
5. **Attribute changes work** via manual fallback
6. **Graceful degradation** — if SuperDoc fails, fallback handles it

---

## Open Questions

1. **Position Calculation**: Converting path arrays to ProseMirror positions requires understanding the document structure. Need to investigate `editor.state.doc.resolve()` and related APIs.

2. **Schema Validation**: When inserting nodes from `sourceJson`, do we need to validate against the current schema? The source was from the same schema, so likely safe.

3. **Undo/Redo**: How do manual fallback transactions interact with SuperDoc's undo stack? Should we group them?

4. **Performance**: For many structural changes, will the timeout mechanism cause UI jank? May need to batch or debounce.

---

## File Changes Summary

| File | Changes |
|------|---------|
| `DocxDiffEditor.tsx` | Add pending reject state, enhance handlers, add manual fallback |
| `types.ts` | Add `sourcePath`, `currentPath` to `StructuralChangeInfo` |
| `blockLevelMerger.ts` | Populate path fields during merge |
| `services/index.ts` | Export new helpers |
| New: `services/documentManipulator.ts` | ProseMirror transaction helpers |

---

## References

- [ProseMirror Guide: Transactions](https://prosemirror.net/docs/guide/#transform)
- [ProseMirror: Positions and Paths](https://prosemirror.net/docs/guide/#doc.positions)
- SuperDoc `rejectTrackedChangeById` implementation (internal)
