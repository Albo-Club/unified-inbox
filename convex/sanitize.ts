'use node';

import { v } from 'convex/values';
import { internalAction, type ActionCtx } from './_generated/server';
import { internal } from './_generated/api';
import { sanitizeHtml } from './lib/sanitize';

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
