#!/usr/bin/env node
/**
 * CSS Build Script
 * 
 * Bundles SuperDoc's CSS with our custom styles.
 * Includes targeted overrides for Tailwind CSS compatibility.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

// Ensure dist directory exists
if (!fs.existsSync(DIST)) {
  fs.mkdirSync(DIST, { recursive: true });
}

// Read SuperDoc CSS
const superdocCss = fs.readFileSync(
  path.join(ROOT, 'node_modules/superdoc/dist/style.css'),
  'utf8'
);

// Read our custom styles
const ownStyles = [
  'index.css',
  'variables.css', 
  'base.css',
  'loading.css',
  'error.css',
  'track-changes.css',
].map(file => 
  fs.readFileSync(path.join(ROOT, 'src/styles', file), 'utf8')
).join('\n');

// Build the final CSS
const output = `
/* ==========================================================================
   DocxDiffEditor Styles
   
   This file bundles SuperDoc CSS + our custom styles.
   Import AFTER your CSS framework (e.g., Tailwind) for proper specificity.
   
   Usage:
     import 'docx-diff-editor/styles.css';
   ========================================================================== */

/* SuperDoc Editor Styles */
${superdocCss}

/* DocxDiffEditor Custom Styles */
${ownStyles}

/* ==========================================================================
   Tailwind CSS Compatibility Overrides
   
   These overrides ensure SuperDoc UI elements display correctly when used
   with Tailwind CSS, which applies aggressive resets.
   
   NOTE: We do NOT override SVG width/height as that breaks toolbar icons.
   ========================================================================== */

/* Context menu - revert Tailwind resets */
.sd-context-menu,
.superdoc-context-menu,
[class*="context-menu"] {
  all: revert;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
}

/* Button resets for SuperDoc UI elements */
.sd-editor-scoped button,
.superdoc button,
[class*="superdoc"] button {
  all: revert;
}

/* Track changes sidebar visibility */
.superdoc__right-sidebar,
.right-sidebar,
[class*="right-sidebar"] {
  display: flex !important;
  visibility: visible !important;
}
`;

// Write output
fs.writeFileSync(path.join(DIST, 'styles.css'), output.trim());

console.log('✓ CSS built successfully');
console.log(`  - SuperDoc CSS: ${(superdocCss.length / 1024).toFixed(1)}KB`);
console.log(`  - Custom styles: ${(ownStyles.length / 1024).toFixed(1)}KB`);
console.log(`  - Output: dist/styles.css (${(output.length / 1024).toFixed(1)}KB)`);
