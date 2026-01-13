/**
 * Services barrel export
 */

export {
  detectContentType,
  parseDocxFile,
  parseHtmlToJson,
  isProseMirrorJSON,
} from './contentResolver';

export { diffDocuments } from './documentDiffer';

export { mergeDocuments, createSimpleMergedDocument } from './mergeDocuments';

export {
  createTrackInsertMark,
  createTrackDeleteMark,
  createTrackFormatMark,
  addMarkToTextNode,
  createTextNode,
  markAllAsDeleted,
  markAllAsInserted,
  cloneNode,
} from './trackChangeInjector';

export {
  extractEnrichedChanges,
  extractEnrichedChangesWithStructural,
} from './changeContextExtractor';

// Block-level diffing services
export {
  generateFingerprint,
  buildFingerprintTree,
  extractBlockFingerprints,
  calculateSimilarity,
  calculateTextSimilarity,
  getNodeTextSimilarity,
} from './nodeFingerprint';

export {
  alignNodes,
  alignDocuments,
  alignChildren,
  alignTableRows,
  alignTableCells,
  alignListItems,
} from './nodeAligner';

export type { AlignmentResult } from './nodeAligner';

export {
  compareAttrs,
  compareNodeAttrs,
  hasAttrChanges,
  formatAttrDiffs,
  summarizeAttrChanges,
} from './attrComparer';

export {
  diffTables,
  isTable,
  isTableRow,
  isTableCell,
  getTableLocation,
  getRowLocation,
  getCellLocation,
  getRowPreview,
} from './tableBlockDiffer';

export type { TableDiffResult } from './tableBlockDiffer';

export {
  diffLists,
  isList,
  isListItem,
  getListType,
  getListLocation,
  getListItemLocation,
  getListItemPreview,
  countListItems,
} from './listBlockDiffer';

export type { ListDiffResult } from './listBlockDiffer';

export {
  isImage,
  isHorizontalRule,
  isHardBreak,
  isPageBreak,
  isEmbedded,
  isAtomicNode,
  getImageIdentifier,
  imagesMatch,
  findImages,
  diffImages,
  getImageLocation,
  getImagePreview,
  getAtomicNodePreview,
} from './nonTextNodeDiffer';

export {
  processStructuralChanges,
  buildMergedDocumentWithStructuralChanges,
  generateStructuralChangeSummary,
} from './blockLevelMerger';

export type { BlockMergeResult } from './blockLevelMerger';

// Structural merger (Phase 6b - structure-aware merge)
export { mergeWithStructuralAwareness } from './structuralMerger';

export type { StructuralMergeResult } from './structuralMerger';
