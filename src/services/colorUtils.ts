/**
 * Color Utilities
 * 
 * Shared color conversion utilities for consistent handling across the codebase.
 * Single source of truth for CSS named colors and color format conversions.
 */

// ============================================================================
// CSS Named Colors Map (Single Source of Truth)
// ============================================================================

/**
 * Map of CSS named colors to hex values WITHOUT the # prefix.
 * This is the canonical format - add # when needed for CSS, strip for DOCX.
 */
export const CSS_NAMED_COLORS: Record<string, string> = {
  // Basic colors
  black: '000000',
  white: 'ffffff',
  red: 'ff0000',
  green: '008000',
  blue: '0000ff',
  yellow: 'ffff00',
  cyan: '00ffff',
  magenta: 'ff00ff',
  
  // Extended colors
  orange: 'ffa500',
  pink: 'ffc0cb',
  purple: '800080',
  violet: 'ee82ee',
  brown: 'a52a2a',
  gray: '808080',
  grey: '808080',
  
  // Light variants
  lightblue: 'add8e6',
  lightgreen: '90ee90',
  lightgray: 'd3d3d3',
  lightgrey: 'd3d3d3',
  lightpink: 'ffb6c1',
  lightyellow: 'ffffe0',
  
  // Dark variants
  darkblue: '00008b',
  darkgreen: '006400',
  darkgray: 'a9a9a9',
  darkgrey: 'a9a9a9',
  darkred: '8b0000',
  
  // Other common colors
  navy: '000080',
  teal: '008080',
  maroon: '800000',
  olive: '808000',
  silver: 'c0c0c0',
  aqua: '00ffff',
  fuchsia: 'ff00ff',
  lime: '00ff00',
  coral: 'ff7f50',
  salmon: 'fa8072',
  gold: 'ffd700',
  indigo: '4b0082',
  crimson: 'dc143c',
  tomato: 'ff6347',
  chocolate: 'd2691e',
  tan: 'd2b48c',
  beige: 'f5f5dc',
  ivory: 'fffff0',
  khaki: 'f0e68c',
  lavender: 'e6e6fa',
  plum: 'dda0dd',
  orchid: 'da70d6',
  turquoise: '40e0d0',
  skyblue: '87ceeb',
  steelblue: '4682b4',
  slategray: '708090',
  slategrey: '708090',
};

// ============================================================================
// Color Conversion Functions
// ============================================================================

/**
 * Convert a color value to hex format WITHOUT # prefix.
 * Used for DOCX runProperties.color.val which expects hex without #.
 * 
 * Handles:
 * - Named colors: "red" → "ff0000"
 * - Hex with #: "#ff0000" → "ff0000"
 * - Hex without #: "ff0000" → "ff0000"
 * 
 * @param color - The color value to convert
 * @returns Hex color without # prefix
 */
export function colorToHexWithoutHash(color: string): string {
  const trimmed = color.trim();
  const lowerColor = trimmed.toLowerCase();
  
  // Check if it's a named color
  if (CSS_NAMED_COLORS[lowerColor]) {
    return CSS_NAMED_COLORS[lowerColor];
  }
  
  // Strip # if present
  return trimmed.replace(/^#/, '');
}

/**
 * Ensure a color value is valid for CSS (with # prefix for hex).
 * Used for ProseMirror marks which need valid CSS colors.
 * 
 * Handles:
 * - Named colors: "red" → "#ff0000"
 * - Hex without #: "ff0000" → "#ff0000"
 * - 3-char hex without #: "f00" → "#f00"
 * - Already valid: "#ff0000" → "#ff0000"
 * - RGB/HSL: "rgb(255,0,0)" → "rgb(255,0,0)" (unchanged)
 * 
 * @param color - The color value to normalize
 * @returns Valid CSS color string, or undefined if invalid input
 */
export function ensureValidCssColor(color: unknown): string | undefined {
  if (typeof color !== 'string' || !color) {
    return undefined;
  }
  
  const trimmed = color.trim();
  const lowerColor = trimmed.toLowerCase();
  
  // If it's a named color, convert to hex with #
  if (CSS_NAMED_COLORS[lowerColor]) {
    return `#${CSS_NAMED_COLORS[lowerColor]}`;
  }
  
  // If it's a 6-character hex without #, add the #
  if (/^[0-9a-fA-F]{6}$/.test(trimmed)) {
    return `#${trimmed}`;
  }
  
  // If it's a 3-character hex without #, add the #
  if (/^[0-9a-fA-F]{3}$/.test(trimmed)) {
    return `#${trimmed}`;
  }
  
  // Already has # or is rgb/hsl/etc - return as-is
  return trimmed;
}

/**
 * Check if a string is a recognized named CSS color.
 * 
 * @param color - The color value to check
 * @returns True if the color is a recognized named color
 */
export function isNamedColor(color: string): boolean {
  return CSS_NAMED_COLORS[color.toLowerCase().trim()] !== undefined;
}
