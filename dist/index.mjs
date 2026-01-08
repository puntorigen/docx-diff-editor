import { forwardRef, useRef, useState, useCallback, useEffect, useImperativeHandle } from 'react';
import DiffMatchPatch from 'diff-match-patch';
import { v4 } from 'uuid';
import { jsxs, jsx } from 'react/jsx-runtime';

// src/DocxDiffEditor.tsx

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
          formatChanges.push({
            from: posA + startI,
            to: posA + i,
            text: segment.text.substring(startI, i),
            before: startMarksA,
            after: startMarksB
          });
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
  for (const [op, text] of diffs) {
    if (op === DIFF_EQUAL) {
      segments.push({ type: "equal", text });
    } else if (op === DIFF_INSERT) {
      segments.push({ type: "insert", text });
      insertCount++;
    } else if (op === DIFF_DELETE) {
      segments.push({ type: "delete", text });
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
    summary
  };
}
function createTrackInsertMark(author = DEFAULT_AUTHOR) {
  return {
    type: "trackInsert",
    attrs: {
      id: v4(),
      author: author.name,
      authorEmail: author.email,
      authorImage: "",
      date: (/* @__PURE__ */ new Date()).toISOString()
    }
  };
}
function createTrackDeleteMark(author = DEFAULT_AUTHOR) {
  return {
    type: "trackDelete",
    attrs: {
      id: v4(),
      author: author.name,
      authorEmail: author.email,
      authorImage: "",
      date: (/* @__PURE__ */ new Date()).toISOString()
    }
  };
}
function createTrackFormatMark(before, after, author = DEFAULT_AUTHOR) {
  return {
    type: "trackFormat",
    attrs: {
      id: v4(),
      author: author.name,
      authorEmail: author.email,
      authorImage: "",
      date: (/* @__PURE__ */ new Date()).toISOString(),
      before,
      after
    }
  };
}

// src/services/mergeDocuments.ts
function cloneNode(node) {
  return JSON.parse(JSON.stringify(node));
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
  for (const segment of diffResult.segments) {
    if (segment.type === "equal") {
      for (let i = 0; i < segment.text.length; i++) {
        charStates[docAOffset + i] = { type: "equal" };
      }
      docAOffset += segment.text.length;
    } else if (segment.type === "delete") {
      for (let i = 0; i < segment.text.length; i++) {
        charStates[docAOffset + i] = { type: "delete" };
      }
      docAOffset += segment.text.length;
    } else if (segment.type === "insert") {
      insertions.push({
        afterOffset: docAOffset,
        text: segment.text
      });
    }
  }
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
          result.push({
            type: "text",
            text: ins.text,
            marks: [...node.marks || [], createTrackInsertMark(author)]
          });
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
          marks.push(createTrackDeleteMark(author));
        } else if (charState.type === "equal") {
          if (currentFormatChange) {
            const trackFormatMark = createTrackFormatMark(
              currentFormatChange.before,
              currentFormatChange.after,
              author
            );
            marks = [...currentFormatChange.after, trackFormatMark];
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
        result.push({
          type: "text",
          text: ins.text,
          marks: [...node.marks || [], createTrackInsertMark(author)]
        });
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
      const insertNode = {
        type: "paragraph",
        content: [
          {
            type: "run",
            content: [
              {
                type: "text",
                text: ins.text,
                marks: [createTrackInsertMark(author)]
              }
            ]
          }
        ]
      };
      if (!merged.content) merged.content = [];
      merged.content.push(insertNode);
    }
  }
  return merged;
}

// src/services/changeContextExtractor.ts
function extractEnrichedChanges(mergedJson) {
  const changes = [];
  const context = {
    currentSection: null,
    currentParagraphText: "",
    currentNodeType: "unknown"
  };
  traverseDocument(mergedJson, context, changes);
  return groupReplacements(changes);
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
  } else if (node.type === "tableCell") {
    context.currentNodeType = "tableCell";
    context.currentParagraphText = extractAllText(node);
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
  if (trackMark.type === "trackInsert") {
    return {
      type: "insertion",
      text,
      location,
      surroundingText,
      charCount: text.length
    };
  }
  if (trackMark.type === "trackDelete") {
    return {
      type: "deletion",
      text,
      location,
      surroundingText,
      charCount: text.length
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
      charCount: text.length
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
  } else if (context.currentSection) {
    description = `"${truncate(context.currentSection, 50)}" section`;
  } else {
    description = "document body";
  }
  return {
    nodeType,
    headingLevel: context.headingLevel,
    sectionTitle: context.currentSection || void 0,
    description
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
var permissionResolver = ({ permission }) => {
  return TRACK_CHANGE_PERMISSIONS.includes(permission) ? true : void 0;
};
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
    editorClassName = ""
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
    const instanceId = useRef(`dde-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
    const editorId = `dde-editor-${instanceId.current}`;
    const toolbarId = `dde-toolbar-${instanceId.current}`;
    const setEditorContent = useCallback((editor, json) => {
      if (editor.commands?.setContent) {
        editor.commands.setContent(json);
      } else if (editor.setContent) {
        editor.setContent(json);
      } else {
        const { state, view } = editor;
        if (state?.doc && view && json.content) {
          const newDoc = state.schema.nodeFromJSON(json);
          const tr = state.tr.replaceWith(0, state.doc.content.size, newDoc.content);
          view.dispatch(tr);
        }
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
        sd.setTrackedChangesPreferences({ mode: "simple", enabled: false });
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
              permissionResolver
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
         * Set the source/base document.
         * Accepts File (DOCX), HTML string, or ProseMirror JSON.
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
         * Compare source with new content, show track changes
         */
        async compareWith(content) {
          if (!SuperDocRef.current) {
            throw new Error("Editor not initialized");
          }
          if (!sourceJson) {
            throw new Error("No source document set. Call setSource() first.");
          }
          setIsLoading(true);
          try {
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
            const diff = diffDocuments(sourceJson, newJson);
            setDiffResult(diff);
            const merged = mergeDocuments(sourceJson, newJson, diff, author);
            setMergedJson(merged);
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
            const insertions = diff.segments.filter((s) => s.type === "insert").length;
            const deletions = diff.segments.filter((s) => s.type === "delete").length;
            const formatChanges = diff.formatChanges?.length || 0;
            const result = {
              totalChanges: insertions + deletions + formatChanges,
              insertions,
              deletions,
              formatChanges,
              summary: diff.summary,
              mergedJson: merged
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
         * Check if editor is ready
         */
        isReady() {
          return readyRef.current;
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
      )
    ] });
  }
);
var DocxDiffEditor_default = DocxDiffEditor;

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

export { CSS_PREFIX, DEFAULT_AUTHOR, DEFAULT_SUPERDOC_USER, DocxDiffEditor, createTrackDeleteMark, createTrackFormatMark, createTrackInsertMark, DocxDiffEditor_default as default, detectContentType, diffDocuments, extractEnrichedChanges, getBlankTemplateBlob, getBlankTemplateFile, isProseMirrorJSON, isValidDocxFile, mergeDocuments, parseDocxFile };
//# sourceMappingURL=index.mjs.map
//# sourceMappingURL=index.mjs.map