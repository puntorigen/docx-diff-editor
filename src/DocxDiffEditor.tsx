/**
 * DocxDiffEditor Component
 *
 * A React component for DOCX document comparison with track changes visualization.
 * Wraps SuperDoc editor and provides methods for setting source, comparing documents,
 * and extracting change context for LLM processing.
 */

import {
  useCallback,
  useRef,
  useState,
  useEffect,
  useImperativeHandle,
  forwardRef,
} from 'react';

import type {
  DocxDiffEditorProps,
  DocxDiffEditorRef,
  DocxContent,
  ProseMirrorJSON,
  SuperDocInstance,
  DiffSegment,
  DiffResult,
  ComparisonResult,
  EnrichedChange,
} from './types';

import { parseDocxFile, detectContentType, isProseMirrorJSON } from './services/contentResolver';
import { diffDocuments } from './services/documentDiffer';
import { mergeDocuments } from './services/mergeDocuments';
import { extractEnrichedChanges } from './services/changeContextExtractor';
import { DEFAULT_AUTHOR, DEFAULT_SUPERDOC_USER, TRACK_CHANGE_PERMISSIONS, TIMEOUTS } from './constants';

/**
 * Permission resolver that allows accepting/rejecting all track changes
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const permissionResolver = ({ permission }: any) => {
  return TRACK_CHANGE_PERMISSIONS.includes(permission) ? true : undefined;
};

/**
 * Accept all track changes in a ProseMirror JSON document.
 * - Removes text with trackDelete marks
 * - Keeps text with trackInsert marks (removes the mark)
 * - Keeps text with trackFormat marks with new formatting (removes the mark)
 */
function acceptAllChangesInJson(node: ProseMirrorJSON): ProseMirrorJSON | null {
  if (!node) return null;

  // Handle text nodes
  if (node.type === 'text') {
    const marks = node.marks || [];
    
    // Check if this text has a trackDelete mark - if so, remove entirely
    if (marks.some((m: { type: string }) => m.type === 'trackDelete')) {
      return null;
    }

    // Filter out track marks, keep other marks
    const cleanMarks = marks.filter(
      (m: { type: string }) => !['trackInsert', 'trackDelete', 'trackFormat'].includes(m.type)
    );

    return {
      ...node,
      marks: cleanMarks.length > 0 ? cleanMarks : undefined,
    };
  }

  // Handle nodes with content
  if (node.content && Array.isArray(node.content)) {
    const cleanContent = node.content
      .map((child: ProseMirrorJSON) => acceptAllChangesInJson(child))
      .filter((child: ProseMirrorJSON | null): child is ProseMirrorJSON => child !== null);

    return {
      ...node,
      content: cleanContent.length > 0 ? cleanContent : undefined,
    };
  }

  return node;
}

/**
 * DocxDiffEditor Component
 */
export const DocxDiffEditor = forwardRef<DocxDiffEditorRef, DocxDiffEditorProps>(
  function DocxDiffEditor(
    {
      initialSource,
      templateDocx,
      showRulers = false,
      showToolbar = true,
      author = DEFAULT_AUTHOR,
      onReady,
      onSourceLoaded,
      onComparisonComplete,
      onError,
      className = '',
      toolbarClassName = '',
      editorClassName = '',
    },
    ref
  ) {
    // Refs
    const containerRef = useRef<HTMLDivElement>(null);
    const toolbarRef = useRef<HTMLDivElement>(null);
    const superdocRef = useRef<SuperDocInstance | null>(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SuperDocRef = useRef<any>(null);
    const mountedRef = useRef(true);
    const initRef = useRef(false);
    const readyRef = useRef(false);

    // State
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [sourceJson, setSourceJson] = useState<ProseMirrorJSON | null>(null);
    const [mergedJson, setMergedJson] = useState<ProseMirrorJSON | null>(null);
    const [diffResult, setDiffResult] = useState<DiffResult | null>(null);

    // Generate unique IDs for this instance
    const instanceId = useRef(`dde-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
    const editorId = `dde-editor-${instanceId.current}`;
    const toolbarId = `dde-toolbar-${instanceId.current}`;

    /**
     * Set content in the editor using ProseMirror transaction
     */
    const setEditorContent = useCallback((editor: SuperDocInstance, json: ProseMirrorJSON) => {
      const { state, view } = editor;
      if (state?.doc && view && json.content) {
        const newDoc = state.schema.nodeFromJSON(json);
        const tr = state.tr.replaceWith(0, state.doc.content.size, newDoc.content);
        view.dispatch(tr);
      }
    }, []);

    /**
     * Enable track changes review mode
     */
    const enableReviewMode = useCallback((sd: SuperDocInstance) => {
      if (sd.setTrackedChangesPreferences) {
        sd.setTrackedChangesPreferences({ mode: 'review', enabled: true });
      } else if (sd.activeEditor?.commands?.enableTrackChanges) {
        sd.activeEditor.commands.enableTrackChanges();
      }
    }, []);

    /**
     * Set editing mode (normal mode - shows original without track changes)
     */
    const setEditingMode = useCallback((sd: SuperDocInstance) => {
      if (sd.setTrackedChangesPreferences) {
        // Use 'off' mode with track changes disabled for clean editing view
        // Valid modes (superdoc 1.3+): 'review', 'original', 'final', 'off'
        sd.setTrackedChangesPreferences({ mode: 'off', enabled: false });
      }
    }, []);

    /**
     * Handle errors
     */
    const handleError = useCallback(
      (err: Error | string) => {
        const error = err instanceof Error ? err : new Error(err);
        setError(error.message);
        onError?.(error);
      },
      [onError]
    );

    /**
     * Destroy current SuperDoc instance
     */
    const destroySuperdoc = useCallback(() => {
      if (superdocRef.current) {
        try {
          superdocRef.current.destroy?.();
        } catch {
          // Ignore cleanup errors
        }
        superdocRef.current = null;
      }
      readyRef.current = false;
    }, []);

    /**
     * Create a new SuperDoc instance with the given options.
     * Accepts either a DOCX File/Blob or HTML string.
     * 
     * Track bubbles are enabled by calling processLoadedDocxComments after
     * setting merged content (see compareWith method).
     */
    const createSuperdoc = useCallback(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async (options: { document?: File | Blob; html?: string }): Promise<{ superdoc: SuperDocInstance; json: ProseMirrorJSON }> => {
        if (!SuperDocRef.current) {
          throw new Error('SuperDoc not loaded');
        }
        if (!containerRef.current) {
          throw new Error('Container not available');
        }

        // Clear containers to avoid Vue "already mounted" warning
        containerRef.current.innerHTML = '';
        if (toolbarRef.current) {
          toolbarRef.current.innerHTML = '';
        }

        // Set IDs on DOM elements
        containerRef.current.id = editorId;
        if (toolbarRef.current) {
          toolbarRef.current.id = toolbarId;
        }

        return new Promise((resolve, reject) => {
          let resolved = false;
          
          try {
            // Build SuperDoc config - use document OR html, not both
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const superdocConfig: any = {
              selector: `#${editorId}`,
              toolbar: showToolbar ? `#${toolbarId}` : undefined,
              documentMode: 'editing',
              role: 'editor',
              rulers: showRulers,
              user: DEFAULT_SUPERDOC_USER,
              permissionResolver,
            };

            if (options.document) {
              superdocConfig.document = options.document;
            } else if (options.html) {
              superdocConfig.html = options.html;
            }
            // If neither document nor html provided, SuperDoc creates blank document

            const superdoc = new SuperDocRef.current({
              ...superdocConfig,
              onReady: ({ superdoc: sd }: { superdoc: SuperDocInstance }) => {
                if (resolved) return;
                resolved = true;
                
                superdocRef.current = sd;
                readyRef.current = true;

                // Extract JSON from the loaded document
                let json: ProseMirrorJSON = { type: 'doc', content: [] };
                if (sd?.activeEditor) {
                  try {
                    json = sd.activeEditor.getJSON();
                  } catch (err) {
                    console.error('Failed to extract JSON:', err);
                  }
                }

                resolve({ superdoc: sd, json });
              },
              onException: ({ error: err }: { error: Error }) => {
                if (resolved) return;
                resolved = true;
                console.error('SuperDoc error:', err);
                reject(err);
              },
            });

            superdocRef.current = superdoc;

            // Timeout
            setTimeout(() => {
              if (!resolved) {
                resolved = true;
                reject(new Error('SuperDoc initialization timed out'));
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

    /**
     * Initialize SuperDoc instance
     */
    const initialize = useCallback(async () => {
      if (initRef.current || !containerRef.current || !mountedRef.current) return;
      if (!showToolbar && !toolbarRef.current) {
        // Continue without toolbar
      } else if (showToolbar && !toolbarRef.current) {
        return;
      }

      initRef.current = true;

      // Small delay for React to settle
      await new Promise((resolve) => setTimeout(resolve, TIMEOUTS.INIT_DELAY));

      if (!mountedRef.current || !containerRef.current) {
        initRef.current = false;
        return;
      }

      setIsLoading(true);
      setError(null);
      destroySuperdoc();

      try {
        // Note: superdoc CSS is bundled in dist/styles.css - user must import 'docx-diff-editor/styles.css'
        const { SuperDoc } = await import('superdoc');
        SuperDocRef.current = SuperDoc;

        // Determine initialization options based on initialSource
        let initOptions: { document?: File | Blob; html?: string } = {};

        if (initialSource) {
          const contentType = detectContentType(initialSource);
          if (contentType === 'file') {
            initOptions = { document: initialSource as File };
          } else if (contentType === 'html') {
            // Use SuperDoc's native HTML support
            initOptions = { html: initialSource as string };
          } else if (contentType === 'json') {
            // For JSON, we need a document first, then set content
            // Use template if provided, otherwise SuperDoc will create blank
            initOptions = templateDocx ? { document: templateDocx } : {};
          }
        } else if (templateDocx) {
          initOptions = { document: templateDocx };
        }
        // If no initialSource and no template, SuperDoc creates a blank document

        const { superdoc: sd, json } = await createSuperdoc(initOptions);

        // For JSON content, set it after initialization
        if (initialSource && detectContentType(initialSource) === 'json') {
          if (sd?.activeEditor && isProseMirrorJSON(initialSource)) {
            setEditorContent(sd.activeEditor, initialSource as ProseMirrorJSON);
            setSourceJson(initialSource as ProseMirrorJSON);
            onSourceLoaded?.(initialSource as ProseMirrorJSON);
          }
        } else {
          // Use JSON extracted from the loaded document
          setSourceJson(json);
          onSourceLoaded?.(json);
        }

        setIsLoading(false);
        onReady?.();
      } catch (err) {
        console.error('Failed to initialize SuperDoc:', err);
        handleError(err instanceof Error ? err : new Error('Failed to load editor'));
        setIsLoading(false);
        // Allow retry on error
        initRef.current = false;
      }
      // Note: initRef stays true on success to prevent re-initialization
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
      handleError,
    ]);

    // Initialize on mount - only once
    useEffect(() => {
      mountedRef.current = true;
      
      // Only initialize once
      if (!initRef.current) {
        initialize();
      }

      return () => {
        mountedRef.current = false;
        destroySuperdoc();
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // Empty deps - only run on mount

    // =========================================================================
    // Imperative API
    // =========================================================================

    useImperativeHandle(
      ref,
      () => ({
        /**
         * Update content in the existing editor without recreating SuperDoc instance.
         * Preserves the DOCX template/styling. Ideal for replacing content with translated JSON.
         */
        updateContent(json: ProseMirrorJSON): void {
          const editor = superdocRef.current?.activeEditor;
          if (!editor) {
            throw new Error('Editor not ready');
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
        async setSource(content: DocxContent): Promise<void> {
          if (!SuperDocRef.current) {
            throw new Error('Editor not initialized');
          }

          setIsLoading(true);
          setError(null);

          try {
            const contentType = detectContentType(content);
            let json: ProseMirrorJSON;

            // Destroy current instance and create new one
            destroySuperdoc();

            if (contentType === 'file') {
              // Initialize with DOCX file
              const result = await createSuperdoc({ document: content as File });
              json = result.json;
            } else if (contentType === 'html') {
              // Use SuperDoc's native HTML support
              const result = await createSuperdoc({ html: content as string });
              json = result.json;
            } else {
              // JSON content - initialize with template or blank, then set content
              const result = await createSuperdoc(templateDocx ? { document: templateDocx } : {});
              if (result.superdoc?.activeEditor && isProseMirrorJSON(content)) {
                setEditorContent(result.superdoc.activeEditor, content as ProseMirrorJSON);
                json = content as ProseMirrorJSON;
              } else {
                json = result.json;
              }
            }

            setSourceJson(json);
            setMergedJson(null);
            setDiffResult(null);
            setEditingMode(superdocRef.current!);
            onSourceLoaded?.(json);
          } catch (err) {
            handleError(err instanceof Error ? err : new Error('Failed to set source'));
            throw err;
          } finally {
            setIsLoading(false);
          }
        },

        /**
         * Compare source with new content, show track changes
         */
        async compareWith(content: DocxContent): Promise<ComparisonResult> {
          if (!SuperDocRef.current) {
            throw new Error('Editor not initialized');
          }
          if (!sourceJson) {
            throw new Error('No source document set. Call setSource() first.');
          }

          setIsLoading(true);
          try {
            const contentType = detectContentType(content);
            let newJson: ProseMirrorJSON;

            if (contentType === 'file') {
              // Parse DOCX file using hidden SuperDoc instance
              newJson = await parseDocxFile(content as File, SuperDocRef.current);
            } else if (contentType === 'html') {
              // Parse HTML using a temporary SuperDoc instance
              const tempContainer = document.createElement('div');
              tempContainer.style.cssText = 'position:absolute;top:-9999px;left:-9999px;width:800px;height:600px;visibility:hidden;';
              document.body.appendChild(tempContainer);

              try {
                newJson = await new Promise((resolve, reject) => {
                  const tempSuperdoc = new SuperDocRef.current({
                    selector: tempContainer,
                    html: content as string,
                    documentMode: 'viewing',
                    rulers: false,
                    user: { name: 'Parser', email: 'parser@local' },
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    onReady: ({ superdoc: sd }: { superdoc: any }) => {
                      try {
                        const json = sd?.activeEditor?.getJSON() || { type: 'doc', content: [] };
                        setTimeout(() => {
                          try { sd?.destroy?.(); } catch { /* ignore */ }
                          tempContainer.parentNode?.removeChild(tempContainer);
                        }, 100);
                        resolve(json);
                      } catch (err) {
                        reject(err);
                      }
                    },
                    onException: ({ error: err }: { error: Error }) => {
                      tempContainer.parentNode?.removeChild(tempContainer);
                      reject(err);
                    },
                  });

                  setTimeout(() => {
                    try { tempSuperdoc?.destroy?.(); } catch { /* ignore */ }
                    tempContainer.parentNode?.removeChild(tempContainer);
                    reject(new Error('HTML parsing timed out'));
                  }, TIMEOUTS.PARSE_TIMEOUT);
                });
              } catch (err) {
                tempContainer.parentNode?.removeChild(tempContainer);
                throw err;
              }
            } else {
              // JSON content - use directly
              if (!isProseMirrorJSON(content)) {
                throw new Error('Invalid ProseMirror JSON structure');
              }
              newJson = content as ProseMirrorJSON;
            }

            // Diff the documents
            const diff = diffDocuments(sourceJson, newJson);
            setDiffResult(diff);

            // Merge with track changes
            const merged = mergeDocuments(sourceJson, newJson, diff, author);
            setMergedJson(merged);

            // Update editor with merged content and enable review mode
            if (superdocRef.current?.activeEditor) {
              setEditorContent(superdocRef.current.activeEditor, merged);
              enableReviewMode(superdocRef.current);
              
              // CRITICAL FIX: Trigger comment creation for track marks
              // SuperDoc's track bubbles require comment entries in commentsStore.
              // When we inject JSON with track marks via setEditorContent, no comments
              // are created automatically. We need to call processLoadedDocxComments
              // which internally calls createCommentForTrackChanges to:
              // 1. Scan the document for track marks using getTrackChanges
              // 2. Create comment entries for each track mark
              // 3. This populates getFloatingComments which renders the bubbles
              //
              // Source reference: superdoc/dist/chunks/index-1n6qegaQ.es.js
              // - Line 4212: processLoadedDocxComments function
              // - Line 4247: setTimeout(() => createCommentForTrackChanges(editor))
              // - Line 4250: createCommentForTrackChanges scans for track marks
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const sd = superdocRef.current as any;
              if (sd.commentsStore?.processLoadedDocxComments) {
                // Small delay to ensure editor state is fully updated
                setTimeout(() => {
                  try {
                    sd.commentsStore.processLoadedDocxComments({
                      superdoc: sd,
                      editor: sd.activeEditor,
                      comments: [], // Empty array - we just want to trigger createCommentForTrackChanges
                      documentId: sd.activeEditor?.options?.documentId || 'primary',
                    });
                  } catch (err) {
                    console.warn('[DocxDiffEditor] Failed to process track changes for bubbles:', err);
                  }
                }, 50);
              }
            }

            // Build result
            const insertions = diff.segments.filter((s) => s.type === 'insert').length;
            const deletions = diff.segments.filter((s) => s.type === 'delete').length;
            const formatChanges = diff.formatChanges?.length || 0;

            const result: ComparisonResult = {
              totalChanges: insertions + deletions + formatChanges,
              insertions,
              deletions,
              formatChanges,
              summary: diff.summary,
              mergedJson: merged,
            };

            onComparisonComplete?.(result);
            return result;
          } catch (err) {
            handleError(err instanceof Error ? err : new Error('Comparison failed'));
            throw err;
          } finally {
            setIsLoading(false);
          }
        },

        /**
         * Get raw diff segments
         */
        getDiffSegments(): DiffSegment[] {
          return diffResult?.segments || [];
        },

        /**
         * Get enriched changes with context for LLM processing
         */
        getEnrichedChangesContext(): EnrichedChange[] {
          if (!mergedJson) return [];
          return extractEnrichedChanges(mergedJson);
        },

        /**
         * Get current document content as JSON
         */
        getContent(): ProseMirrorJSON {
          if (superdocRef.current?.activeEditor) {
            return superdocRef.current.activeEditor.getJSON();
          }
          return mergedJson || sourceJson || { type: 'doc', content: [] };
        },

        /**
         * Get source document JSON (before comparison)
         */
        getSourceContent(): ProseMirrorJSON | null {
          return sourceJson;
        },

        /**
         * Export current document to DOCX blob
         */
        async exportDocx(): Promise<Blob> {
          if (!superdocRef.current?.activeEditor) {
            throw new Error('Editor not ready');
          }

          const blob = await superdocRef.current.activeEditor.exportDocx({
            isFinalDoc: false,
          });

          if (!blob) {
            throw new Error('Export returned no data');
          }

          return blob;
        },

        /**
         * Reset to source state (clear comparison)
         */
        resetComparison(): void {
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
        async acceptAllChanges(): Promise<ProseMirrorJSON> {
          const editor = superdocRef.current?.activeEditor;
          const sd = superdocRef.current;
          if (!editor || !sd) {
            throw new Error('Editor not ready');
          }

          // Try different API paths with fallback
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const editorAny = editor as any;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const sdAny = sd as any;

          let cleanJson: ProseMirrorJSON;

          if (typeof editorAny.commands?.acceptAllChanges === 'function') {
            editorAny.commands.acceptAllChanges();
            cleanJson = editor.getJSON();
          } else if (typeof sdAny.commands?.acceptAllChanges === 'function') {
            sdAny.commands.acceptAllChanges();
            cleanJson = editor.getJSON();
          } else if (typeof sdAny.acceptAllChanges === 'function') {
            sdAny.acceptAllChanges();
            cleanJson = editor.getJSON();
          } else {
            // Fallback: process JSON manually to accept all changes
            const currentJson = editor.getJSON();
            cleanJson = acceptAllChangesInJson(currentJson) || { type: 'doc', content: [] };
          }

          // Clear comparison state since changes are now accepted
          setMergedJson(null);
          setDiffResult(null);

          return cleanJson;
        },

        /**
         * Check if editor is ready
         */
        isReady(): boolean {
          return readyRef.current;
        },

        /**
         * Get the current page count from the presentation editor.
         * Returns 0 if editor is not ready or pages are unavailable.
         */
        getPages(): number {
          if (!readyRef.current || !superdocRef.current) {
            return 0;
          }

          try {
            // Access the document from the superdoc store
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const sd = superdocRef.current as any;
            const doc = sd.superdocStore?.documents?.[0];
            
            if (!doc) {
              return 0;
            }

            // Get the PresentationEditor and retrieve page count
            const presentationEditor = doc.getPresentationEditor?.();
            const pages = presentationEditor?.getPages?.();
            
            return pages?.length ?? 0;
          } catch (err) {
            console.warn('[DocxDiffEditor] Failed to get page count:', err);
            return 0;
          }
        },
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
        handleError,
      ]
    );

    // =========================================================================
    // Render
    // =========================================================================

    return (
      <div className={`dde-container ${className}`.trim()}>
        {/* Loading overlay */}
        {isLoading && (
          <div className="dde-loading">
            <div className="dde-loading__spinner" />
            <p className="dde-loading__text">Loading document...</p>
          </div>
        )}

        {/* Error overlay */}
        {error && (
          <div className="dde-error">
            <div className="dde-error__icon">
              <svg
                className="dde-error__svg"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <p className="dde-error__title">Failed to load document</p>
            <p className="dde-error__message">{error}</p>
          </div>
        )}

        {/* Toolbar */}
        {showToolbar && (
          <div
            ref={toolbarRef}
            className={`dde-toolbar ${toolbarClassName}`.trim()}
          />
        )}

        {/* Editor container */}
        <div
          ref={containerRef}
          className={`dde-editor ${editorClassName}`.trim()}
        />
      </div>
    );
  }
);

export default DocxDiffEditor;
