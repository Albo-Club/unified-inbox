import { ConvexError, v } from 'convex/values';
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type ActionCtx,
  type MutationCtx,
  type QueryCtx,
} from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import { api, internal } from './_generated/api';
import { requireAppUser } from './users';
import { sanitizeHtml } from './lib/sanitize';

/* ============================================================================
 * Email CRUD — reads from the cache, writes through to Gmail/IMAP via actions.
 *
 * Folder mapping (Gmail labels):
 *   inbox   → INBOX
 *   sent    → SENT
 *   trash   → TRASH
 *   starred → STARRED
 *   all     → (no label filter)
 *
 * Every public function calls `requireAppUser` and scopes by userId.
 * ========================================================================= */

const FOLDER_LABEL: Record<'inbox' | 'sent' | 'trash' | 'starred', string> = {
  inbox: 'INBOX',
  sent: 'SENT',
  trash: 'TRASH',
  starred: 'STARRED',
};

async function loadOwnedEmail(
  ctx: QueryCtx | MutationCtx,
  emailId: Id<'emails'>,
) {
  const user = await requireAppUser(ctx);
  const email = await ctx.db.get(emailId);
  if (!email) {
    throw new ConvexError({ code: 'NOT_FOUND', message: 'Email not found' });
  }
  if (email.userId !== user._id) {
    throw new ConvexError({ code: 'FORBIDDEN', message: 'Not your email' });
  }
  return { user, email };
}

function publicEmailShape(e: Doc<'emails'>) {
  return {
    _id: e._id,
    accountId: e.accountId,
    providerId: e.providerId,
    threadId: e.threadId,
    subject: e.subject,
    sender: e.sender,
    senderEmail: e.senderEmail,
    recipients: e.recipients,
    cc: e.cc,
    date: e.date,
    snippet: e.snippet,
    isRead: e.isRead,
    isStarred: e.isStarred,
    labels: e.labels,
    hasAttachments: e.hasAttachments,
    hasBody: !!e.bodyStorageId,
  };
}

/** List emails in a folder for the current user. */
export const listByFolder = query({
  args: {
    folder: v.union(
      v.literal('inbox'),
      v.literal('sent'),
      v.literal('trash'),
      v.literal('starred'),
      v.literal('all'),
    ),
    limit: v.optional(v.number()),
    search: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireAppUser(ctx);
    const limit = Math.min(Math.max(args.limit ?? 50, 1), 200);

    // Full-text search path
    const search = args.search?.trim().toLowerCase();
    if (search) {
      const hits = await ctx.db
        .query('emails')
        .withSearchIndex('search_text', (q) =>
          q.search('searchText', search).eq('userId', user._id),
        )
        .take(limit);
      return hits.map(publicEmailShape);
    }

    // Folder filter
    const rows = await ctx.db
      .query('emails')
      .withIndex('by_user_date', (q) => q.eq('userId', user._id))
      .order('desc')
      .take(limit * 3); // over-fetch then filter

    let filtered = rows;
    if (args.folder !== 'all') {
      const label = FOLDER_LABEL[args.folder];
      filtered = rows.filter((r) => r.labels.includes(label));
    }
    return filtered.slice(0, limit).map(publicEmailShape);
  },
});

/** Get all messages in a thread, oldest first. */
export const getThread = query({
  args: { threadId: v.string() },
  handler: async (ctx, args) => {
    const user = await requireAppUser(ctx);
    const rows = await ctx.db
      .query('emails')
      .withIndex('by_user_thread', (q) =>
        q.eq('userId', user._id).eq('threadId', args.threadId),
      )
      .collect();
    rows.sort((a, b) => a.date - b.date);
    return rows.map(publicEmailShape);
  },
});

/**
 * Returns a short-lived URL where the sanitized HTML body of an email can be
 * fetched, or null if the body has not been fetched yet. Frontend should
 * call `fetchBody` action when it gets null, then re-query.
 *
 * Reactive — the URL appears as soon as a sync action populates the body.
 */
export const getBodyHtml = query({
  args: { emailId: v.id('emails') },
  handler: async (ctx, args): Promise<string | null> => {
    const { email } = await loadOwnedEmail(ctx, args.emailId);
    if (!email.bodyStorageId) return null;
    return await ctx.storage.getUrl(email.bodyStorageId);
  },
});

/**
 * Trigger a body fetch (Gmail API or IMAP, depending on account type). After
 * the action completes, `getBodyHtml` will return a non-null URL.
 */
export const fetchBody = action({
  args: { emailId: v.id('emails') },
  handler: async (ctx: ActionCtx, args) => {
    const email = (await ctx.runQuery(internal.emails.getInternal, {
      emailId: args.emailId,
    })) as Doc<'emails'> | null;
    if (!email) {
      throw new ConvexError({ code: 'NOT_FOUND', message: 'Email not found' });
    }
    const account = (await ctx.runQuery(internal.emails.getAccountInternal, {
      accountId: email.accountId,
    })) as Doc<'emailAccounts'> | null;
    if (!account) {
      throw new ConvexError({ code: 'NOT_FOUND', message: 'Account not found' });
    }

    if (account.authType === 'oauth') {
      await ctx.runAction(internal.gmail.fetchBody, { emailId: args.emailId });
    } else {
      await ctx.runAction(internal.imap.fetchBodyImap, { emailId: args.emailId });
    }
    return { success: true };
  },
});

/** List the current user's drafts. */
export const listDraftsMine = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireAppUser(ctx);
    const rows = await ctx.db
      .query('drafts')
      .withIndex('by_user', (q) => q.eq('userId', user._id))
      .order('desc')
      .collect();
    return rows.map((d) => ({
      _id: d._id,
      accountId: d.accountId,
      mode: d.mode,
      inReplyToEmailId: d.inReplyToEmailId ?? null,
      to: d.to,
      cc: d.cc,
      subject: d.subject,
      bodyHtml: d.bodyHtml,
      updatedAt: d.updatedAt,
    }));
  },
});

export const getDraft = query({
  args: { draftId: v.id('drafts') },
  handler: async (ctx, args) => {
    const user = await requireAppUser(ctx);
    const draft = await ctx.db.get(args.draftId);
    if (!draft) {
      throw new ConvexError({ code: 'NOT_FOUND', message: 'Draft not found' });
    }
    if (draft.userId !== user._id) {
      throw new ConvexError({ code: 'FORBIDDEN', message: 'Not your draft' });
    }
    return {
      _id: draft._id,
      accountId: draft.accountId,
      mode: draft.mode,
      inReplyToEmailId: draft.inReplyToEmailId ?? null,
      to: draft.to,
      cc: draft.cc,
      subject: draft.subject,
      bodyHtml: draft.bodyHtml,
      updatedAt: draft.updatedAt,
    };
  },
});

/* --------------------------------------------------------------------------
 * Mutations
 * ------------------------------------------------------------------------ */

/** Mark an email read/unread. Optimistic locally, propagated to provider async. */
export const markRead = mutation({
  args: {
    emailId: v.id('emails'),
    isRead: v.boolean(),
  },
  handler: async (ctx, args) => {
    const { email } = await loadOwnedEmail(ctx, args.emailId);
    await ctx.db.patch(email._id, { isRead: args.isRead });

    // Fire-and-forget label modification at the provider level.
    const account = await ctx.db.get(email.accountId);
    if (account?.authType === 'oauth') {
      await ctx.scheduler.runAfter(0, internal.gmail.applyFlag, {
        emailId: email._id,
        addLabels: args.isRead ? [] : ['UNREAD'],
        removeLabels: args.isRead ? ['UNREAD'] : [],
      });
    }
    return { success: true };
  },
});

/** Archive — remove from INBOX. */
export const archive = mutation({
  args: { emailId: v.id('emails') },
  handler: async (ctx, args) => {
    const { email } = await loadOwnedEmail(ctx, args.emailId);
    const newLabels = email.labels.filter((l) => l !== 'INBOX');
    await ctx.db.patch(email._id, { labels: newLabels });

    const account = await ctx.db.get(email.accountId);
    if (account?.authType === 'oauth') {
      await ctx.scheduler.runAfter(0, internal.gmail.applyFlag, {
        emailId: email._id,
        addLabels: [],
        removeLabels: ['INBOX'],
      });
    }
    return { success: true };
  },
});

/** Trash — move to TRASH. */
export const trash = mutation({
  args: { emailId: v.id('emails') },
  handler: async (ctx, args) => {
    const { email } = await loadOwnedEmail(ctx, args.emailId);
    const newLabels = email.labels.filter((l) => l !== 'INBOX').concat('TRASH');
    await ctx.db.patch(email._id, { labels: Array.from(new Set(newLabels)) });

    const account = await ctx.db.get(email.accountId);
    if (account?.authType === 'oauth') {
      await ctx.scheduler.runAfter(0, internal.gmail.applyFlag, {
        emailId: email._id,
        addLabels: ['TRASH'],
        removeLabels: ['INBOX'],
      });
    }
    return { success: true };
  },
});

/** Upsert a draft. */
export const saveDraft = mutation({
  args: {
    draftId: v.optional(v.id('drafts')),
    mode: v.union(
      v.literal('new'),
      v.literal('reply'),
      v.literal('replyAll'),
      v.literal('forward'),
    ),
    inReplyToEmailId: v.optional(v.id('emails')),
    accountId: v.id('emailAccounts'),
    to: v.string(),
    cc: v.string(),
    subject: v.string(),
    bodyHtml: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireAppUser(ctx);
    // Verify ownership of the target account
    const account = await ctx.db.get(args.accountId);
    if (!account || account.userId !== user._id) {
      throw new ConvexError({ code: 'FORBIDDEN', message: 'Account not yours' });
    }
    const now = Date.now();
    if (args.draftId) {
      const existing = await ctx.db.get(args.draftId);
      if (!existing) {
        throw new ConvexError({ code: 'NOT_FOUND', message: 'Draft not found' });
      }
      if (existing.userId !== user._id) {
        throw new ConvexError({ code: 'FORBIDDEN', message: 'Not your draft' });
      }
      await ctx.db.patch(args.draftId, {
        accountId: args.accountId,
        mode: args.mode,
        inReplyToEmailId: args.inReplyToEmailId,
        to: args.to,
        cc: args.cc,
        subject: args.subject,
        bodyHtml: args.bodyHtml,
        updatedAt: now,
      });
      return { _id: args.draftId };
    }
    const id = await ctx.db.insert('drafts', {
      userId: user._id,
      accountId: args.accountId,
      mode: args.mode,
      inReplyToEmailId: args.inReplyToEmailId,
      to: args.to,
      cc: args.cc,
      subject: args.subject,
      bodyHtml: args.bodyHtml,
      updatedAt: now,
    });
    return { _id: id };
  },
});

export const deleteDraft = mutation({
  args: { draftId: v.id('drafts') },
  handler: async (ctx, args) => {
    const user = await requireAppUser(ctx);
    const draft = await ctx.db.get(args.draftId);
    if (!draft) {
      throw new ConvexError({ code: 'NOT_FOUND', message: 'Draft not found' });
    }
    if (draft.userId !== user._id) {
      throw new ConvexError({ code: 'FORBIDDEN', message: 'Not your draft' });
    }
    await ctx.db.delete(args.draftId);
    return { success: true };
  },
});

/* --------------------------------------------------------------------------
 * Action: send an email via Gmail API or SMTP, depending on the account type.
 * ------------------------------------------------------------------------ */

export const sendEmail = action({
  args: {
    accountId: v.id('emailAccounts'),
    to: v.string(),
    cc: v.optional(v.string()),
    subject: v.string(),
    bodyHtml: v.string(),
    inReplyToEmailId: v.optional(v.id('emails')),
  },
  handler: async (ctx: ActionCtx, args) => {
    // Ownership check first
    const account = await ctx.runQuery(api.emailAccounts.listMine, {});
    const owned = account.find((a) => a._id === args.accountId);
    if (!owned) {
      throw new ConvexError({ code: 'FORBIDDEN', message: 'Account not yours' });
    }

    if (owned.authType === 'oauth') {
      await ctx.runAction(internal.gmail.sendGmailApi, {
        accountId: args.accountId,
        to: args.to,
        cc: args.cc ?? '',
        subject: args.subject,
        bodyHtml: args.bodyHtml,
        inReplyToEmailId: args.inReplyToEmailId,
      });
    } else {
      await ctx.runAction(internal.imap.sendSmtp, {
        accountId: args.accountId,
        to: args.to,
        cc: args.cc ?? '',
        subject: args.subject,
        bodyHtml: args.bodyHtml,
        inReplyToEmailId: args.inReplyToEmailId,
      });
    }
    return { success: true };
  },
});

/* --------------------------------------------------------------------------
 * Internal mutations — used by sync actions
 * ------------------------------------------------------------------------ */

/**
 * Upsert an email row (metadata only — body lives in storage). Recomputes
 * `searchText`. Sync actions call this for each message; bodies are fetched
 * on demand via `setBody` (action).
 */
export const upsertEmail = internalMutation({
  args: {
    userId: v.id('users'),
    accountId: v.id('emailAccounts'),
    providerId: v.string(),
    threadId: v.string(),
    subject: v.string(),
    sender: v.string(),
    senderEmail: v.string(),
    recipients: v.array(v.string()),
    cc: v.array(v.string()),
    date: v.number(),
    snippet: v.string(),
    isRead: v.boolean(),
    isStarred: v.boolean(),
    labels: v.array(v.string()),
    hasAttachments: v.boolean(),
  },
  handler: async (ctx, args): Promise<Id<'emails'>> => {
    const existing = await ctx.db
      .query('emails')
      .withIndex('by_account_providerId', (q) =>
        q.eq('accountId', args.accountId).eq('providerId', args.providerId),
      )
      .unique();

    const searchText = [args.subject, args.sender, args.senderEmail, args.snippet]
      .join(' ')
      .toLowerCase();

    if (existing) {
      await ctx.db.patch(existing._id, {
        userId: args.userId,
        accountId: args.accountId,
        providerId: args.providerId,
        threadId: args.threadId,
        subject: args.subject,
        sender: args.sender,
        senderEmail: args.senderEmail,
        recipients: args.recipients,
        cc: args.cc,
        date: args.date,
        snippet: args.snippet,
        isRead: args.isRead,
        isStarred: args.isStarred,
        labels: args.labels,
        hasAttachments: args.hasAttachments,
        searchText,
      });
      return existing._id;
    }
    return await ctx.db.insert('emails', {
      userId: args.userId,
      accountId: args.accountId,
      providerId: args.providerId,
      threadId: args.threadId,
      subject: args.subject,
      sender: args.sender,
      senderEmail: args.senderEmail,
      recipients: args.recipients,
      cc: args.cc,
      date: args.date,
      snippet: args.snippet,
      isRead: args.isRead,
      isStarred: args.isStarred,
      labels: args.labels,
      hasAttachments: args.hasAttachments,
      searchText,
    });
  },
});

/**
 * Internal mutation called by setBody action: replace the bodyStorageId
 * after the new blob has already been written. Deletes any previous storage
 * blob.
 */
export const setBodyStorage = internalMutation({
  args: {
    emailId: v.id('emails'),
    bodyStorageId: v.id('_storage'),
    bodyText: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const email = await ctx.db.get(args.emailId);
    if (!email) return;
    if (email.bodyStorageId && email.bodyStorageId !== args.bodyStorageId) {
      try {
        await ctx.storage.delete(email.bodyStorageId);
      } catch {
        // ignore
      }
    }
    await ctx.db.patch(args.emailId, {
      bodyStorageId: args.bodyStorageId,
      bodyText: args.bodyText,
    });
  },
});

/**
 * Action: sanitize + store + link a new HTML body for an email. Called from
 * gmail.fetchBody and imap.fetchBodyImap.
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

/** Delete an email (used by trash flow that removes from cache entirely). */
export const deleteEmail = internalMutation({
  args: { emailId: v.id('emails') },
  handler: async (ctx, args) => {
    const email = await ctx.db.get(args.emailId);
    if (!email) return;
    if (email.bodyStorageId) {
      try {
        await ctx.storage.delete(email.bodyStorageId);
      } catch {
        // ignore
      }
    }
    const atts = await ctx.db
      .query('attachments')
      .withIndex('by_email', (q) => q.eq('emailId', email._id))
      .collect();
    for (const a of atts) {
      try {
        await ctx.storage.delete(a.storageId);
      } catch {
        // ignore
      }
      await ctx.db.delete(a._id);
    }
    await ctx.db.delete(email._id);
  },
});

/** Internal: get an email row by id (for sync actions). */
export const getInternal = internalQuery({
  args: { emailId: v.id('emails') },
  handler: async (ctx, args) => {
    const e = await ctx.db.get(args.emailId);
    return e;
  },
});

/** Internal: get full account doc (for sync actions). */
export const getAccountInternal = internalQuery({
  args: { accountId: v.id('emailAccounts') },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.accountId);
  },
});
