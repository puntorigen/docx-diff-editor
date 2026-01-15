# Graceful Error Handling Architecture

## Problem Statement

Currently, when operations like `setSource` or `compareWith` fail (most commonly with invalid content), the SuperDoc editor fails catastrophically:

1. The error overlay ("Failed to load document") appears over the editor
2. The editor itself is erased/hidden
3. Users lose visibility of their work
4. There's no way to recover without a full page reload

**Goal**: Preserve the existing visible editor on recoverable errors and provide a callback mechanism so consuming applications can show friendly error UI (modals, toasts) without losing the user's work.

---

## Architecture Overview

### Error Classification

| Type | Description | Behavior |
|------|-------------|----------|
| **Fatal** | Editor is unrecoverable (init failed, SuperDoc crashed beyond repair) | Show error overlay, call `onError` with `type: 'fatal'` |
| **Operation** | An operation failed but editor is intact | Keep editor visible, call `onError` with `type: 'operation'`, return error result |

### New Types

```typescript
/**
 * Enhanced error information passed to onError callback
 */
interface EditorError {
  /** The underlying Error object */
  error: Error;
  /** Error classification */
  type: 'fatal' | 'operation';
  /** Which operation failed (for operation errors) */
  operation?: 'setSource' | 'compareWith' | 'parseHtml' | 'export' | 'init';
  /** Whether the editor is still usable */
  recoverable: boolean;
  /** Human-readable error message */
  message: string;
  /** For compareWith: which phase failed */
  phase?: 'parsing' | 'diffing' | 'merging' | 'applying';
}

/**
 * Successful comparison result (existing + success field)
 */
interface ComparisonResult {
  success: true;  // NEW - for backward compatibility
  totalChanges: number;
  insertions: number;
  deletions: number;
  formatChanges: number;
  structuralChanges: number;
  summary: string[];
  mergedJson: ProseMirrorJSON;
  structuralChangeInfos: StructuralChangeInfo[];
  usedFallback?: boolean;
}

/**
 * Failed comparison result (NEW)
 */
interface ComparisonError {
  success: false;
  error: Error;
  message: string;
  phase: 'parsing' | 'diffing' | 'merging' | 'applying';
}

/**
 * Union type for compareWith return value
 */
type CompareWithResult = ComparisonResult | ComparisonError;
```

---

## Recovery Mechanism

### Rollback State

We maintain a "last known good" JSON state that can be used to restore the editor if an operation corrupts it:

```typescript
// Internal ref to store rollback point
const rollbackJsonRef = useRef<ProseMirrorJSON | null>(null);
```

**When rollbackJsonRef is updated:**
- After successful initialization
- After successful `setSource`
- After successful `compareWith`

**When rollbackJsonRef is used:**
- When applying content fails and we need to restore previous state

### Recovery Cascade

For `compareWith`, we have a multi-tier recovery approach:

```
┌─────────────────────────────────────────────────────┐
│ 1. Try apply merged content (with track changes)   │
│    └─ fails →                                       │
│ 2. Try apply clean content (usedFallback mode)     │
│    └─ fails →                                       │
│ 3. Try apply rollbackJson (restore previous)       │
│    └─ fails →                                       │
│ 4. Fatal: show overlay, call onError(fatal)        │
└─────────────────────────────────────────────────────┘
```

This integrates with the existing `usedFallback` pattern, adding rollback as a third tier.

---

## Flow Diagrams

### compareWith Flow

```
compareWith(content)
        │
        ▼
┌───────────────────┐
│ Capture rollback  │  ← Save current editor state FIRST
│ json from editor  │
└────────┬──────────┘
         │
         ▼
┌───────────────────┐     ┌──────────────────────────┐
│ Parse content in  │────▶│ Fail: return {           │
│ hidden instance   │     │   success: false,        │
└────────┬──────────┘     │   phase: 'parsing' }     │
         │ OK             │ Editor UNCHANGED         │
         ▼                └──────────────────────────┘
┌───────────────────┐     ┌──────────────────────────┐
│ Run diff/merge    │────▶│ Fail: return {           │
│ algorithm         │     │   success: false,        │
└────────┬──────────┘     │   phase: 'merging' }     │
         │ OK             │ Editor UNCHANGED         │
         ▼                └──────────────────────────┘
┌───────────────────┐
│ Apply merged      │─────────────────┐
│ content           │                 │ fail
└────────┬──────────┘                 ▼
         │ OK              ┌───────────────────┐
         │                 │ Try fallback      │────────┐
         │                 │ (clean content)   │        │ fail
         │                 └────────┬──────────┘        ▼
         │                          │ OK      ┌───────────────────┐
         │                          │         │ Try rollback      │────────┐
         │                          │         │ (previous state)  │        │ fail
         │                          │         └────────┬──────────┘        ▼
         ▼                          ▼                  ▼             ┌──────────┐
┌─────────────────────────────────────────────┐  ┌──────────┐       │ FATAL    │
│ SUCCESS                                     │  │ Return   │       │ Show     │
│ Return { success: true, ... }               │  │ success: │       │ overlay  │
│ Update rollbackJsonRef = mergedJson         │  │ false    │       └──────────┘
└─────────────────────────────────────────────┘  └──────────┘
```

### setSource Flow

```
setSource(content)
        │
        ▼
┌───────────────────┐
│ Capture rollback  │  ← Save current editor state FIRST
│ json from editor  │
└────────┬──────────┘
         │
         ▼
┌───────────────────┐     ┌──────────────────────────┐
│ Pre-validate:     │────▶│ Fail: return error       │
│ Parse content in  │     │ DON'T destroy editor     │
│ hidden instance   │     │ Editor UNCHANGED         │
└────────┬──────────┘     └──────────────────────────┘
         │ OK
         ▼
┌───────────────────┐
│ Destroy current   │
│ SuperDoc instance │
└────────┬──────────┘
         │
         ▼
┌───────────────────┐     ┌──────────────────────────┐
│ Create new        │────▶│ Fail: Try create with    │
│ SuperDoc with     │     │ rollbackJson instead     │
│ validated content │     └───────────┬──────────────┘
└────────┬──────────┘                 │
         │ OK                         ▼
         │               ┌──────────────────────────┐
         │               │ If rollback also fails:  │
         │               │ FATAL - show overlay     │
         │               └──────────────────────────┘
         ▼
┌─────────────────────────────────────────────┐
│ SUCCESS                                     │
│ Update rollbackJsonRef = newContent         │
└─────────────────────────────────────────────┘
```

---

## API Changes

### Props

```typescript
interface DocxDiffEditorProps {
  // CHANGED: Now receives EditorError instead of Error
  onError?: (error: EditorError) => void;
  
  // ... all other props unchanged
}
```

### Ref Methods

```typescript
interface DocxDiffEditorRef {
  // CHANGED: Return type is now union, no longer throws on recoverable errors
  compareWith(content: DocxContent): Promise<CompareWithResult>;
  
  // CHANGED: Return type includes error case, no longer throws on recoverable errors
  setSource(content: DocxContent): Promise<void | { success: false; error: Error; message: string }>;
  
  // ... all other methods unchanged
}
```

---

## Consumer Migration Guide

### Before (current behavior)

```typescript
// Using try/catch for error handling
try {
  const result = await editorRef.current.compareWith(newContent);
  console.log(`Found ${result.totalChanges} changes`);
  // Process result...
} catch (error) {
  // Editor might be in broken state here
  showErrorMessage(error.message);
}
```

### After (new behavior)

```typescript
// Using result-based error handling
const result = await editorRef.current.compareWith(newContent);

if (!result.success) {
  // Editor is still intact! Show friendly error
  showModal({
    title: 'Comparison Failed',
    message: result.message,
    phase: result.phase,  // 'parsing', 'diffing', 'merging', or 'applying'
  });
  return;
}

// Success path - result has all the usual fields
console.log(`Found ${result.totalChanges} changes`);
```

### Using the Enhanced Callback

```typescript
<DocxDiffEditor
  ref={editorRef}
  onError={(errorInfo) => {
    if (errorInfo.type === 'fatal') {
      // Editor is gone, need to reinitialize or show full error page
      console.error('Fatal editor error:', errorInfo.error);
    } else {
      // Editor still works, just show a notification
      toast.error(`Operation failed: ${errorInfo.message}`);
    }
  }}
/>
```

---

## Error Overlay Behavior

### Current Behavior
- Any error triggers the `dde-error` overlay
- Overlay hides the editor
- User sees "Failed to load document"

### New Behavior
- **Fatal errors only** trigger the overlay
- Operation errors call `onError` callback but don't show overlay
- User's editor remains visible and functional

---

## Implementation Checklist

### Types (`types.ts`)
- [ ] Add `EditorError` interface
- [ ] Add `ComparisonError` interface  
- [ ] Add `success: true` to `ComparisonResult`
- [ ] Create `CompareWithResult` union type
- [ ] Update `DocxDiffEditorRef.compareWith` signature
- [ ] Update `DocxDiffEditorRef.setSource` signature

### Component (`DocxDiffEditor.tsx`)
- [ ] Add `rollbackJsonRef` for state backup
- [ ] Rename `error` state to `fatalError` (conceptually - for fatal only)
- [ ] Create `handleOperationError` (calls callback, no overlay)
- [ ] Modify `handleError` to only set overlay for fatal errors
- [ ] Update `compareWith`:
  - [ ] Capture rollback state at start
  - [ ] Pre-validate content before applying
  - [ ] Implement recovery cascade
  - [ ] Return union type instead of throwing
  - [ ] Add `success: true` to successful results
- [ ] Update `setSource`:
  - [ ] Capture rollback state at start
  - [ ] Pre-validate before destroying current instance
  - [ ] Implement recovery with rollbackJson
- [ ] Update `initialize`:
  - [ ] Set initial rollbackJsonRef after successful init
- [ ] Update rollbackJsonRef after successful operations

### Exports (`index.ts`)
- [ ] Export new types: `EditorError`, `ComparisonError`, `CompareWithResult`

### Documentation
- [ ] Update README with new error handling patterns
- [ ] Add migration notes for breaking changes
- [ ] Document the `onError` callback enhancement

---

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Template preservation on recovery | Accept potential styling loss | Content > styling. Pre-validation makes full recovery rare. |
| setSource approach | Pre-validate before destroying | Never destroy working editor until replacement is confirmed. |
| Error overlay trigger | Fatal errors only | Operation errors should let users see their work. |
| Throw behavior | Don't throw for recoverable errors | Cleaner API, explicit success checking. |
| Backward compatibility | Add `success` field to existing type | Existing code continues to work, TypeScript helps migration. |
| usedFallback integration | Keep existing, add rollback tier | Complementary recovery mechanisms. |

---

## Edge Cases

### SuperDoc Internal Crash
When SuperDoc internally corrupts (shows its own "Failed to load document" in the DOM):
1. Our `setEditorContent` will throw
2. We attempt rollback
3. If rollback fails (SuperDoc too corrupted), we try full reinitialization
4. If reinitialization fails, we show fatal error overlay

### Content That Passes Validation But Fails Apply
Rare case where content parses fine in hidden instance but fails in main editor:
1. Could be due to schema differences or plugin conflicts
2. Rollback mechanism handles this
3. User sees their previous content restored

### Concurrent Operations
If user calls `compareWith` while another is running:
1. Current behavior: undefined (race condition)
2. Future consideration: queue operations or reject with error
3. For now: document that operations should not overlap
