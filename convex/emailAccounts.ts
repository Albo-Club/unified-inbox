import { ConvexError, v } from 'convex/values';
import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from './_generated/server';
import type { Id } from './_generated/dataModel';
import { requireAppUser } from './users';
import { encrypt } from './lib/crypto';

/* ============================================================================
 * Account management — connected Gmail / IMAP inboxes per user.
 *
 * IMPORTANT: never expose encrypted credentials in client-facing payloads.
 * The `listMine` query strips `oauthTokens` and `imapCreds`. Decryption only
 * happens inside `'use node'` actions (convex/gmail.ts, convex/imap.ts).
 * ========================================================================= */

async function loadOwnedAccount(
  ctx: QueryCtx | MutationCtx,
  accountId: Id<'emailAccounts'>,
) {
  const user = await requireAppUser(ctx);
  const account = await ctx.db.get(accountId);
  if (!account) {
    throw new ConvexError({ code: 'NOT_FOUND', message: 'Account not found' });
  }
  if (account.userId !== user._id) {
    throw new ConvexError({ code: 'FORBIDDEN', message: 'Not your account' });
  }
  return { user, account };
}

/** List the current user's connected accounts (without credentials). */
export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireAppUser(ctx);
    const rows = await ctx.db
      .query('emailAccounts')
      .withIndex('by_user', (q) => q.eq('userId', user._id))
      .order('desc')
      .collect();
    return rows.map((r) => ({
      _id: r._id,
      email: r.email,
      label: r.label,
      authType: r.authType,
      status: r.status,
      lastSyncAt: r.lastSyncAt ?? null,
    }));
  },
});

/**
 * Add a generic IMAP account with an app password. The password is encrypted
 * before being written to the database. For Gmail OAuth, use the OAuth flow
 * via `internal.gmail.startOAuthFlow` + `internal.gmail.completeOAuth`.
 */
export const addImapAccount = mutation({
  args: {
    email: v.string(),
    label: v.string(),
    appPassword: v.string(),
    imapHost: v.optional(v.string()),
    smtpHost: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireAppUser(ctx);
    const email = args.email.trim().toLowerCase();
    if (!email || !args.appPassword) {
      throw new ConvexError({
        code: 'BAD_REQUEST',
        message: 'email and appPassword are required',
      });
    }

    // Prevent duplicates for the same user/email
    const existing = await ctx.db
      .query('emailAccounts')
      .withIndex('by_user_email', (q) => q.eq('userId', user._id).eq('email', email))
      .unique();
    if (existing) {
      throw new ConvexError({
        code: 'CONFLICT',
        message: 'You already have an account with this email',
      });
    }

    const encrypted = await encrypt(args.appPassword);
    const now = Date.now();
    const id = await ctx.db.insert('emailAccounts', {
      userId: user._id,
      email,
      label: args.label.trim() || email,
      authType: 'imap',
      imapCreds: {
        appPassword: encrypted,
        imapHost: args.imapHost?.trim() || 'imap.gmail.com',
        smtpHost: args.smtpHost?.trim() || 'smtp.gmail.com',
      },
      status: 'active',
      createdAt: now,
      updatedAt: now,
    });
    return { _id: id };
  },
});

/**
 * Remove an account AND cascade-delete its cached emails + drafts + attachments.
 * Convex mutations are limited in scan size — we iterate emails via the
 * `by_account_providerId` index in chunks. For very large mailboxes consider
 * splitting into a follow-up scheduled action.
 */
export const removeAccount = mutation({
  args: { accountId: v.id('emailAccounts') },
  handler: async (ctx, args) => {
    const { account } = await loadOwnedAccount(ctx, args.accountId);

    // Cascade delete cached emails (and their attachments) for this account
    let deletedEmails = 0;
    for await (const row of ctx.db
      .query('emails')
      .withIndex('by_account_providerId', (q) => q.eq('accountId', account._id))) {
      // Delete attachments for this email
      const atts = await ctx.db
        .query('attachments')
        .withIndex('by_email', (q) => q.eq('emailId', row._id))
        .collect();
      for (const a of atts) {
        try {
          await ctx.storage.delete(a.storageId);
        } catch {
          // already gone — fine
        }
        await ctx.db.delete(a._id);
      }
      if (row.bodyStorageId) {
        try {
          await ctx.storage.delete(row.bodyStorageId);
        } catch {
          // ignore
        }
      }
      await ctx.db.delete(row._id);
      deletedEmails++;
    }

    // Drafts attached to this account
    const drafts = await ctx.db
      .query('drafts')
      .withIndex('by_user', (q) => q.eq('userId', account.userId))
      .collect();
    for (const d of drafts) {
      if (d.accountId === account._id) await ctx.db.delete(d._id);
    }

    await ctx.db.delete(account._id);
    return { success: true, deletedEmails };
  },
});

/* --------------------------------------------------------------------------
 * Internal mutations — called from `'use node'` actions only.
 * ------------------------------------------------------------------------ */

/** Replace the OAuth tokens for an account. */
export const setOAuthTokens = internalMutation({
  args: {
    accountId: v.id('emailAccounts'),
    accessToken: v.string(), // already encrypted
    refreshToken: v.string(), // already encrypted
    expiresAt: v.number(),
    scope: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.accountId, {
      authType: 'oauth',
      oauthTokens: {
        accessToken: args.accessToken,
        refreshToken: args.refreshToken,
        expiresAt: args.expiresAt,
        scope: args.scope,
      },
      status: 'active',
      updatedAt: Date.now(),
    });
  },
});

/** Upsert (insert or update) an OAuth account by userId+email. */
export const upsertOAuthAccount = internalMutation({
  args: {
    userId: v.id('users'),
    email: v.string(),
    label: v.string(),
    accessToken: v.string(), // encrypted
    refreshToken: v.string(), // encrypted
    expiresAt: v.number(),
    scope: v.string(),
  },
  handler: async (ctx, args) => {
    const email = args.email.trim().toLowerCase();
    const existing = await ctx.db
      .query('emailAccounts')
      .withIndex('by_user_email', (q) => q.eq('userId', args.userId).eq('email', email))
      .unique();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        authType: 'oauth',
        oauthTokens: {
          accessToken: args.accessToken,
          refreshToken: args.refreshToken,
          expiresAt: args.expiresAt,
          scope: args.scope,
        },
        status: 'active',
        updatedAt: now,
      });
      return existing._id;
    }
    return await ctx.db.insert('emailAccounts', {
      userId: args.userId,
      email,
      label: args.label || email,
      authType: 'oauth',
      oauthTokens: {
        accessToken: args.accessToken,
        refreshToken: args.refreshToken,
        expiresAt: args.expiresAt,
        scope: args.scope,
      },
      status: 'active',
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateHistoryId = internalMutation({
  args: {
    accountId: v.id('emailAccounts'),
    historyId: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.accountId, {
      historyId: args.historyId,
      lastSyncAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

export const markStatus = internalMutation({
  args: {
    accountId: v.id('emailAccounts'),
    status: v.union(
      v.literal('active'),
      v.literal('error'),
      v.literal('paused'),
    ),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.accountId, {
      status: args.status,
      updatedAt: Date.now(),
    });
  },
});

/** Internal helper: list all active accounts (for crons). */
export const listActiveAll = internalMutation({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query('emailAccounts').collect();
    return rows
      .filter((r) => r.status === 'active')
      .map((r) => ({
        _id: r._id,
        userId: r.userId,
        authType: r.authType,
      }));
  },
});

/** Internal helper: get an account by email (for Pub/Sub webhook). */
export const getByEmail = internalMutation({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const email = args.email.trim().toLowerCase();
    const rows = await ctx.db.query('emailAccounts').collect();
    const match = rows.find((r) => r.email === email);
    return match
      ? { _id: match._id, userId: match.userId, authType: match.authType }
      : null;
  },
});
