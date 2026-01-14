import { forwardRef, useRef, useState, useEffect, useCallback, useImperativeHandle } from 'react';
import { jsxs, jsx, Fragment } from 'react/jsx-runtime';
import { v4 } from 'uuid';
import DiffMatchPatch from 'diff-match-patch';

var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/services/nodeFingerprint.ts
var nodeFingerprint_exports = {};
__export(nodeFingerprint_exports, {
  buildFingerprintTree: () => buildFingerprintTree,
  calculateSimilarity: () => calculateSimilarity,
  calculateTextSimilarity: () => calculateTextSimilarity,
  extractBlockFingerprints: () => extractBlockFingerprints,
  generateFingerprint: () => generateFingerprint,
  getNodeTextSimilarity: () => getNodeTextSimilarity
});
function extractTextContent2(node) {
  if (!node) return "";
  if (node.type === "text" && node.text) {
    return node.text;
  }
  if (node.content && Array.isArray(node.content)) {
    return node.content.map(extractTextContent2).join("");
  }
  return "";
}
function simpleHash(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) + hash ^ str.charCodeAt(i);
  }
  return (hash >>> 0).toString(16);
}
function normalizeText(text) {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}
function generateFingerprint(node) {
  if (!node) return "";
  const type = node.type || "unknown";
  switch (type) {
    case "text": {
      const text = normalizeText(node.text || "");
      return `t:${simpleHash(text)}`;
    }
    case "paragraph": {
      const text = normalizeText(extractTextContent2(node));
      return `p:${simpleHash(text)}`;
    }
    case "heading": {
      const level = node.attrs?.level || 1;
      const text = normalizeText(extractTextContent2(node));
      return `h${level}:${simpleHash(text)}`;
    }
    case "table": {
      const rowCount = node.content?.length || 0;
      const childFps = (node.content || []).map((child) => generateFingerprint(child)).join("|");
      return `table:${rowCount}:${simpleHash(childFps)}`;
    }
    case "tableRow": {
      const cellCount = node.content?.length || 0;
      const childFps = (node.content || []).map((child) => generateFingerprint(child)).join("|");
      return `tr:${cellCount}:${simpleHash(childFps)}`;
    }
    case "tableCell":
    case "tableHeader": {
      const text = normalizeText(extractTextContent2(node));
      return `tc:${simpleHash(text)}`;
    }
    case "bulletList":
    case "orderedList": {
      const itemCount = node.content?.length || 0;
      const childFps = (node.content || []).map((child) => generateFingerprint(child)).join("|");
      return `list:${itemCount}:${simpleHash(childFps)}`;
    }
    case "listItem": {
      const text = normalizeText(extractTextContent2(node));
      return `li:${simpleHash(text)}`;
    }
    case "image": {
      const src = node.attrs?.src || "";
      return `img:${simpleHash(src)}`;
    }
    case "hardBreak":
      return "br";
    case "horizontalRule":
      return "hr";
    case "codeBlock": {
      const text = normalizeText(extractTextContent2(node));
      const lang = node.attrs?.language || "";
      return `code:${lang}:${simpleHash(text)}`;
    }
    case "blockquote": {
      const text = normalizeText(extractTextContent2(node));
      return `bq:${simpleHash(text)}`;
    }
    // For doc and other container types, fingerprint based on content
    case "doc": {
      const childFps = (node.content || []).map((child) => generateFingerprint(child)).join("|");
      return `doc:${simpleHash(childFps)}`;
    }
    // Default: use type and text content
    default: {
      const text = normalizeText(extractTextContent2(node));
      return `${type}:${simpleHash(text)}`;
    }
  }
}
function buildFingerprintTree(node, path = []) {
  const fingerprint = generateFingerprint(node);
  const result = {
    node,
    fingerprint,
    path: [...path]
  };
  if (node.content && Array.isArray(node.content)) {
    result.children = node.content.map(
      (child, index) => buildFingerprintTree(child, [...path, index])
    );
  }
  return result;
}
function extractBlockFingerprints(doc) {
  if (!doc || !doc.content || !Array.isArray(doc.content)) {
    return [];
  }
  return doc.content.map((child, index) => ({
    node: child,
    fingerprint: generateFingerprint(child),
    path: [index]
  }));
}
function calculateSimilarity(fpA, fpB) {
  if (fpA === fpB) return 1;
  const typeA = fpA.split(":")[0];
  const typeB = fpB.split(":")[0];
  if (typeA !== typeB) return 0;
  return 0.3;
}
function calculateTextSimilarity(textA, textB) {
  const a = normalizeText(textA);
  const b = normalizeText(textB);
  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;
  const lenRatio = Math.min(a.length, b.length) / Math.max(a.length, b.length);
  if (lenRatio < 0.3) return lenRatio;
  const distance = levenshteinDistance(a, b);
  const maxLen = Math.max(a.length, b.length);
  return 1 - distance / maxLen;
}
function levenshteinDistance(a, b) {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let prevRow = Array.from({ length: b.length + 1 }, (_, i) => i);
  let currRow = new Array(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    currRow[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      currRow[j] = Math.min(
        prevRow[j] + 1,
        // deletion
        currRow[j - 1] + 1,
        // insertion
        prevRow[j - 1] + cost
        // substitution
      );
    }
    [prevRow, currRow] = [currRow, prevRow];
  }
  return prevRow[b.length];
}
function getNodeTextSimilarity(nodeA, nodeB) {
  const textA = extractTextContent2(nodeA);
  const textB = extractTextContent2(nodeB);
  return calculateTextSimilarity(textA, textB);
}
var init_nodeFingerprint = __esm({
  "src/services/nodeFingerprint.ts"() {
  }
});
function getChangeIcon(type) {
  switch (type) {
    case "rowInsert":
    case "columnInsert":
    case "paragraphInsert":
    case "listItemInsert":
    case "imageInsert":
      return "\u2795";
    case "rowDelete":
    case "columnDelete":
    case "paragraphDelete":
    case "listItemDelete":
    case "imageDelete":
      return "\u2796";
    case "attrChange":
      return "\u270F\uFE0F";
    default:
      return "\u2022";
  }
}
function getChangeLabel(type) {
  switch (type) {
    case "rowInsert":
      return "Row inserted";
    case "rowDelete":
      return "Row deleted";
    case "columnInsert":
      return "Column inserted";
    case "columnDelete":
      return "Column deleted";
    case "paragraphInsert":
      return "Paragraph inserted";
    case "paragraphDelete":
      return "Paragraph deleted";
    case "listItemInsert":
      return "List item inserted";
    case "listItemDelete":
      return "List item deleted";
    case "imageInsert":
      return "Image inserted";
    case "imageDelete":
      return "Image deleted";
    case "attrChange":
      return "Formatting changed";
    default:
      return "Change";
  }
}
function formatDate(isoDate) {
  try {
    const date = new Date(isoDate);
    return date.toLocaleDateString(void 0, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  } catch {
    return "";
  }
}
var StructuralChangesPane = ({
  changes,
  position = "bottom-right",
  initiallyCollapsed = false,
  onAccept,
  onReject,
  onAcceptAll,
  onRejectAll,
  onNavigate,
  onDismiss
}) => {
  const [isCollapsed, setIsCollapsed] = useState(initiallyCollapsed);
  const [isVisible, setIsVisible] = useState(true);
  const [isAnimatingOut, setIsAnimatingOut] = useState(false);
  useEffect(() => {
    if (changes.length === 0) {
      setIsAnimatingOut(true);
      const timer = setTimeout(() => setIsVisible(false), 300);
      return () => clearTimeout(timer);
    } else {
      setIsVisible(true);
      setIsAnimatingOut(false);
    }
  }, [changes.length]);
  const handleDismiss = useCallback(() => {
    setIsAnimatingOut(true);
    setTimeout(() => {
      setIsVisible(false);
      onDismiss?.();
    }, 300);
  }, [onDismiss]);
  const handleToggleCollapse = useCallback(() => {
    setIsCollapsed((prev) => !prev);
  }, []);
  const handleAccept = useCallback((e, changeId) => {
    e.stopPropagation();
    onAccept(changeId);
  }, [onAccept]);
  const handleReject = useCallback((e, changeId) => {
    e.stopPropagation();
    onReject(changeId);
  }, [onReject]);
  const handleNavigate = useCallback((changeId) => {
    onNavigate?.(changeId);
  }, [onNavigate]);
  if (!isVisible) return null;
  const positionClasses = {
    "top-right": "dde-pane--top-right",
    "bottom-right": "dde-pane--bottom-right",
    "top-left": "dde-pane--top-left",
    "bottom-left": "dde-pane--bottom-left"
  };
  return /* @__PURE__ */ jsxs(
    "div",
    {
      className: `dde-structural-pane ${positionClasses[position]} ${isAnimatingOut ? "dde-pane--animating-out" : ""} ${isCollapsed ? "dde-pane--collapsed" : ""}`,
      role: "region",
      "aria-label": "Structural Changes",
      children: [
        /* @__PURE__ */ jsxs("div", { className: "dde-pane__header", onClick: handleToggleCollapse, children: [
          /* @__PURE__ */ jsxs("div", { className: "dde-pane__title", children: [
            /* @__PURE__ */ jsx("span", { className: "dde-pane__icon", children: "\u{1F4CB}" }),
            /* @__PURE__ */ jsxs("span", { className: "dde-pane__label", children: [
              "Structural Changes",
              /* @__PURE__ */ jsx("span", { className: "dde-pane__count", children: changes.length })
            ] })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "dde-pane__controls", children: [
            /* @__PURE__ */ jsx(
              "button",
              {
                className: "dde-pane__btn dde-pane__btn--collapse",
                onClick: (e) => {
                  e.stopPropagation();
                  handleToggleCollapse();
                },
                "aria-label": isCollapsed ? "Expand" : "Collapse",
                title: isCollapsed ? "Expand" : "Collapse",
                children: isCollapsed ? "+" : "\u2212"
              }
            ),
            /* @__PURE__ */ jsx(
              "button",
              {
                className: "dde-pane__btn dde-pane__btn--close",
                onClick: (e) => {
                  e.stopPropagation();
                  handleDismiss();
                },
                "aria-label": "Close",
                title: "Close",
                children: "\xD7"
              }
            )
          ] })
        ] }),
        !isCollapsed && /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsx("div", { className: "dde-pane__body", children: changes.length === 0 ? /* @__PURE__ */ jsx("div", { className: "dde-pane__empty", children: "No structural changes" }) : /* @__PURE__ */ jsx("ul", { className: "dde-pane__list", children: changes.map((change) => /* @__PURE__ */ jsxs(
            "li",
            {
              className: "dde-pane__item",
              onClick: () => handleNavigate(change.id),
              children: [
                /* @__PURE__ */ jsxs("div", { className: "dde-pane__item-header", children: [
                  /* @__PURE__ */ jsx("span", { className: "dde-pane__item-icon", children: getChangeIcon(change.type) }),
                  /* @__PURE__ */ jsx("span", { className: "dde-pane__item-label", children: getChangeLabel(change.type) })
                ] }),
                /* @__PURE__ */ jsx("div", { className: "dde-pane__item-location", children: change.location }),
                /* @__PURE__ */ jsx("div", { className: "dde-pane__item-preview", children: change.preview }),
                /* @__PURE__ */ jsxs("div", { className: "dde-pane__item-meta", children: [
                  /* @__PURE__ */ jsx("span", { className: "dde-pane__item-author", children: change.author.name }),
                  /* @__PURE__ */ jsx("span", { className: "dde-pane__item-date", children: formatDate(change.date) })
                ] }),
                /* @__PURE__ */ jsxs("div", { className: "dde-pane__item-actions", children: [
                  /* @__PURE__ */ jsx(
                    "button",
                    {
                      className: "dde-pane__action dde-pane__action--accept",
                      onClick: (e) => handleAccept(e, change.id),
                      title: "Accept change",
                      children: "Accept"
                    }
                  ),
                  /* @__PURE__ */ jsx(
                    "button",
                    {
                      className: "dde-pane__action dde-pane__action--reject",
                      onClick: (e) => handleReject(e, change.id),
                      title: "Reject change",
                      children: "Reject"
                    }
                  )
                ] })
              ]
            },
            change.id
          )) }) }),
          changes.length > 0 && /* @__PURE__ */ jsxs("div", { className: "dde-pane__footer", children: [
            /* @__PURE__ */ jsx(
              "button",
              {
                className: "dde-pane__bulk-btn dde-pane__bulk-btn--accept",
                onClick: onAcceptAll,
                children: "Accept All"
              }
            ),
            /* @__PURE__ */ jsx(
              "button",
              {
                className: "dde-pane__bulk-btn dde-pane__bulk-btn--reject",
                onClick: onRejectAll,
                children: "Reject All"
              }
            )
          ] })
        ] })
      ]
    }
  );
};

// src/constants.ts
var DEFAULT_AUTHOR = {
  name: "DocxDiff Editor",
  email: "editor@docxdiff.local"
};
var DEFAULT_SUPERDOC_USER = {
  name: "DocxDiff User",
  email: "user@docxdiff.local"
};
var TRACK_CHANGE_PERMISSIONS = [
  "RESOLVE_OWN",
  "RESOLVE_OTHER",
  "REJECT_OWN",
  "REJECT_OTHER"
];
var CSS_PREFIX = "dde";
var TIMEOUTS = {
  /** Timeout for document parsing (ms) */
  PARSE_TIMEOUT: 3e4,
  /** Small delay for React settling (ms) */
  INIT_DELAY: 100,
  /** Cleanup delay (ms) */
  CLEANUP_DELAY: 100
};

// src/services/colorUtils.ts
var CSS_NAMED_COLORS = {
  // Basic colors
  black: "000000",
  white: "ffffff",
  red: "ff0000",
  green: "008000",
  blue: "0000ff",
  yellow: "ffff00",
  cyan: "00ffff",
  magenta: "ff00ff",
  // Extended colors
  orange: "ffa500",
  pink: "ffc0cb",
  purple: "800080",
  violet: "ee82ee",
  brown: "a52a2a",
  gray: "808080",
  grey: "808080",
  // Light variants
  lightblue: "add8e6",
  lightgreen: "90ee90",
  lightgray: "d3d3d3",
  lightgrey: "d3d3d3",
  lightpink: "ffb6c1",
  lightyellow: "ffffe0",
  // Dark variants
  darkblue: "00008b",
  darkgreen: "006400",
  darkgray: "a9a9a9",
  darkgrey: "a9a9a9",
  darkred: "8b0000",
  // Other common colors
  navy: "000080",
  teal: "008080",
  maroon: "800000",
  olive: "808000",
  silver: "c0c0c0",
  aqua: "00ffff",
  fuchsia: "ff00ff",
  lime: "00ff00",
  coral: "ff7f50",
  salmon: "fa8072",
  gold: "ffd700",
  indigo: "4b0082",
  crimson: "dc143c",
  tomato: "ff6347",
  chocolate: "d2691e",
  tan: "d2b48c",
  beige: "f5f5dc",
  ivory: "fffff0",
  khaki: "f0e68c",
  lavender: "e6e6fa",
  plum: "dda0dd",
  orchid: "da70d6",
  turquoise: "40e0d0",
  skyblue: "87ceeb",
  steelblue: "4682b4",
  slategray: "708090",
  slategrey: "708090"
};
function colorToHexWithoutHash(color) {
  const trimmed = color.trim();
  const lowerColor = trimmed.toLowerCase();
  if (CSS_NAMED_COLORS[lowerColor]) {
    return CSS_NAMED_COLORS[lowerColor];
  }
  return trimmed.replace(/^#/, "");
}
function ensureValidCssColor(color) {
  if (typeof color !== "string" || !color) {
    return void 0;
  }
  const trimmed = color.trim();
  const lowerColor = trimmed.toLowerCase();
  if (CSS_NAMED_COLORS[lowerColor]) {
    return `#${CSS_NAMED_COLORS[lowerColor]}`;
  }
  if (/^[0-9a-fA-F]{6}$/.test(trimmed)) {
    return `#${trimmed}`;
  }
  if (/^[0-9a-fA-F]{3}$/.test(trimmed)) {
    return `#${trimmed}`;
  }
  return trimmed;
}

// src/services/trackChangeInjector.ts
function isMeaningfulValue(value) {
  return value !== null && value !== void 0 && value !== "";
}
function cleanAttrs(attrs) {
  const cleaned = {};
  for (const [key, value] of Object.entries(attrs)) {
    if (isMeaningfulValue(value)) {
      cleaned[key] = value;
    }
  }
  return cleaned;
}
function normalizeMark(mark) {
  const attrs = { ...mark.attrs || {} };
  if (attrs.color !== void 0) {
    attrs.color = ensureValidCssColor(attrs.color);
  }
  return {
    type: mark.type,
    attrs
  };
}
function normalizeMarkForTrackFormat(mark) {
  let attrs = { ...mark.attrs || {} };
  if (attrs.color !== void 0) {
    attrs.color = ensureValidCssColor(attrs.color);
  }
  attrs = cleanAttrs(attrs);
  return {
    type: mark.type,
    attrs
  };
}
function normalizeMarks(marks) {
  return marks.map(normalizeMark);
}
function normalizeMarksForTrackFormat(marks) {
  return marks.map(normalizeMarkForTrackFormat);
}
function normalizeMarksForRendering(marks) {
  return normalizeMarks(marks);
}
function createTrackInsertMark(author = DEFAULT_AUTHOR, id) {
  return {
    type: "trackInsert",
    attrs: {
      id: id ?? v4(),
      author: author.name,
      authorEmail: author.email,
      authorImage: "",
      date: (/* @__PURE__ */ new Date()).toISOString()
    }
  };
}
function createTrackDeleteMark(author = DEFAULT_AUTHOR, id) {
  return {
    type: "trackDelete",
    attrs: {
      id: id ?? v4(),
      author: author.name,
      authorEmail: author.email,
      authorImage: "",
      date: (/* @__PURE__ */ new Date()).toISOString()
    }
  };
}
function createTrackFormatMark(before, after, author = DEFAULT_AUTHOR) {
  const normalizedBefore = normalizeMarksForTrackFormat(before);
  const normalizedAfter = normalizeMarksForTrackFormat(after);
  return {
    type: "trackFormat",
    attrs: {
      id: v4(),
      author: author.name,
      authorEmail: author.email,
      authorImage: "",
      date: (/* @__PURE__ */ new Date()).toISOString(),
      before: normalizedBefore,
      after: normalizedAfter
    }
  };
}

// src/services/runPropertiesSync.ts
var PT_TO_TWIPS = 20;
function ptToTwips(ptValue) {
  return Math.round(ptValue * PT_TO_TWIPS);
}
function parseFontSizeToPoints(fontSize) {
  if (typeof fontSize === "number") {
    return fontSize;
  }
  const value = parseFloat(fontSize);
  if (isNaN(value)) {
    return null;
  }
  if (fontSize.toLowerCase().includes("px")) {
    return value * 0.75;
  }
  return value;
}
function cleanFontFamily(fontFamily) {
  return fontFamily.split(",")[0].trim().replace(/^["']|["']$/g, "");
}
function marksToRunProperties(marks) {
  const runProperties = {};
  if (!marks || !Array.isArray(marks)) {
    return runProperties;
  }
  for (const mark of marks) {
    const type = mark.type;
    const attrs = mark.attrs || {};
    switch (type) {
      // Boolean marks: bold, italic, strike
      case "bold":
      case "italic":
      case "strike": {
        const isNegated = attrs.value === "0" || attrs.value === false;
        runProperties[type] = !isNegated;
        break;
      }
      // Underline with optional type and color
      case "underline": {
        const underlineAttrs = {};
        if (attrs.underlineType) {
          underlineAttrs["w:val"] = String(attrs.underlineType);
        } else {
          underlineAttrs["w:val"] = "single";
        }
        if (attrs.underlineColor) {
          underlineAttrs["w:color"] = colorToHexWithoutHash(String(attrs.underlineColor));
        }
        if (Object.keys(underlineAttrs).length > 0) {
          runProperties.underline = underlineAttrs;
        }
        break;
      }
      // Highlight (background color)
      case "highlight": {
        if (attrs.color) {
          const color = String(attrs.color).toLowerCase();
          if (color === "transparent") {
            runProperties.highlight = { "w:val": "none" };
          } else {
            runProperties.highlight = { "w:val": color };
          }
        }
        break;
      }
      // textStyle contains multiple style attributes
      case "textStyle": {
        if (attrs.color != null) {
          runProperties.color = {
            val: colorToHexWithoutHash(String(attrs.color))
          };
        }
        if (attrs.fontSize != null) {
          const points = parseFontSizeToPoints(attrs.fontSize);
          if (points !== null) {
            runProperties.fontSize = points * 2;
          }
        }
        if (attrs.fontFamily != null) {
          const cleanedFont = cleanFontFamily(String(attrs.fontFamily));
          runProperties.fontFamily = {
            ascii: cleanedFont,
            eastAsia: cleanedFont,
            hAnsi: cleanedFont,
            cs: cleanedFont
          };
        }
        if (attrs.letterSpacing != null) {
          const ptValue = parseFloat(String(attrs.letterSpacing));
          if (!isNaN(ptValue)) {
            runProperties.letterSpacing = ptToTwips(ptValue);
          }
        }
        if (attrs.textTransform != null) {
          runProperties.textTransform = String(attrs.textTransform);
        }
        break;
      }
    }
  }
  return runProperties;
}
function collectMarksRecursively(node, allMarks) {
  if (node.type === "text" && node.marks && Array.isArray(node.marks)) {
    allMarks.push(...node.marks);
  }
  if (node.content && Array.isArray(node.content)) {
    for (const child of node.content) {
      collectMarksRecursively(child, allMarks);
    }
  }
}
function collectMarksFromRunChildren(runNode) {
  const allMarks = [];
  if (!runNode.content || !Array.isArray(runNode.content)) {
    return allMarks;
  }
  for (const child of runNode.content) {
    collectMarksRecursively(child, allMarks);
  }
  const marksByType = /* @__PURE__ */ new Map();
  for (const mark of allMarks) {
    marksByType.set(mark.type, mark);
  }
  return Array.from(marksByType.values());
}
function normalizeNode(node) {
  if (node.type === "text" && node.marks && Array.isArray(node.marks)) {
    const normalizedMarks = normalizeMarksForRendering(node.marks);
    return {
      ...node,
      marks: normalizedMarks
    };
  }
  if (node.type === "run") {
    const normalizedContent = node.content?.map(normalizeNode);
    const normalizedNode = { ...node, content: normalizedContent };
    const marks = collectMarksFromRunChildren(normalizedNode);
    if (marks.length > 0) {
      const runPropsFromMarks = marksToRunProperties(marks);
      const existingRunProps = node.attrs?.runProperties || {};
      const mergedRunProps = {
        ...existingRunProps,
        ...runPropsFromMarks
      };
      return {
        ...normalizedNode,
        attrs: {
          ...normalizedNode.attrs,
          runProperties: mergedRunProps
        }
      };
    }
    return normalizedNode;
  }
  if (node.content && Array.isArray(node.content)) {
    return {
      ...node,
      content: node.content.map(normalizeNode)
    };
  }
  return node;
}
function normalizeRunProperties(doc) {
  const cloned = JSON.parse(JSON.stringify(doc));
  return normalizeNode(cloned);
}

// src/services/contentResolver.ts
function detectContentType(content) {
  if (content instanceof File) {
    return "file";
  }
  if (typeof content === "string") {
    return "html";
  }
  return "json";
}
function isProseMirrorJSON(content) {
  if (!content || typeof content !== "object") return false;
  const obj = content;
  return typeof obj.type === "string" && (obj.type === "doc" || Array.isArray(obj.content));
}
async function parseHtmlToJson(html, SuperDoc) {
  const container = document.createElement("div");
  container.style.cssText = "position:absolute;top:-9999px;left:-9999px;width:800px;height:600px;visibility:hidden;";
  document.body.appendChild(container);
  return new Promise((resolve, reject) => {
    let superdoc = null;
    let resolved = false;
    const cleanup = () => {
      setTimeout(() => {
        if (superdoc) {
          try {
            const sd = superdoc;
            superdoc = null;
            sd.destroy?.();
          } catch {
          }
        }
        if (container.parentNode) {
          container.parentNode.removeChild(container);
        }
      }, TIMEOUTS.CLEANUP_DELAY);
    };
    const createMockPasteEvent = (htmlContent) => {
      const dataTransfer = new DataTransfer();
      dataTransfer.setData("text/html", htmlContent);
      dataTransfer.setData("text/plain", "");
      const event = new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        clipboardData: dataTransfer
      });
      return event;
    };
    const tryPasteApproach = (sd, onSuccess, onFail) => {
      try {
        const editor = sd?.activeEditor;
        if (!editor?.view?.pasteHTML) {
          onFail();
          return;
        }
        editor.commands.focus?.();
        if (editor.commands.selectAll && editor.commands.deleteSelection) {
          editor.commands.selectAll();
          editor.commands.deleteSelection();
        }
        const mockEvent = createMockPasteEvent(html);
        editor.view.pasteHTML(html, mockEvent);
        setTimeout(() => {
          try {
            const json = editor.getJSON();
            if (json?.content?.length > 0) {
              const normalizedJson = normalizeRunProperties(json);
              onSuccess(normalizedJson);
            } else {
              onFail();
            }
          } catch {
            onFail();
          }
        }, 100);
      } catch (err) {
        console.warn("[parseHtmlToJson] Paste approach error:", err);
        onFail();
      }
    };
    const fallbackToImport = () => {
      if (superdoc) {
        try {
          superdoc.destroy?.();
        } catch {
        }
        superdoc = null;
      }
      superdoc = new SuperDoc({
        selector: container,
        html,
        // Use the actual HTML content
        documentMode: "viewing",
        rulers: false,
        user: { name: "Parser", email: "parser@local" },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onReady: ({ superdoc: sd }) => {
          if (resolved) return;
          try {
            const editor = sd?.activeEditor;
            if (!editor) {
              throw new Error("No active editor found");
            }
            const json = editor.getJSON();
            const normalizedJson = normalizeRunProperties(json);
            resolved = true;
            cleanup();
            resolve(normalizedJson);
          } catch (err) {
            resolved = true;
            cleanup();
            reject(err);
          }
        },
        onException: ({ error: err }) => {
          if (resolved) return;
          resolved = true;
          cleanup();
          reject(err);
        }
      });
    };
    setTimeout(async () => {
      if (resolved) return;
      try {
        superdoc = new SuperDoc({
          selector: container,
          html: "<p></p>",
          // Minimal empty document
          documentMode: "editing",
          // Need editing mode to use paste
          rulers: false,
          user: { name: "Parser", email: "parser@local" },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          onReady: ({ superdoc: sd }) => {
            if (resolved) return;
            tryPasteApproach(
              sd,
              // Success callback
              (json) => {
                if (resolved) return;
                resolved = true;
                cleanup();
                resolve(json);
              },
              // Fail callback - try fallback
              () => {
                if (resolved) return;
                console.warn("[parseHtmlToJson] Paste approach failed, falling back to import");
                fallbackToImport();
              }
            );
          },
          onException: ({ error: err }) => {
            if (resolved) return;
            console.warn("[parseHtmlToJson] Paste approach exception, falling back:", err);
            fallbackToImport();
          }
        });
        setTimeout(() => {
          if (!resolved) {
            resolved = true;
            cleanup();
            reject(new Error("HTML parsing timed out"));
          }
        }, TIMEOUTS.PARSE_TIMEOUT);
      } catch (err) {
        try {
          fallbackToImport();
        } catch (fallbackErr) {
          cleanup();
          reject(fallbackErr);
        }
      }
    }, 50);
  });
}
async function parseDocxFile(file, SuperDoc) {
  const container = document.createElement("div");
  container.style.cssText = "position:absolute;top:-9999px;left:-9999px;width:800px;height:600px;visibility:hidden;";
  document.body.appendChild(container);
  return new Promise((resolve, reject) => {
    let superdoc = null;
    let resolved = false;
    const cleanup = () => {
      setTimeout(() => {
        if (superdoc) {
          try {
            const sd = superdoc;
            superdoc = null;
            sd.destroy?.();
          } catch {
          }
        }
        if (container.parentNode) {
          container.parentNode.removeChild(container);
        }
      }, TIMEOUTS.CLEANUP_DELAY);
    };
    setTimeout(async () => {
      if (resolved) return;
      try {
        superdoc = new SuperDoc({
          selector: container,
          document: file,
          documentMode: "viewing",
          rulers: false,
          user: { name: "Parser", email: "parser@local" },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          onReady: ({ superdoc: sd }) => {
            if (resolved) return;
            try {
              const editor = sd?.activeEditor;
              if (!editor) {
                throw new Error("No active editor found");
              }
              const json = editor.getJSON();
              resolved = true;
              cleanup();
              resolve(json);
            } catch (err) {
              resolved = true;
              cleanup();
              reject(err);
            }
          },
          onException: ({ error: err }) => {
            if (resolved) return;
            resolved = true;
            cleanup();
            reject(err);
          }
        });
        setTimeout(() => {
          if (!resolved) {
            resolved = true;
            cleanup();
            reject(new Error("Document parsing timed out"));
          }
        }, TIMEOUTS.PARSE_TIMEOUT);
      } catch (err) {
        cleanup();
        reject(err);
      }
    }, 50);
  });
}
var dmp = new DiffMatchPatch();
var DIFF_DELETE = -1;
var DIFF_INSERT = 1;
var DIFF_EQUAL = 0;
function extractTextSpans(node, offset = 0) {
  const spans = [];
  if (!node) return spans;
  if (node.type === "text" && node.text) {
    spans.push({
      text: node.text,
      from: offset,
      to: offset + node.text.length,
      marks: node.marks || []
    });
    return spans;
  }
  if (node.content && Array.isArray(node.content)) {
    let currentOffset = offset;
    for (const child of node.content) {
      const childSpans = extractTextSpans(child, currentOffset);
      spans.push(...childSpans);
      for (const span of childSpans) {
        currentOffset = Math.max(currentOffset, span.to);
      }
      if (childSpans.length === 0 && child.type === "text" && child.text) {
        currentOffset += child.text.length;
      }
    }
  }
  return spans;
}
function extractTextContent(node) {
  if (!node) return "";
  if (node.type === "text" && node.text) {
    return node.text;
  }
  if (node.content && Array.isArray(node.content)) {
    return node.content.map(extractTextContent).join("");
  }
  return "";
}
function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (typeof a !== "object" || a === null || b === null) return false;
  const objA = a;
  const objB = b;
  const keysA = Object.keys(objA);
  const keysB = Object.keys(objB);
  if (keysA.length !== keysB.length) return false;
  for (const key of keysA) {
    if (!keysB.includes(key)) return false;
    if (!deepEqual(objA[key], objB[key])) return false;
  }
  return true;
}
function marksEqual(marksA, marksB) {
  if (marksA.length !== marksB.length) return false;
  const sortedA = [...marksA].sort((a, b) => (a.type || "").localeCompare(b.type || ""));
  const sortedB = [...marksB].sort((a, b) => (a.type || "").localeCompare(b.type || ""));
  return deepEqual(sortedA, sortedB);
}
function getMarksAtPosition(spans, pos) {
  for (const span of spans) {
    if (pos >= span.from && pos < span.to) {
      return span.marks;
    }
  }
  return [];
}
function hasDefinedAttributes(marks) {
  if (!marks || marks.length === 0) return false;
  for (const mark of marks) {
    if (!mark.attrs) continue;
    for (const value of Object.values(mark.attrs)) {
      if (value !== void 0 && value !== null) {
        return true;
      }
    }
  }
  return marks.some((m) => !m.attrs);
}
function detectFormatChanges(spansA, spansB, segments) {
  const formatChanges = [];
  let posA = 0;
  let posB = 0;
  for (const segment of segments) {
    if (segment.type === "equal") {
      let i = 0;
      while (i < segment.text.length) {
        const marksA = getMarksAtPosition(spansA, posA + i);
        const marksB = getMarksAtPosition(spansB, posB + i);
        if (!marksEqual(marksA, marksB)) {
          const startI = i;
          const startMarksA = marksA;
          const startMarksB = marksB;
          while (i < segment.text.length) {
            const currentMarksA = getMarksAtPosition(spansA, posA + i);
            const currentMarksB = getMarksAtPosition(spansB, posB + i);
            if (marksEqual(currentMarksA, startMarksA) && marksEqual(currentMarksB, startMarksB)) {
              i++;
            } else {
              break;
            }
          }
          if (hasDefinedAttributes(startMarksB) || hasDefinedAttributes(startMarksA)) {
            if (hasDefinedAttributes(startMarksB)) {
              formatChanges.push({
                from: posA + startI,
                to: posA + i,
                text: segment.text.substring(startI, i),
                before: startMarksA,
                after: startMarksB
              });
            }
          }
        } else {
          i++;
        }
      }
      posA += segment.text.length;
      posB += segment.text.length;
    } else if (segment.type === "delete") {
      posA += segment.text.length;
    } else if (segment.type === "insert") {
      posB += segment.text.length;
    }
  }
  return formatChanges;
}
function diffDocuments(docA, docB) {
  const textA = extractTextContent(docA);
  const textB = extractTextContent(docB);
  const diffs = dmp.diff_main(textA, textB);
  dmp.diff_cleanupSemantic(diffs);
  const segments = [];
  let insertCount = 0;
  let deleteCount = 0;
  let posA = 0;
  let posB = 0;
  for (const [op, text] of diffs) {
    if (op === DIFF_EQUAL) {
      segments.push({ type: "equal", text, posA, posB });
      posA += text.length;
      posB += text.length;
    } else if (op === DIFF_INSERT) {
      segments.push({ type: "insert", text, posB });
      posB += text.length;
      insertCount++;
    } else if (op === DIFF_DELETE) {
      segments.push({ type: "delete", text, posA });
      posA += text.length;
      deleteCount++;
    }
  }
  const spansA = extractTextSpans(docA);
  const spansB = extractTextSpans(docB);
  const formatChanges = detectFormatChanges(spansA, spansB, segments);
  const summary = [];
  if (insertCount > 0) {
    summary.push(`${insertCount} insertion(s)`);
  }
  if (deleteCount > 0) {
    summary.push(`${deleteCount} deletion(s)`);
  }
  if (formatChanges.length > 0) {
    summary.push(`${formatChanges.length} format change(s)`);
  }
  if (insertCount === 0 && deleteCount === 0 && formatChanges.length === 0) {
    summary.push("No changes detected");
  }
  return {
    segments,
    formatChanges,
    textA,
    textB,
    summary,
    spansB
    // Include docB spans for mark preservation during merge
  };
}

// src/services/changeContextExtractor.ts
function extractEnrichedChanges(mergedJson) {
  const changes = [];
  const context = {
    currentSection: null,
    currentParagraphText: "",
    currentNodeType: "unknown",
    tableIndex: 0,
    listIndex: 0,
    listDepth: 0
  };
  traverseDocument(mergedJson, context, changes);
  return groupReplacements(changes);
}
function extractEnrichedChangesWithStructural(mergedJson, structuralInfos) {
  const textChanges = extractEnrichedChanges(mergedJson);
  const structuralChanges = structuralInfos.map((info) => {
    const location = buildLocationFromStructural(info);
    return {
      type: info.type.includes("Insert") ? "insertion" : "deletion",
      text: info.preview,
      location,
      surroundingText: info.preview,
      structuralType: info.type,
      charCount: info.preview.length
    };
  });
  return [...structuralChanges, ...textChanges];
}
function buildLocationFromStructural(info) {
  const nodeType = mapNodeTypeToLocation(info.nodeType);
  return {
    nodeType,
    description: info.location,
    sectionTitle: void 0
  };
}
function mapNodeTypeToLocation(nodeType) {
  switch (nodeType) {
    case "tableRow":
    case "tableCell":
    case "table":
      return "table";
    case "listItem":
      return "listItem";
    case "paragraph":
      return "paragraph";
    case "heading":
      return "heading";
    case "image":
      return "image";
    default:
      return "unknown";
  }
}
function traverseDocument(node, context, changes) {
  if (!node) return;
  if (node.type === "heading") {
    context.currentSection = extractAllText(node);
    context.headingLevel = node.attrs?.level || 1;
    context.currentNodeType = "heading";
    context.currentParagraphText = context.currentSection;
  } else if (node.type === "paragraph") {
    context.currentNodeType = "paragraph";
    context.currentParagraphText = extractAllText(node);
  } else if (node.type === "listItem") {
    context.currentNodeType = "listItem";
    context.currentParagraphText = extractAllText(node);
    context.listItemIndex = (context.listItemIndex || 0) + 1;
  } else if (node.type === "tableCell" || node.type === "tableHeader") {
    context.currentNodeType = "tableCell";
    context.currentParagraphText = extractAllText(node);
    context.cellIndex = (context.cellIndex || 0) + 1;
  } else if (node.type === "tableRow") {
    context.rowIndex = (context.rowIndex || 0) + 1;
    context.cellIndex = 0;
  } else if (node.type === "table") {
    context.tableIndex = (context.tableIndex || 0) + 1;
    context.rowIndex = 0;
  } else if (node.type === "bulletList" || node.type === "orderedList") {
    context.listIndex = (context.listIndex || 0) + 1;
    context.listItemIndex = 0;
    context.listDepth = (context.listDepth || 0) + 1;
  }
  if (node.type === "text" && node.marks) {
    const trackMark = findTrackChangeMark(node.marks);
    if (trackMark) {
      const change = createEnrichedChange(node, trackMark, context);
      if (change) changes.push(change);
    }
  }
  if (node.content && Array.isArray(node.content)) {
    for (const child of node.content) {
      traverseDocument(child, context, changes);
    }
  }
  if (node.type === "bulletList" || node.type === "orderedList") {
    context.listDepth = Math.max(0, (context.listDepth || 1) - 1);
  }
}
function extractAllText(node) {
  if (!node) return "";
  if (node.type === "text") {
    return node.text || "";
  }
  if (node.content && Array.isArray(node.content)) {
    return node.content.map(extractAllText).join("");
  }
  return "";
}
function findTrackChangeMark(marks) {
  return marks.find(
    (m) => m.type === "trackInsert" || m.type === "trackDelete" || m.type === "trackFormat"
  ) || null;
}
function createEnrichedChange(node, trackMark, context) {
  const text = node.text || "";
  const location = buildLocation(context);
  const surroundingText = extractSurroundingSentence(text, context.currentParagraphText);
  const tablePosition = context.currentNodeType === "tableCell" && context.rowIndex !== void 0 ? { row: context.rowIndex, column: context.cellIndex || 0 } : void 0;
  const listPosition = context.currentNodeType === "listItem" && context.listItemIndex !== void 0 ? { index: context.listItemIndex, depth: context.listDepth || 0 } : void 0;
  if (trackMark.type === "trackInsert") {
    return {
      type: "insertion",
      text,
      location,
      surroundingText,
      charCount: text.length,
      tablePosition,
      listPosition
    };
  }
  if (trackMark.type === "trackDelete") {
    return {
      type: "deletion",
      text,
      location,
      surroundingText,
      charCount: text.length,
      tablePosition,
      listPosition
    };
  }
  if (trackMark.type === "trackFormat") {
    const before = trackMark.attrs?.before || [];
    const after = trackMark.attrs?.after || [];
    return {
      type: "format",
      text,
      location,
      surroundingText,
      formatDetails: {
        added: after.map((m) => m.type).filter((t) => !before.some((b) => b.type === t)),
        removed: before.map((m) => m.type).filter((t) => !after.some((a) => a.type === t))
      },
      charCount: text.length,
      tablePosition,
      listPosition
    };
  }
  return null;
}
function extractSurroundingSentence(changedText, paragraphText) {
  if (!paragraphText || !changedText) return "";
  const changeIndex = paragraphText.indexOf(changedText);
  if (changeIndex === -1) {
    return truncate(paragraphText, 150);
  }
  const sentenceBreaks = /([.;!?]\s+)/g;
  const sentences = [];
  let lastEnd = 0;
  let match;
  while ((match = sentenceBreaks.exec(paragraphText)) !== null) {
    sentences.push({
      text: paragraphText.slice(lastEnd, match.index + match[0].length).trim(),
      start: lastEnd,
      end: match.index + match[0].length
    });
    lastEnd = match.index + match[0].length;
  }
  if (lastEnd < paragraphText.length) {
    sentences.push({
      text: paragraphText.slice(lastEnd).trim(),
      start: lastEnd,
      end: paragraphText.length
    });
  }
  const changeEnd = changeIndex + changedText.length;
  for (const sentence of sentences) {
    if (changeIndex >= sentence.start && changeIndex < sentence.end) {
      return truncate(sentence.text, 200);
    }
  }
  const windowSize = 100;
  const start = Math.max(0, changeIndex - windowSize);
  const end = Math.min(paragraphText.length, changeEnd + windowSize);
  let result = paragraphText.slice(start, end);
  if (start > 0) result = "..." + result;
  if (end < paragraphText.length) result = result + "...";
  return result;
}
function truncate(text, maxLen) {
  if (!text) return "";
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length <= maxLen) return cleaned;
  return cleaned.slice(0, maxLen - 3).trim() + "...";
}
function buildLocation(context) {
  const nodeType = context.currentNodeType;
  let description;
  if (nodeType === "heading") {
    description = context.headingLevel === 1 ? "document title" : "section heading";
  } else if (nodeType === "tableCell" && context.tableIndex !== void 0) {
    const colLetter = String.fromCharCode(65 + (context.cellIndex || 0));
    description = `Table ${context.tableIndex}, Cell ${colLetter}${context.rowIndex || 1}`;
  } else if (nodeType === "listItem" && context.listIndex !== void 0) {
    const depthStr = (context.listDepth || 0) > 1 ? ` (nested, level ${context.listDepth})` : "";
    description = `List ${context.listIndex}, Item ${context.listItemIndex || 1}${depthStr}`;
  } else if (context.currentSection) {
    description = `"${truncate(context.currentSection, 50)}" section`;
  } else {
    description = "document body";
  }
  const tableCoords = context.currentNodeType === "tableCell" && context.rowIndex !== void 0 ? { row: context.rowIndex, column: context.cellIndex || 0 } : void 0;
  return {
    nodeType,
    headingLevel: context.headingLevel,
    sectionTitle: context.currentSection || void 0,
    description,
    tableCoords,
    listIndex: context.currentNodeType === "listItem" ? context.listItemIndex : void 0,
    listDepth: context.currentNodeType === "listItem" ? context.listDepth : void 0
  };
}
function groupReplacements(changes) {
  const result = [];
  let i = 0;
  while (i < changes.length) {
    const current = changes[i];
    const next = changes[i + 1];
    if (current.type === "deletion" && next?.type === "insertion" && current.location.sectionTitle === next.location.sectionTitle) {
      result.push({
        type: "replacement",
        oldText: current.text,
        newText: next.text,
        location: current.location,
        surroundingText: current.surroundingText || next.surroundingText,
        charCount: (current.charCount || 0) + (next.charCount || 0)
      });
      i += 2;
    } else {
      result.push(current);
      i++;
    }
  }
  return result;
}

// src/services/nodeAligner.ts
init_nodeFingerprint();
var SIMILARITY_THRESHOLD = 0.7;
function findLCS(seqA, seqB) {
  const m = seqA.length;
  const n = seqB.length;
  const dp = Array.from(
    { length: m + 1 },
    () => Array(n + 1).fill(0)
  );
  for (let i2 = 1; i2 <= m; i2++) {
    for (let j2 = 1; j2 <= n; j2++) {
      if (seqA[i2 - 1] === seqB[j2 - 1]) {
        dp[i2][j2] = dp[i2 - 1][j2 - 1] + 1;
      } else {
        dp[i2][j2] = Math.max(dp[i2 - 1][j2], dp[i2][j2 - 1]);
      }
    }
  }
  const result = [];
  let i = m;
  let j = n;
  while (i > 0 && j > 0) {
    if (seqA[i - 1] === seqB[j - 1]) {
      result.unshift([i - 1, j - 1]);
      i--;
      j--;
    } else if (dp[i - 1][j] > dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }
  return result;
}
function findFuzzyMatches(unmatchedA, unmatchedB, threshold = SIMILARITY_THRESHOLD) {
  const matches = [];
  const usedA = /* @__PURE__ */ new Set();
  const usedB = /* @__PURE__ */ new Set();
  const similarities = [];
  for (let i = 0; i < unmatchedA.length; i++) {
    for (let j = 0; j < unmatchedB.length; j++) {
      const fpSim = calculateSimilarity(unmatchedA[i].fingerprint, unmatchedB[j].fingerprint);
      if (fpSim === 0) continue;
      const textSim = getNodeTextSimilarity(unmatchedA[i].node, unmatchedB[j].node);
      if (textSim >= threshold) {
        similarities.push({ i, j, sim: textSim });
      }
    }
  }
  similarities.sort((a, b) => b.sim - a.sim);
  for (const { i, j, sim } of similarities) {
    if (!usedA.has(i) && !usedB.has(j)) {
      matches.push([unmatchedA[i], unmatchedB[j], sim]);
      usedA.add(i);
      usedB.add(j);
    }
  }
  const remainingA = unmatchedA.filter((_, i) => !usedA.has(i));
  const remainingB = unmatchedB.filter((_, j) => !usedB.has(j));
  return { matches, remainingA, remainingB };
}
function alignNodes(nodesA, nodesB) {
  const fpsA = nodesA.map((n) => n.fingerprint);
  const fpsB = nodesB.map((n) => n.fingerprint);
  const lcsMatches = findLCS(fpsA, fpsB);
  const matchedIndicesA = new Set(lcsMatches.map(([i]) => i));
  const matchedIndicesB = new Set(lcsMatches.map(([, j]) => j));
  const matched = lcsMatches.map(([i, j]) => ({
    pathA: nodesA[i].path,
    pathB: nodesB[j].path,
    fingerprint: nodesA[i].fingerprint,
    similarity: 1
    // Exact match
  }));
  const unmatchedA = nodesA.filter((_, i) => !matchedIndicesA.has(i));
  const unmatchedB = nodesB.filter((_, j) => !matchedIndicesB.has(j));
  const { matches: fuzzyMatches, remainingA, remainingB } = findFuzzyMatches(
    unmatchedA,
    unmatchedB
  );
  for (const [nodeA, nodeB, similarity] of fuzzyMatches) {
    matched.push({
      pathA: nodeA.path,
      pathB: nodeB.path,
      fingerprint: nodeA.fingerprint,
      similarity
    });
  }
  return {
    matched,
    deletions: remainingA,
    insertions: remainingB
  };
}
function alignDocuments(docA, docB) {
  const blocksA = extractBlockFingerprints(docA);
  const blocksB = extractBlockFingerprints(docB);
  return alignNodes(blocksA, blocksB);
}
function alignTableRows(tableA, tableB, tablePathA, tablePathB) {
  const rowsA = (tableA.content || []).map((row, i) => ({
    node: row,
    fingerprint: "",
    // Will be computed
    path: [...tablePathA, i]
  }));
  const rowsB = (tableB.content || []).map((row, i) => ({
    node: row,
    fingerprint: "",
    // Will be computed
    path: [...tablePathB, i]
  }));
  const { generateFingerprint: generateFingerprint2 } = (init_nodeFingerprint(), __toCommonJS(nodeFingerprint_exports));
  for (const row of rowsA) {
    row.fingerprint = generateFingerprint2(row.node);
  }
  for (const row of rowsB) {
    row.fingerprint = generateFingerprint2(row.node);
  }
  return alignNodes(rowsA, rowsB);
}
function alignTableCells(rowA, rowB, rowPathA, rowPathB) {
  const cellsA = (rowA.content || []).map((cell, i) => ({
    node: cell,
    fingerprint: "",
    // Will be computed
    path: [...rowPathA, i]
  }));
  const cellsB = (rowB.content || []).map((cell, i) => ({
    node: cell,
    fingerprint: "",
    // Will be computed
    path: [...rowPathB, i]
  }));
  const { generateFingerprint: generateFingerprint2 } = (init_nodeFingerprint(), __toCommonJS(nodeFingerprint_exports));
  for (const cell of cellsA) {
    cell.fingerprint = generateFingerprint2(cell.node);
  }
  for (const cell of cellsB) {
    cell.fingerprint = generateFingerprint2(cell.node);
  }
  if (cellsA.length === cellsB.length) {
    const matched = [];
    for (let i = 0; i < cellsA.length; i++) {
      const similarity = getNodeTextSimilarity(cellsA[i].node, cellsB[i].node);
      matched.push({
        pathA: cellsA[i].path,
        pathB: cellsB[i].path,
        fingerprint: cellsA[i].fingerprint,
        similarity
      });
    }
    return { matched, deletions: [], insertions: [] };
  }
  return alignNodes(cellsA, cellsB);
}
function alignListItems(listA, listB, listPathA, listPathB) {
  const itemsA = (listA.content || []).map((item, i) => ({
    node: item,
    fingerprint: "",
    // Will be computed
    path: [...listPathA, i]
  }));
  const itemsB = (listB.content || []).map((item, i) => ({
    node: item,
    fingerprint: "",
    // Will be computed
    path: [...listPathB, i]
  }));
  const { generateFingerprint: generateFingerprint2 } = (init_nodeFingerprint(), __toCommonJS(nodeFingerprint_exports));
  for (const item of itemsA) {
    item.fingerprint = generateFingerprint2(item.node);
  }
  for (const item of itemsB) {
    item.fingerprint = generateFingerprint2(item.node);
  }
  return alignNodes(itemsA, itemsB);
}
function cloneNode(node) {
  return JSON.parse(JSON.stringify(node));
}
function getMarkSpansForRange(spansB, start, end) {
  const result = [];
  for (const span of spansB) {
    if (span.to > start && span.from < end) {
      const overlapStart = Math.max(span.from, start);
      const overlapEnd = Math.min(span.to, end);
      result.push({
        relStart: overlapStart - start,
        relEnd: overlapEnd - start,
        marks: span.marks || []
      });
    }
  }
  return result;
}
function createInsertedTextNodes(text, posB, spansB, author, replacementId) {
  const result = [];
  const trackMark = createTrackInsertMark(author, replacementId);
  if (posB === void 0 || spansB.length === 0) {
    return [{
      type: "text",
      text,
      marks: [trackMark]
    }];
  }
  const markSpans = getMarkSpansForRange(spansB, posB, posB + text.length);
  if (markSpans.length === 0) {
    return [{
      type: "text",
      text,
      marks: [trackMark]
    }];
  }
  markSpans.sort((a, b) => a.relStart - b.relStart);
  let processedUpTo = 0;
  for (const span of markSpans) {
    if (span.relStart > processedUpTo) {
      result.push({
        type: "text",
        text: text.substring(processedUpTo, span.relStart),
        marks: [trackMark]
      });
    }
    if (span.relEnd > span.relStart) {
      const spanText = text.substring(span.relStart, span.relEnd);
      const normalizedSpanMarks = normalizeMarksForRendering(span.marks);
      const marks = [...normalizedSpanMarks, trackMark];
      result.push({
        type: "text",
        text: spanText,
        marks
      });
      processedUpTo = span.relEnd;
    }
  }
  if (processedUpTo < text.length) {
    result.push({
      type: "text",
      text: text.substring(processedUpTo),
      marks: [trackMark]
    });
  }
  return result;
}
function mergeDocuments(docA, docB, diffResult, author = DEFAULT_AUTHOR) {
  const merged = cloneNode(docA);
  const charStates = [];
  let insertions = [];
  const formatChanges = diffResult.formatChanges || [];
  function getFormatChangeAt(pos) {
    for (const fc of formatChanges) {
      if (pos >= fc.from && pos < fc.to) {
        return fc;
      }
    }
    return null;
  }
  let docAOffset = 0;
  const segments = diffResult.segments;
  for (let segIdx = 0; segIdx < segments.length; segIdx++) {
    const segment = segments[segIdx];
    if (segment.type === "equal") {
      for (let i = 0; i < segment.text.length; i++) {
        charStates[docAOffset + i] = { type: "equal" };
      }
      docAOffset += segment.text.length;
    } else if (segment.type === "delete") {
      const nextSegment = segments[segIdx + 1];
      const isReplacement = nextSegment && nextSegment.type === "insert";
      const replacementId = isReplacement ? v4() : void 0;
      for (let i = 0; i < segment.text.length; i++) {
        charStates[docAOffset + i] = { type: "delete", replacementId };
      }
      docAOffset += segment.text.length;
      if (isReplacement && nextSegment) {
        insertions.push({
          afterOffset: docAOffset,
          text: nextSegment.text,
          replacementId,
          posB: nextSegment.posB
          // Capture docB position for mark lookup
        });
        segIdx++;
      }
    } else if (segment.type === "insert") {
      insertions.push({
        afterOffset: docAOffset,
        text: segment.text,
        posB: segment.posB
        // Capture docB position for mark lookup
      });
    }
  }
  const spansB = diffResult.spansB || [];
  function transformNode(node, nodeOffset, path) {
    if (node.type === "text" && node.text) {
      const text = node.text;
      const result = [];
      let i = 0;
      while (i < text.length) {
        const charOffset = nodeOffset + i;
        const charState = charStates[charOffset] || { type: "equal" };
        const insertionsHere = insertions.filter((ins) => ins.afterOffset === charOffset);
        for (const ins of insertionsHere) {
          const insertedNodes = createInsertedTextNodes(
            ins.text,
            ins.posB,
            spansB,
            author,
            ins.replacementId
          );
          result.push(...insertedNodes);
        }
        const currentFormatChange = getFormatChangeAt(nodeOffset + i);
        let j = i + 1;
        while (j < text.length) {
          const nextState = charStates[nodeOffset + j] || { type: "equal" };
          if (nextState.type !== charState.type) break;
          if (insertions.some((ins) => ins.afterOffset === nodeOffset + j)) break;
          const nextFormatChange = getFormatChangeAt(nodeOffset + j);
          if (currentFormatChange !== nextFormatChange) break;
          j++;
        }
        const chunk = text.substring(i, j);
        let marks = [...node.marks || []];
        if (charState.type === "delete") {
          marks.push(createTrackDeleteMark(author, charState.replacementId));
        } else if (charState.type === "equal") {
          if (currentFormatChange) {
            const trackFormatMark = createTrackFormatMark(
              currentFormatChange.before,
              currentFormatChange.after,
              author
            );
            const normalizedAfterMarks = normalizeMarksForRendering(currentFormatChange.after);
            marks = [...normalizedAfterMarks, trackFormatMark];
          }
        }
        result.push({
          type: "text",
          text: chunk,
          marks: marks.length > 0 ? marks : void 0
        });
        i = j;
      }
      const endOffset = nodeOffset + text.length;
      const endInsertions = insertions.filter((ins) => ins.afterOffset === endOffset);
      for (const ins of endInsertions) {
        const insertedNodes = createInsertedTextNodes(
          ins.text,
          ins.posB,
          spansB,
          author,
          ins.replacementId
        );
        result.push(...insertedNodes);
      }
      insertions = insertions.filter(
        (ins) => ins.afterOffset < nodeOffset || ins.afterOffset > endOffset
      );
      return { nodes: result, consumedLength: text.length };
    }
    if (node.content && Array.isArray(node.content)) {
      const newContent = [];
      let offset = nodeOffset;
      for (const child of node.content) {
        const { nodes, consumedLength } = transformNode(child, offset);
        newContent.push(...nodes);
        offset += consumedLength;
      }
      return {
        nodes: [{ ...node, content: newContent }],
        consumedLength: offset - nodeOffset
      };
    }
    return { nodes: [node], consumedLength: 0 };
  }
  if (merged.content && Array.isArray(merged.content)) {
    const newContent = [];
    let offset = 0;
    for (let i = 0; i < merged.content.length; i++) {
      const child = merged.content[i];
      const { nodes, consumedLength } = transformNode(child, offset);
      newContent.push(...nodes);
      offset += consumedLength;
    }
    merged.content = newContent;
  }
  if (insertions.length > 0) {
    for (const ins of insertions) {
      const insertedNodes = createInsertedTextNodes(
        ins.text,
        ins.posB,
        spansB,
        author,
        ins.replacementId
      );
      const insertNode = {
        type: "paragraph",
        content: [
          {
            type: "run",
            content: insertedNodes
          }
        ]
      };
      if (!merged.content) merged.content = [];
      merged.content.push(insertNode);
    }
  }
  return merged;
}

// src/services/attrComparer.ts
var KNOWN_DEFAULTS = {
  paragraph: {
    textAlign: "left",
    indent: 0,
    lineSpacing: 1
  },
  heading: {
    level: 1,
    textAlign: "left"
  },
  table: {
    alignment: "left",
    borderStyle: "single"
  },
  tableCell: {
    verticalAlign: "top",
    colspan: 1,
    rowspan: 1
  },
  listItem: {
    indent: 0
  },
  image: {
    width: "auto",
    height: "auto"
  }
};
var IGNORED_ATTRS = /* @__PURE__ */ new Set([
  "id",
  "class",
  "data-id",
  "data-pm-slice",
  "__trackAttrChanges"
]);
function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value) && Object.prototype.toString.call(value) === "[object Object]";
}
function deepEqual2(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return a === b;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((val, i) => deepEqual2(val, b[i]));
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;
    return keysA.every((key) => deepEqual2(a[key], b[key]));
  }
  return false;
}
function normalizeValue(value, key, nodeType) {
  if (value !== void 0 && value !== null) {
    return value;
  }
  const defaults = KNOWN_DEFAULTS[nodeType];
  if (defaults && key in defaults) {
    return defaults[key];
  }
  return value;
}
function compareAttrs(attrsA, attrsB, nodeType = "", prefix = "") {
  const diffs = [];
  const a = attrsA || {};
  const b = attrsB || {};
  const allKeys = /* @__PURE__ */ new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of allKeys) {
    if (IGNORED_ATTRS.has(key)) continue;
    const fullKey = prefix ? `${prefix}.${key}` : key;
    const valueA = normalizeValue(a[key], key, nodeType);
    const valueB = normalizeValue(b[key], key, nodeType);
    if (isPlainObject(valueA) && isPlainObject(valueB)) {
      const nestedDiffs = compareAttrs(
        valueA,
        valueB,
        nodeType,
        fullKey
      );
      diffs.push(...nestedDiffs);
      continue;
    }
    if (!deepEqual2(valueA, valueB)) {
      diffs.push({
        key: fullKey,
        before: valueA,
        after: valueB
      });
    }
  }
  return diffs;
}
function compareNodeAttrs(nodeA, nodeB) {
  const nodeType = nodeA.type || nodeB.type || "";
  return compareAttrs(nodeA.attrs, nodeB.attrs, nodeType);
}

// src/services/tableBlockDiffer.ts
function detectColumnChanges(matchedRows, tableA, tableB, tablePathA, tablePathB) {
  const changes = [];
  if (matchedRows.length === 0) return changes;
  const firstMatch = matchedRows[0];
  const rowIdxA = firstMatch.pathA[firstMatch.pathA.length - 1];
  const rowIdxB = firstMatch.pathB[firstMatch.pathB.length - 1];
  const rowA = tableA.content?.[rowIdxA];
  const rowB = tableB.content?.[rowIdxB];
  if (!rowA || !rowB) return changes;
  const cellCountA = rowA.content?.length || 0;
  const cellCountB = rowB.content?.length || 0;
  const diff = cellCountB - cellCountA;
  if (diff === 0) return changes;
  let consistent = true;
  for (const match of matchedRows) {
    const idxA = match.pathA[match.pathA.length - 1];
    const idxB = match.pathB[match.pathB.length - 1];
    const rA = tableA.content?.[idxA];
    const rB = tableB.content?.[idxB];
    if (!rA || !rB) continue;
    const countA = rA.content?.length || 0;
    const countB = rB.content?.length || 0;
    if (countB - countA !== diff) {
      consistent = false;
      break;
    }
  }
  if (!consistent) return changes;
  if (diff > 0) {
    for (let i = 0; i < diff; i++) {
      changes.push({
        id: v4(),
        type: "columnInsert",
        nodeType: "tableColumn",
        path: [...tablePathB],
        node: { type: "column", position: cellCountA + i }
      });
    }
  } else {
    for (let i = 0; i < Math.abs(diff); i++) {
      changes.push({
        id: v4(),
        type: "columnDelete",
        nodeType: "tableColumn",
        path: [...tablePathA],
        node: { type: "column", position: cellCountB + i }
      });
    }
  }
  return changes;
}
function diffTables(tableA, tableB, tablePathA, tablePathB) {
  const result = {
    rowChanges: [],
    columnChanges: [],
    cellMatches: [],
    tableAttrChanges: null,
    cellAttrChanges: []
  };
  const tableAttrDiffs = compareNodeAttrs(tableA, tableB);
  if (tableAttrDiffs.length > 0) {
    result.tableAttrChanges = {
      id: v4(),
      nodeType: "table",
      pathA: tablePathA,
      pathB: tablePathB,
      changes: tableAttrDiffs
    };
  }
  const rowAlignment = alignTableRows(tableA, tableB, tablePathA, tablePathB);
  for (const inserted of rowAlignment.insertions) {
    result.rowChanges.push({
      id: v4(),
      type: "rowInsert",
      nodeType: "tableRow",
      path: inserted.path,
      node: inserted.node
    });
  }
  for (const deleted of rowAlignment.deletions) {
    result.rowChanges.push({
      id: v4(),
      type: "rowDelete",
      nodeType: "tableRow",
      path: deleted.path,
      node: deleted.node
    });
  }
  result.columnChanges = detectColumnChanges(
    rowAlignment.matched,
    tableA,
    tableB,
    tablePathA,
    tablePathB
  );
  for (const rowMatch of rowAlignment.matched) {
    const rowIdxA = rowMatch.pathA[rowMatch.pathA.length - 1];
    const rowIdxB = rowMatch.pathB[rowMatch.pathB.length - 1];
    const rowA = tableA.content?.[rowIdxA];
    const rowB = tableB.content?.[rowIdxB];
    if (!rowA || !rowB) continue;
    const cellAlignment = alignTableCells(
      rowA,
      rowB,
      rowMatch.pathA,
      rowMatch.pathB
    );
    result.cellMatches.push(...cellAlignment.matched);
    for (const cellMatch of cellAlignment.matched) {
      const cellIdxA = cellMatch.pathA[cellMatch.pathA.length - 1];
      const cellIdxB = cellMatch.pathB[cellMatch.pathB.length - 1];
      const cellA = rowA.content?.[cellIdxA];
      const cellB = rowB.content?.[cellIdxB];
      if (!cellA || !cellB) continue;
      const cellAttrDiffs = compareNodeAttrs(cellA, cellB);
      if (cellAttrDiffs.length > 0) {
        result.cellAttrChanges.push({
          id: v4(),
          nodeType: "tableCell",
          pathA: cellMatch.pathA,
          pathB: cellMatch.pathB,
          changes: cellAttrDiffs
        });
      }
    }
  }
  return result;
}
function isTable(node) {
  return node?.type === "table";
}
function isTableRow(node) {
  return node?.type === "tableRow";
}
function getRowLocation(tablePath, rowIndex, tableIndex) {
  return `Table ${tableIndex + 1}, Row ${rowIndex + 1}`;
}
function getRowPreview(row, maxLength = 50) {
  const cells = [];
  for (const cell of row.content || []) {
    const cellText = extractCellText(cell);
    if (cellText) {
      cells.push(cellText);
    }
  }
  const preview = cells.join(" | ");
  if (preview.length > maxLength) {
    return preview.substring(0, maxLength - 3) + "...";
  }
  return preview;
}
function extractCellText(cell) {
  if (!cell.content) return "";
  const texts = [];
  for (const child of cell.content) {
    if (child.type === "text") {
      texts.push(child.text || "");
    } else if (child.type === "paragraph" && child.content) {
      for (const pChild of child.content) {
        if (pChild.type === "text") {
          texts.push(pChild.text || "");
        }
      }
    }
  }
  return texts.join("").trim();
}
function isList(node) {
  return node?.type === "bulletList" || node?.type === "orderedList";
}
function isListItem(node) {
  return node?.type === "listItem";
}
function extractListItemText(item) {
  const texts = [];
  function extract(node) {
    if (!node) return;
    if (node.type === "text") {
      texts.push(node.text || "");
    }
    if (node.content && Array.isArray(node.content)) {
      for (const child of node.content) {
        if (!isList(child)) {
          extract(child);
        }
      }
    }
  }
  extract(item);
  return texts.join("").trim();
}
function findNestedLists(item) {
  const lists = [];
  if (!item.content) return lists;
  for (const child of item.content) {
    if (isList(child)) {
      lists.push(child);
    }
  }
  return lists;
}
function diffLists(listA, listB, listPathA, listPathB, depth = 0) {
  const result = {
    itemChanges: [],
    itemMatches: [],
    nestedChanges: []
  };
  const alignment = alignListItems(listA, listB, listPathA, listPathB);
  for (const inserted of alignment.insertions) {
    result.itemChanges.push({
      id: v4(),
      type: "listItemInsert",
      nodeType: "listItem",
      path: inserted.path,
      node: inserted.node
    });
  }
  for (const deleted of alignment.deletions) {
    result.itemChanges.push({
      id: v4(),
      type: "listItemDelete",
      nodeType: "listItem",
      path: deleted.path,
      node: deleted.node
    });
  }
  result.itemMatches = alignment.matched;
  for (const match of alignment.matched) {
    const itemIdxA = match.pathA[match.pathA.length - 1];
    const itemIdxB = match.pathB[match.pathB.length - 1];
    const itemA = listA.content?.[itemIdxA];
    const itemB = listB.content?.[itemIdxB];
    if (!itemA || !itemB) continue;
    const nestedA = findNestedLists(itemA);
    const nestedB = findNestedLists(itemB);
    const maxNested = Math.max(nestedA.length, nestedB.length);
    for (let i = 0; i < maxNested; i++) {
      const nA = nestedA[i];
      const nB = nestedB[i];
      if (nA && nB) {
        const nestedResult = diffLists(
          nA,
          nB,
          [...match.pathA, i],
          [...match.pathB, i],
          depth + 1
        );
        result.nestedChanges.push(nestedResult);
      } else if (!nA && nB) {
        result.itemChanges.push({
          id: v4(),
          type: "listItemInsert",
          nodeType: "nestedList",
          path: [...match.pathB, i],
          node: nB
        });
      } else if (nA && !nB) {
        result.itemChanges.push({
          id: v4(),
          type: "listItemDelete",
          nodeType: "nestedList",
          path: [...match.pathA, i],
          node: nA
        });
      }
    }
  }
  return result;
}
function getListItemLocation(listPath, itemIndex, listIndex, depth = 0) {
  const depthStr = depth > 0 ? ` (nested, level ${depth + 1})` : "";
  return `List ${listIndex + 1}, Item ${itemIndex + 1}${depthStr}`;
}
function getListItemPreview(item, maxLength = 50) {
  const text = extractListItemText(item);
  if (text.length > maxLength) {
    return text.substring(0, maxLength - 3) + "...";
  }
  return text || "(empty item)";
}
function isImage(node) {
  return node?.type === "image";
}
function isHorizontalRule(node) {
  return node?.type === "horizontalRule" || node?.type === "hr";
}
function isHardBreak(node) {
  return node?.type === "hardBreak";
}
function isPageBreak(node) {
  return node?.type === "pageBreak";
}
function isEmbedded(node) {
  const embeddedTypes = [
    "equation",
    "math",
    "embed",
    "chart",
    "drawing",
    "shape"
  ];
  return embeddedTypes.includes(node?.type);
}
function isAtomicNode(node) {
  return isImage(node) || isHorizontalRule(node) || isHardBreak(node) || isPageBreak(node) || isEmbedded(node);
}
function getImageIdentifier(node) {
  if (!isImage(node)) return "";
  const attrs = node.attrs || {};
  if (attrs.src) {
    return `src:${attrs.src}`;
  }
  if (attrs.data) {
    return `data:${simpleHash2(attrs.data)}`;
  }
  if (attrs.alt) {
    return `alt:${attrs.alt}`;
  }
  return "unknown";
}
function simpleHash2(str) {
  let hash = 5381;
  const sample = str.substring(0, 1e3);
  for (let i = 0; i < sample.length; i++) {
    hash = (hash << 5) + hash ^ sample.charCodeAt(i);
  }
  return (hash >>> 0).toString(16);
}
function findImages(doc, basePath = []) {
  const images = [];
  function traverse(node, path) {
    if (!node) return;
    if (isImage(node)) {
      images.push({ node, path: [...path] });
    }
    if (node.content && Array.isArray(node.content)) {
      node.content.forEach((child, i) => {
        traverse(child, [...path, i]);
      });
    }
  }
  traverse(doc, basePath);
  return images;
}
function diffImages(docA, docB) {
  const imagesA = findImages(docA);
  const imagesB = findImages(docB);
  const inserted = [];
  const deleted = [];
  const idsA = /* @__PURE__ */ new Map();
  const idsB = /* @__PURE__ */ new Map();
  for (const img of imagesA) {
    const id = getImageIdentifier(img.node);
    idsA.set(id, img);
  }
  for (const img of imagesB) {
    const id = getImageIdentifier(img.node);
    idsB.set(id, img);
  }
  for (const [id, img] of idsA) {
    if (!idsB.has(id)) {
      deleted.push({
        id: v4(),
        type: "imageDelete",
        nodeType: "image",
        path: img.path,
        node: img.node
      });
    }
  }
  for (const [id, img] of idsB) {
    if (!idsA.has(id)) {
      inserted.push({
        id: v4(),
        type: "imageInsert",
        nodeType: "image",
        path: img.path,
        node: img.node
      });
    }
  }
  return { inserted, deleted };
}
function getImageLocation(path) {
  if (path.length <= 1) {
    return `Image at position ${path[0] + 1}`;
  }
  return `Image (nested at depth ${path.length})`;
}
function getImagePreview(node) {
  if (!isImage(node)) return "";
  const attrs = node.attrs || {};
  if (attrs.alt) {
    return `"${attrs.alt}"`;
  }
  if (attrs.src) {
    const src = attrs.src;
    const filename = src.split("/").pop()?.split("?")[0];
    if (filename) {
      return filename;
    }
  }
  return "(image)";
}

// src/services/structuralMerger.ts
function cloneNode2(node) {
  return JSON.parse(JSON.stringify(node));
}
function markAllTextAsInserted(node, sharedId, author) {
  if (node.type === "text") {
    const existingMarks = normalizeMarksForRendering(node.marks || []);
    return {
      ...node,
      marks: [...existingMarks, createTrackInsertMark(author, sharedId)]
    };
  }
  if (node.content && Array.isArray(node.content)) {
    return {
      ...node,
      content: node.content.map(
        (child) => markAllTextAsInserted(child, sharedId, author)
      )
    };
  }
  return { ...node };
}
function markAllTextAsDeleted(node, sharedId, author) {
  if (node.type === "text") {
    const existingMarks = normalizeMarksForRendering(node.marks || []);
    return {
      ...node,
      marks: [...existingMarks, createTrackDeleteMark(author, sharedId)]
    };
  }
  if (node.content && Array.isArray(node.content)) {
    return {
      ...node,
      content: node.content.map(
        (child) => markAllTextAsDeleted(child, sharedId, author)
      )
    };
  }
  return { ...node };
}
function extractTextPreview(node, maxLength = 50) {
  const texts = [];
  function extract(n) {
    if (n.type === "text") {
      texts.push(n.text || "");
    }
    if (n.content) {
      for (const child of n.content) {
        extract(child);
      }
    }
  }
  extract(node);
  const text = texts.join("").trim();
  if (text.length > maxLength) {
    return text.substring(0, maxLength - 3) + "...";
  }
  return text || "(empty)";
}
function getNodeTypeDescription(node) {
  if (isTable(node)) return "Table";
  if (isList(node)) return "List";
  if (isListItem(node)) return "List item";
  if (isTableRow(node)) return "Table row";
  if (isImage(node)) return "Image";
  if (node.type === "heading") return `Heading ${node.attrs?.level || 1}`;
  if (node.type === "paragraph") return "Paragraph";
  if (node.type === "blockquote") return "Blockquote";
  if (node.type === "codeBlock") return "Code block";
  return node.type || "Block";
}
function mergeWithStructuralAwareness(docA, docB, author = DEFAULT_AUTHOR) {
  const structuralInfos = [];
  const summary = [];
  let textChangeCount = 0;
  const alignment = alignDocuments(docA, docB);
  const operations = buildMergeOperations(alignment, docA, docB);
  const mergedContent = [];
  let blockIndex = 0;
  for (const op of operations) {
    blockIndex++;
    switch (op.type) {
      case "matched": {
        const { mergedNode, infos, changes } = mergeMatchedBlock(
          op.nodeA,
          op.nodeB,
          blockIndex,
          author
        );
        mergedContent.push(mergedNode);
        structuralInfos.push(...infos);
        textChangeCount += changes;
        break;
      }
      case "inserted": {
        const { markedNode, info } = createInsertedBlock(
          op.nodeB,
          blockIndex,
          author
        );
        mergedContent.push(markedNode);
        if (info) {
          structuralInfos.push(info);
        }
        break;
      }
      case "deleted": {
        const { markedNode, info } = createDeletedBlock(
          op.nodeA,
          blockIndex,
          author
        );
        mergedContent.push(markedNode);
        if (info) {
          structuralInfos.push(info);
        }
        break;
      }
    }
  }
  const mergedDoc = {
    type: "doc",
    content: mergedContent
  };
  const insertCount = structuralInfos.filter((i) => i.type.includes("Insert")).length;
  const deleteCount = structuralInfos.filter((i) => i.type.includes("Delete")).length;
  if (insertCount > 0) summary.push(`${insertCount} block(s) inserted`);
  if (deleteCount > 0) summary.push(`${deleteCount} block(s) deleted`);
  if (textChangeCount > 0) summary.push(`${textChangeCount} text change(s)`);
  return {
    mergedDoc,
    structuralInfos,
    summary,
    textChangeCount
  };
}
function buildMergeOperations(alignment, docA, docB) {
  const operations = [];
  const matchedFromA = /* @__PURE__ */ new Map();
  const matchedFromB = /* @__PURE__ */ new Map();
  for (const match of alignment.matched) {
    const idxA = match.pathA[0];
    const idxB = match.pathB[0];
    matchedFromA.set(idxA, { pathB: match.pathB, similarity: match.similarity });
    matchedFromB.set(idxB, { pathA: match.pathA, similarity: match.similarity });
  }
  const deletedIndices = new Set(alignment.deletions.map((d) => d.path[0]));
  const processedDeletions = /* @__PURE__ */ new Set();
  const contentB = docB.content || [];
  const contentA = docA.content || [];
  for (let idxB = 0; idxB < contentB.length; idxB++) {
    const nodeB = contentB[idxB];
    const match = matchedFromB.get(idxB);
    if (match) {
      const idxA = match.pathA[0];
      const nodeA = contentA[idxA];
      for (let checkIdx = 0; checkIdx < idxA; checkIdx++) {
        if (deletedIndices.has(checkIdx) && !processedDeletions.has(checkIdx)) {
          operations.push({
            type: "deleted",
            nodeA: contentA[checkIdx],
            pathA: [checkIdx]
          });
          processedDeletions.add(checkIdx);
        }
      }
      operations.push({
        type: "matched",
        nodeA,
        nodeB,
        pathA: match.pathA,
        pathB: [idxB]
      });
    } else {
      operations.push({
        type: "inserted",
        nodeB,
        pathB: [idxB]
      });
    }
  }
  for (const deletion of alignment.deletions) {
    const idxA = deletion.path[0];
    if (!processedDeletions.has(idxA)) {
      operations.push({
        type: "deleted",
        nodeA: deletion.node,
        pathA: deletion.path
      });
    }
  }
  return operations;
}
function mergeMatchedBlock(nodeA, nodeB, blockIndex, author) {
  const infos = [];
  let changes = 0;
  if (isTable(nodeA) && isTable(nodeB)) {
    const { mergedTable, tableInfos, changeCount } = mergeMatchedTable(
      nodeA,
      nodeB,
      blockIndex,
      author
    );
    return { mergedNode: mergedTable, infos: tableInfos, changes: changeCount };
  }
  if (isList(nodeA) && isList(nodeB)) {
    const { mergedList, listInfos, changeCount } = mergeMatchedList(
      nodeA,
      nodeB,
      blockIndex,
      author
    );
    return { mergedNode: mergedList, infos: listInfos, changes: changeCount };
  }
  const diff = diffDocuments(
    { type: "doc", content: [nodeA] },
    { type: "doc", content: [nodeB] }
  );
  changes = diff.segments.filter((s) => s.type !== "equal").length;
  changes += diff.formatChanges?.length || 0;
  const merged = mergeDocuments(
    { type: "doc", content: [nodeA] },
    { },
    diff,
    author
  );
  const mergedNode = merged.content?.[0] || cloneNode2(nodeB);
  return { mergedNode, infos, changes };
}
function mergeMatchedTable(tableA, tableB, tableIndex, author) {
  const tableInfos = [];
  let changeCount = 0;
  const rowAlignment = alignTableRows(tableA, tableB, [tableIndex - 1], [tableIndex - 1]);
  const mergedRows = [];
  const matchedFromA = /* @__PURE__ */ new Map();
  const matchedFromB = /* @__PURE__ */ new Map();
  for (const match of rowAlignment.matched) {
    const idxA = match.pathA[match.pathA.length - 1];
    const idxB = match.pathB[match.pathB.length - 1];
    matchedFromA.set(idxA, idxB);
    matchedFromB.set(idxB, idxA);
  }
  const deletedIndices = new Set(rowAlignment.deletions.map((d) => d.path[d.path.length - 1]));
  const processedDeletions = /* @__PURE__ */ new Set();
  const rowsA = tableA.content || [];
  const rowsB = tableB.content || [];
  for (let idxB = 0; idxB < rowsB.length; idxB++) {
    const rowB = rowsB[idxB];
    const matchedIdxA = matchedFromB.get(idxB);
    if (matchedIdxA !== void 0) {
      const rowA = rowsA[matchedIdxA];
      for (let checkIdx = 0; checkIdx < matchedIdxA; checkIdx++) {
        if (deletedIndices.has(checkIdx) && !processedDeletions.has(checkIdx)) {
          const deletedRow = rowsA[checkIdx];
          const changeId = v4();
          mergedRows.push(markAllTextAsDeleted(cloneNode2(deletedRow), changeId, author));
          tableInfos.push({
            id: changeId,
            type: "rowDelete",
            nodeType: "tableRow",
            location: `Table ${tableIndex}, Row ${checkIdx + 1}`,
            preview: extractTextPreview(deletedRow),
            author,
            date: (/* @__PURE__ */ new Date()).toISOString()
          });
          processedDeletions.add(checkIdx);
        }
      }
      const { mergedNode, changes } = mergeMatchedBlock(rowA, rowB, idxB, author);
      mergedRows.push(mergedNode);
      changeCount += changes;
    } else {
      const changeId = v4();
      mergedRows.push(markAllTextAsInserted(cloneNode2(rowB), changeId, author));
      tableInfos.push({
        id: changeId,
        type: "rowInsert",
        nodeType: "tableRow",
        location: `Table ${tableIndex}, Row ${idxB + 1}`,
        preview: extractTextPreview(rowB),
        author,
        date: (/* @__PURE__ */ new Date()).toISOString()
      });
    }
  }
  for (const deletion of rowAlignment.deletions) {
    const idxA = deletion.path[deletion.path.length - 1];
    if (!processedDeletions.has(idxA)) {
      const changeId = v4();
      mergedRows.push(markAllTextAsDeleted(cloneNode2(deletion.node), changeId, author));
      tableInfos.push({
        id: changeId,
        type: "rowDelete",
        nodeType: "tableRow",
        location: `Table ${tableIndex}, Row ${idxA + 1}`,
        preview: extractTextPreview(deletion.node),
        author,
        date: (/* @__PURE__ */ new Date()).toISOString()
      });
    }
  }
  const mergedTable = {
    ...tableB,
    content: mergedRows
  };
  return { mergedTable, tableInfos, changeCount };
}
function mergeMatchedList(listA, listB, listIndex, author) {
  const listInfos = [];
  let changeCount = 0;
  const itemAlignment = alignListItems(listA, listB, [listIndex - 1], [listIndex - 1]);
  const mergedItems = [];
  const matchedFromA = /* @__PURE__ */ new Map();
  const matchedFromB = /* @__PURE__ */ new Map();
  for (const match of itemAlignment.matched) {
    const idxA = match.pathA[match.pathA.length - 1];
    const idxB = match.pathB[match.pathB.length - 1];
    matchedFromA.set(idxA, idxB);
    matchedFromB.set(idxB, idxA);
  }
  const deletedIndices = new Set(itemAlignment.deletions.map((d) => d.path[d.path.length - 1]));
  const processedDeletions = /* @__PURE__ */ new Set();
  const itemsA = listA.content || [];
  const itemsB = listB.content || [];
  for (let idxB = 0; idxB < itemsB.length; idxB++) {
    const itemB = itemsB[idxB];
    const matchedIdxA = matchedFromB.get(idxB);
    if (matchedIdxA !== void 0) {
      const itemA = itemsA[matchedIdxA];
      for (let checkIdx = 0; checkIdx < matchedIdxA; checkIdx++) {
        if (deletedIndices.has(checkIdx) && !processedDeletions.has(checkIdx)) {
          const deletedItem = itemsA[checkIdx];
          const changeId = v4();
          mergedItems.push(markAllTextAsDeleted(cloneNode2(deletedItem), changeId, author));
          listInfos.push({
            id: changeId,
            type: "listItemDelete",
            nodeType: "listItem",
            location: `List ${listIndex}, Item ${checkIdx + 1}`,
            preview: extractTextPreview(deletedItem),
            author,
            date: (/* @__PURE__ */ new Date()).toISOString()
          });
          processedDeletions.add(checkIdx);
        }
      }
      const { mergedNode, changes } = mergeMatchedBlock(itemA, itemB, idxB, author);
      mergedItems.push(mergedNode);
      changeCount += changes;
    } else {
      const changeId = v4();
      mergedItems.push(markAllTextAsInserted(cloneNode2(itemB), changeId, author));
      listInfos.push({
        id: changeId,
        type: "listItemInsert",
        nodeType: "listItem",
        location: `List ${listIndex}, Item ${idxB + 1}`,
        preview: extractTextPreview(itemB),
        author,
        date: (/* @__PURE__ */ new Date()).toISOString()
      });
    }
  }
  for (const deletion of itemAlignment.deletions) {
    const idxA = deletion.path[deletion.path.length - 1];
    if (!processedDeletions.has(idxA)) {
      const changeId = v4();
      mergedItems.push(markAllTextAsDeleted(cloneNode2(deletion.node), changeId, author));
      listInfos.push({
        id: changeId,
        type: "listItemDelete",
        nodeType: "listItem",
        location: `List ${listIndex}, Item ${idxA + 1}`,
        preview: extractTextPreview(deletion.node),
        author,
        date: (/* @__PURE__ */ new Date()).toISOString()
      });
    }
  }
  const mergedList = {
    ...listB,
    content: mergedItems
  };
  return { mergedList, listInfos, changeCount };
}
function createInsertedBlock(node, blockIndex, author) {
  const changeId = v4();
  const markedNode = markAllTextAsInserted(cloneNode2(node), changeId, author);
  const nodeDesc = getNodeTypeDescription(node);
  const info = {
    id: changeId,
    type: isTable(node) ? "rowInsert" : isList(node) ? "listItemInsert" : isImage(node) ? "imageInsert" : "paragraphInsert",
    nodeType: node.type || "unknown",
    location: `${nodeDesc} inserted at position ${blockIndex}`,
    preview: extractTextPreview(node),
    author,
    date: (/* @__PURE__ */ new Date()).toISOString()
  };
  return { markedNode, info };
}
function createDeletedBlock(node, blockIndex, author) {
  const changeId = v4();
  const markedNode = markAllTextAsDeleted(cloneNode2(node), changeId, author);
  const nodeDesc = getNodeTypeDescription(node);
  const info = {
    id: changeId,
    type: isTable(node) ? "rowDelete" : isList(node) ? "listItemDelete" : isImage(node) ? "imageDelete" : "paragraphDelete",
    nodeType: node.type || "unknown",
    location: `${nodeDesc} deleted from position ${blockIndex}`,
    preview: extractTextPreview(node),
    author,
    date: (/* @__PURE__ */ new Date()).toISOString()
  };
  return { markedNode, info };
}
var permissionResolver = ({ permission }) => {
  return TRACK_CHANGE_PERMISSIONS.includes(permission) ? true : void 0;
};
function acceptAllChangesInJson(node) {
  if (!node) return null;
  if (node.type === "text") {
    const marks = node.marks || [];
    if (marks.some((m) => m.type === "trackDelete")) {
      return null;
    }
    const cleanMarks = marks.filter(
      (m) => !["trackInsert", "trackDelete", "trackFormat"].includes(m.type)
    );
    return {
      ...node,
      marks: cleanMarks.length > 0 ? cleanMarks : void 0
    };
  }
  if (node.content && Array.isArray(node.content)) {
    const cleanContent = node.content.map((child) => acceptAllChangesInJson(child)).filter((child) => child !== null);
    return {
      ...node,
      content: cleanContent.length > 0 ? cleanContent : void 0
    };
  }
  return node;
}
var DocxDiffEditor = forwardRef(
  function DocxDiffEditor2({
    initialSource,
    templateDocx,
    showRulers = false,
    showToolbar = true,
    author = DEFAULT_AUTHOR,
    onReady,
    onSourceLoaded,
    onComparisonComplete,
    onError,
    className = "",
    toolbarClassName = "",
    editorClassName = "",
    // Structural Changes Pane options
    structuralPanePosition = "bottom-right",
    structuralPaneCollapsed = false,
    hideStructuralPane = false
  }, ref) {
    const containerRef = useRef(null);
    const toolbarRef = useRef(null);
    const superdocRef = useRef(null);
    const SuperDocRef = useRef(null);
    const mountedRef = useRef(true);
    const initRef = useRef(false);
    const readyRef = useRef(false);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [sourceJson, setSourceJson] = useState(null);
    const [mergedJson, setMergedJson] = useState(null);
    const [diffResult, setDiffResult] = useState(null);
    const [structuralChanges, setStructuralChanges] = useState([]);
    const [isPaneDismissed, setIsPaneDismissed] = useState(false);
    const structuralChangeIdsRef = useRef(/* @__PURE__ */ new Set());
    useEffect(() => {
      structuralChangeIdsRef.current = new Set(structuralChanges.map((c) => c.id));
    }, [structuralChanges]);
    const instanceId = useRef(`dde-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
    const editorId = `dde-editor-${instanceId.current}`;
    const toolbarId = `dde-toolbar-${instanceId.current}`;
    const setEditorContent = useCallback((editor, json) => {
      const { state, view } = editor;
      if (state?.doc && view && json.content) {
        const newDoc = state.schema.nodeFromJSON(json);
        const tr = state.tr.replaceWith(0, state.doc.content.size, newDoc.content);
        view.dispatch(tr);
      }
    }, []);
    const enableReviewMode = useCallback((sd) => {
      if (sd.setTrackedChangesPreferences) {
        sd.setTrackedChangesPreferences({ mode: "review", enabled: true });
      } else if (sd.activeEditor?.commands?.enableTrackChanges) {
        sd.activeEditor.commands.enableTrackChanges();
      }
    }, []);
    const setEditingMode = useCallback((sd) => {
      if (sd.setTrackedChangesPreferences) {
        sd.setTrackedChangesPreferences({ mode: "off", enabled: false });
      }
    }, []);
    const handleError = useCallback(
      (err) => {
        const error2 = err instanceof Error ? err : new Error(err);
        setError(error2.message);
        onError?.(error2);
      },
      [onError]
    );
    const handleAcceptStructuralChange = useCallback((changeId) => {
      const editor = superdocRef.current?.activeEditor;
      if (editor?.commands?.acceptTrackedChangeById) {
        editor.commands.acceptTrackedChangeById(changeId);
        setStructuralChanges((prev) => prev.filter((c) => c.id !== changeId));
      }
    }, []);
    const handleRejectStructuralChange = useCallback((changeId) => {
      const editor = superdocRef.current?.activeEditor;
      if (editor?.commands?.rejectTrackedChangeById) {
        editor.commands.rejectTrackedChangeById(changeId);
        setStructuralChanges((prev) => prev.filter((c) => c.id !== changeId));
      }
    }, []);
    const handleAcceptAllStructural = useCallback(() => {
      const editor = superdocRef.current?.activeEditor;
      if (editor?.commands?.acceptTrackedChangeById) {
        for (const change of structuralChanges) {
          editor.commands.acceptTrackedChangeById(change.id);
        }
        setStructuralChanges([]);
      }
    }, [structuralChanges]);
    const handleRejectAllStructural = useCallback(() => {
      const editor = superdocRef.current?.activeEditor;
      if (editor?.commands?.rejectTrackedChangeById) {
        for (const change of structuralChanges) {
          editor.commands.rejectTrackedChangeById(change.id);
        }
        setStructuralChanges([]);
      }
    }, [structuralChanges]);
    const handleNavigateToChange = useCallback((changeId) => {
      const change = structuralChanges.find((c) => c.id === changeId);
      if (!change) return;
      const editor = superdocRef.current?.activeEditor;
      if (editor?.commands?.focus) {
        editor.commands.focus();
      }
    }, [structuralChanges]);
    const handlePaneDismiss = useCallback(() => {
      setIsPaneDismissed(true);
    }, []);
    const handleCommentsUpdate = useCallback(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (event) => {
        if (event?.type === "resolved" && event?.comment?.trackedChange) {
          const commentId = event.comment.commentId;
          if (structuralChangeIdsRef.current.has(commentId)) {
            setStructuralChanges((prev) => prev.filter((c) => c.id !== commentId));
          }
        }
      },
      []
    );
    const destroySuperdoc = useCallback(() => {
      if (superdocRef.current) {
        try {
          superdocRef.current.destroy?.();
        } catch {
        }
        superdocRef.current = null;
      }
      readyRef.current = false;
    }, []);
    const createSuperdoc = useCallback(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async (options) => {
        if (!SuperDocRef.current) {
          throw new Error("SuperDoc not loaded");
        }
        if (!containerRef.current) {
          throw new Error("Container not available");
        }
        containerRef.current.innerHTML = "";
        if (toolbarRef.current) {
          toolbarRef.current.innerHTML = "";
        }
        containerRef.current.id = editorId;
        if (toolbarRef.current) {
          toolbarRef.current.id = toolbarId;
        }
        return new Promise((resolve, reject) => {
          let resolved = false;
          try {
            const superdocConfig = {
              selector: `#${editorId}`,
              toolbar: showToolbar ? `#${toolbarId}` : void 0,
              documentMode: "editing",
              role: "editor",
              rulers: showRulers,
              user: DEFAULT_SUPERDOC_USER,
              permissionResolver,
              // Bubble sync: listen for track changes resolved via SuperDoc bubbles
              onCommentsUpdate: handleCommentsUpdate
            };
            if (options.document) {
              superdocConfig.document = options.document;
            } else if (options.html) {
              superdocConfig.html = options.html;
            }
            const superdoc = new SuperDocRef.current({
              ...superdocConfig,
              onReady: ({ superdoc: sd }) => {
                if (resolved) return;
                resolved = true;
                superdocRef.current = sd;
                readyRef.current = true;
                let json = { type: "doc", content: [] };
                if (sd?.activeEditor) {
                  try {
                    json = sd.activeEditor.getJSON();
                  } catch (err) {
                    console.error("Failed to extract JSON:", err);
                  }
                }
                resolve({ superdoc: sd, json });
              },
              onException: ({ error: err }) => {
                if (resolved) return;
                resolved = true;
                console.error("SuperDoc error:", err);
                reject(err);
              }
            });
            superdocRef.current = superdoc;
            setTimeout(() => {
              if (!resolved) {
                resolved = true;
                reject(new Error("SuperDoc initialization timed out"));
              }
            }, TIMEOUTS.PARSE_TIMEOUT);
          } catch (err) {
            if (!resolved) {
              resolved = true;
              reject(err);
            }
          }
        });
      },
      [editorId, toolbarId, showToolbar, showRulers]
    );
    const initialize = useCallback(async () => {
      if (initRef.current || !containerRef.current || !mountedRef.current) return;
      if (!showToolbar && !toolbarRef.current) ; else if (showToolbar && !toolbarRef.current) {
        return;
      }
      initRef.current = true;
      await new Promise((resolve) => setTimeout(resolve, TIMEOUTS.INIT_DELAY));
      if (!mountedRef.current || !containerRef.current) {
        initRef.current = false;
        return;
      }
      setIsLoading(true);
      setError(null);
      destroySuperdoc();
      try {
        const { SuperDoc } = await import('superdoc');
        SuperDocRef.current = SuperDoc;
        let initOptions = {};
        if (initialSource) {
          const contentType = detectContentType(initialSource);
          if (contentType === "file") {
            initOptions = { document: initialSource };
          } else if (contentType === "html") {
            initOptions = { html: initialSource };
          } else if (contentType === "json") {
            initOptions = templateDocx ? { document: templateDocx } : {};
          }
        } else if (templateDocx) {
          initOptions = { document: templateDocx };
        }
        const { superdoc: sd, json } = await createSuperdoc(initOptions);
        if (initialSource && detectContentType(initialSource) === "json") {
          if (sd?.activeEditor && isProseMirrorJSON(initialSource)) {
            setEditorContent(sd.activeEditor, initialSource);
            setSourceJson(initialSource);
            onSourceLoaded?.(initialSource);
          }
        } else {
          setSourceJson(json);
          onSourceLoaded?.(json);
        }
        setIsLoading(false);
        onReady?.();
      } catch (err) {
        console.error("Failed to initialize SuperDoc:", err);
        handleError(err instanceof Error ? err : new Error("Failed to load editor"));
        setIsLoading(false);
        initRef.current = false;
      }
    }, [
      initialSource,
      showRulers,
      showToolbar,
      templateDocx,
      onReady,
      onSourceLoaded,
      destroySuperdoc,
      createSuperdoc,
      setEditorContent,
      handleError
    ]);
    useEffect(() => {
      mountedRef.current = true;
      if (!initRef.current) {
        initialize();
      }
      return () => {
        mountedRef.current = false;
        destroySuperdoc();
      };
    }, []);
    useImperativeHandle(
      ref,
      () => ({
        /**
         * Update content in the existing editor without recreating SuperDoc instance.
         * Preserves the DOCX template/styling. Ideal for replacing content with translated JSON.
         */
        updateContent(json) {
          const editor = superdocRef.current?.activeEditor;
          if (!editor) {
            throw new Error("Editor not ready");
          }
          setEditorContent(editor, json);
          setSourceJson(json);
          setMergedJson(null);
          setDiffResult(null);
          onSourceLoaded?.(json);
        },
        /**
         * Set the source/base document.
         * Accepts File (DOCX), HTML string, or ProseMirror JSON.
         * Note: This destroys and recreates the SuperDoc instance.
         * For JSON content updates, prefer updateContent() to preserve the existing template.
         */
        async setSource(content) {
          if (!SuperDocRef.current) {
            throw new Error("Editor not initialized");
          }
          setIsLoading(true);
          setError(null);
          try {
            const contentType = detectContentType(content);
            let json;
            destroySuperdoc();
            if (contentType === "file") {
              const result = await createSuperdoc({ document: content });
              json = result.json;
            } else if (contentType === "html") {
              const result = await createSuperdoc({ html: content });
              json = result.json;
            } else {
              const result = await createSuperdoc(templateDocx ? { document: templateDocx } : {});
              if (result.superdoc?.activeEditor && isProseMirrorJSON(content)) {
                setEditorContent(result.superdoc.activeEditor, content);
                json = content;
              } else {
                json = result.json;
              }
            }
            setSourceJson(json);
            setMergedJson(null);
            setDiffResult(null);
            setEditingMode(superdocRef.current);
            onSourceLoaded?.(json);
          } catch (err) {
            handleError(err instanceof Error ? err : new Error("Failed to set source"));
            throw err;
          } finally {
            setIsLoading(false);
          }
        },
        /**
         * Compare current editor content with new content, show track changes.
         * 
         * The comparison uses the current editor state (with any existing track
         * changes accepted/stripped) as the baseline. This means if you've made
         * edits or accepted previous comparisons, those become the new baseline.
         * 
         * To compare against the original source document, call setSource() again
         * before compareWith().
         */
        async compareWith(content) {
          if (!SuperDocRef.current) {
            throw new Error("Editor not initialized");
          }
          if (!superdocRef.current?.activeEditor) {
            throw new Error("Editor not ready. Ensure a document is loaded first.");
          }
          setIsLoading(true);
          try {
            const currentEditorJson = superdocRef.current.activeEditor.getJSON();
            const cleanBaseline = acceptAllChangesInJson(currentEditorJson) || { type: "doc", content: [] };
            setSourceJson(cleanBaseline);
            const contentType = detectContentType(content);
            let newJson;
            if (contentType === "file") {
              newJson = await parseDocxFile(content, SuperDocRef.current);
            } else if (contentType === "html") {
              const tempContainer = document.createElement("div");
              tempContainer.style.cssText = "position:absolute;top:-9999px;left:-9999px;width:800px;height:600px;visibility:hidden;";
              document.body.appendChild(tempContainer);
              try {
                newJson = await new Promise((resolve, reject) => {
                  const tempSuperdoc = new SuperDocRef.current({
                    selector: tempContainer,
                    html: content,
                    documentMode: "viewing",
                    rulers: false,
                    user: { name: "Parser", email: "parser@local" },
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    onReady: ({ superdoc: sd }) => {
                      try {
                        const json = sd?.activeEditor?.getJSON() || { type: "doc", content: [] };
                        setTimeout(() => {
                          try {
                            sd?.destroy?.();
                          } catch {
                          }
                          tempContainer.parentNode?.removeChild(tempContainer);
                        }, 100);
                        resolve(json);
                      } catch (err) {
                        reject(err);
                      }
                    },
                    onException: ({ error: err }) => {
                      tempContainer.parentNode?.removeChild(tempContainer);
                      reject(err);
                    }
                  });
                  setTimeout(() => {
                    try {
                      tempSuperdoc?.destroy?.();
                    } catch {
                    }
                    tempContainer.parentNode?.removeChild(tempContainer);
                    reject(new Error("HTML parsing timed out"));
                  }, TIMEOUTS.PARSE_TIMEOUT);
                });
              } catch (err) {
                tempContainer.parentNode?.removeChild(tempContainer);
                throw err;
              }
            } else {
              if (!isProseMirrorJSON(content)) {
                throw new Error("Invalid ProseMirror JSON structure");
              }
              newJson = content;
            }
            const normalizedNewJson = normalizeRunProperties(newJson);
            const structuralResult = mergeWithStructuralAwareness(
              cleanBaseline,
              normalizedNewJson,
              author
            );
            const merged = structuralResult.mergedDoc;
            const structInfos = structuralResult.structuralInfos;
            setMergedJson(merged);
            const diff = diffDocuments(cleanBaseline, newJson);
            setDiffResult(diff);
            if (superdocRef.current?.activeEditor) {
              setEditorContent(superdocRef.current.activeEditor, merged);
              enableReviewMode(superdocRef.current);
              const sd = superdocRef.current;
              if (sd.commentsStore?.processLoadedDocxComments) {
                setTimeout(() => {
                  try {
                    sd.commentsStore.processLoadedDocxComments({
                      superdoc: sd,
                      editor: sd.activeEditor,
                      comments: [],
                      // Empty array - we just want to trigger createCommentForTrackChanges
                      documentId: sd.activeEditor?.options?.documentId || "primary"
                    });
                  } catch (err) {
                    console.warn("[DocxDiffEditor] Failed to process track changes for bubbles:", err);
                  }
                }, 50);
              }
            }
            setStructuralChanges(structInfos);
            setIsPaneDismissed(false);
            const insertions = diff.segments.filter((s) => s.type === "insert").length;
            const deletions = diff.segments.filter((s) => s.type === "delete").length;
            const formatChanges = diff.formatChanges?.length || 0;
            const structuralChangeCount = structInfos.length;
            const combinedSummary = [...structuralResult.summary];
            if (diff.summary.length > 0 && structuralResult.summary.length === 0) {
              combinedSummary.push(...diff.summary);
            }
            const result = {
              totalChanges: insertions + deletions + formatChanges + structuralChangeCount,
              insertions,
              deletions,
              formatChanges,
              structuralChanges: structuralChangeCount,
              summary: combinedSummary,
              mergedJson: merged,
              structuralChangeInfos: structInfos
            };
            onComparisonComplete?.(result);
            return result;
          } catch (err) {
            handleError(err instanceof Error ? err : new Error("Comparison failed"));
            throw err;
          } finally {
            setIsLoading(false);
          }
        },
        /**
         * Get raw diff segments
         */
        getDiffSegments() {
          return diffResult?.segments || [];
        },
        /**
         * Get enriched changes with context for LLM processing
         */
        getEnrichedChangesContext() {
          if (!mergedJson) return [];
          return extractEnrichedChanges(mergedJson);
        },
        /**
         * Get current document content as JSON
         */
        getContent() {
          if (superdocRef.current?.activeEditor) {
            return superdocRef.current.activeEditor.getJSON();
          }
          return mergedJson || sourceJson || { type: "doc", content: [] };
        },
        /**
         * Get source document JSON (before comparison)
         */
        getSourceContent() {
          return sourceJson;
        },
        /**
         * Export current document to DOCX blob
         */
        async exportDocx() {
          if (!superdocRef.current?.activeEditor) {
            throw new Error("Editor not ready");
          }
          const blob = await superdocRef.current.activeEditor.exportDocx({
            isFinalDoc: false
          });
          if (!blob) {
            throw new Error("Export returned no data");
          }
          return blob;
        },
        /**
         * Reset to source state (clear comparison)
         */
        resetComparison() {
          if (sourceJson && superdocRef.current?.activeEditor) {
            setEditorContent(superdocRef.current.activeEditor, sourceJson);
            setEditingMode(superdocRef.current);
            setMergedJson(null);
            setDiffResult(null);
          }
        },
        /**
         * Accept all track changes and return the clean document
         */
        async acceptAllChanges() {
          const editor = superdocRef.current?.activeEditor;
          const sd = superdocRef.current;
          if (!editor || !sd) {
            throw new Error("Editor not ready");
          }
          const editorAny = editor;
          const sdAny = sd;
          let cleanJson;
          if (typeof editorAny.commands?.acceptAllChanges === "function") {
            editorAny.commands.acceptAllChanges();
            cleanJson = editor.getJSON();
          } else if (typeof sdAny.commands?.acceptAllChanges === "function") {
            sdAny.commands.acceptAllChanges();
            cleanJson = editor.getJSON();
          } else if (typeof sdAny.acceptAllChanges === "function") {
            sdAny.acceptAllChanges();
            cleanJson = editor.getJSON();
          } else {
            const currentJson = editor.getJSON();
            cleanJson = acceptAllChangesInJson(currentJson) || { type: "doc", content: [] };
          }
          setMergedJson(null);
          setDiffResult(null);
          return cleanJson;
        },
        /**
         * Check if editor is ready
         */
        isReady() {
          return readyRef.current;
        },
        /**
         * Get the current page count from the presentation editor.
         * Returns 0 if editor is not ready or pages are unavailable.
         */
        getPages() {
          if (!readyRef.current || !superdocRef.current) {
            return 0;
          }
          try {
            const sd = superdocRef.current;
            const doc = sd.superdocStore?.documents?.[0];
            if (!doc) {
              return 0;
            }
            const presentationEditor = doc.getPresentationEditor?.();
            const pages = presentationEditor?.getPages?.();
            return pages?.length ?? 0;
          } catch (err) {
            console.warn("[DocxDiffEditor] Failed to get page count:", err);
            return 0;
          }
        },
        /**
         * Get combined document metadata and statistics.
         * Returns null if editor is not ready.
         */
        getDocumentInfo() {
          if (!readyRef.current || !superdocRef.current) {
            return null;
          }
          try {
            const sd = superdocRef.current;
            const doc = sd.superdocStore?.documents?.[0];
            if (!doc) {
              return null;
            }
            const editor = doc.getEditor?.();
            const metadata = editor?.getMetadata?.() ?? {};
            const stats = editor?.commands?.getDocumentStats?.() ?? {};
            const presentationEditor = doc.getPresentationEditor?.();
            const pages = presentationEditor?.getPages?.();
            const pageCount = pages?.length ?? 0;
            return {
              // Metadata
              documentGuid: metadata.documentGuid ?? null,
              isModified: metadata.isModified ?? false,
              version: metadata.version ?? null,
              // Stats
              words: stats.words ?? 0,
              characters: stats.characters ?? 0,
              paragraphs: stats.paragraphs ?? 0,
              // Pages
              pages: pageCount
            };
          } catch (err) {
            console.warn("[DocxDiffEditor] Failed to get document info:", err);
            return null;
          }
        },
        /**
         * Get document core properties from docProps/core.xml.
         * Returns null if editor is not ready or properties unavailable.
         */
        async getProperties() {
          if (!readyRef.current || !superdocRef.current) {
            return null;
          }
          try {
            const sd = superdocRef.current;
            const doc = sd.superdocStore?.documents?.[0];
            if (!doc) {
              return null;
            }
            const editor = doc.getEditor?.();
            if (!editor) {
              return null;
            }
            const coreXml = editor.converter?.convertedXml?.["docProps/core.xml"];
            if (!coreXml?.elements?.[0]?.elements) {
              return null;
            }
            const elements = coreXml.elements[0].elements;
            const xmlToKey = {
              "dc:title": "title",
              "dc:creator": "author",
              "dc:subject": "subject",
              "dc:description": "description",
              "cp:keywords": "keywords",
              "cp:category": "category",
              "cp:lastModifiedBy": "lastModifiedBy",
              "cp:revision": "revision",
              "dcterms:created": "created",
              "dcterms:modified": "modified"
            };
            const props = {};
            for (const el of elements) {
              const key = xmlToKey[el.name];
              if (key) {
                const textValue = el.elements?.[0]?.text;
                if (textValue !== void 0 && textValue !== null) {
                  if (key === "created" || key === "modified") {
                    props[key] = new Date(textValue);
                  } else {
                    props[key] = textValue;
                  }
                }
              }
            }
            return props;
          } catch (err) {
            console.warn("[DocxDiffEditor] Failed to get properties:", err);
            return null;
          }
        },
        /**
         * Set document core properties (partial update).
         * Only provided properties will be updated; others are preserved.
         * Preserves XML namespaces and structure for valid DOCX output.
         * Returns true on success, false on failure.
         */
        async setProperties(properties) {
          if (!readyRef.current || !superdocRef.current) {
            return false;
          }
          try {
            const sd = superdocRef.current;
            const doc = sd.superdocStore?.documents?.[0];
            if (!doc) {
              return false;
            }
            const editor = doc.getEditor?.();
            if (!editor) {
              return false;
            }
            const coreXml = editor.converter?.convertedXml?.["docProps/core.xml"];
            if (!coreXml?.elements?.[0]?.elements) {
              console.warn("[DocxDiffEditor] docProps/core.xml not found or invalid structure");
              return false;
            }
            const coreProperties = coreXml.elements[0];
            const elements = coreProperties.elements;
            const keyToXml = {
              title: "dc:title",
              author: "dc:creator",
              subject: "dc:subject",
              description: "dc:description",
              keywords: "cp:keywords",
              category: "cp:category",
              lastModifiedBy: "cp:lastModifiedBy",
              revision: "cp:revision",
              created: "dcterms:created",
              modified: "dcterms:modified"
            };
            for (const [key, value] of Object.entries(properties)) {
              if (value === void 0) continue;
              const xmlName = keyToXml[key];
              if (!xmlName) continue;
              const textValue = value instanceof Date ? value.toISOString() : String(value);
              const existingProp = elements.find((el) => el.name === xmlName);
              if (existingProp) {
                if (!existingProp.elements) {
                  existingProp.elements = [];
                }
                if (existingProp.elements[0]) {
                  existingProp.elements[0].text = textValue;
                } else {
                  existingProp.elements.push({ type: "text", text: textValue });
                }
              } else {
                elements.push({
                  type: "element",
                  name: xmlName,
                  elements: [{ type: "text", text: textValue }]
                });
              }
            }
            if (editor.converter) {
              editor.converter.documentModified = true;
            }
            if (editor.converter?.schemaToXml) {
              const serialized = editor.converter.schemaToXml(coreXml.elements[0]);
              if (!editor.options) {
                editor.options = {};
              }
              if (!editor.options.customUpdatedFiles) {
                editor.options.customUpdatedFiles = {};
              }
              editor.options.customUpdatedFiles["docProps/core.xml"] = String(serialized);
              editor.options.isCustomXmlChanged = true;
            }
            return true;
          } catch (err) {
            console.warn("[DocxDiffEditor] Failed to set properties:", err);
            return false;
          }
        },
        /**
         * Parse HTML string to ProseMirror JSON using a hidden SuperDoc instance.
         * Useful for converting HTML content before using with other methods.
         */
        async parseHtml(html) {
          if (!SuperDocRef.current) {
            throw new Error("Editor not initialized");
          }
          return parseHtmlToJson(html, SuperDocRef.current);
        }
      }),
      [
        sourceJson,
        mergedJson,
        diffResult,
        templateDocx,
        author,
        destroySuperdoc,
        createSuperdoc,
        setEditorContent,
        enableReviewMode,
        setEditingMode,
        onSourceLoaded,
        onComparisonComplete,
        handleError
      ]
    );
    return /* @__PURE__ */ jsxs("div", { className: `dde-container ${className}`.trim(), children: [
      isLoading && /* @__PURE__ */ jsxs("div", { className: "dde-loading", children: [
        /* @__PURE__ */ jsx("div", { className: "dde-loading__spinner" }),
        /* @__PURE__ */ jsx("p", { className: "dde-loading__text", children: "Loading document..." })
      ] }),
      error && /* @__PURE__ */ jsxs("div", { className: "dde-error", children: [
        /* @__PURE__ */ jsx("div", { className: "dde-error__icon", children: /* @__PURE__ */ jsx(
          "svg",
          {
            className: "dde-error__svg",
            fill: "none",
            stroke: "currentColor",
            viewBox: "0 0 24 24",
            children: /* @__PURE__ */ jsx(
              "path",
              {
                strokeLinecap: "round",
                strokeLinejoin: "round",
                strokeWidth: "2",
                d: "M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              }
            )
          }
        ) }),
        /* @__PURE__ */ jsx("p", { className: "dde-error__title", children: "Failed to load document" }),
        /* @__PURE__ */ jsx("p", { className: "dde-error__message", children: error })
      ] }),
      showToolbar && /* @__PURE__ */ jsx(
        "div",
        {
          ref: toolbarRef,
          className: `dde-toolbar ${toolbarClassName}`.trim()
        }
      ),
      /* @__PURE__ */ jsx(
        "div",
        {
          ref: containerRef,
          className: `dde-editor ${editorClassName}`.trim()
        }
      ),
      !hideStructuralPane && !isPaneDismissed && structuralChanges.length > 0 && /* @__PURE__ */ jsx(
        StructuralChangesPane,
        {
          changes: structuralChanges,
          position: structuralPanePosition,
          initiallyCollapsed: structuralPaneCollapsed,
          onAccept: handleAcceptStructuralChange,
          onReject: handleRejectStructuralChange,
          onAcceptAll: handleAcceptAllStructural,
          onRejectAll: handleRejectAllStructural,
          onNavigate: handleNavigateToChange,
          onDismiss: handlePaneDismiss
        }
      )
    ] });
  }
);
var DocxDiffEditor_default = DocxDiffEditor;

// src/services/index.ts
init_nodeFingerprint();
function markAllTextAsInserted2(node, sharedId, author) {
  if (node.type === "text") {
    const existingMarks = normalizeMarksForRendering(node.marks || []);
    return {
      ...node,
      marks: [...existingMarks, createTrackInsertMark(author, sharedId)]
    };
  }
  if (node.content && Array.isArray(node.content)) {
    return {
      ...node,
      content: node.content.map(
        (child) => markAllTextAsInserted2(child, sharedId, author)
      )
    };
  }
  return node;
}
function markAllTextAsDeleted2(node, sharedId, author) {
  if (node.type === "text") {
    const existingMarks = normalizeMarksForRendering(node.marks || []);
    return {
      ...node,
      marks: [...existingMarks, createTrackDeleteMark(author, sharedId)]
    };
  }
  if (node.content && Array.isArray(node.content)) {
    return {
      ...node,
      content: node.content.map(
        (child) => markAllTextAsDeleted2(child, sharedId, author)
      )
    };
  }
  return node;
}
function cloneNode3(node) {
  return JSON.parse(JSON.stringify(node));
}
function extractTextPreview2(node, maxLength = 50) {
  const texts = [];
  function extract(n) {
    if (n.type === "text") {
      texts.push(n.text || "");
    }
    if (n.content) {
      for (const child of n.content) {
        extract(child);
      }
    }
  }
  extract(node);
  const text = texts.join("").trim();
  if (text.length > maxLength) {
    return text.substring(0, maxLength - 3) + "...";
  }
  return text || "(empty)";
}
function processStructuralChanges(docA, docB, author = DEFAULT_AUTHOR) {
  const changes = [];
  const infos = [];
  const alignment = alignDocuments(docA, docB);
  let tableIndex = 0;
  let listIndex = 0;
  let paragraphIndex = 0;
  for (const inserted of alignment.insertions) {
    const node = inserted.node;
    const sharedId = v4();
    const date = (/* @__PURE__ */ new Date()).toISOString();
    let type = "paragraphInsert";
    let location = "";
    let preview = "";
    if (isTable(node)) {
      type = "rowInsert";
      location = `New table at position ${inserted.path[0] + 1}`;
      preview = `Table with ${node.content?.length || 0} rows`;
      tableIndex++;
    } else if (isList(node)) {
      type = "listItemInsert";
      location = `New list at position ${inserted.path[0] + 1}`;
      preview = `List with ${node.content?.length || 0} items`;
      listIndex++;
    } else {
      type = "paragraphInsert";
      paragraphIndex++;
      location = `Paragraph ${paragraphIndex}`;
      preview = extractTextPreview2(node);
    }
    changes.push({
      id: sharedId,
      type,
      nodeType: node.type,
      path: inserted.path,
      node: markAllTextAsInserted2(cloneNode3(node), sharedId, author)
    });
    infos.push({
      id: sharedId,
      type,
      nodeType: node.type,
      location,
      preview,
      author,
      date
    });
  }
  for (const deleted of alignment.deletions) {
    const node = deleted.node;
    const sharedId = v4();
    const date = (/* @__PURE__ */ new Date()).toISOString();
    let type = "paragraphDelete";
    let location = "";
    let preview = "";
    if (isTable(node)) {
      type = "rowDelete";
      location = `Deleted table at position ${deleted.path[0] + 1}`;
      preview = `Table with ${node.content?.length || 0} rows`;
    } else if (isList(node)) {
      type = "listItemDelete";
      location = `Deleted list at position ${deleted.path[0] + 1}`;
      preview = `List with ${node.content?.length || 0} items`;
    } else {
      type = "paragraphDelete";
      location = `Deleted paragraph`;
      preview = extractTextPreview2(node);
    }
    changes.push({
      id: sharedId,
      type,
      nodeType: node.type,
      path: deleted.path,
      node: markAllTextAsDeleted2(cloneNode3(node), sharedId, author)
    });
    infos.push({
      id: sharedId,
      type,
      nodeType: node.type,
      location,
      preview,
      author,
      date
    });
  }
  for (const match of alignment.matched) {
    const nodeA = docA.content?.[match.pathA[0]];
    const nodeB = docB.content?.[match.pathB[0]];
    if (!nodeA || !nodeB) continue;
    if (isTable(nodeA) && isTable(nodeB)) {
      tableIndex++;
      const tableResult = diffTables(nodeA, nodeB, match.pathA, match.pathB);
      for (const rowChange of tableResult.rowChanges) {
        const sharedId = rowChange.id;
        const date = (/* @__PURE__ */ new Date()).toISOString();
        const rowIndex = rowChange.path[rowChange.path.length - 1];
        const isInsert = rowChange.type === "rowInsert";
        const location = getRowLocation(rowChange.path, rowIndex, tableIndex - 1);
        const preview = getRowPreview(rowChange.node);
        const markedNode = isInsert ? markAllTextAsInserted2(cloneNode3(rowChange.node), sharedId, author) : markAllTextAsDeleted2(cloneNode3(rowChange.node), sharedId, author);
        changes.push({
          ...rowChange,
          node: markedNode
        });
        infos.push({
          id: sharedId,
          type: rowChange.type,
          nodeType: "tableRow",
          location,
          preview,
          author,
          date
        });
      }
    }
    if (isList(nodeA) && isList(nodeB)) {
      listIndex++;
      const listResult = diffLists(nodeA, nodeB, match.pathA, match.pathB);
      for (const itemChange of listResult.itemChanges) {
        const sharedId = itemChange.id;
        const date = (/* @__PURE__ */ new Date()).toISOString();
        const itemIndex = itemChange.path[itemChange.path.length - 1];
        const isInsert = itemChange.type === "listItemInsert";
        const location = getListItemLocation(itemChange.path, itemIndex, listIndex - 1);
        const preview = getListItemPreview(itemChange.node);
        const markedNode = isInsert ? markAllTextAsInserted2(cloneNode3(itemChange.node), sharedId, author) : markAllTextAsDeleted2(cloneNode3(itemChange.node), sharedId, author);
        changes.push({
          ...itemChange,
          node: markedNode
        });
        infos.push({
          id: sharedId,
          type: itemChange.type,
          nodeType: "listItem",
          location,
          preview,
          author,
          date
        });
      }
    }
  }
  const imageChanges = diffImages(docA, docB);
  for (const imgInsert of imageChanges.inserted) {
    const sharedId = imgInsert.id;
    const date = (/* @__PURE__ */ new Date()).toISOString();
    infos.push({
      id: sharedId,
      type: "imageInsert",
      nodeType: "image",
      location: getImageLocation(imgInsert.path),
      preview: getImagePreview(imgInsert.node),
      author,
      date
    });
    changes.push(imgInsert);
  }
  for (const imgDelete of imageChanges.deleted) {
    const sharedId = imgDelete.id;
    const date = (/* @__PURE__ */ new Date()).toISOString();
    infos.push({
      id: sharedId,
      type: "imageDelete",
      nodeType: "image",
      location: getImageLocation(imgDelete.path),
      preview: getImagePreview(imgDelete.node),
      author,
      date
    });
    changes.push(imgDelete);
  }
  return { changes, infos };
}
function generateStructuralChangeSummary(infos) {
  const summary = [];
  const rowInserts = infos.filter((i) => i.type === "rowInsert").length;
  const rowDeletes = infos.filter((i) => i.type === "rowDelete").length;
  const paragraphInserts = infos.filter((i) => i.type === "paragraphInsert").length;
  const paragraphDeletes = infos.filter((i) => i.type === "paragraphDelete").length;
  const listItemInserts = infos.filter((i) => i.type === "listItemInsert").length;
  const listItemDeletes = infos.filter((i) => i.type === "listItemDelete").length;
  const imageInserts = infos.filter((i) => i.type === "imageInsert").length;
  const imageDeletes = infos.filter((i) => i.type === "imageDelete").length;
  if (rowInserts > 0) summary.push(`${rowInserts} row(s) inserted`);
  if (rowDeletes > 0) summary.push(`${rowDeletes} row(s) deleted`);
  if (paragraphInserts > 0) summary.push(`${paragraphInserts} paragraph(s) inserted`);
  if (paragraphDeletes > 0) summary.push(`${paragraphDeletes} paragraph(s) deleted`);
  if (listItemInserts > 0) summary.push(`${listItemInserts} list item(s) inserted`);
  if (listItemDeletes > 0) summary.push(`${listItemDeletes} list item(s) deleted`);
  if (imageInserts > 0) summary.push(`${imageInserts} image(s) inserted`);
  if (imageDeletes > 0) summary.push(`${imageDeletes} image(s) deleted`);
  return summary;
}

// src/blankTemplate.ts
var BLANK_DOCX_BASE64 = `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`;
function base64ToBlob(base64, mimeType) {
  const byteCharacters = atob(base64.replace(/\s/g, ""));
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  return new Blob([byteArray], { type: mimeType });
}
function base64ToFile(base64, filename, mimeType) {
  const blob = base64ToBlob(base64, mimeType);
  return new File([blob], filename, { type: mimeType });
}
function getBlankTemplateFile() {
  return base64ToFile(
    BLANK_DOCX_BASE64,
    "blank-template.docx",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  );
}
function getBlankTemplateBlob() {
  return base64ToBlob(
    BLANK_DOCX_BASE64,
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  );
}
function isValidDocxFile(file) {
  const validTypes = [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/msword"
  ];
  return validTypes.includes(file.type) || file.name.endsWith(".docx");
}

export { CSS_PREFIX, DEFAULT_AUTHOR, DEFAULT_SUPERDOC_USER, DocxDiffEditor, StructuralChangesPane, alignDocuments, createTrackDeleteMark, createTrackFormatMark, createTrackInsertMark, DocxDiffEditor_default as default, detectContentType, diffDocuments, diffImages, diffLists, diffTables, extractEnrichedChanges, extractEnrichedChangesWithStructural, generateFingerprint, generateStructuralChangeSummary, getBlankTemplateBlob, getBlankTemplateFile, isAtomicNode, isImage, isList, isProseMirrorJSON, isTable, isValidDocxFile, mergeDocuments, parseDocxFile, parseHtmlToJson, processStructuralChanges };
//# sourceMappingURL=index.mjs.map
//# sourceMappingURL=index.mjs.map