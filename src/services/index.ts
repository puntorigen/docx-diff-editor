/**
 * Services barrel export
 */

export {
  detectContentType,
  parseDocxFile,
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

export { extractEnrichedChanges } from './changeContextExtractor';
