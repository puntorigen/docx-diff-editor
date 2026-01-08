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
