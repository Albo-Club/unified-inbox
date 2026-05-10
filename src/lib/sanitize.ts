import DOMPurify from 'isomorphic-dompurify';

/**
 * Sanitize HTML before injecting into the reading pane via dangerouslySetInnerHTML.
 * Defense in depth — the body is also sanitized server-side before persisting.
 */
export function sanitizeHtml(dirty: string): string {
  return DOMPurify.sanitize(dirty, {
    USE_PROFILES: { html: true },
    ADD_ATTR: ['target'],
    FORBID_TAGS: ['style', 'script', 'iframe', 'form', 'object', 'embed'],
  });
}
