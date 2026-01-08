# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.27] - 2026-01-07

### Fixed

- **Replacement track changes now share the same ID**: When text is replaced (deleted and inserted at the same position), both the `trackDelete` and `trackInsert` marks now share the same ID. This matches the behavior expected by SuperDoc and Microsoft Word for proper replacement display in track change bubbles.

### Changed

- `createTrackInsertMark()` and `createTrackDeleteMark()` in `trackChangeInjector.ts` now accept an optional `id` parameter to allow ID sharing between related marks.
- `mergeDocuments.ts` now detects replacement patterns (delete followed by insert) and generates a single shared UUID for both operations.

