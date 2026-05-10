import DOMPurify from 'isomorphic-dompurify';

/**
 * Sanitize raw HTML before storage and again on the client just before render
 * (defense in depth). Strips <style>, <script>, <iframe>, <form>, <object>,
 * <embed>. Keeps `target` attribute so external links can open in new tabs.
 */
export function sanitizeHtml(dirty: string): string {
  return DOMPurify.sanitize(dirty, {
    USE_PROFILES: { html: true },
    ADD_ATTR: ['target'],
    FORBID_TAGS: ['style', 'script', 'iframe', 'form', 'object', 'embed'],
  });
}
