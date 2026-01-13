import * as react from 'react';
import react__default from 'react';

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
    /** Position in docA where this segment starts (for equal/delete segments) */
    posA?: number;
    /** Position in docB where this segment starts (for equal/insert segments) */
    posB?: number;
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
    /** Text spans from docB with marks (for mark preservation during merge) */
    spansB?: TextSpan[];
}
/**
 * Type of structural change
 */
type StructuralChangeType = 'rowInsert' | 'rowDelete' | 'columnInsert' | 'columnDelete' | 'paragraphInsert' | 'paragraphDelete' | 'listItemInsert' | 'listItemDelete' | 'imageInsert' | 'imageDelete' | 'attrChange';
/**
 * A structural change (node added/removed/moved)
 */
interface StructuralChange {
    /** Unique ID shared across all marks in this structural change */
    id: string;
    /** Type of structural change */
    type: StructuralChangeType;
    /** The node type affected (e.g., 'tableRow', 'paragraph', 'listItem') */
    nodeType: string;
    /** Path to the node in the document tree */
    path: number[];
    /** The affected node */
    node: ProseMirrorJSON;
    /** For moves: original path */
    fromPath?: number[];
    /** For moves: new path */
    toPath?: number[];
}
/**
 * Single attribute difference
 */
interface AttrDiff {
    /** Attribute key (e.g., "borders.top.color") */
    key: string;
    /** Value before the change */
    before: unknown;
    /** Value after the change */
    after: unknown;
}
/**
 * An attribute change on a matched node
 */
interface AttributeChange {
    /** Unique ID for this attribute change */
    id: string;
    /** The node type affected */
    nodeType: string;
    /** Path in original document */
    pathA: number[];
    /** Path in new document */
    pathB: number[];
    /** List of attribute differences */
    changes: AttrDiff[];
}
/**
 * Record of matched nodes between documents
 */
interface NodeMatch {
    /** Path in original document */
    pathA: number[];
    /** Path in new document */
    pathB: number[];
    /** Fingerprint used for matching */
    fingerprint: string;
    /** Similarity score (0.0 - 1.0) */
    similarity: number;
}
/**
 * Node with computed fingerprint (used in alignment)
 */
interface FingerprintedNode {
    /** The original node */
    node: ProseMirrorJSON;
    /** Content-based fingerprint */
    fingerprint: string;
    /** Path in the document tree */
    path: number[];
    /** Child fingerprinted nodes */
    children?: FingerprintedNode[];
}
/**
 * Extended diff result with structural awareness
 */
interface HybridDiffResult extends DiffResult {
    /** Structural changes (rows, paragraphs, list items added/removed) */
    structuralChanges: StructuralChange[];
    /** Attribute changes on matched nodes */
    attributeChanges: AttributeChange[];
    /** Node matching information (for debugging) */
    nodeMatches: NodeMatch[];
}
/**
 * Metadata for the Structural Changes Pane
 * Generated during merge, stored in component state
 */
interface StructuralChangeInfo {
    /** Shared ID across all marks in this structural change */
    id: string;
    /** Type of structural change */
    type: StructuralChangeType;
    /** The node type affected */
    nodeType: string;
    /** Human-readable location (e.g., "Table 1, Row 3") */
    location: string;
    /** Truncated content preview */
    preview: string;
    /** Author of the change */
    author: TrackChangeAuthor;
    /** ISO timestamp */
    date: string;
    /** For attribute changes, the specific diffs */
    attrChanges?: AttrDiff[];
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
    /** Number of structural changes (rows, paragraphs, etc.) */
    structuralChanges: number;
    /** Human-readable summary strings */
    summary: string[];
    /** The merged JSON document with track changes */
    mergedJson: ProseMirrorJSON;
    /** Metadata for structural changes (for the pane) */
    structuralChangeInfos: StructuralChangeInfo[];
}
/**
 * Location context for a change
 */
interface ChangeLocation {
    nodeType: 'heading' | 'paragraph' | 'listItem' | 'tableCell' | 'table' | 'image' | 'unknown';
    headingLevel?: number;
    paragraphIndex?: number;
    sectionTitle?: string;
    description: string;
    /** Table coordinates (for table-related changes) */
    tableCoords?: {
        row: number;
        column: number;
    };
    /** List item index */
    listIndex?: number;
    /** List nesting depth */
    listDepth?: number;
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
    /** Structural change type (for block-level changes) */
    structuralType?: StructuralChangeType;
    /** Attribute changes (for attribute-only changes) */
    attributeChanges?: AttrDiff[];
    /** Table position (for table-related changes) */
    tablePosition?: {
        row: number;
        column: number;
    };
    /** List position (for list-related changes) */
    listPosition?: {
        index: number;
        depth: number;
    };
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
 * Position of the structural changes pane
 */
type StructuralPanePosition = 'top-right' | 'bottom-right' | 'top-left' | 'bottom-left';
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
    /** Position of structural changes pane (default: 'bottom-right') */
    structuralPanePosition?: StructuralPanePosition;
    /** Start with pane collapsed (default: false) */
    structuralPaneCollapsed?: boolean;
    /** Hide structural changes pane entirely (default: false) */
    hideStructuralPane?: boolean;
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
    /** Parse HTML string to ProseMirror JSON (uses hidden SuperDoc instance) */
    parseHtml(html: string): Promise<ProseMirrorJSON>;
}
/**
 * Text span with position and marks (used in diffing)
 */
interface TextSpan {
    text: string;
    from: number;
    to: number;
    marks: ProseMirrorMark[];
}

/**
 * DocxDiffEditor Component
 */
declare const DocxDiffEditor: react.ForwardRefExoticComponent<DocxDiffEditorProps & react.RefAttributes<DocxDiffEditorRef>>;

/**
 * Structural Changes Pane Component
 *
 * A floating, collapsible panel that displays structural changes
 * (table rows, list items, images, etc.) with Accept/Reject controls.
 *
 * Uses SuperDoc's acceptTrackedChangeById/rejectTrackedChangeById commands
 * to handle accept/reject actions.
 */

interface StructuralChangesPaneProps {
    /** Array of structural changes to display */
    changes: StructuralChangeInfo[];
    /** Position of the pane */
    position?: StructuralPanePosition;
    /** Start collapsed? */
    initiallyCollapsed?: boolean;
    /** Callback when a change is accepted */
    onAccept: (changeId: string) => void;
    /** Callback when a change is rejected */
    onReject: (changeId: string) => void;
    /** Callback when Accept All is clicked */
    onAcceptAll: () => void;
    /** Callback when Reject All is clicked */
    onRejectAll: () => void;
    /** Callback when a change is clicked (for navigation) */
    onNavigate?: (changeId: string) => void;
    /** Callback when pane is dismissed */
    onDismiss?: () => void;
}
declare const StructuralChangesPane: react__default.FC<StructuralChangesPaneProps>;

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
 * Parse an HTML string into ProseMirror JSON using a hidden SuperDoc instance.
 *
 * IMPORTANT: Uses the "paste" approach instead of the "import" approach.
 * SuperDoc's import path (via `html` option) calls `stripHtmlStyles()` which
 * removes all CSS styles except `text-align`. The paste path (via `view.pasteHTML()`)
 * preserves inline styles like color, font-size, font-family, font-weight, etc.
 *
 * Flow:
 * 1. Create SuperDoc with empty HTML document
 * 2. Wait for editor to be ready
 * 3. Select all content and delete it (start fresh)
 * 4. Use editor.view.pasteHTML(html) - this uses the paste path which preserves styles
 * 5. Return the resulting JSON
 *
 * Falls back to the standard import approach if paste fails.
 */
declare function parseHtmlToJson(html: string, SuperDoc: SuperDocConstructor): Promise<ProseMirrorJSON>;
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
 *
 * Now also tracks positions in both documents for mark preservation:
 * - posA: position in docA (for equal/delete segments)
 * - posB: position in docB (for equal/insert segments)
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
 *
 * Note: SuperDoc's parseFormatList requires all marks in before/after arrays
 * to have both `type` and `attrs` properties. Marks without `attrs` get filtered out,
 * causing empty values in track change bubbles. We normalize marks here to ensure
 * all have at least an empty `attrs` object.
 */
declare function createTrackFormatMark(before: ProseMirrorMark[], after: ProseMirrorMark[], author?: TrackChangeAuthor): ProseMirrorMark;

/**
 * Change Context Extractor
 * Extracts enriched changes with semantic context from merged document.
 * Provides surrounding text so the LLM can understand what the change is about.
 *
 * Updated to include structural change information (tables, lists, images).
 */

/**
 * Main entry point - extract enriched changes from merged document
 */
declare function extractEnrichedChanges(mergedJson: ProseMirrorJSON): EnrichedChange[];
/**
 * Extract enriched changes with structural change infos included.
 * This merges inline text changes with structural change metadata.
 */
declare function extractEnrichedChangesWithStructural(mergedJson: ProseMirrorJSON, structuralInfos: StructuralChangeInfo[]): EnrichedChange[];

/**
 * Node Fingerprint Service
 *
 * Generates content-based fingerprints for ProseMirror nodes.
 * Fingerprints are used to match nodes between documents during diffing.
 *
 * Key principle: Two nodes with the same content (ignoring styles/attrs)
 * should produce the same or similar fingerprints.
 */

/**
 * Generate a fingerprint for a single node.
 *
 * Fingerprint format by node type:
 * - text: "t:{hash}"
 * - paragraph: "p:{hash}"
 * - heading: "h{level}:{hash}"
 * - table: "table:{rowCount}:{hash}"
 * - tableRow: "tr:{cellCount}:{hash}"
 * - tableCell: "tc:{hash}"
 * - listItem: "li:{hash}"
 * - image: "img:{srcHash}"
 * - hardBreak: "br"
 * - horizontalRule: "hr"
 * - other: "{type}:{hash}"
 */
declare function generateFingerprint(node: ProseMirrorJSON): string;

/**
 * Node Aligner Service
 *
 * Aligns nodes between two documents using fingerprints and LCS algorithm.
 * Produces matched pairs, insertions, and deletions.
 */

/**
 * Result of aligning two node sequences
 */
interface AlignmentResult {
    /** Nodes that match between documents */
    matched: NodeMatch[];
    /** Nodes only in document A (deleted) */
    deletions: FingerprintedNode[];
    /** Nodes only in document B (inserted) */
    insertions: FingerprintedNode[];
}
/**
 * Align top-level blocks between two documents.
 */
declare function alignDocuments(docA: ProseMirrorJSON, docB: ProseMirrorJSON): AlignmentResult;

/**
 * Table Block Differ Service
 *
 * Specialized diffing logic for tables:
 * - Row insertions/deletions
 * - Column insertions/deletions
 * - Cell-level content changes
 * - Table/cell attribute changes
 */

/**
 * Result of diffing two tables
 */
interface TableDiffResult {
    /** Row-level structural changes */
    rowChanges: StructuralChange[];
    /** Column-level structural changes (detected from cell patterns) */
    columnChanges: StructuralChange[];
    /** Cell-level matches for content diffing */
    cellMatches: NodeMatch[];
    /** Attribute changes on the table itself */
    tableAttrChanges: AttributeChange | null;
    /** Attribute changes on cells */
    cellAttrChanges: AttributeChange[];
}
/**
 * Diff two tables and return all detected changes.
 */
declare function diffTables(tableA: ProseMirrorJSON, tableB: ProseMirrorJSON, tablePathA: number[], tablePathB: number[]): TableDiffResult;
/**
 * Check if a node is a table.
 */
declare function isTable(node: ProseMirrorJSON): boolean;

/**
 * List Block Differ Service
 *
 * Specialized diffing logic for lists:
 * - List item insertions/deletions
 * - List item reordering detection
 * - Nested list handling
 */

/**
 * Result of diffing two lists
 */
interface ListDiffResult {
    /** Item-level structural changes */
    itemChanges: StructuralChange[];
    /** Item matches for content diffing */
    itemMatches: NodeMatch[];
    /** Nested list changes (recursive) */
    nestedChanges: ListDiffResult[];
}
/**
 * Check if a node is a list (ordered or unordered).
 */
declare function isList(node: ProseMirrorJSON): boolean;
/**
 * Diff two lists and return all detected changes.
 */
declare function diffLists(listA: ProseMirrorJSON, listB: ProseMirrorJSON, listPathA: number[], listPathB: number[], depth?: number): ListDiffResult;

/**
 * Non-Text Node Differ Service
 *
 * Handles diffing of atomic non-text nodes:
 * - Images
 * - Horizontal rules
 * - Page breaks
 * - Embedded objects (equations, etc.)
 */

/**
 * Check if a node is an image.
 */
declare function isImage(node: ProseMirrorJSON): boolean;
/**
 * Check if a node is an atomic (non-text, leaf) node.
 */
declare function isAtomicNode(node: ProseMirrorJSON): boolean;
/**
 * Diff images between two documents.
 */
declare function diffImages(docA: ProseMirrorJSON, docB: ProseMirrorJSON): {
    inserted: StructuralChange[];
    deleted: StructuralChange[];
};

/**
 * Block Level Merger Service
 *
 * Handles merging of structural changes (tables, lists, images)
 * with shared IDs for all marks within a structural change.
 *
 * This allows the Structural Changes Pane to accept/reject
 * entire structural units (e.g., a whole table row) with a single action.
 */

/**
 * Process structural changes and generate marked blocks with shared IDs.
 */
declare function processStructuralChanges(docA: ProseMirrorNode, docB: ProseMirrorNode, author?: TrackChangeAuthor): {
    changes: StructuralChange[];
    infos: StructuralChangeInfo[];
};
/**
 * Generate a summary of structural changes.
 */
declare function generateStructuralChangeSummary(infos: StructuralChangeInfo[]): string[];

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

export { type AttrDiff, type AttributeChange, CSS_PREFIX, type ChangeLocation, type ComparisonResult, DEFAULT_AUTHOR, DEFAULT_SUPERDOC_USER, type DiffResult, type DiffSegment, type DocumentInfo, type DocumentProperties, type DocxContent, DocxDiffEditor, type DocxDiffEditorProps, type DocxDiffEditorRef, type EnrichedChange, type FingerprintedNode, type FormatChange, type FormatDetails, type HybridDiffResult, type NodeMatch, type ProseMirrorJSON, type ProseMirrorMark, type ProseMirrorNode, type StructuralChange, type StructuralChangeInfo, type StructuralChangeType, StructuralChangesPane, type StructuralPanePosition, type TrackChangeAuthor, alignDocuments, createTrackDeleteMark, createTrackFormatMark, createTrackInsertMark, DocxDiffEditor as default, detectContentType, diffDocuments, diffImages, diffLists, diffTables, extractEnrichedChanges, extractEnrichedChangesWithStructural, generateFingerprint, generateStructuralChangeSummary, getBlankTemplateBlob, getBlankTemplateFile, isAtomicNode, isImage, isList, isProseMirrorJSON, isTable, isValidDocxFile, mergeDocuments, parseDocxFile, parseHtmlToJson, processStructuralChanges };
