# DocxDiffEditor - NPM Package Plan

An independent, portable React component for DOCX document comparison with track changes visualization.

## Package Overview

| Property | Value |
|----------|-------|
| **Name** | `docx-diff-editor` |
| **License** | Apache 2.0 |
| **Build Tool** | tsup |
| **Styling** | Plain CSS (no Tailwind dependency) |
| **React Version** | >=18.0.0 |

---

## Purpose

A React component that wraps SuperDoc to provide:
- Document viewing with toolbar
- Comparison between two document versions
- Track changes visualization (insert, delete, format)
- Enriched change context extraction for LLM processing

---

## Content Input Formats

The component accepts three content formats:

| Format | Type | Detection | Handling |
|--------|------|-----------|----------|
| **File** | `File` | `instanceof File` | SuperDoc parses directly |
| **HTML** | `string` | `typeof === 'string'` | SuperDoc `html` option → JSON |
| **JSON** | `ProseMirrorJSON` | Object (not File/string) | Used directly |

```typescript
type DocxContent = File | ProseMirrorJSON | string;
```

---

## Component API

### Props

```typescript
interface DocxDiffEditorProps {
  /** Optional initial source document */
  initialSource?: DocxContent;
  
  /** Optional template DOCX for styles when using HTML/JSON input */
  templateDocx?: File;
  
  /** Show rulers in the editor (default: false) */
  showRulers?: boolean;
  
  /** Show toolbar (default: true) */
  showToolbar?: boolean;
  
  /** Author info for track changes */
  author?: {
    name: string;
    email: string;
  };
  
  /** Callback when editor is ready */
  onReady?: () => void;
  
  /** Callback when source document is loaded */
  onSourceLoaded?: (json: ProseMirrorJSON) => void;
  
  /** Callback when comparison completes */
  onComparisonComplete?: (result: ComparisonResult) => void;
  
  /** Callback on errors */
  onError?: (error: Error) => void;
  
  /** Container className */
  className?: string;
  
  /** Toolbar container className */
  toolbarClassName?: string;
  
  /** Editor container className */
  editorClassName?: string;
}
```

### Ref Methods (Imperative API)

```typescript
interface DocxDiffEditorRef {
  /** Set the source/base document */
  setSource(content: DocxContent): Promise<void>;
  
  /** Compare source with new content, show track changes */
  compareWith(content: DocxContent): Promise<ComparisonResult>;
  
  /** Get raw diff segments */
  getDiffSegments(): DiffSegment[];
  
  /** Get enriched changes with context for LLM processing */
  getEnrichedChangesContext(): EnrichedChange[];
  
  /** Get current document content as JSON */
  getContent(): ProseMirrorJSON;
  
  /** Get source document JSON (before comparison) */
  getSourceContent(): ProseMirrorJSON | null;
  
  /** Export current document to DOCX blob */
  exportDocx(): Promise<Blob>;
  
  /** Reset to source state (clear comparison) */
  resetComparison(): void;
  
  /** Check if editor is ready */
  isReady(): boolean;
}
```

### Result Types

```typescript
interface ComparisonResult {
  totalChanges: number;
  insertions: number;
  deletions: number;
  formatChanges: number;
  summary: string[];
  mergedJson: ProseMirrorJSON;
}

interface DiffSegment {
  type: 'equal' | 'insert' | 'delete';
  text: string;
}

interface EnrichedChange {
  type: 'insertion' | 'deletion' | 'replacement' | 'format';
  text?: string;
  oldText?: string;
  newText?: string;
  location: ChangeLocation;
  surroundingText?: string;
  formatDetails?: {
    added: string[];
    removed: string[];
  };
  charCount?: number;
}

interface ChangeLocation {
  nodeType: 'heading' | 'paragraph' | 'listItem' | 'tableCell' | 'unknown';
  headingLevel?: number;
  sectionTitle?: string;
  description: string;
}
```

---

## Track Changes Support

| Type | Mark | Visual | Supported |
|------|------|--------|-----------|
| Insertion | `trackInsert` | Green underline | ✅ |
| Deletion | `trackDelete` | Red strikethrough | ✅ |
| Format | `trackFormat` | Gold highlight | ✅ |
| Comment | `trackComment` | - | ❌ |

---

## Editor Modes

| Action | Mode | Track Bubbles | User Can |
|--------|------|---------------|----------|
| After `setSource()` | `editing` | Hidden | Edit document |
| After `compareWith()` | `review` | Visible | Accept/reject changes |
| After `resetComparison()` | `editing` | Hidden | Edit document |

---

## Template DOCX Strategy

SuperDoc requires a DOCX file for initialization (provides schema, fonts, styles).

**Solution:**
1. **Embedded fallback**: Bundle a minimal blank DOCX as base64 (~5KB)
2. **Optional override**: `templateDocx` prop for custom styles/fonts
3. **Not needed if**: Source is already a File (brings its own styles)

---

## Dependencies

### Peer Dependencies (user provides)
```json
{
  "react": ">=18.0.0",
  "react-dom": ">=18.0.0",
  "superdoc": ">=0.14.0"
}
```

### Bundled Dependencies
```json
{
  "diff-match-patch": "^1.0.5",
  "uuid": "^9.0.0"
}
```

---

## File Structure

```
packages/docx-diff-editor/
├── package.json
├── tsconfig.json
├── tsup.config.ts
├── README.md
├── LICENSE
├── PLAN.md                       # This file
│
├── src/
│   ├── index.ts                  # Barrel exports
│   ├── DocxDiffEditor.tsx        # Main component (forwardRef)
│   │
│   ├── services/
│   │   ├── index.ts              # Service exports
│   │   ├── contentResolver.ts    # File/HTML/JSON → ProseMirror JSON
│   │   ├── documentDiffer.ts     # Character-level diff (diff-match-patch)
│   │   ├── mergeDocuments.ts     # Apply track change marks to document
│   │   ├── trackChangeInjector.ts # Create trackInsert/Delete/Format marks
│   │   └── changeContextExtractor.ts # Extract enriched changes for LLM
│   │
│   ├── types.ts                  # All TypeScript type definitions
│   ├── constants.ts              # Default author, config values
│   ├── blankTemplate.ts          # Embedded minimal DOCX as base64
│   │
│   └── styles/
│       ├── index.css             # Main entry (imports all)
│       ├── variables.css         # CSS custom properties
│       ├── base.css              # Layout, containers
│       ├── loading.css           # Loading spinner, states
│       ├── error.css             # Error display
│       └── track-changes.css     # Track change mark styles
│
└── dist/                         # Build output (generated)
    ├── index.js                  # ESM bundle
    ├── index.cjs                 # CommonJS bundle
    ├── index.d.ts                # TypeScript declarations
    └── styles.css                # Combined CSS
```

---

## CSS Architecture

### Naming Convention
All classes prefixed with `dde-` (docx-diff-editor) to avoid conflicts:

```css
/* Container hierarchy */
.dde-container { }
.dde-toolbar { }
.dde-editor { }

/* States */
.dde-loading { }
.dde-loading__spinner { }
.dde-loading__text { }
.dde-error { }
.dde-error__icon { }
.dde-error__message { }

/* Track changes */
.dde-track-insert { }
.dde-track-delete { }
.dde-track-format { }
```

### CSS Variables (customizable by users)

```css
:root {
  /* Colors */
  --dde-primary-color: #007ACC;
  --dde-insert-color: #10B981;
  --dde-delete-color: #EF4444;
  --dde-format-color: #F59E0B;
  --dde-error-color: #EF4444;
  --dde-text-color: #374151;
  --dde-text-muted: #6B7280;
  --dde-bg-color: #FFFFFF;
  --dde-bg-muted: #F9FAFB;
  --dde-border-color: #E5E7EB;
  
  /* Spacing */
  --dde-spacing-sm: 0.5rem;
  --dde-spacing-md: 1rem;
  --dde-spacing-lg: 1.5rem;
  
  /* Border radius */
  --dde-radius-sm: 0.25rem;
  --dde-radius-md: 0.5rem;
  --dde-radius-lg: 0.75rem;
  
  /* Transitions */
  --dde-transition: 150ms ease;
}
```

---

## Build Configuration

### tsup.config.ts

```typescript
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  external: ['react', 'react-dom', 'superdoc'],
  injectStyle: false, // Keep CSS separate
});
```

### Build Output

| File | Format | Purpose |
|------|--------|---------|
| `dist/index.js` | ESM | Modern bundlers (Vite, webpack 5) |
| `dist/index.cjs` | CommonJS | Node.js, older bundlers |
| `dist/index.d.ts` | TypeScript | Type definitions |
| `dist/styles.css` | CSS | Styles to import |

---

## Usage Example

### Installation

```bash
npm install docx-diff-editor
```

### Basic Usage

```tsx
import { useRef } from 'react';
import { DocxDiffEditor, DocxDiffEditorRef } from 'docx-diff-editor';
import 'docx-diff-editor/styles.css';

function DocumentComparison() {
  const editorRef = useRef<DocxDiffEditorRef>(null);

  const handleSetSource = async () => {
    // From HTML
    await editorRef.current?.setSource('<h1>Contract</h1><p>Terms and conditions...</p>');
    
    // Or from JSON
    await editorRef.current?.setSource({ type: 'doc', content: [...] });
    
    // Or from File
    await editorRef.current?.setSource(fileInput.files[0]);
  };

  const handleCompare = async () => {
    const newVersion = '<h1>Contract</h1><p>Updated terms...</p>';
    const result = await editorRef.current?.compareWith(newVersion);
    
    console.log(`Found ${result.totalChanges} changes`);
    console.log(`- ${result.insertions} insertions`);
    console.log(`- ${result.deletions} deletions`);
    console.log(`- ${result.formatChanges} format changes`);
  };

  const handleGetLLMContext = () => {
    // Get enriched changes for your LLM
    const context = editorRef.current?.getEnrichedChangesContext();
    
    // Send to your API
    fetch('/api/summarize', {
      method: 'POST',
      body: JSON.stringify({ changes: context }),
    });
  };

  const handleExport = async () => {
    const blob = await editorRef.current?.exportDocx();
    // Download or process the blob
  };

  return (
    <div>
      <div className="controls">
        <button onClick={handleSetSource}>Load Source</button>
        <button onClick={handleCompare}>Compare</button>
        <button onClick={handleGetLLMContext}>Get LLM Context</button>
        <button onClick={handleExport}>Export DOCX</button>
      </div>
      
      <DocxDiffEditor
        ref={editorRef}
        showRulers
        showToolbar
        author={{ name: 'My App', email: 'app@example.com' }}
        onReady={() => console.log('Editor ready!')}
        onComparisonComplete={(result) => console.log('Comparison done:', result)}
        onError={(error) => console.error('Error:', error)}
        className="editor-wrapper"
      />
    </div>
  );
}
```

### Custom Styling

```css
/* Override CSS variables */
:root {
  --dde-primary-color: #6366F1;
  --dde-insert-color: #22C55E;
  --dde-delete-color: #F43F5E;
}

/* Or override specific classes */
.dde-container {
  border: 2px solid #6366F1;
  border-radius: 1rem;
}
```

---

## Internal Flow

### setSource(content)

```
content (File | HTML | JSON)
        │
        ▼
┌─────────────────────────────┐
│   contentResolver.ts        │
│   Detect type & convert     │
│   to ProseMirror JSON       │
└─────────────┬───────────────┘
              │
              ▼
┌─────────────────────────────┐
│   Store as sourceJson       │
│   Set editor content        │
│   Mode: editing             │
└─────────────────────────────┘
```

### compareWith(content)

```
content (File | HTML | JSON)
        │
        ▼
┌─────────────────────────────┐
│   contentResolver.ts        │
│   Convert to JSON           │
└─────────────┬───────────────┘
              │
              ▼
┌─────────────────────────────┐
│   documentDiffer.ts         │
│   diff(sourceJson, newJson) │
│   → DiffResult              │
└─────────────┬───────────────┘
              │
              ▼
┌─────────────────────────────┐
│   mergeDocuments.ts         │
│   Apply track marks         │
│   → mergedJson              │
└─────────────┬───────────────┘
              │
              ▼
┌─────────────────────────────┐
│   Set editor content        │
│   Mode: review              │
│   Return ComparisonResult   │
└─────────────────────────────┘
```

### getEnrichedChangesContext()

```
mergedJson (with track marks)
        │
        ▼
┌─────────────────────────────┐
│   changeContextExtractor.ts │
│   Walk document tree        │
│   Extract marked text       │
│   Add surrounding context   │
│   Group replacements        │
└─────────────┬───────────────┘
              │
              ▼
      EnrichedChange[]
      (ready for LLM)
```

---

## Services Detail

### contentResolver.ts
Detects content type and converts to ProseMirror JSON:
- File → Hidden SuperDoc instance → `editor.getJSON()`
- HTML → SuperDoc with `html` option → `editor.getJSON()`
- JSON → Pass through (validate structure)

### documentDiffer.ts
Character-level diff using diff-match-patch:
- Extract text from both documents
- Run diff algorithm
- Detect format changes on unchanged text
- Return `DiffResult` with segments

### mergeDocuments.ts
Apply track changes to original document:
- Clone source document
- Walk diff segments
- Add `trackInsert` marks to new text
- Add `trackDelete` marks to removed text
- Add `trackFormat` marks to format changes

### trackChangeInjector.ts
Create ProseMirror marks:
- `createTrackInsertMark(author)` → green insertion
- `createTrackDeleteMark(author)` → red deletion
- `createTrackFormatMark(before, after, author)` → format change

### changeContextExtractor.ts
Extract enriched changes for LLM:
- Walk merged document tree
- Find nodes with track marks
- Extract surrounding text/sentence
- Track current section (heading)
- Group adjacent delete+insert as replacement

---

## Testing Checklist

- [ ] Initialize with File source
- [ ] Initialize with HTML source
- [ ] Initialize with JSON source
- [ ] Compare File vs File
- [ ] Compare HTML vs HTML
- [ ] Compare JSON vs JSON
- [ ] Compare mixed formats (e.g., File vs HTML)
- [ ] Track insertions displayed correctly
- [ ] Track deletions displayed correctly
- [ ] Track format changes displayed correctly
- [ ] Accept single change
- [ ] Reject single change
- [ ] Reset comparison
- [ ] Export to DOCX
- [ ] getEnrichedChangesContext() returns correct data
- [ ] Custom templateDocx works
- [ ] CSS variables customization works
- [ ] className props work
- [ ] All callbacks fire correctly
- [ ] Error handling works

---

## Future Considerations

- [ ] Add `trackComment` support if needed
- [ ] Collaboration features
- [ ] Undo/redo after accept/reject
- [ ] Batch accept/reject all
- [ ] Side-by-side comparison view
- [ ] Change navigation (prev/next)

