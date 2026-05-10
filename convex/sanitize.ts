'use node';

import DOMPurify from 'isomorphic-dompurify';
import { v } from 'convex/values';
import { internalAction, type ActionCtx } from './_generated/server';
import { internal } from './_generated/api';

/**
 * Sanitize raw HTML before storing in Convex Storage (defense in depth —
 * the client re-sanitizes via src/lib/sanitize.ts before rendering).
 * Strips <style>, <script>, <iframe>, <form>, <object>, <embed>. Keeps
 * `target` so external links can open in new tabs.
 *
 * Inlined here (rather than in convex/lib/) because Convex analyses every
 * file under convex/ and falls over loading isomorphic-dompurify in V8.
 * This file is 'use node' so jsdom (DOMPurify's runtime dep) loads fine.
 */
function sanitizeHtml(dirty: string): string {
  return DOMPurify.sanitize(dirty, {
    USE_PROFILES: { html: true },
    ADD_ATTR: ['target'],
    FORBID_TAGS: ['style', 'script', 'iframe', 'form', 'object', 'embed'],
  });
}

/**
 * Action: sanitize + store + link a new HTML body for an email. Called from
 * `gmail.fetchBody` and `imap.fetchBodyImap`.
 *
 * Lives in this Node-runtime file because `isomorphic-dompurify` pulls in
 * `jsdom`, which isn't available in Convex's V8 isolate runtime. Importing it
 * from `convex/emails.ts` (V8 runtime) breaks module analysis with
 * "Cannot read properties of undefined (reading 'bind')".
 */
export const setBody = internalAction({
  args: {
    emailId: v.id('emails'),
    bodyHtml: v.string(),
    bodyText: v.optional(v.string()),
  },
  handler: async (ctx: ActionCtx, args) => {
    const sanitized = sanitizeHtml(args.bodyHtml);
    const storageId = await ctx.storage.store(
      new Blob([sanitized], { type: 'text/html' }),
    );
    await ctx.runMutation(internal.emails.setBodyStorage, {
      emailId: args.emailId,
      bodyStorageId: storageId,
      bodyText: args.bodyText,
    });
  },
});
