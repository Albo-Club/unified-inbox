import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

/**
 * App-level schema. Better Auth user/session/account/jwks tables live in the
 * `betterAuth` component (see `convex/convex.config.ts`), not here.
 *
 * Our `users` table is the *application* user — we mirror it from Better Auth
 * via a trigger (see `convex/auth.ts`) and add app-level fields like `role`.
 */
export default defineSchema({
  /** Application user. One row per Better Auth user, created via trigger on signup. */
  users: defineTable({
    authUserId: v.string(),
    email: v.string(),
    name: v.optional(v.string()),
    role: v.union(v.literal('admin'), v.literal('user')),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_auth_user_id', ['authUserId'])
    .index('by_email', ['email']),

  /* ==========================================================================
   * Unified Email — feature
   * ======================================================================== */

  /** Per-user connected email account (Gmail OAuth or generic IMAP). */
  emailAccounts: defineTable({
    userId: v.id('users'),
    email: v.string(),
    label: v.string(), // "Perso", "Pro", or custom
    authType: v.union(v.literal('oauth'), v.literal('imap')),
    /** OAuth tokens (AES-GCM encrypted). Set only when authType === 'oauth'. */
    oauthTokens: v.optional(
      v.object({
        accessToken: v.string(),
        refreshToken: v.string(),
        expiresAt: v.number(),
        scope: v.string(),
      }),
    ),
    /** IMAP credentials (AES-GCM encrypted appPassword). Set only when authType === 'imap'. */
    imapCreds: v.optional(
      v.object({
        appPassword: v.string(),
        imapHost: v.string(),
        smtpHost: v.string(),
      }),
    ),
    /** Gmail historyId cursor for incremental sync. */
    historyId: v.optional(v.string()),
    lastSyncAt: v.optional(v.number()),
    status: v.union(v.literal('active'), v.literal('error'), v.literal('paused')),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_user', ['userId'])
    .index('by_user_email', ['userId', 'email']),

  /** Flat email cache, indexed by user + thread + date. */
  emails: defineTable({
    userId: v.id('users'),
    accountId: v.id('emailAccounts'),
    providerId: v.string(), // Gmail message ID OR `UID@mailbox` for IMAP
    threadId: v.string(), // Gmail threadId OR normalizeSubject fallback
    subject: v.string(),
    sender: v.string(),
    senderEmail: v.string(),
    recipients: v.array(v.string()),
    cc: v.array(v.string()),
    date: v.number(),
    snippet: v.string(),
    bodyStorageId: v.optional(v.id('_storage')),
    bodyText: v.optional(v.string()),
    isRead: v.boolean(),
    isStarred: v.boolean(),
    labels: v.array(v.string()),
    hasAttachments: v.boolean(),
    /** Lowercase concat of subject + sender + snippet for fuzzy search. */
    searchText: v.string(),
  })
    .index('by_user', ['userId'])
    .index('by_user_thread', ['userId', 'threadId'])
    .index('by_account_providerId', ['accountId', 'providerId'])
    .index('by_user_date', ['userId', 'date'])
    .searchIndex('search_text', {
      searchField: 'searchText',
      filterFields: ['userId'],
    }),

  /** Attachments are stored in Convex file storage; this row indexes them. */
  attachments: defineTable({
    emailId: v.id('emails'),
    filename: v.string(),
    mimeType: v.string(),
    size: v.number(),
    storageId: v.id('_storage'),
  }).index('by_email', ['emailId']),

  /** In-progress drafts auto-saved from the composer. */
  drafts: defineTable({
    userId: v.id('users'),
    accountId: v.id('emailAccounts'),
    mode: v.union(
      v.literal('new'),
      v.literal('reply'),
      v.literal('replyAll'),
      v.literal('forward'),
    ),
    inReplyToEmailId: v.optional(v.id('emails')),
    to: v.string(),
    cc: v.string(),
    subject: v.string(),
    bodyHtml: v.string(),
    updatedAt: v.number(),
  }).index('by_user', ['userId']),
});
