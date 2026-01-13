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

    setTimeout(async () => {
      if (resolved) return;

      try {
        // Create SuperDoc with minimal empty HTML (not the actual content)
        // This avoids the import path which strips styles
        superdoc = new SuperDoc({
          selector: container,
          html: '<p></p>', // Minimal empty document
          documentMode: 'editing', // Need editing mode to use paste
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

              // Get the ProseMirror view
              const view = editor.view;
              if (!view) {
                throw new Error('No editor view found');
              }

              // Select all content and delete it to start fresh
              editor.commands.selectAll();
              editor.commands.deleteSelection();

              // Use pasteHTML which goes through the paste path
              // This path does NOT call stripHtmlStyles(), preserving inline styles
              view.pasteHTML(html);

              // Small delay to let the paste operation complete
              setTimeout(() => {
                if (resolved) return;
                try {
                  const json = editor.getJSON();
                  resolved = true;
                  cleanup();
                  resolve(json);
                } catch (err) {
                  resolved = true;
                  cleanup();
                  reject(err);
                }
              }, 50);
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
            reject(new Error('HTML parsing timed out'));
          }
        }, TIMEOUTS.PARSE_TIMEOUT);
      } catch (err) {
        cleanup();
        reject(err);
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
