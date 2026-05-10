'use node';

import { ConvexError, v } from 'convex/values';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import nodemailer from 'nodemailer';
import { internalAction } from './_generated/server';
import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { decrypt } from './lib/crypto';
import { normalizeSubject } from './lib/threading';

/* ============================================================================
 * IMAP fallback for non-Gmail accounts (or Gmail with app password).
 *
 * Uses ImapFlow + Nodemailer + mailparser. Ported from the my-unified-mail POC
 * (see ../../../personal/my-unified-mail/src/lib/email.ts).
 * ========================================================================= */

type IMAPFolder = 'inbox' | 'sent' | 'trash' | 'archive';

const FOLDER_SPECIAL_USE: Record<IMAPFolder, string> = {
  inbox: '\\Inbox',
  sent: '\\Sent',
  trash: '\\Trash',
  archive: '\\All',
};

const FOLDER_LABEL: Record<IMAPFolder, string> = {
  inbox: 'INBOX',
  sent: 'SENT',
  trash: 'TRASH',
  archive: 'ARCHIVE',
};

async function resolveMailboxPath(client: ImapFlow, folder: IMAPFolder): Promise<string> {
  if (folder === 'inbox') return 'INBOX';
  try {
    const mailboxes = await client.list();
    const attr = FOLDER_SPECIAL_USE[folder];
    const match = mailboxes.find((mb) => mb.specialUse === attr);
    if (match) return match.path;
  } catch (err) {
    console.error('[imap.resolveMailboxPath] list() failed:', err);
  }
  // Fallback to Gmail English paths
  const fallback: Record<IMAPFolder, string> = {
    inbox: 'INBOX',
    sent: '[Gmail]/Sent Mail',
    trash: '[Gmail]/Trash',
    archive: '[Gmail]/All Mail',
  };
  return fallback[folder];
}

async function safeImapDisconnect(client: ImapFlow) {
  try {
    await client.logout();
  } catch {
    try {
      client.close();
    } catch {
      // already gone
    }
  }
}

async function decryptCreds(account: Doc<'emailAccounts'>): Promise<{
  user: string;
  pass: string;
  imapHost: string;
  smtpHost: string;
}> {
  if (!account.imapCreds) {
    throw new ConvexError({ code: 'NO_IMAP', message: 'Account has no IMAP creds' });
  }
  const pass = await decrypt(account.imapCreds.appPassword);
  return {
    user: account.email,
    pass,
    imapHost: account.imapCreds.imapHost,
    smtpHost: account.imapCreds.smtpHost,
  };
}

async function fetchFolder(
  account: Doc<'emailAccounts'>,
  folder: IMAPFolder,
  limit = 50,
): Promise<Array<{
  uid: number;
  subject: string;
  fromDisplay: string;
  fromEmail: string;
  to: string[];
  cc: string[];
  date: number;
  isRead: boolean;
  folder: IMAPFolder;
}>> {
  const { user, pass, imapHost } = await decryptCreds(account);
  const client = new ImapFlow({
    host: imapHost,
    port: 993,
    secure: true,
    auth: { user, pass },
    logger: false,
    socketTimeout: 30_000,
  });

  const out: Array<{
    uid: number;
    subject: string;
    fromDisplay: string;
    fromEmail: string;
    to: string[];
    cc: string[];
    date: number;
    isRead: boolean;
    folder: IMAPFolder;
  }> = [];

  try {
    await client.connect();
    const mailbox = await resolveMailboxPath(client, folder);
    const lock = await client.getMailboxLock(mailbox);
    try {
      for await (const message of client.fetch(
        '1:*',
        { envelope: true, internalDate: true, flags: true },
        { uid: true },
      )) {
        const subject = message.envelope?.subject || '(Pas de sujet)';
        const fromAddr = message.envelope?.from?.[0];
        const fromEmail = fromAddr?.address ?? '';
        const fromName = fromAddr?.name ?? '';
        const to = (message.envelope?.to ?? [])
          .map((a) => a.address || '')
          .filter(Boolean);
        const cc = (message.envelope?.cc ?? [])
          .map((a) => a.address || '')
          .filter(Boolean);
        out.push({
          uid: message.uid,
          subject,
          fromDisplay: fromName || fromEmail || 'Inconnu',
          fromEmail,
          to,
          cc,
          date: new Date(message.internalDate ?? Date.now()).getTime(),
          isRead: message.flags?.has('\\Seen') ?? false,
          folder,
        });
      }
    } finally {
      lock.release();
    }
  } catch (err) {
    console.error(`[imap.fetchFolder] ${account.email}/${folder} failed:`, err);
    return [];
  } finally {
    await safeImapDisconnect(client);
  }

  // Newest first, then cap
  out.sort((a, b) => b.date - a.date);
  return out.slice(0, limit);
}

/* --------------------------------------------------------------------------
 * Sync
 * ------------------------------------------------------------------------ */

const SYNC_FOLDERS: IMAPFolder[] = ['inbox', 'sent', 'trash'];

export const syncAccountImap = internalAction({
  args: { accountId: v.id('emailAccounts') },
  handler: async (ctx, args) => {
    const account = (await ctx.runQuery(internal.emails.getAccountInternal, {
      accountId: args.accountId,
    })) as Doc<'emailAccounts'> | null;
    if (!account || account.authType !== 'imap') return;

    try {
      const results = await Promise.all(
        SYNC_FOLDERS.map((f) => fetchFolder(account, f, 50)),
      );
      const all = results.flat();
      for (const m of all) {
        const providerId = `${m.uid}@${m.folder}`;
        const threadId = normalizeSubject(m.subject) || providerId;
        const labels = [FOLDER_LABEL[m.folder]];
        await ctx.runMutation(internal.emails.upsertEmail, {
          userId: account.userId,
          accountId: account._id,
          providerId,
          threadId,
          subject: m.subject,
          sender: m.fromDisplay,
          senderEmail: m.fromEmail,
          recipients: m.to,
          cc: m.cc,
          date: m.date,
          snippet: '',
          isRead: m.isRead,
          isStarred: false,
          labels,
          hasAttachments: false,
        });
      }
      await ctx.runMutation(internal.emailAccounts.markStatus, {
        accountId: args.accountId,
        status: 'active',
      });
    } catch (err) {
      console.error('[imap.syncAccountImap] failed:', err);
      await ctx.runMutation(internal.emailAccounts.markStatus, {
        accountId: args.accountId,
        status: 'error',
      });
    }
  },
});

/* --------------------------------------------------------------------------
 * Fetch body
 * ------------------------------------------------------------------------ */

export const fetchBodyImap = internalAction({
  args: { emailId: v.id('emails') },
  handler: async (ctx, args) => {
    const email = (await ctx.runQuery(internal.emails.getInternal, {
      emailId: args.emailId,
    })) as Doc<'emails'> | null;
    if (!email) return;
    const account = (await ctx.runQuery(internal.emails.getAccountInternal, {
      accountId: email.accountId,
    })) as Doc<'emailAccounts'> | null;
    if (!account || account.authType !== 'imap') return;

    const [uidStr, folderStr] = email.providerId.split('@');
    const uid = Number(uidStr);
    const folder = (folderStr as IMAPFolder) ?? 'inbox';

    const { user, pass, imapHost } = await decryptCreds(account);
    const client = new ImapFlow({
      host: imapHost,
      port: 993,
      secure: true,
      auth: { user, pass },
      logger: false,
      socketTimeout: 30_000,
    });
    try {
      await client.connect();
      const mailbox = await resolveMailboxPath(client, folder);
      const lock = await client.getMailboxLock(mailbox);
      try {
        const source = await client.download(uid, undefined, { uid: true });
        const parsed = await simpleParser(source.content);
        const html = parsed.html || parsed.textAsHtml || '';
        await ctx.runAction(internal.sanitize.setBody, {
          emailId: email._id,
          bodyHtml: html,
          bodyText: parsed.text || undefined,
        });
      } finally {
        lock.release();
      }
    } catch (err) {
      console.error('[imap.fetchBodyImap] failed:', err);
    } finally {
      await safeImapDisconnect(client);
    }
  },
});

/* --------------------------------------------------------------------------
 * Send via SMTP
 * ------------------------------------------------------------------------ */

export const sendSmtp = internalAction({
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
    if (!account || account.authType !== 'imap') {
      throw new ConvexError({ code: 'BAD_ACCOUNT', message: 'IMAP account not found' });
    }
    const { user, pass, smtpHost } = await decryptCreds(account);
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: 587,
      secure: false, // STARTTLS
      auth: { user, pass },
    });

    let inReplyToProviderId: string | undefined;
    if (args.inReplyToEmailId) {
      const orig = (await ctx.runQuery(internal.emails.getInternal, {
        emailId: args.inReplyToEmailId,
      })) as Doc<'emails'> | null;
      if (orig) inReplyToProviderId = orig.providerId;
    }

    await transporter.sendMail({
      from: account.email,
      to: args.to,
      cc: args.cc || undefined,
      subject: args.subject,
      html: args.bodyHtml,
      inReplyTo: inReplyToProviderId,
      references: inReplyToProviderId ? [inReplyToProviderId] : undefined,
    });
  },
});
