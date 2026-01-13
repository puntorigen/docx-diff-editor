# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.42] - 2026-01-13

### Added

- **`parseHtml()` ref method**: New async method to parse HTML strings to ProseMirror JSON using a hidden SuperDoc instance. Useful for converting HTML content before using with other methods like `updateContent()` or `compareWith()`.
- **`parseHtmlToJson()` standalone function**: Exported utility function for parsing HTML without needing an editor instance (requires passing the SuperDoc class).

## [1.0.41] - 2026-01-13

### Added

- **Block-Level Diffing**: Complete structural change detection for tables, lists, and images. The component now detects:
  - Table row insertions/deletions
  - Table column changes
  - List item insertions/deletions (with nested list support)
  - Image insertions/deletions
  - Paragraph insertions/deletions

- **Structural Changes Pane**: New floating, collapsible panel that displays structural changes with Accept/Reject controls. Features include:
  - Positioned panel (4 position options: `top-right`, `bottom-right`, `top-left`, `bottom-left`)
  - Collapse/expand animation
  - Per-change Accept/Reject buttons
  - Accept All / Reject All bulk actions
  - Change counter badge
  - Auto-hide when no changes remain
  - Click to navigate to change

- **New Props for Pane Customization**:
  - `structuralPanePosition`: Position of the pane (`'bottom-right'` default)
  - `structuralPaneCollapsed`: Start with pane collapsed
  - `hideStructuralPane`: Hide the pane entirely

- **Bubble Sync**: When users accept/reject changes via SuperDoc's native bubbles, the Structural Changes Pane automatically syncs (using `onCommentsUpdate` callback).

- **Enhanced Context Extraction**: `getEnrichedChangesContext()` now includes table/list coordinates in location info, and structural change metadata.

- **New Services & Types Exported**:
  - `StructuralChangesPane` component
  - `generateFingerprint`, `alignDocuments`, `processStructuralChanges`
  - `diffTables`, `diffLists`, `diffImages`
  - Types: `StructuralChange`, `StructuralChangeInfo`, `HybridDiffResult`, `AttributeChange`, `AttrDiff`

### Changed

- `ComparisonResult` now includes `structuralChanges` count and `structuralChangeInfos` array
- `EnrichedChange` now includes `structuralType`, `tablePosition`, and `listPosition` fields
- `ChangeLocation` now includes `tableCoords`, `listIndex`, and `listDepth` fields

## [1.0.40] - 2026-01-12

### Fixed

- **`setProperties()` changes now included in DOCX export**: Added serialization step that registers modified XML in `customUpdatedFiles` and sets `isCustomXmlChanged = true`. This ensures property changes are actually written to the exported DOCX file.

## [1.0.39] - 2026-01-12

### Fixed

- **`setProperties()` now produces valid DOCX**: Fixed the implementation to use `editor.converter.convertedXml` instead of `getInternalXmlFile`/`updateInternalXmlFile`. The new approach correctly navigates the XML structure (accessing `cp:coreProperties` root element) and marks `documentModified = true` so changes are included in export. This preserves XML namespaces and structure for valid DOCX output.
- **`getProperties()` updated for consistency**: Now uses the same `editor.converter.convertedXml` access pattern as `setProperties()`.

## [1.0.38] - 2026-01-12

### Added

- **`getProperties()` ref method**: New async method to retrieve document core properties from `docProps/core.xml`. Returns properties like `title`, `author`, `subject`, `keywords`, `description`, `category`, `lastModifiedBy`, `revision`, `created`, and `modified`. Date fields are returned as `Date` objects.
- **`setProperties()` ref method**: New async method to update document core properties. Accepts a partial `DocumentProperties` object - only provided properties are updated, others are preserved. Date fields accept `Date` objects which are converted to ISO strings internally.
- **`DocumentProperties` type**: New exported type for document core properties.

## [1.0.37] - 2026-01-12

### Added

- **`getDocumentInfo()` ref method**: New method that returns combined document metadata and statistics in a single call. Includes `documentGuid`, `isModified`, `version`, `words`, `characters`, `paragraphs`, and `pages`. Returns `null` if editor is not ready.
- **`DocumentInfo` type**: New exported type for the unified document info object.

## [1.0.36] - 2026-01-12

### Added

- **`getPages()` ref method**: New method to retrieve the current page count from the SuperDoc presentation editor. Can be called at any time after the editor is ready and reflects real-time document state (e.g., after user edits).

## [1.0.35] - 2026-01-09

### Changed

- Simplified `setEditorContent` to use direct ProseMirror transaction instead of non-existent SuperDoc methods.

## [1.0.34] - 2026-01-09

### Added

- **`updateContent()` ref method**: New method to update editor content without destroying and recreating the SuperDoc instance. Preserves the DOCX template/styling, making it ideal for replacing content with translated JSON. Avoids Vue unmounting issues when working with externally loaded DOCX files.

## [1.0.33] - 2026-01-09

### Fixed

- Fixed invalid tracked changes mode for superdoc 1.3.0: changed `'simple'` to `'off'` in editing mode.

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

