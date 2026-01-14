/**
 * Content Resolver Service
 * Detects content type and parses DOCX files to ProseMirror JSON.
 *
 * Supports three input formats:
 * - File: DOCX file parsed by SuperDoc
 * - string: HTML content (handled directly by SuperDoc in the component)
 * - object: Direct ProseMirror JSON (passed through)
 */

import type { DocxContent, ProseMirrorJSON } from '../types';
import { TIMEOUTS } from '../constants';
import { normalizeRunProperties } from './runPropertiesSync';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SuperDocConstructor = any;

/**
 * Detect the type of content provided
 */
export function detectContentType(content: DocxContent): 'file' | 'html' | 'json' {
  if (content instanceof File) {
    return 'file';
  }
  if (typeof content === 'string') {
    return 'html';
  }
  // Assume it's JSON if it's an object
  return 'json';
}

/**
 * Validate that content looks like ProseMirror JSON
 */
export function isProseMirrorJSON(content: unknown): boolean {
  if (!content || typeof content !== 'object') return false;
  const obj = content as Record<string, unknown>;
  return typeof obj.type === 'string' && (obj.type === 'doc' || Array.isArray(obj.content));
}

/**
 * Parse an HTML string into ProseMirror JSON using a hidden SuperDoc instance.
 * 
 * IMPORTANT: Uses the "paste" approach instead of the "import" approach.
 * SuperDoc's import path (via `html` option) calls `stripHtmlStyles()` which
 * removes all CSS styles except `text-align`. The paste path (via `view.pasteHTML()`)
 * preserves inline styles like color, font-size, font-family, font-weight, etc.
 * 
 * Flow:
 * 1. Create SuperDoc with empty HTML document
 * 2. Wait for editor to be ready
 * 3. Select all content and delete it (start fresh)
 * 4. Use editor.view.pasteHTML(html) - this uses the paste path which preserves styles
 * 5. Return the resulting JSON
 * 
 * Falls back to the standard import approach if paste fails.
 */
export async function parseHtmlToJson(
  html: string,
  SuperDoc: SuperDocConstructor
): Promise<ProseMirrorJSON> {
  // Create a hidden container for the editor
  const container = document.createElement('div');
  container.style.cssText =
    'position:absolute;top:-9999px;left:-9999px;width:800px;height:600px;visibility:hidden;';
  document.body.appendChild(container);

  return new Promise((resolve, reject) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let superdoc: any = null;
    let resolved = false;

    const cleanup = () => {
      setTimeout(() => {
        if (superdoc) {
          try {
            const sd = superdoc;
            superdoc = null;
            sd.destroy?.();
          } catch {
            // Ignore cleanup errors
          }
        }
        if (container.parentNode) {
          container.parentNode.removeChild(container);
        }
      }, TIMEOUTS.CLEANUP_DELAY);
    };

    /**
     * Attempt the paste approach (preserves styles)
     */
    const tryPasteApproach = (
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      sd: any,
      onSuccess: (json: ProseMirrorJSON) => void,
      onFail: () => void
    ) => {
      try {
        const editor = sd?.activeEditor;
        if (!editor?.view?.pasteHTML) {
          // pasteHTML not available, fall back
          onFail();
          return;
        }

        // Focus the editor (required for some operations)
        editor.commands.focus?.();

        // Select all content and delete it to start fresh
        if (editor.commands.selectAll && editor.commands.deleteSelection) {
          editor.commands.selectAll();
          editor.commands.deleteSelection();
        }

        // Create a mock paste event with proper clipboardData
        const mockEvent = createMockPasteEvent(html);

        // Use pasteHTML which goes through the paste path
        // This path does NOT call stripHtmlStyles(), preserving inline styles
        // Pass the mock event so getData() works
        editor.view.pasteHTML(html, mockEvent);

        // Small delay to let the paste operation complete
        setTimeout(() => {
          try {
            const json = editor.getJSON();
            // Verify we got content (paste succeeded)
            if (json?.content?.length > 0) {
              // Normalize runProperties to ensure styles render correctly
              const normalizedJson = normalizeRunProperties(json);
              onSuccess(normalizedJson);
            } else {
              // Paste produced empty doc, fall back
              onFail();
            }
          } catch {
            onFail();
          }
        }, 100);
      } catch (err) {
        console.warn('[parseHtmlToJson] Paste approach error:', err);
        onFail();
      }
    };

    /**
     * Fallback to standard import approach (strips some styles but works reliably)
     */
    const fallbackToImport = () => {
      // Clean up the paste attempt
      if (superdoc) {
        try {
          superdoc.destroy?.();
        } catch {
          // Ignore
        }
        superdoc = null;
      }

      // Create new SuperDoc with standard import
      superdoc = new SuperDoc({
        selector: container,
        html: html, // Use the actual HTML content
        documentMode: 'viewing',
        rulers: false,
        user: { name: 'Parser', email: 'parser@local' },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onReady: ({ superdoc: sd }: { superdoc: any }) => {
          if (resolved) return;
          try {
            const editor = sd?.activeEditor;
            if (!editor) {
              throw new Error('No active editor found');
            }
            const json = editor.getJSON();
            // Normalize runProperties to ensure styles render correctly
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
        onException: ({ error: err }: { error: Error }) => {
          if (resolved) return;
          resolved = true;
          cleanup();
          reject(err);
        },
      });
    };

    setTimeout(async () => {
      if (resolved) return;

      try {
        // First, try the paste approach (preserves styles)
        superdoc = new SuperDoc({
          selector: container,
          html: '<p></p>', // Minimal empty document
          documentMode: 'editing', // Need editing mode to use paste
          rulers: false,
          user: { name: 'Parser', email: 'parser@local' },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          onReady: ({ superdoc: sd }: { superdoc: any }) => {
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
                console.warn('[parseHtmlToJson] Paste approach failed, falling back to import');
                fallbackToImport();
              }
            );
          },
          onException: ({ error: err }: { error: Error }) => {
            if (resolved) return;
            // Try fallback on exception
            console.warn('[parseHtmlToJson] Paste approach exception, falling back:', err);
            fallbackToImport();
          },
        });

        // Timeout
        setTimeout(() => {
          if (!resolved) {
            resolved = true;
            cleanup();
            reject(new Error('HTML parsing timed out'));
          }
        }, TIMEOUTS.PARSE_TIMEOUT);
      } catch (err) {
        // Try fallback on error
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

/**
 * Manually sync numbering definitions from child editor to parent editor.
 * 
 * SuperDoc's createChildEditor has a linkListDefinitionsChange callback that should
 * sync numbering automatically, but due to timing issues (event emitted during construction
 * before listeners are registered), we need to manually sync after parsing completes.
 * 
 * This merges the child's numbering definitions and abstracts into the parent's store.
 */
function syncNumberingToParent(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  childEditor: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  parentEditor: any
): void {
  try {
    const childNumbering = childEditor?.converter?.numbering;
    const parentNumbering = parentEditor?.converter?.numbering;
    
    if (!childNumbering || !parentNumbering) {
      return;
    }

    // Merge definitions (numId -> definition mapping)
    if (childNumbering.definitions) {
      parentNumbering.definitions = {
        ...parentNumbering.definitions,
        ...childNumbering.definitions,
      };
    }

    // Merge abstracts (abstractNumId -> abstract definition mapping)
    if (childNumbering.abstracts) {
      parentNumbering.abstracts = {
        ...parentNumbering.abstracts,
        ...childNumbering.abstracts,
      };
    }

    // Update the parent's converter numbering reference
    parentEditor.converter.numbering = parentNumbering;
  } catch (err) {
    console.warn('[syncNumberingToParent] Failed to sync numbering definitions:', err);
  }
}

/**
 * Create a mock ClipboardEvent with proper getData() support.
 * This is needed because pasteHTML internally calls event.clipboardData.getData().
 */
function createMockPasteEvent(htmlContent: string): ClipboardEvent {
  const dataTransfer = new DataTransfer();
  dataTransfer.setData('text/html', htmlContent);
  dataTransfer.setData('text/plain', '');

  return new ClipboardEvent('paste', {
    bubbles: true,
    cancelable: true,
    clipboardData: dataTransfer,
  });
}

/**
 * Parse HTML using a linked child editor from the main SuperDoc instance.
 * 
 * This approach combines two critical features:
 * 
 * 1. **Style preservation**: Uses the "paste" approach (view.pasteHTML) instead of
 *    the "import" approach (html option). The import path calls stripHtmlStyles()
 *    which removes CSS styles. The paste path preserves inline styles.
 * 
 * 2. **List numbering sync**: Creates a linked child editor and manually syncs
 *    numbering definitions to the parent editor, preventing crashes when parsed
 *    content with lists is later applied via compareWith().
 * 
 * Flow:
 * 1. Create linked child editor with minimal empty HTML ('<p></p>')
 * 2. Wait for child editor to be ready
 * 3. Use view.pasteHTML() to paste the actual HTML (preserves styles)
 * 4. Manually sync numbering definitions from child to parent
 * 5. Return the parsed JSON
 * 
 * @param html - HTML string to parse
 * @param mainEditor - The main SuperDoc editor instance (must have createChildEditor)
 * @returns ProseMirror JSON with styles preserved and numbering synced
 */
export async function parseHtmlWithLinkedEditor(
  html: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mainEditor: any
): Promise<ProseMirrorJSON> {
  // Create a hidden container for the child editor
  const container = document.createElement('div');
  container.style.cssText =
    'position:absolute;top:-9999px;left:-9999px;width:800px;height:600px;visibility:hidden;';
  document.body.appendChild(container);

  return new Promise((resolve, reject) => {
    let resolved = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let childEditor: any = null;

    const cleanup = () => {
      setTimeout(() => {
        if (childEditor) {
          try {
            childEditor.destroy?.();
          } catch {
            // Ignore cleanup errors
          }
          childEditor = null;
        }
        if (container.parentNode) {
          container.parentNode.removeChild(container);
        }
      }, TIMEOUTS.CLEANUP_DELAY);
    };

    /**
     * Use the paste approach on the child editor to preserve styles
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pasteAndExtract = (editor: any) => {
      try {
        if (!editor?.view?.pasteHTML) {
          throw new Error('pasteHTML not available on child editor');
        }

        // Focus the editor (required for some operations)
        editor.commands?.focus?.();

        // Select all content and delete it to start fresh
        if (editor.commands?.selectAll && editor.commands?.deleteSelection) {
          editor.commands.selectAll();
          editor.commands.deleteSelection();
        }

        // Create a mock paste event with proper clipboardData
        const mockEvent = createMockPasteEvent(html);

        // Use pasteHTML which goes through the paste path
        // This path does NOT call stripHtmlStyles(), preserving inline styles
        editor.view.pasteHTML(html, mockEvent);

        // Small delay to let the paste operation complete
        setTimeout(() => {
          if (resolved) return;

          try {
            // CRITICAL: Manually sync numbering definitions from child to parent
            // This must happen BEFORE getJSON() so the parent has all definitions
            // when the parsed content is later applied via compareWith()
            syncNumberingToParent(editor, mainEditor);

            const json = editor.getJSON();

            // Verify we got content
            if (!json?.content?.length) {
              throw new Error('Paste produced empty document');
            }

            // Normalize runProperties to ensure styles render correctly
            const normalizedJson = normalizeRunProperties(json);

            resolved = true;
            cleanup();
            resolve(normalizedJson);
          } catch (err) {
            resolved = true;
            cleanup();
            reject(err);
          }
        }, 100);
      } catch (err) {
        resolved = true;
        cleanup();
        reject(err);
      }
    };

    try {
      // Create linked child editor with EMPTY HTML (not the actual content)
      // We'll use pasteHTML to insert the actual content, which preserves styles
      mainEditor.createChildEditor({
        element: container,
        html: '<p></p>', // Minimal empty document - actual HTML pasted via pasteHTML
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onCreate: ({ editor: localEditor }: { editor: any }) => {
          if (resolved) return;
          childEditor = localEditor;
          
          // Now paste the actual HTML using the paste approach
          pasteAndExtract(localEditor);
        },
        onError: (error: Error) => {
          if (resolved) return;
          resolved = true;
          cleanup();
          reject(error);
        },
      });

      // Timeout fallback
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          cleanup();
          reject(new Error('Linked HTML parsing timed out'));
        }
      }, TIMEOUTS.PARSE_TIMEOUT);
    } catch (err) {
      cleanup();
      reject(err);
    }
  });
}

/**
 * Parse a DOCX File into ProseMirror JSON using a hidden SuperDoc instance.
 */
export async function parseDocxFile(
  file: File,
  SuperDoc: SuperDocConstructor
): Promise<ProseMirrorJSON> {
  // Create a hidden container for the editor
  const container = document.createElement('div');
  container.style.cssText =
    'position:absolute;top:-9999px;left:-9999px;width:800px;height:600px;visibility:hidden;';
  document.body.appendChild(container);

  return new Promise((resolve, reject) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let superdoc: any = null;
    let resolved = false;

    const cleanup = () => {
      setTimeout(() => {
        if (superdoc) {
          try {
            const sd = superdoc;
            superdoc = null;
            sd.destroy?.();
          } catch {
            // Ignore cleanup errors
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
          documentMode: 'viewing',
          rulers: false,
          user: { name: 'Parser', email: 'parser@local' },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          onReady: ({ superdoc: sd }: { superdoc: any }) => {
            if (resolved) return;
            try {
              const editor = sd?.activeEditor;
              if (!editor) {
                throw new Error('No active editor found');
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
          onException: ({ error: err }: { error: Error }) => {
            if (resolved) return;
            resolved = true;
            cleanup();
            reject(err);
          },
        });

        // Timeout
        setTimeout(() => {
          if (!resolved) {
            resolved = true;
            cleanup();
            reject(new Error('Document parsing timed out'));
          }
        }, TIMEOUTS.PARSE_TIMEOUT);
      } catch (err) {
        cleanup();
        reject(err);
      }
    }, 50);
  });
}
