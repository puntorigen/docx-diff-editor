/**
 * DocxDiffEditor - React component for DOCX comparison with track changes
 *
 * @packageDocumentation
 */

// Main component
export { DocxDiffEditor, default } from './DocxDiffEditor';

// Sub-components
export { StructuralChangesPane } from './components';

// Types
export type {
  // Component types
  DocxDiffEditorProps,
  DocxDiffEditorRef,
  DocxContent,
  ComparisonResult,
  StructuralPanePosition,

  // ProseMirror types
  ProseMirrorJSON,
  ProseMirrorMark,
  ProseMirrorNode,

  // Diff types
  DiffSegment,
  DiffResult,
  FormatChange,

  // Block-level diff types
  StructuralChange,
  StructuralChangeType,
  StructuralChangeInfo,
  AttributeChange,
  AttrDiff,
  HybridDiffResult,
  NodeMatch,
  FingerprintedNode,

  // Enriched change types (for LLM)
  EnrichedChange,
  ChangeLocation,
  FormatDetails,

  // Author type
  TrackChangeAuthor,

  // Document info type
  DocumentInfo,

  // Document properties type
  DocumentProperties,
} from './types';

// Services (for advanced usage)
export {
  // Content detection & parsing
  detectContentType,
  parseDocxFile,
  parseHtmlToJson,
  isProseMirrorJSON,

  // Diffing
  diffDocuments,

  // Merging
  mergeDocuments,

  // Track change marks
  createTrackInsertMark,
  createTrackDeleteMark,
  createTrackFormatMark,

  // Change extraction
  extractEnrichedChanges,
  extractEnrichedChangesWithStructural,

  // Block-level diffing
  generateFingerprint,
  alignDocuments,
  processStructuralChanges,
  generateStructuralChangeSummary,

  // Table diffing
  diffTables,
  isTable,

  // List diffing
  diffLists,
  isList,

  // Image/non-text diffing
  diffImages,
  isImage,
  isAtomicNode,
} from './services';

// Constants (for customization)
export { DEFAULT_AUTHOR, DEFAULT_SUPERDOC_USER, CSS_PREFIX } from './constants';

// Template utilities (optional - for users who want custom templates)
export { getBlankTemplateFile, getBlankTemplateBlob, isValidDocxFile } from './blankTemplate';
