/**
 * Constants for DocxDiffEditor
 */

import type { TrackChangeAuthor } from './types';

/**
 * Default author for track changes
 */
export const DEFAULT_AUTHOR: TrackChangeAuthor = {
  name: 'DocxDiff Editor',
  email: 'editor@docxdiff.local',
};

/**
 * Default SuperDoc user (used for editor initialization)
 */
export const DEFAULT_SUPERDOC_USER = {
  name: 'DocxDiff User',
  email: 'user@docxdiff.local',
};

/**
 * Permissions allowed for track change resolution
 */
export const TRACK_CHANGE_PERMISSIONS = [
  'RESOLVE_OWN',
  'RESOLVE_OTHER',
  'REJECT_OWN',
  'REJECT_OTHER',
];

/**
 * CSS class prefix for all component styles
 */
export const CSS_PREFIX = 'dde';

/**
 * Timeouts
 */
export const TIMEOUTS = {
  /** Timeout for document parsing (ms) */
  PARSE_TIMEOUT: 30000,
  /** Small delay for React settling (ms) */
  INIT_DELAY: 100,
  /** Cleanup delay (ms) */
  CLEANUP_DELAY: 100,
};

