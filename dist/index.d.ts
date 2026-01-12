import * as react from 'react';

/**
 * Type definitions for DocxDiffEditor
 */
/**
 * ProseMirror JSON document structure
 */
type ProseMirrorJSON = any;
/**
 * ProseMirror mark (bold, italic, trackInsert, etc.)
 */
type ProseMirrorMark = any;
/**
 * ProseMirror node
 */
type ProseMirrorNode = any;
/**
 * Content that can be set as source or compared against.
 * - File: DOCX file object
 * - string: HTML content
 * - ProseMirrorJSON: Direct JSON structure
 */
type DocxContent = File | ProseMirrorJSON | string;
/**
 * A segment from the diff algorithm
 */
interface DiffSegment {
    type: 'equal' | 'insert' | 'delete';
    text: string;
}
/**
 * A format change on unchanged text
 */
interface FormatChange {
    from: number;
    to: number;
    text: string;
    before: ProseMirrorMark[];
    after: ProseMirrorMark[];
}
/**
 * Result of diffing two documents
 */
interface DiffResult {
    /** Character-level diff segments */
    segments: DiffSegment[];
    /** Format changes on unchanged text */
    formatChanges: FormatChange[];
    /** Full text from original document */
    textA: string;
    /** Full text from new document */
    textB: string;
    /** Human-readable summary */
    summary: string[];
}
/**
 * Result returned after comparing two documents
 */
interface ComparisonResult {
    /** Total number of changes */
    totalChanges: number;
    /** Number of insertions */
    insertions: number;
    /** Number of deletions */
    deletions: number;
    /** Number of format changes */
    formatChanges: number;
    /** Human-readable summary strings */
    summary: string[];
    /** The merged JSON document with track changes */
    mergedJson: ProseMirrorJSON;
}
/**
 * Location context for a change
 */
interface ChangeLocation {
    nodeType: 'heading' | 'paragraph' | 'listItem' | 'tableCell' | 'unknown';
    headingLevel?: number;
    paragraphIndex?: number;
    sectionTitle?: string;
    description: string;
}
/**
 * Format change details
 */
interface FormatDetails {
    added: string[];
    removed: string[];
}
/**
 * Enriched change with full context for LLM processing
 */
interface EnrichedChange {
    type: 'insertion' | 'deletion' | 'replacement' | 'format';
    text?: string;
    oldText?: string;
    newText?: string;
    location: ChangeLocation;
    formatDetails?: FormatDetails;
    charCount?: number;
    /** The sentence or clause containing the change */
    surroundingText?: string;
}
/**
 * Author information for track changes
 */
interface TrackChangeAuthor {
    name: string;
    email: string;
}
/**
 * Document core properties (stored in docProps/core.xml)
 */
interface DocumentProperties {
    /** Document title (dc:title) */
    title?: string;
    /** Original author (dc:creator) */
    author?: string;
    /** Subject/topic (dc:subject) */
    subject?: string;
    /** Comments/description (dc:description) */
    description?: string;
    /** Keywords/tags (cp:keywords) */
    keywords?: string;
    /** Category (cp:category) */
    category?: string;
    /** Last modified by (cp:lastModifiedBy) */
    lastModifiedBy?: string;
    /** Revision number (cp:revision) */
    revision?: string;
    /** Creation date (dcterms:created) */
    created?: Date;
    /** Last modified date (dcterms:modified) */
    modified?: Date;
}
/**
 * Combined document metadata and statistics
 */
interface DocumentInfo {
    /** Document unique identifier */
    documentGuid: string | null;
    /** Whether the document has unsaved changes */
    isModified: boolean;
    /** Document version number */
    version: number | null;
    /** Word count */
    words: number;
    /** Character count */
    characters: number;
    /** Paragraph count */
    paragraphs: number;
    /** Page count */
    pages: number;
}
/**
 * Props for DocxDiffEditor component
 */
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
    author?: TrackChangeAuthor;
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
/**
 * Ref methods exposed by DocxDiffEditor
 */
interface DocxDiffEditorRef {
    /** Set the source/base document (destroys and recreates SuperDoc instance) */
    setSource(content: DocxContent): Promise<void>;
    /** Update content in the existing editor without recreating SuperDoc instance */
    updateContent(json: ProseMirrorJSON): void;
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
    /** Accept all track changes and return the clean document */
    acceptAllChanges(): Promise<ProseMirrorJSON>;
    /** Check if editor is ready */
    isReady(): boolean;
    /** Get the current page count from the presentation editor */
    getPages(): number;
    /** Get combined document metadata and statistics */
    getDocumentInfo(): DocumentInfo | null;
    /** Get document core properties (from docProps/core.xml) */
    getProperties(): Promise<DocumentProperties | null>;
    /** Set document core properties (partial update) */
    setProperties(properties: Partial<DocumentProperties>): Promise<boolean>;
}

/**
 * DocxDiffEditor Component
 */
declare const DocxDiffEditor: react.ForwardRefExoticComponent<DocxDiffEditorProps & react.RefAttributes<DocxDiffEditorRef>>;

/**
 * Content Resolver Service
 * Detects content type and parses DOCX files to ProseMirror JSON.
 *
 * Supports three input formats:
 * - File: DOCX file parsed by SuperDoc
 * - string: HTML content (handled directly by SuperDoc in the component)
 * - object: Direct ProseMirror JSON (passed through)
 */

type SuperDocConstructor = any;
/**
 * Detect the type of content provided
 */
declare function detectContentType(content: DocxContent): 'file' | 'html' | 'json';
/**
 * Validate that content looks like ProseMirror JSON
 */
declare function isProseMirrorJSON(content: unknown): boolean;
/**
 * Parse a DOCX File into ProseMirror JSON using a hidden SuperDoc instance.
 */
declare function parseDocxFile(file: File, SuperDoc: SuperDocConstructor): Promise<ProseMirrorJSON>;

/**
 * Document Differ Service
 * Diffs two ProseMirror JSON documents at the character level,
 * including text changes and formatting changes.
 */

/**
 * Diff two ProseMirror JSON documents at the character level.
 * Detects both text changes and formatting changes.
 */
declare function diffDocuments(docA: ProseMirrorJSON, docB: ProseMirrorJSON): DiffResult;

/**
 * Merge Documents Service
 * Applies track change marks to the original document structure
 * based on character-level diff segments.
 */

/**
 * Build a merged document by applying diff segments to the original structure.
 *
 * Strategy:
 * 1. Clone docA (original)
 * 2. Walk through diff segments
 * 3. For 'equal' segments: keep original content as-is
 * 4. For 'delete' segments: add trackDelete mark to the corresponding text
 * 5. For 'insert' segments: insert new text nodes with trackInsert mark
 */
declare function mergeDocuments(docA: ProseMirrorNode, docB: ProseMirrorNode, diffResult: DiffResult, author?: TrackChangeAuthor): ProseMirrorNode;

/**
 * Track Change Injector Service
 * Creates track change marks for insertions, deletions, and format changes.
 */

/**
 * Create a trackInsert mark.
 * @param author - The author of the change
 * @param id - Optional ID to use (for linking with corresponding delete in replacements)
 */
declare function createTrackInsertMark(author?: TrackChangeAuthor, id?: string): ProseMirrorMark;
/**
 * Create a trackDelete mark.
 * @param author - The author of the change
 * @param id - Optional ID to use (for linking with corresponding insert in replacements)
 */
declare function createTrackDeleteMark(author?: TrackChangeAuthor, id?: string): ProseMirrorMark;
/**
 * Create a trackFormat mark.
 */
declare function createTrackFormatMark(before: ProseMirrorMark[], after: ProseMirrorMark[], author?: TrackChangeAuthor): ProseMirrorMark;

/**
 * Change Context Extractor
 * Extracts enriched changes with semantic context from merged document.
 * Provides surrounding text so the LLM can understand what the change is about.
 */

/**
 * Main entry point - extract enriched changes from merged document
 */
declare function extractEnrichedChanges(mergedJson: ProseMirrorJSON): EnrichedChange[];

/**
 * Constants for DocxDiffEditor
 */

/**
 * Default author for track changes
 */
declare const DEFAULT_AUTHOR: TrackChangeAuthor;
/**
 * Default SuperDoc user (used for editor initialization)
 */
declare const DEFAULT_SUPERDOC_USER: {
    name: string;
    email: string;
};
/**
 * CSS class prefix for all component styles
 */
declare const CSS_PREFIX = "dde";

/**
 * Embedded DOCX template
 *
 * This is a base64-encoded blank DOCX file created with Microsoft Word.
 * It provides the complete schema, styles, themes, and fonts needed to
 * initialize SuperDoc when working with HTML or JSON content.
 *
 * The DOCX contains all standard Word document components:
 * - [Content_Types].xml
 * - _rels/.rels
 * - word/document.xml
 * - word/_rels/document.xml.rels
 * - word/styles.xml (full Word styles)
 * - word/settings.xml
 * - word/fontTable.xml
 * - word/webSettings.xml
 * - word/theme/theme1.xml
 * - docProps/core.xml
 * - docProps/app.xml
 */
/**
 * Get the blank DOCX template as a File object
 */
declare function getBlankTemplateFile(): File;
/**
 * Get the blank DOCX template as a Blob
 */
declare function getBlankTemplateBlob(): Blob;
/**
 * Check if a File is a valid DOCX file (basic check)
 */
declare function isValidDocxFile(file: File): boolean;

export { CSS_PREFIX, type ChangeLocation, type ComparisonResult, DEFAULT_AUTHOR, DEFAULT_SUPERDOC_USER, type DiffResult, type DiffSegment, type DocumentInfo, type DocumentProperties, type DocxContent, DocxDiffEditor, type DocxDiffEditorProps, type DocxDiffEditorRef, type EnrichedChange, type FormatChange, type FormatDetails, type ProseMirrorJSON, type ProseMirrorMark, type ProseMirrorNode, type TrackChangeAuthor, createTrackDeleteMark, createTrackFormatMark, createTrackInsertMark, DocxDiffEditor as default, detectContentType, diffDocuments, extractEnrichedChanges, getBlankTemplateBlob, getBlankTemplateFile, isProseMirrorJSON, isValidDocxFile, mergeDocuments, parseDocxFile };
