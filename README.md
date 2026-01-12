# docx-diff-editor

A React component for DOCX document comparison with track changes visualization. Built on top of SuperDoc.

## Features

- 📄 Compare two DOCX documents side by side
- 🔍 Character-level diff with track changes
- ✅ Accept/reject individual changes
- 🎨 Visual track changes (insert, delete, format)
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

### Ref Methods

```tsx
interface DocxDiffEditorRef {
  // Set the source/base document
  setSource(content: DocxContent): Promise<void>;

  // Compare and show track changes
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
}
```

### ComparisonResult

```tsx
interface ComparisonResult {
  totalChanges: number;
  insertions: number;
  deletions: number;
  formatChanges: number;
  summary: string[];
  mergedJson: ProseMirrorJSON;
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

## License

Apache 2.0

