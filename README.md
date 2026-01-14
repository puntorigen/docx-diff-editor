# docx-diff-editor

A React component for DOCX document comparison with track changes visualization. Built on top of SuperDoc.

## Features

- 📄 Compare two DOCX documents side by side
- 🔍 Character-level diff with track changes
- 📊 **Block-level structural diffing** for tables, lists, paragraphs, and images
- 🔄 **Structure-aware merge** - inserted/deleted blocks appear in the editor with track marks
- ✅ Accept/reject individual changes (both text and structural)
- 🎨 Visual track changes (insert, delete, format)
- 📋 **Structural Changes Pane** for table rows, list items, images
- 🤖 Extract enriched change context for LLM processing
- 📤 Export merged document to DOCX

## Installation

```bash
npm install docx-diff-editor
```

### Peer Dependencies

This package requires React to be installed in your project:

```bash
# If you don't have React already
npm install react react-dom
```

> **Note**: React must be provided by your project (not bundled) to avoid duplicate React instances which cause hooks and context to break. SuperDoc is bundled with this package - you don't need to install it separately.

## Quick Start

```tsx
import { useRef } from 'react';
import { DocxDiffEditor, DocxDiffEditorRef } from 'docx-diff-editor';
import 'docx-diff-editor/styles.css';

function App() {
  const editorRef = useRef<DocxDiffEditorRef>(null);

  const handleCompare = async () => {
    // Set the source document (can be File, HTML, or JSON)
    await editorRef.current?.setSource('<h1>Original</h1><p>Hello world</p>');

    // Compare with a new version
    const result = await editorRef.current?.compareWith(
      '<h1>Original</h1><p>Hello universe</p>'
    );

    console.log(`Found ${result.totalChanges} changes`);

    // Note: Subsequent compareWith calls compare against current editor state
    // (with track changes accepted), not the original source.
    // To compare against original again, call setSource() first.
  };

  return (
    <div style={{ height: '600px' }}>
      <button onClick={handleCompare}>Compare Documents</button>
      <DocxDiffEditor
        ref={editorRef}
        showToolbar
        showRulers
        onReady={() => console.log('Editor ready!')}
      />
    </div>
  );
}
```

## Content Formats

The component accepts three content formats:

| Format | Type | Example |
|--------|------|---------|
| **File** | `File` | DOCX file from `<input type="file">` |
| **HTML** | `string` | `'<h1>Title</h1><p>Content</p>'` |
| **JSON** | `ProseMirrorJSON` | `{ type: 'doc', content: [...] }` |

```tsx
// From File
await editor.setSource(fileInput.files[0]);

// From HTML
await editor.setSource('<h1>Hello</h1><p>World</p>');

// From JSON
await editor.setSource({ type: 'doc', content: [...] });
```

## API Reference

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `initialSource` | `DocxContent` | - | Initial document to load |
| `templateDocx` | `File` | - | Template DOCX for styles (when using HTML/JSON) |
| `showToolbar` | `boolean` | `true` | Show the editor toolbar |
| `showRulers` | `boolean` | `false` | Show document rulers |
| `author` | `{ name, email }` | - | Author info for track changes |
| `onReady` | `() => void` | - | Called when editor is ready |
| `onSourceLoaded` | `(json) => void` | - | Called when source is loaded |
| `onComparisonComplete` | `(result) => void` | - | Called after comparison |
| `onError` | `(error) => void` | - | Called on errors |
| `className` | `string` | - | Container class |
| `toolbarClassName` | `string` | - | Toolbar container class |
| `editorClassName` | `string` | - | Editor container class |
| `structuralPanePosition` | `StructuralPanePosition` | `'bottom-right'` | Position of structural changes pane |
| `structuralPaneCollapsed` | `boolean` | `false` | Start with pane collapsed |
| `hideStructuralPane` | `boolean` | `false` | Hide structural changes pane entirely |

### Ref Methods

```tsx
interface DocxDiffEditorRef {
  // Set the source/base document
  setSource(content: DocxContent): Promise<void>;

  // Compare current editor content with new content, show track changes
  // Note: Compares against current editor state (not original source)
  compareWith(content: DocxContent): Promise<ComparisonResult>;

  // Get diff data
  getDiffSegments(): DiffSegment[];

  // Get enriched context for LLM
  getEnrichedChangesContext(): EnrichedChange[];

  // Get document content
  getContent(): ProseMirrorJSON;
  getSourceContent(): ProseMirrorJSON | null;

  // Export to DOCX
  exportDocx(): Promise<Blob>;

  // Reset comparison
  resetComparison(): void;

  // Check if ready
  isReady(): boolean;

  // Get current page count
  getPages(): number;

  // Get document metadata and statistics
  getDocumentInfo(): DocumentInfo | null;

  // Get document core properties
  getProperties(): Promise<DocumentProperties | null>;

  // Set document core properties (partial update)
  setProperties(properties: Partial<DocumentProperties>): Promise<boolean>;

  // Parse HTML to ProseMirror JSON
  parseHtml(html: string): Promise<ProseMirrorJSON>;
}
```

### ComparisonResult

```tsx
interface ComparisonResult {
  totalChanges: number;
  insertions: number;
  deletions: number;
  formatChanges: number;
  structuralChanges: number;          // New: count of structural changes
  summary: string[];
  mergedJson: ProseMirrorJSON;
  structuralChangeInfos: StructuralChangeInfo[];  // New: metadata for pane
}
```

### DocumentInfo

```tsx
interface DocumentInfo {
  // Metadata
  documentGuid: string | null;
  isModified: boolean;
  version: number | null;
  // Statistics
  words: number;
  characters: number;
  paragraphs: number;
  pages: number;
}
```

### DocumentProperties

```tsx
interface DocumentProperties {
  title?: string;
  author?: string;
  subject?: string;
  description?: string;
  keywords?: string;
  category?: string;
  lastModifiedBy?: string;
  revision?: string;
  created?: Date;
  modified?: Date;
}
```

## Getting LLM Context

Extract enriched changes with semantic context for AI/LLM processing:

```tsx
const context = editorRef.current?.getEnrichedChangesContext();

// Example: Send to your LLM API
await fetch('/api/summarize', {
  method: 'POST',
  body: JSON.stringify({ changes: context }),
});

// Returns array of EnrichedChange:
// {
//   type: 'replacement',
//   oldText: 'world',
//   newText: 'universe',
//   location: {
//     nodeType: 'paragraph',
//     sectionTitle: 'Introduction',
//     description: '"Introduction" section'
//   },
//   surroundingText: 'Hello world, welcome to...'
// }
```

## Document Properties

Read and update document metadata (stored in `docProps/core.xml`):

```tsx
// Get current properties
const props = await editorRef.current?.getProperties();
if (props) {
  console.log(`Title: ${props.title}`);
  console.log(`Author: ${props.author}`);
  console.log(`Created: ${props.created?.toLocaleDateString()}`);
  console.log(`Modified: ${props.modified?.toLocaleDateString()}`);
}

// Update properties (partial update - only specified fields are changed)
await editorRef.current?.setProperties({
  title: 'Quarterly Report Q4 2026',
  author: 'Jane Smith',
  subject: 'Financial Summary',
  keywords: 'report, quarterly, finance, 2026',
  modified: new Date(),
});
```

## Parsing HTML to JSON

Convert HTML strings to ProseMirror JSON without visible rendering. **Inline styles are preserved!**

```tsx
// Using the ref method (requires editor to be initialized)
const json = await editorRef.current?.parseHtml('<h1>Title</h1><p>Content here</p>');
console.log(json); // { type: 'doc', content: [...] }

// Lists work correctly - numbering definitions are synced to the main document
const listJson = await editorRef.current?.parseHtml(
  '<ul><li>Item 1</li><li>Item 2</li></ul>'
);

// Inline styles are converted to marks
const styledJson = await editorRef.current?.parseHtml(
  '<p><span style="color: red; font-weight: bold;">styled text</span></p>'
);
// Result: text with textStyle mark (color) and bold mark

// Use with other methods
await editorRef.current?.updateContent(json);

// Or use the standalone function (requires SuperDoc class)
import { parseHtmlToJson } from 'docx-diff-editor';
const json = await parseHtmlToJson(htmlString, SuperDocClass);
```

### Linked Parsing for Lists

When the main editor is ready, `parseHtml()` automatically uses a **linked child editor** approach. This ensures that list numbering definitions (for `<ol>` and `<ul>` elements) are synced to the main document's numbering store.

This prevents crashes when parsed content with lists is later spliced into the main document and rendered via `compareWith()`.

If the main editor isn't ready yet, the method falls back to an isolated SuperDoc instance.

### Supported Inline Styles

| CSS Property | ProseMirror Mark |
|--------------|------------------|
| `color` | `textStyle.color` |
| `font-size` | `textStyle.fontSize` |
| `font-family` | `textStyle.fontFamily` |
| `font-weight: bold` | `bold` |
| `font-style: italic` | `italic` |
| `text-decoration: underline` | `underline` |
| `text-decoration: line-through` | `strike` |
| `background-color` | `highlight.color` |

## Customization

### CSS Variables

Override CSS variables to customize colors:

```css
:root {
  --dde-primary-color: #6366F1;
  --dde-insert-color: #22C55E;
  --dde-delete-color: #F43F5E;
  --dde-format-color: #F59E0B;
}
```

### Available Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `--dde-primary-color` | `#007ACC` | Primary/accent color |
| `--dde-insert-color` | `#10B981` | Insertion highlight color |
| `--dde-delete-color` | `#EF4444` | Deletion highlight color |
| `--dde-format-color` | `#F59E0B` | Format change highlight |
| `--dde-text-color` | `#374151` | Main text color |
| `--dde-bg-color` | `#FFFFFF` | Background color |
| `--dde-border-color` | `#E5E7EB` | Border color |

## Track Changes

The component supports three types of track changes:

| Type | Visual | Description |
|------|--------|-------------|
| **Insert** | Green underline | New text added |
| **Delete** | Red strikethrough | Text removed |
| **Format** | Gold highlight | Formatting changed |

## Structural Changes Pane

When comparing documents with structural differences (tables, lists, images), a floating pane appears showing these changes with Accept/Reject controls.

### How It Works

The component uses a **structure-aware merge** approach:

1. **Block alignment**: Documents are aligned at the block level (paragraphs, tables, lists) using content fingerprinting
2. **Recursive merge**: Tables and lists are merged recursively (row-by-row, item-by-item)
3. **Character-level diff**: Within matched blocks, character-level diffing is applied
4. **Insert/delete marking**: New blocks get `trackInsert` marks; deleted blocks are preserved with `trackDelete` marks
5. **Shared IDs**: Each structural change has a unique ID linking the track marks to the pane entry

This means inserted tables, paragraphs, and list items actually appear in the editor (with green highlighting), and deleted content remains visible (with red strikethrough) until you accept or reject the changes.

### What's Detected

| Change Type | Description |
|-------------|-------------|
| **Table Rows** | Inserted or deleted rows |
| **Table Columns** | Added or removed columns |
| **List Items** | New or removed list items (including nested) |
| **Paragraphs** | Entire paragraphs added or deleted |
| **Images** | New or removed images |

### Pane Features

- **Floating Position**: Configurable position (`top-right`, `bottom-right`, `top-left`, `bottom-left`)
- **Collapsible**: Click header to minimize to just the title bar
- **Accept/Reject**: Per-change or bulk actions
- **Counter Badge**: Shows remaining changes
- **Auto-Hide**: Disappears when all changes are resolved
- **Bubble Sync**: Stays in sync when changes are accepted via SuperDoc's bubbles

### Configuration

```tsx
<DocxDiffEditor
  ref={editorRef}
  structuralPanePosition="bottom-right"  // Position of the pane
  structuralPaneCollapsed={false}         // Start expanded
  hideStructuralPane={false}              // Show the pane
/>
```

### Accessing Structural Changes Programmatically

```tsx
const result = await editorRef.current?.compareWith(newDocument);

// Get structural change count
console.log(`${result.structuralChanges} structural changes detected`);

// Access detailed info
result.structuralChangeInfos.forEach(change => {
  console.log(`${change.type}: ${change.location} - ${change.preview}`);
});
```

## License

Apache 2.0

