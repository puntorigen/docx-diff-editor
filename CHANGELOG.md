# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.32] - 2026-01-09

### Changed

- Updated superdoc dependency from 1.2.1 to 1.3.0.

## [1.0.31] - 2026-01-09

### Added

- **`acceptAllChanges()` ref method**: New method to accept all track changes and return the clean document JSON. Useful for consolidating documents after review (e.g., for translation workflows).

### Improved

- **`acceptAllChanges()` robustness**: Now tries multiple SuperDoc API paths (`editor.commands`, `superdoc.commands`, `superdoc`) with a JSON walker fallback that manually removes deleted text and cleans track marks if no native method is available.

### Fixed

- **Replacement track changes now share the same ID**: When text is replaced (deleted and inserted at the same position), both the `trackDelete` and `trackInsert` marks now share the same ID. This matches the behavior expected by SuperDoc and Microsoft Word for proper replacement display in track change bubbles.

- **Skip format changes with undefined values**: Format changes where the "after" marks have only undefined/null attribute values are now skipped. This prevents track change bubbles from showing meaningless changes like "Changed font family from Times New Roman to undefined" when comparing DOCX with HTML/plain content.

### Changed

- `createTrackInsertMark()` and `createTrackDeleteMark()` in `trackChangeInjector.ts` now accept an optional `id` parameter to allow ID sharing between related marks.
- `mergeDocuments.ts` now detects replacement patterns (delete followed by insert) and generates a single shared UUID for both operations.
- `documentDiffer.ts` now filters out format changes where the target marks have no defined attribute values.

