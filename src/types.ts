/**
 * Type definitions for DocxDiffEditor
 */

// ============================================================================
// ProseMirror Types
// ============================================================================

/**
 * ProseMirror JSON document structure
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ProseMirrorJSON = any;

/**
 * ProseMirror mark (bold, italic, trackInsert, etc.)
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ProseMirrorMark = any;

/**
 * ProseMirror node
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ProseMirrorNode = any;

/**
 * SuperDoc instance
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SuperDocInstance = any;

// ============================================================================
// Content Types
// ============================================================================

/**
 * Content that can be set as source or compared against.
 * - File: DOCX file object
 * - string: HTML content
 * - ProseMirrorJSON: Direct JSON structure
 */
export type DocxContent = File | ProseMirrorJSON | string;

/**
 * Result of content resolution (converting any input to JSON)
 */
export interface ResolvedContent {
  json: ProseMirrorJSON;
  type: 'file' | 'html' | 'json';
}

// ============================================================================
// Diff Types
// ============================================================================

/**
 * A segment from the diff algorithm
 */
export interface DiffSegment {
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
export interface FormatChange {
  from: number;
  to: number;
  text: string;
  before: ProseMirrorMark[];
  after: ProseMirrorMark[];
}

/**
 * Result of diffing two documents
 */
export interface DiffResult {
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

// ============================================================================
// Block-Level Diff Types
// ============================================================================

/**
 * Type of structural change
 */
export type StructuralChangeType =
  | 'rowInsert'
  | 'rowDelete'
  | 'columnInsert'
  | 'columnDelete'
  | 'paragraphInsert'
  | 'paragraphDelete'
  | 'listItemInsert'
  | 'listItemDelete'
  | 'imageInsert'
  | 'imageDelete'
  | 'attrChange';

/**
 * A structural change (node added/removed/moved)
 */
export interface StructuralChange {
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
export interface AttrDiff {
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
export interface AttributeChange {
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
export interface NodeMatch {
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
export interface FingerprintedNode {
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
export interface HybridDiffResult extends DiffResult {
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
export interface StructuralChangeInfo {
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

// ============================================================================
// Error Types
// ============================================================================

/**
 * Operation types that can fail
 */
export type EditorOperation = 'setSource' | 'compareWith' | 'parseHtml' | 'export' | 'init';

/**
 * Phase of compareWith where failure occurred
 */
export type ComparisonPhase = 'parsing' | 'diffing' | 'merging' | 'applying';

/**
 * Enhanced error information passed to onError callback.
 * Provides context about whether the error is recoverable and what operation failed.
 */
export interface EditorError {
  /** The underlying Error object */
  error: Error;
  /** Error classification: 'fatal' means editor is unusable, 'operation' means editor is still functional */
  type: 'fatal' | 'operation';
  /** Which operation failed */
  operation?: EditorOperation;
  /** Whether the editor is still usable after this error */
  recoverable: boolean;
  /** Human-readable error message */
  message: string;
  /** For compareWith: which phase failed */
  phase?: ComparisonPhase;
}

// ============================================================================
// Comparison Result Types
// ============================================================================

/**
 * Successful result returned after comparing two documents
 */
export interface ComparisonResult {
  /** Indicates successful comparison */
  success: true;
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
  /** 
   * True if comparison fell back to direct content update (without track bubbles).
   * This happens when SuperDoc's internal plugins crash on certain content structures
   * (e.g., ordered lists with missing numbering definitions).
   * The content is still applied correctly, but track change visualization is unavailable.
   */
  usedFallback?: boolean;
}

/**
 * Failed comparison result.
 * Returned when compareWith fails but the editor is still functional.
 */
export interface ComparisonError {
  /** Indicates failed comparison */
  success: false;
  /** The underlying error */
  error: Error;
  /** Human-readable error message */
  message: string;
  /** Which phase of comparison failed */
  phase: ComparisonPhase;
}

/**
 * Union type for compareWith return value.
 * Check the `success` field to determine which type you have.
 */
export type CompareWithResult = ComparisonResult | ComparisonError;

// ============================================================================
// Enriched Change Types (for LLM context)
// ============================================================================

/**
 * Location context for a change
 */
export interface ChangeLocation {
  nodeType: 'heading' | 'paragraph' | 'listItem' | 'tableCell' | 'table' | 'image' | 'unknown';
  headingLevel?: number;
  paragraphIndex?: number;
  sectionTitle?: string;
  description: string;
  /** Table coordinates (for table-related changes) */
  tableCoords?: { row: number; column: number };
  /** List item index */
  listIndex?: number;
  /** List nesting depth */
  listDepth?: number;
}

/**
 * Format change details
 */
export interface FormatDetails {
  added: string[];
  removed: string[];
}

/**
 * Enriched change with full context for LLM processing
 */
export interface EnrichedChange {
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
  tablePosition?: { row: number; column: number };
  /** List position (for list-related changes) */
  listPosition?: { index: number; depth: number };
}

// ============================================================================
// Track Change Author
// ============================================================================

/**
 * Author information for track changes
 */
export interface TrackChangeAuthor {
  name: string;
  email: string;
}

// ============================================================================
// Document Properties Types
// ============================================================================

/**
 * Document core properties (stored in docProps/core.xml)
 */
export interface DocumentProperties {
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

// ============================================================================
// Document Info Types
// ============================================================================

/**
 * Combined document metadata and statistics
 */
export interface DocumentInfo {
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

// ============================================================================
// Component Props & Ref Types
// ============================================================================

/**
 * Position of the structural changes pane
 */
export type StructuralPanePosition = 'top-right' | 'bottom-right' | 'top-left' | 'bottom-left';

/**
 * Props for DocxDiffEditor component
 */
export interface DocxDiffEditorProps {
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

  /**
   * Callback on errors.
   * 
   * The EditorError object provides context about the error:
   * - `type: 'fatal'` - Editor is unusable (overlay will be shown)
   * - `type: 'operation'` - Operation failed but editor is still functional
   * 
   * For operation errors, the editor remains visible and usable.
   * You can use this callback to show a modal or toast notification.
   */
  onError?: (error: EditorError) => void;

  /** Container className */
  className?: string;

  /** Toolbar container className */
  toolbarClassName?: string;

  /** Editor container className */
  editorClassName?: string;

  // -------------------------------------------------------------------------
  // Structural Changes Pane Options
  // -------------------------------------------------------------------------

  /** Position of structural changes pane (default: 'bottom-right') */
  structuralPanePosition?: StructuralPanePosition;

  /** Start with pane collapsed (default: false) */
  structuralPaneCollapsed?: boolean;

  /** Hide structural changes pane entirely (default: false) */
  hideStructuralPane?: boolean;
}

/**
 * Error result for setSource operation
 */
export interface SetSourceError {
  /** Indicates failure */
  success: false;
  /** The underlying error */
  error: Error;
  /** Human-readable error message */
  message: string;
}

/**
 * Ref methods exposed by DocxDiffEditor
 */
export interface DocxDiffEditorRef {
  /**
   * Set the source/base document (destroys and recreates SuperDoc instance).
   * 
   * On failure, returns an error object instead of throwing. The editor
   * will attempt to restore the previous state if possible.
   */
  setSource(content: DocxContent): Promise<void | SetSourceError>;

  /** Update content in the existing editor without recreating SuperDoc instance */
  updateContent(json: ProseMirrorJSON): void;

  /**
   * Compare source with new content, show track changes.
   * 
   * Returns a union type - check `result.success` to determine outcome:
   * - `success: true` - Comparison succeeded, access result fields
   * - `success: false` - Comparison failed, editor unchanged, check error
   * 
   * On failure, the editor is preserved in its previous state.
   */
  compareWith(content: DocxContent): Promise<CompareWithResult>;

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

// ============================================================================
// Internal Types
// ============================================================================

/**
 * Text span with position and marks (used in diffing)
 */
export interface TextSpan {
  text: string;
  from: number;
  to: number;
  marks: ProseMirrorMark[];
}

/**
 * Text span with node reference (used in merging)
 */
export interface TextSpanWithNode {
  text: string;
  startOffset: number;
  node: ProseMirrorNode;
  path: number[];
}

/**
 * Traversal context for change extraction
 */
export interface TraversalContext {
  currentSection: string | null;
  currentParagraphText: string;
  currentNodeType: string;
  headingLevel?: number;
}

