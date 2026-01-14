# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.60] - 2026-01-14

### Fixed

- **List numbering definitions now properly synced to main editor**: Added manual numbering sync in `parseHtmlWithLinkedEditor()` to fix list parsing crashes. SuperDoc's automatic `linkListDefinitionsChange` callback has a timing issue - the `list-definitions-change` event is emitted during editor construction before event listeners are registered.

### Technical Details

- **Root cause discovered**: When `createChildEditor` parses HTML with lists:
  1. `flattenListsInHtml` → `flattenFoundList` calls `ListHelpers.generateNewListDefinition()`
  2. This emits `list-definitions-change` event
  3. But event listeners aren't registered yet (still in constructor)
  4. So `linkListDefinitionsChange` never fires and numbering isn't synced

- **Solution**: New `syncNumberingToParent()` helper function that:
  1. Gets numbering from child editor: `childEditor.converter.numbering`
  2. Merges `definitions` and `abstracts` into parent's numbering store
  3. Called after `onCreate` fires (when parsing is complete) but before `getJSON()`

- **This ensures**: When parsed content with lists is applied via `compareWith()`, the main editor already has the numbering definitions the list nodes reference.

## [1.0.59] - 2026-01-14

### Fixed

- **`parseHtml()` now works correctly with lists**: When the main editor is ready, `parseHtml()` now uses a **linked child editor** approach via `createChildEditor()`. This ensures list numbering definitions (for `<ol>` and `<ul>` elements) are synced to the main document's numbering store, preventing crashes when parsed content is later used with `compareWith()`.

### Technical Details

- **Root cause**: The previous isolated SuperDoc instance stored numbering definitions in its own `editor.converter.numbering` store. When parsed JSON was spliced into the main document, the `numId` references pointed to definitions that didn't exist in the main editor, causing:
  ```
  TypeError: Cannot read properties of null (reading 'replace')
      at createNumbering
  ```

- **Solution**: New `parseHtmlWithLinkedEditor()` function that:
  1. Uses `mainEditor.createChildEditor({ element, html, onCreate, onError })`
  2. Numbering definitions are automatically synced via `onListDefinitionsChange: linkListDefinitionsChange`
  3. Extracts JSON and destroys child editor after parsing
  4. Falls back to isolated approach if linked parsing fails

- **Backwards compatible**: If the main editor isn't ready yet (e.g., calling `parseHtml()` before `onReady`), the method falls back to the isolated SuperDoc instance approach.

## [1.0.58] - 2026-01-14

### Fixed

- **`compareWith()` no longer crashes on documents with ordered lists**: SuperDoc's internal list numbering plugin (`createOrderedListPlugin`) crashes when content contains ordered lists with `numId` references to numbering definitions that don't exist in the target editor. This commonly happens when HTML with lists is parsed and injected.

### Added

- **Graceful fallback mode for problematic content**: When the merged content with track marks cannot be applied (due to SuperDoc plugin crashes), `compareWith()` now automatically falls back to applying the new content directly without track change visualization.

- **New `usedFallback` field in `ComparisonResult`**: Indicates when fallback mode was used. When `true`, the content was updated successfully but track change bubbles are not available.

### Changed

- **Updated SuperDoc dependency**: Upgraded from `^1.3.0` to `^1.6.1` for latest fixes and improvements.

### Technical Details

- **Root cause**: When HTML with ordered lists (e.g., `1. **item**`) is parsed by a temporary SuperDoc instance:
  1. The resulting JSON contains paragraphs with `numberingProperties.numId` referencing numbering definitions
  2. These definitions are stored in `editor.converter.numbering`, not in the JSON
  3. When injected into the main editor, the `numId` doesn't exist in that editor's definitions
  4. SuperDoc's list sync plugin calls `getListDefinitionDetails()` which returns `{ lvlText: null }`
  5. `createNumbering()` crashes calling `.replace()` on null

- **Solution**: Wrapped `setEditorContent()` in try-catch:
  - On success: Normal flow with track changes
  - On failure: Apply clean new content without track marks, set `usedFallback: true`
  - Summary includes "Note: Track change visualization unavailable for this content"

- **Note**: This is a workaround for a bug in SuperDoc that should null-check `lvlText` before calling `.replace()`.

## [1.0.57] - 2026-01-14

### Fixed

- **Format change detection now works for bold, italic, and other simple marks**: The `hasDefinedAttributes` function in `documentDiffer.ts` was incorrectly returning `false` for marks like `{ type: "bold", attrs: { value: null } }`, causing format changes to not be detected.

### Technical Details

- **Root cause**: The function assumed marks like bold/italic would have NO `attrs` property. But SuperDoc's HTML parsing creates them with `attrs: { value: null }`. The logic checked if attr values were non-null, which failed for these marks.

- **The trace for `[{ type: "bold", attrs: { value: null } }]`**:
  1. Mark HAS `attrs`, so `!mark.attrs` check didn't help
  2. `attrs.value` is `null`, so value check failed
  3. Fallback `marks.some((m) => !m.attrs)` also failed
  4. Returned `false` → format change not detected!

- **Solution**: Added `INHERENT_FORMAT_MARKS` set containing mark types that represent formatting by their presence alone:
  - `bold`, `italic`, `strike`, `underline`, `code`, `subscript`, `superscript`
  - These marks return `true` regardless of their attr values

- **Updated logic**:
  ```typescript
  if (INHERENT_FORMAT_MARKS.has(mark.type)) {
    return true;  // Bold/italic/etc are defined by type alone
  }
  ```

## [1.0.56] - 2026-01-14

### Fixed

- **Bold, italic, and other format marks now render correctly after `compareWith()`**: Format changes like bold, italic, underline were not visually rendered in the editor after comparison, even though the marks were correctly applied. The text would appear normal despite having a `bold` mark.

### Technical Details

- **Root cause**: `normalizeRunProperties()` was called on the incoming document (`cleanNewJson`) but NOT on the merged result. The merge process creates text nodes with marks from the new document, but the parent `run` nodes come from the baseline and don't have `runProperties.bold` set.

- **Solution**: Added a second `normalizeRunProperties()` call on the merged document before setting it in the editor:
  ```typescript
  const normalizedMerged = normalizeRunProperties(merged);
  setEditorContent(superdocRef.current.activeEditor, normalizedMerged);
  ```

- This ensures that after the merge, all marks on text nodes are synced to their parent run's `runProperties`, which SuperDoc needs for visual rendering.

- **Affected marks**: `bold`, `italic`, `strike`, `underline`, `textStyle` (color, fontFamily, fontSize, etc.)

## [1.0.55] - 2026-01-14

### Fixed

- **Subsequent `compareWith()` calls no longer layer track marks**: When calling `compareWith()` multiple times, previous track changes would accumulate instead of being replaced. This happened when the new content was derived from `getContent()` (which includes track marks). Now, both the editor baseline AND the incoming content are cleaned of track marks before comparison.

### Technical Details

- **Root cause**: If you called `getContent()`, cloned it, modified it, and passed it to `compareWith()`, the cloned content still had track marks from the previous comparison. These old marks were preserved in the merge, creating layered track changes.

- **Solution**: Added `acceptAllChangesInJson(newJson)` to clean the incoming content before merging. Now both sides of the comparison are guaranteed to be clean:
  - `cleanBaseline` = current editor content with track marks accepted
  - `cleanNewJson` = incoming content with track marks accepted (new in v1.0.55)

- This makes `compareWith()` more robust - callers don't need to worry about cleaning content before passing it.

## [1.0.54] - 2026-01-14

### Fixed

- **Empty text nodes no longer cause errors**: ProseMirror throws `RangeError: Empty text nodes are not allowed` when loading JSON with empty text nodes (e.g., `{ type: 'text', text: '' }`). This could happen when content was replaced with empty strings. Now, `setEditorContent` sanitizes the JSON before loading.

### Technical Details

- **New `sanitizeJson()` function** in `DocxDiffEditor.tsx` that recursively:
  1. Removes text nodes with empty strings
  2. Removes `run` nodes that become empty after cleaning
  3. Preserves all marks on valid text nodes
  4. Returns cleaned JSON safe for ProseMirror

- Applied in `setEditorContent()` before `schema.nodeFromJSON()` to catch all edge cases

## [1.0.53] - 2026-01-14

### Changed

- **`compareWith()` now compares against current editor content**: Previously, `compareWith()` always compared the given content against the originally loaded document from `setSource()`. Now it compares against the **current editor state**, with any existing track changes stripped/accepted first to create a clean baseline.

### Behavior Change

- **Old behavior**: `compareWith(newDoc)` compared `originalSource` vs `newDoc` (ignoring any edits made in the editor)
- **New behavior**: `compareWith(newDoc)` compares `currentEditorContent` vs `newDoc`

This is more intuitive for users who make edits in the editor and then want to compare their work against a new version. To compare against the original source document, simply call `setSource(originalDoc)` again before `compareWith()`.

### Technical Details

- Before comparing, the method now:
  1. Gets current editor content via `activeEditor.getJSON()`
  2. Strips all track marks using `acceptAllChangesInJson()` to create a clean baseline
  3. Uses that clean baseline for the structural merge and diff
  4. Updates `sourceJson` state to reflect this new baseline

## [1.0.52] - 2026-01-14

### Fixed

- **Track change bubbles no longer show "undefined" values**: When comparing documents with different textStyle properties (e.g., docA has fontFamily but docB doesn't), the bubble would show "Changed font family from Arial to undefined". Now, attrs are cleaned to only include meaningful values before comparison.

### Technical Details

- **Root cause**: SuperDoc's `translateFormatChangesToEnglish` iterates over `Object.keys({...beforeTextStyle, ...afterTextStyle})`. If docA had `{fontFamily: "Arial"}` and docB had `{color: "#ff0000"}`, the merged keys included `fontFamily`, but `afterTextStyle.fontFamily` was `undefined` (not `null`), bypassing SuperDoc's null check.

- **Solution**: New `normalizeMarkForTrackFormat()` and `normalizeMarksForTrackFormat()` functions that clean attrs:
  - Remove `null`, `undefined`, and empty string values from attrs
  - Only meaningful values remain for comparison
  - Prevents "Set X to undefined" or "Changed X from Y to undefined" messages

- **Functions added**:
  - `isMeaningfulValue()` - checks if value is not null/undefined/empty
  - `cleanAttrs()` - filters attrs to only include meaningful values
  - `normalizeMarkForTrackFormat()` - combines cleaning with color normalization
  - `normalizeMarksForTrackFormat()` - array version

## [1.0.51] - 2026-01-13

### Fixed

- **Text node marks now normalized during `normalizeRunProperties()`**: When a document is processed through `normalizeRunProperties()`, the marks on text nodes are also normalized (ensuring `attrs` exists and colors are valid CSS hex). This closes a gap where marks could have invalid formats even after normalization.

### Changed

- **Refactored color utilities to single source of truth**: The CSS named colors map was duplicated between `trackChangeInjector.ts` and `runPropertiesSync.ts`. Created new `colorUtils.ts` with shared color conversion functions:
  - `CSS_NAMED_COLORS` - single map of 60+ named colors to hex values
  - `colorToHexWithoutHash()` - for DOCX runProperties (e.g., `"red"` → `"ff0000"`)
  - `ensureValidCssColor()` - for CSS/marks (e.g., `"red"` → `"#ff0000"`)
  - `isNamedColor()` - check if a color is a recognized named color

### Technical Details

- `normalizeRunProperties()` now calls `normalizeMarksForRendering()` on text node marks
- This ensures that after `parseHtml()` or any document processing, both:
  - `runProperties.color.val` = hex without `#` (e.g., `"ff0000"`) for DOCX
  - `textStyle.attrs.color` = valid CSS color with `#` (e.g., `"#ff0000"`) for DOM rendering
- The normalization is recursive, handling nested text nodes within runs
- Bundle size reduced by ~1KB due to deduplication

## [1.0.49] - 2026-01-13

### Fixed

- **Named CSS colors now render correctly**: Colors specified as named values (e.g., "red", "blue", "green") are now converted to hex format for proper SuperDoc rendering. Previously, named colors were passed through unchanged, but SuperDoc's internal color handling (`resolveColorFromAttributes`) requires hex values.

### Technical Details

- Added `CSS_NAMED_COLORS` map with 60+ common CSS color names and their hex equivalents
- `ensureValidCssColor()` now converts named colors: `"red"` → `"#ff0000"`
- `colorToHexWithoutHash()` in `runPropertiesSync.ts` converts for runProperties: `"red"` → `"ff0000"`
- Both the mark's `attrs.color` (for DOM rendering) and `runProperties.color.val` (for DOCX) are now consistently hex

## [1.0.48] - 2026-01-13

### Fixed

- **Track change bubbles now show complete change details**: Format change bubbles previously showed empty values like "Set font family to" without the actual value. This was caused by SuperDoc's `parseFormatList` filtering out marks without an `attrs` property.

- **Text colors now render correctly in the editor**: Colors applied via format changes or inserted text now display properly in the editor. Previously, hex colors without `#` prefix (e.g., `ff0000` instead of `#ff0000`) resulted in invalid CSS.

### Technical Details

- **Mark normalization**: New `normalizeMarksForRendering()` function in `trackChangeInjector.ts` ensures:
  1. All marks have an `attrs` property (even if empty) - required by SuperDoc's `parseFormatList`
  2. Color values in `textStyle` marks have valid CSS format (`#` prefix for hex colors)
  
- **Applied in**:
  - `createTrackFormatMark()` - normalizes `before`/`after` mark arrays
  - `createInsertedTextNodes()` in `mergeDocuments.ts` - normalizes marks from docB
  - Format change handling in `mergeDocuments.ts` - normalizes after marks
  - `markAllTextAsInserted/Deleted()` in `structuralMerger.ts` and `blockLevelMerger.ts`

- **Root cause analysis**:
  - SuperDoc's `parseFormatList` (line 63964) filters: `format => hasOwn(format, "type") && hasOwn(format, "attrs")`
  - SuperDoc's Color extension `renderDOM` uses `color: ${attrs.color}` directly - requires valid CSS color

## [1.0.47] - 2026-01-13

### Fixed

- **Mark preservation in character-level merging**: Inserted text from `compareWith()` now correctly preserves its original styling (colors, bold, italic, etc.) from the source document. Previously, when text was inserted via character-level diffing, it would lose all marks from docB and only inherit marks from docA.

### Technical Details

- **Root cause**: The character-level merge in `mergeDocuments.ts` flattened documents to plain strings for diffing, losing all mark/style information. Inserted text nodes were created with marks from the original document (docA), not the new document (docB).
- **Solution**: Added position tracking in `diffDocuments()` to track where each segment originated in both documents:
  - `DiffSegment` now includes `posA` and `posB` fields
  - `DiffResult` now includes `spansB` (text spans with marks from docB)
- **Mark lookup**: New helper functions in `mergeDocuments.ts`:
  - `getMarksFromSpansB()` - get marks at a specific position in docB
  - `getMarkSpansForRange()` - get all mark spans covering a text range
  - `createInsertedTextNodes()` - creates text nodes with preserved marks from docB, splitting into multiple nodes when the text spans differently-styled regions
- This fix works in conjunction with `normalizeRunProperties()` (1.0.46) to ensure marks are reflected in both ProseMirror marks AND SuperDoc's runProperties

## [1.0.46] - 2026-01-13

### Added

- **Run properties sync**: New `normalizeRunProperties()` function that syncs ProseMirror marks on text nodes to `runProperties` on parent `run` nodes. This is required because SuperDoc uses a dual-layer architecture:
  - ProseMirror marks → used for editing interactions (toolbar, cursor)
  - runProperties → used for actual DOCX rendering

### Fixed

- **Text styling now renders correctly**: When HTML with inline styles is parsed, the styles now render visually in the editor. Previously, marks were set on text nodes but the parent run's `runProperties` weren't updated, causing styles to not display.

### Technical Details

- New service: `services/runPropertiesSync.ts` with:
  - `marksToRunProperties(marks)` - converts ProseMirror marks to SuperDoc runProperties format
  - `normalizeRunProperties(doc)` - walks a document and syncs all run nodes
- Integration in `parseHtmlToJson()` - normalizes the JSON before returning
- Integration in `compareWith()` - normalizes the "new" document before comparison (safety net)
- Based on SuperDoc's `decodeRPrFromMarks` logic in converter-BavE2jnW.js
- Handles: bold, italic, strike, underline, highlight, textStyle (color, fontSize, fontFamily, letterSpacing, textTransform)
- Format conversions: strips `#` from colors, converts fontSize to half-points, fontFamily gets 4 properties (ascii, eastAsia, hAnsi, cs)

## [1.0.45] - 2026-01-13

### Fixed

- **`parseHtml()` paste approach now works correctly**: Fixed the `pasteHTML` call that was failing with `Cannot read properties of null (reading 'getData')`. The issue was that `pasteHTML(html, event)` internally requires a proper `ClipboardEvent` with `clipboardData.getData()` method.

### Technical Details

- Created a mock `ClipboardEvent` with a `DataTransfer` object containing the HTML content
- The mock event is passed to `view.pasteHTML(html, mockEvent)` so SuperDoc's paste handler can access clipboard data
- Added fallback to standard import approach if paste method fails for any reason
- Console warning shown when falling back: `[parseHtmlToJson] Paste approach failed, falling back to import`

## [1.0.44] - 2026-01-13

### Fixed

- **`parseHtml()` now preserves inline styles**: Changed the implementation to use SuperDoc's paste path (`view.pasteHTML()`) instead of the import path (`html` option). SuperDoc's import path intentionally strips all CSS styles except `text-align` via `stripHtmlStyles()`. The paste path preserves inline styles like `color`, `font-size`, `font-family`, `font-weight`, `font-style`, `text-decoration`, and `background-color`, converting them to proper ProseMirror marks.

### Technical Details

- **Before**: HTML like `<span style="color: red; font-weight: bold;">text</span>` would lose all styling
- **After**: The same HTML now produces text with `textStyle` mark (for color) and `bold` mark (for font-weight)
- The fix works by creating an empty SuperDoc instance, then using `view.pasteHTML()` which goes through SuperDoc's paste handler (`htmlHandler`) rather than the import handler (`createDocFromHTML` → `stripHtmlStyles`)

## [1.0.43] - 2026-01-13

### Fixed

- **Structural changes now actually work**: Implemented `structuralMerger.ts`, the critical missing piece that makes structural changes visible and actionable. Previously, structural changes were only detected but not applied to the merged document—tables, paragraphs, and list items that were inserted or deleted would not appear in the editor, and the Structural Changes Pane's Accept/Reject buttons did nothing.

### Added

- **`mergeWithStructuralAwareness()` service**: New structure-aware merge function that:
  - Aligns documents at block level (paragraphs, tables, lists) before merging
  - Recursively merges matched tables row-by-row and lists item-by-item
  - Applies character-level diff within matched blocks
  - Inserts new blocks with `trackInsert` marks on all text content
  - Keeps deleted blocks with `trackDelete` marks on all text content
  - Generates `StructuralChangeInfo` metadata with shared UUIDs for pane integration

### Changed

- **`compareWith()` now uses structural merge**: The comparison flow now uses `mergeWithStructuralAwareness()` instead of the previous character-level-only approach. This means:
  - Inserted tables, paragraphs, and list items are now visible in the editor with green (insert) highlighting
  - Deleted content is now preserved with red (delete) strikethrough
  - The Structural Changes Pane's Accept/Reject buttons now work correctly via SuperDoc's `acceptTrackedChangeById`/`rejectTrackedChangeById` commands

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

