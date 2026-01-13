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
     * Create a mock ClipboardEvent with proper getData() support.
     * This is needed because pasteHTML internally calls event.clipboardData.getData().
     */
    const createMockPasteEvent = (htmlContent: string): ClipboardEvent => {
      // Create a DataTransfer object to hold the clipboard data
      const dataTransfer = new DataTransfer();
      dataTransfer.setData('text/html', htmlContent);
      dataTransfer.setData('text/plain', ''); // Some handlers check for plain text too

      // Create the ClipboardEvent with our DataTransfer
      const event = new ClipboardEvent('paste', {
        bubbles: true,
        cancelable: true,
        clipboardData: dataTransfer,
      });

      return event;
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
