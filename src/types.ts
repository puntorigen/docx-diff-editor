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
}

// ============================================================================
// Comparison Result Types
// ============================================================================

/**
 * Result returned after comparing two documents
 */
export interface ComparisonResult {
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

// ============================================================================
// Enriched Change Types (for LLM context)
// ============================================================================

/**
 * Location context for a change
 */
export interface ChangeLocation {
  nodeType: 'heading' | 'paragraph' | 'listItem' | 'tableCell' | 'unknown';
  headingLevel?: number;
  paragraphIndex?: number;
  sectionTitle?: string;
  description: string;
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
// Component Props & Ref Types
// ============================================================================

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
export interface DocxDiffEditorRef {
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

  /** Accept all track changes and return the clean document */
  acceptAllChanges(): Promise<ProseMirrorJSON>;

  /** Check if editor is ready */
  isReady(): boolean;
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

