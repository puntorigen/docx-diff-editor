/**
 * DocxDiffEditor - React component for DOCX comparison with track changes
 *
 * @packageDocumentation
 */

// Main component
export { DocxDiffEditor, default } from './DocxDiffEditor';

// Types
export type {
  // Component types
  DocxDiffEditorProps,
  DocxDiffEditorRef,
  DocxContent,
  ComparisonResult,

  // ProseMirror types
  ProseMirrorJSON,
  ProseMirrorMark,
  ProseMirrorNode,

  // Diff types
  DiffSegment,
  DiffResult,
  FormatChange,

  // Enriched change types (for LLM)
  EnrichedChange,
  ChangeLocation,
  FormatDetails,

  // Author type
  TrackChangeAuthor,

  // Document info type
  DocumentInfo,
} from './types';

// Services (for advanced usage)
export {
  // Content detection
  detectContentType,
  parseDocxFile,
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
} from './services';

// Constants (for customization)
export { DEFAULT_AUTHOR, DEFAULT_SUPERDOC_USER, CSS_PREFIX } from './constants';

// Template utilities (optional - for users who want custom templates)
export { getBlankTemplateFile, getBlankTemplateBlob, isValidDocxFile } from './blankTemplate';
