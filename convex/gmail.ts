'use node';

import { google, type gmail_v1 } from 'googleapis';
import { ConvexError, v } from 'convex/values';
import {
  action,
  internalAction,
  type ActionCtx,
} from './_generated/server';
import { api, internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { decrypt, encrypt } from './lib/crypto';

/* ============================================================================
 * Gmail API actions — OAuth flow + sync + send + flag mutations.
 *
 * Run in the Node runtime ('use node') so we can use googleapis.
 * Never callable directly from the client (all internal except where stated).
 * ========================================================================= */

const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.send',
  'openid',
  'email',
  'profile',
].join(' ');

function getOAuthClientShell() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new ConvexError({
      code: 'CONFIG_MISSING',
      message:
        'GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_OAUTH_REDIRECT_URI must be set in Convex env.',
    });
  }
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

/** Build an OAuth2 client primed with the account's tokens (decrypted). */
async function getAuthedClient(account: Doc<'emailAccounts'>) {
  if (!account.oauthTokens) {
    throw new ConvexError({
      code: 'NO_OAUTH',
      message: 'Account has no OAuth tokens',
    });
  }
  const refreshToken = await decrypt(account.oauthTokens.refreshToken);
  const accessToken = await decrypt(account.oauthTokens.accessToken);
  const client = getOAuthClientShell();
  client.setCredentials({
    refresh_token: refreshToken,
    access_token: accessToken,
    expiry_date: account.oauthTokens.expiresAt,
    scope: account.oauthTokens.scope,
  });
  return client;
}

function headerValue(headers: gmail_v1.Schema$MessagePartHeader[] | undefined, name: string): string {
  if (!headers) return '';
  const lower = name.toLowerCase();
  const h = headers.find((x) => (x.name || '').toLowerCase() === lower);
  return h?.value ?? '';
}

function parseAddressList(raw: string): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseSender(raw: string): { display: string; email: string } {
  if (!raw) return { display: '', email: '' };
  // Format: "Name <addr@x>" or "addr@x"
  const m = raw.match(/^(.*?)<([^>]+)>\s*$/);
  if (m && m[1] !== undefined && m[2] !== undefined) {
    const display = m[1].trim().replace(/^"|"$/g, '') || m[2];
    return { display, email: m[2] };
  }
  return { display: raw, email: raw };
}

/** Recursively walk a Gmail message payload and extract text/html + text/plain. */
function extractBodies(payload: gmail_v1.Schema$MessagePart | undefined): {
  html: string;
  text: string;
} {
  let html = '';
  let text = '';
  function walk(p: gmail_v1.Schema$MessagePart | undefined) {
    if (!p) return;
    const data = p.body?.data;
    if (data) {
      const decoded = Buffer.from(data, 'base64url').toString('utf-8');
      if (p.mimeType === 'text/html') {
        html += decoded;
      } else if (p.mimeType === 'text/plain') {
        text += decoded;
      }
    }
    if (p.parts) for (const sub of p.parts) walk(sub);
  }
  walk(payload);
  return { html, text };
}

/* --------------------------------------------------------------------------
 * OAuth flow
 * ------------------------------------------------------------------------ */

/**
 * Build the Google consent URL with an encrypted state token embedding the
 * current userId. Frontend calls this via a public action wrapper, then
 * redirects the user to the returned URL.
 */
export const buildAuthUrlForCurrentUser = action({
  args: { label: v.optional(v.string()) },
  handler: async (ctx: ActionCtx, args): Promise<{ url: string }> => {
    // Resolve the current app user via the existing me query.
    const me = (await ctx.runQuery(api.users.me, {})) as
      | { kind: 'ready'; _id: string }
      | { kind: 'unprovisioned'; email: string; name: string | null }
      | null;
    if (!me || me.kind !== 'ready') {
      throw new ConvexError({ code: 'UNAUTHENTICATED', message: 'Not signed in' });
    }
    const client = getOAuthClientShell();
    const state = await encrypt(
      JSON.stringify({ userId: me._id as Id<'users'>, label: args.label ?? null }),
    );
    const url = client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: GMAIL_SCOPES.split(' '),
      state,
    });
    return { url };
  },
});

/**
 * Exchange the OAuth code for tokens, decode state, encrypt + upsert account.
 * Called from the HTTP callback in `convex/http.ts`.
 */
export const completeOAuth = internalAction({
  args: {
    code: v.string(),
    stateEncrypted: v.string(),
  },
  handler: async (ctx, args): Promise<{ accountId: Id<'emailAccounts'>; email: string }> => {
    // Decrypt state to recover userId
    const stateJson = await decrypt(args.stateEncrypted);
    const state = JSON.parse(stateJson) as { userId: Id<'users'>; label: string | null };

    const client = getOAuthClientShell();
    const { tokens } = await client.getToken(args.code);
    if (!tokens.access_token || !tokens.refresh_token) {
      throw new ConvexError({
        code: 'OAUTH_FAILED',
        message:
          'No refresh_token returned. Ensure the user reconsents (prompt=consent) and access_type=offline.',
      });
    }
    client.setCredentials(tokens);

    // Fetch the user's primary email from the userinfo endpoint
    const oauth2 = google.oauth2({ version: 'v2', auth: client });
    const userInfo = await oauth2.userinfo.get();
    const email = (userInfo.data.email ?? '').toLowerCase();
    if (!email) {
      throw new ConvexError({ code: 'OAUTH_FAILED', message: 'No email in user info' });
    }
    const label =
      state.label ||
      (email.includes('+') ? email.split('+')[0] : email.split('@')[0]) ||
      email;

    const encryptedAccess = await encrypt(tokens.access_token);
    const encryptedRefresh = await encrypt(tokens.refresh_token);
    const expiresAt =
      typeof tokens.expiry_date === 'number' ? tokens.expiry_date : Date.now() + 3500_000;
    const scope = tokens.scope ?? GMAIL_SCOPES;

    const accountId: Id<'emailAccounts'> = await ctx.runMutation(
      internal.emailAccounts.upsertOAuthAccount,
      {
        userId: state.userId,
        email,
        label,
        accessToken: encryptedAccess,
        refreshToken: encryptedRefresh,
        expiresAt,
        scope,
      },
    );

    // Kick off an initial sync (non-blocking)
    await ctx.scheduler.runAfter(0, internal.gmail.syncAccount, { accountId });

    return { accountId, email };
  },
});

/** Helper used by HTTP route to produce a fresh state-encrypted string. */
export const encodeStateForUser = internalAction({
  args: { userId: v.id('users'), label: v.optional(v.string()) },
  handler: async (_ctx, args) => {
    const json = JSON.stringify({ userId: args.userId, label: args.label ?? null });
    const enc = await encrypt(json);
    return { state: enc };
  },
});

/** Build the consent URL (called from HTTP/agent flows). */
export const buildAuthUrl = internalAction({
  args: { userId: v.id('users'), label: v.optional(v.string()) },
  handler: async (_ctx, args) => {
    const client = getOAuthClientShell();
    const state = await encrypt(
      JSON.stringify({ userId: args.userId, label: args.label ?? null }),
    );
    const url = client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: GMAIL_SCOPES.split(' '),
      state,
    });
    return { url };
  },
});

/* --------------------------------------------------------------------------
 * Sync
 * ------------------------------------------------------------------------ */

/**
 * Sync a single OAuth Gmail account. First call: fetch the most recent 50
 * INBOX messages (metadata only). Subsequent calls: use history.list with the
 * cached historyId.
 */
export const syncAccount = internalAction({
  args: { accountId: v.id('emailAccounts') },
  handler: async (ctx, args) => {
    const account = (await ctx.runQuery(internal.emails.getAccountInternal, {
      accountId: args.accountId,
    })) as Doc<'emailAccounts'> | null;
    if (!account || account.authType !== 'oauth') return;

    let client;
    try {
      client = await getAuthedClient(account);
    } catch (err) {
      console.error('[gmail.syncAccount] auth failed:', err);
      await ctx.runMutation(internal.emailAccounts.markStatus, {
        accountId: args.accountId,
        status: 'error',
      });
      return;
    }
    const gmail = google.gmail({ version: 'v1', auth: client });

    try {
      const messageIds = new Set<string>();
      let latestHistoryId: string | undefined;

      if (account.historyId) {
        // Incremental
        try {
          const res = await gmail.users.history.list({
            userId: 'me',
            startHistoryId: account.historyId,
            historyTypes: ['messageAdded', 'messageDeleted', 'labelAdded', 'labelRemoved'],
            maxResults: 500,
          });
          latestHistoryId = res.data.historyId ?? account.historyId;
          for (const h of res.data.history ?? []) {
            for (const m of h.messages ?? []) {
              if (m.id) messageIds.add(m.id);
            }
            for (const m of h.messagesAdded ?? []) {
              if (m.message?.id) messageIds.add(m.message.id);
            }
            for (const m of h.labelsAdded ?? []) {
              if (m.message?.id) messageIds.add(m.message.id);
            }
            for (const m of h.labelsRemoved ?? []) {
              if (m.message?.id) messageIds.add(m.message.id);
            }
          }
        } catch (err) {
          // historyId may be too old (404). Fall back to a fresh list.
          console.warn('[gmail.syncAccount] history.list failed, falling back:', err);
        }
      }

      if (messageIds.size === 0) {
        const res = await gmail.users.messages.list({
          userId: 'me',
          maxResults: 50,
          labelIds: ['INBOX'],
        });
        for (const m of res.data.messages ?? []) {
          if (m.id) messageIds.add(m.id);
        }
        // Capture the current historyId from a profile call
        const profile = await gmail.users.getProfile({ userId: 'me' });
        latestHistoryId = profile.data.historyId ?? latestHistoryId;
      }

      // Hydrate metadata for each message in sequence (Gmail rate-limited).
      for (const id of messageIds) {
        try {
          const msg = await gmail.users.messages.get({
            userId: 'me',
            id,
            format: 'metadata',
            metadataHeaders: ['From', 'To', 'Cc', 'Subject', 'Date'],
          });
          const headers = msg.data.payload?.headers;
          const subject = headerValue(headers, 'Subject') || '(Pas de sujet)';
          const fromRaw = headerValue(headers, 'From');
          const { display, email: senderEmail } = parseSender(fromRaw);
          const recipients = parseAddressList(headerValue(headers, 'To'));
          const cc = parseAddressList(headerValue(headers, 'Cc'));
          const dateMs = msg.data.internalDate
            ? Number(msg.data.internalDate)
            : Date.now();
          const labels = (msg.data.labelIds ?? []).slice();
          const isRead = !labels.includes('UNREAD');
          const isStarred = labels.includes('STARRED');
          const snippet = msg.data.snippet ?? '';
          const hasAttachments = !!msg.data.payload?.parts?.some(
            (p) => (p.filename ?? '') !== '',
          );

          await ctx.runMutation(internal.emails.upsertEmail, {
            userId: account.userId,
            accountId: account._id,
            providerId: id,
            threadId: msg.data.threadId ?? id,
            subject,
            sender: display,
            senderEmail,
            recipients,
            cc,
            date: dateMs,
            snippet,
            isRead,
            isStarred,
            labels,
            hasAttachments,
          });
        } catch (err) {
          console.error(`[gmail.syncAccount] message ${id} failed:`, err);
        }
      }

      if (latestHistoryId) {
        await ctx.runMutation(internal.emailAccounts.updateHistoryId, {
          accountId: args.accountId,
          historyId: latestHistoryId,
        });
      } else {
        await ctx.runMutation(internal.emailAccounts.markStatus, {
          accountId: args.accountId,
          status: 'active',
        });
      }
    } catch (err) {
      console.error('[gmail.syncAccount] failed:', err);
      await ctx.runMutation(internal.emailAccounts.markStatus, {
        accountId: args.accountId,
        status: 'error',
      });
    }
  },
});

/* --------------------------------------------------------------------------
 * Fetch full body on demand
 * ------------------------------------------------------------------------ */

export const fetchBody = internalAction({
  args: { emailId: v.id('emails') },
  handler: async (ctx, args) => {
    const email = (await ctx.runQuery(internal.emails.getInternal, {
      emailId: args.emailId,
    })) as Doc<'emails'> | null;
    if (!email) return;
    const account = (await ctx.runQuery(internal.emails.getAccountInternal, {
      accountId: email.accountId,
    })) as Doc<'emailAccounts'> | null;
    if (!account || account.authType !== 'oauth') return;

    const client = await getAuthedClient(account);
    const gmail = google.gmail({ version: 'v1', auth: client });
    try {
      const msg = await gmail.users.messages.get({
        userId: 'me',
        id: email.providerId,
        format: 'full',
      });
      const { html, text } = extractBodies(msg.data.payload);
      const final = html || `<pre>${text}</pre>`;
      await ctx.runAction(internal.emails.setBody, {
        emailId: email._id,
        bodyHtml: final,
        bodyText: text || undefined,
      });
    } catch (err) {
      console.error('[gmail.fetchBody] failed:', err);
    }
  },
});

/* --------------------------------------------------------------------------
 * Send
 * ------------------------------------------------------------------------ */

export const sendGmailApi = internalAction({
  args: {
    accountId: v.id('emailAccounts'),
    to: v.string(),
    cc: v.string(),
    subject: v.string(),
    bodyHtml: v.string(),
    inReplyToEmailId: v.optional(v.id('emails')),
  },
  handler: async (ctx, args) => {
    const account = (await ctx.runQuery(internal.emails.getAccountInternal, {
      accountId: args.accountId,
    })) as Doc<'emailAccounts'> | null;
    if (!account || account.authType !== 'oauth') {
      throw new ConvexError({ code: 'BAD_ACCOUNT', message: 'OAuth account not found' });
    }

    let inReplyTo: { providerId: string; subject: string; threadId: string } | null = null;
    if (args.inReplyToEmailId) {
      const orig = (await ctx.runQuery(internal.emails.getInternal, {
        emailId: args.inReplyToEmailId,
      })) as Doc<'emails'> | null;
      if (orig) {
        inReplyTo = {
          providerId: orig.providerId,
          subject: orig.subject,
          threadId: orig.threadId,
        };
      }
    }

    const client = await getAuthedClient(account);
    const gmail = google.gmail({ version: 'v1', auth: client });

    const subject = args.subject || (inReplyTo ? `Re: ${inReplyTo.subject}` : '');
    const headers: string[] = [
      `From: ${account.email}`,
      `To: ${args.to}`,
      args.cc ? `Cc: ${args.cc}` : '',
      `Subject: ${subject}`,
      'MIME-Version: 1.0',
      'Content-Type: text/html; charset=utf-8',
    ].filter(Boolean);
    if (inReplyTo) {
      headers.push(`In-Reply-To: <${inReplyTo.providerId}@mail.gmail.com>`);
      headers.push(`References: <${inReplyTo.providerId}@mail.gmail.com>`);
    }
    const raw = `${headers.join('\r\n')}\r\n\r\n${args.bodyHtml}`;
    const encoded = Buffer.from(raw, 'utf-8').toString('base64url');

    await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encoded,
        threadId: inReplyTo?.threadId,
      },
    });
  },
});

/* --------------------------------------------------------------------------
 * Apply / remove labels
 * ------------------------------------------------------------------------ */

export const applyFlag = internalAction({
  args: {
    emailId: v.id('emails'),
    addLabels: v.optional(v.array(v.string())),
    removeLabels: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const email = (await ctx.runQuery(internal.emails.getInternal, {
      emailId: args.emailId,
    })) as Doc<'emails'> | null;
    if (!email) return;
    const account = (await ctx.runQuery(internal.emails.getAccountInternal, {
      accountId: email.accountId,
    })) as Doc<'emailAccounts'> | null;
    if (!account || account.authType !== 'oauth') return;

    try {
      const client = await getAuthedClient(account);
      const gmail = google.gmail({ version: 'v1', auth: client });
      await gmail.users.messages.modify({
        userId: 'me',
        id: email.providerId,
        requestBody: {
          addLabelIds: args.addLabels ?? [],
          removeLabelIds: args.removeLabels ?? [],
        },
      });
    } catch (err) {
      console.error('[gmail.applyFlag] failed:', err);
    }
  },
});

/* --------------------------------------------------------------------------
 * Scheduled sync — invoked by the cron in `convex/crons.ts`.
 * ------------------------------------------------------------------------ */

export const runScheduledSync = internalAction({
  args: {},
  handler: async (ctx) => {
    const accounts = (await ctx.runMutation(internal.emailAccounts.listActiveAll, {})) as Array<{
      _id: Id<'emailAccounts'>;
      userId: Id<'users'>;
      authType: 'oauth' | 'imap';
    }>;
    for (const a of accounts) {
      if (a.authType === 'oauth') {
        await ctx.scheduler.runAfter(0, internal.gmail.syncAccount, {
          accountId: a._id,
        });
      } else {
        await ctx.scheduler.runAfter(0, internal.imap.syncAccountImap, {
          accountId: a._id,
        });
      }
    }
  },
});
