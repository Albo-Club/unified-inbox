/**
 * Shared email types for the unified-mail feature (client-side).
 * Server-only logic (Convex / IMAP / Gmail API) lives in `convex/*`.
 */

export type EmailFolder = 'inbox' | 'sent' | 'trash' | 'archive' | 'starred' | 'all';

/**
 * Mirrors the shape of an `emails` row served by `api.emails.listByFolder`.
 * `accountId` replaces the POC's `accountLabel`/`seq` pair — the label is now
 * resolved through `emailAccounts` when needed.
 */
export type EmailHeader = {
  _id: string;
  accountId: string;
  threadId: string;
  subject: string;
  sender: string; // display name (or email if no name)
  senderEmail: string;
  recipients: string[];
  cc: string[];
  date: number; // ms epoch
  snippet: string;
  isRead: boolean;
  isStarred: boolean;
  labels: string[];
  hasAttachments: boolean;
};

export type ThreadGroup = {
  threadId: string;
  subject: string;
  latestDate: number;
  messageCount: number;
  messages: EmailHeader[];
  accountId: string;
};

export type ComposeMode = 'new' | 'reply' | 'replyAll' | 'forward';

export type ComposeState = {
  mode: ComposeMode;
  to: string;
  cc: string;
  subject: string;
  quotedBody: string;
  /** Convex emailAccount id to send from. May be empty for a brand new compose. */
  accountId: string;
  /** Original email id (for reply/forward) to thread on. Optional. */
  inReplyToEmailId?: string;
};

export const composeTitles: Record<ComposeMode, string> = {
  new: 'Nouveau message',
  reply: 'Répondre',
  replyAll: 'Répondre à tous',
  forward: 'Transférer',
};

const SUBJECT_PREFIX_RE = /^(Re:\s*|Fwd:\s*|Fw:\s*|TR:\s*|R[ée]p:\s*)+/i;

export function normalizeSubject(subject: string): string {
  return (subject ?? '').replace(SUBJECT_PREFIX_RE, '').trim();
}

const formatQuoteDate = (msEpoch: number) =>
  new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(msEpoch));

/**
 * Build a `ComposeState` for replying / forwarding an existing email.
 *
 * @param mode - which composition mode
 * @param email - the source email header
 * @param body - the original HTML body (already loaded)
 * @param myEmail - the address we're sending FROM (to exclude from `cc` on replyAll)
 */
export function buildComposeState(
  mode: ComposeMode,
  email: EmailHeader,
  body: string,
  myEmail: string,
): ComposeState {
  const normalized = normalizeSubject(email.subject);
  const subject = mode === 'forward' ? `Fwd: ${normalized}` : `Re: ${normalized}`;

  const quoteHeader = `Le ${formatQuoteDate(email.date)}, ${email.sender} a écrit :`;
  const quotedBody = `<br/><br/><div style="padding-left:12px;border-left:2px solid #ccc;margin-left:0;color:#555">${quoteHeader}<br/>${body}</div>`;

  let to = '';
  let cc = '';

  if (mode === 'reply') {
    to = email.senderEmail || email.sender;
  } else if (mode === 'replyAll') {
    to = email.senderEmail || email.sender;
    const all = [...email.recipients, ...email.cc]
      .map((s) => s.trim())
      .filter((addr) => addr && addr.toLowerCase() !== myEmail.toLowerCase());
    cc = Array.from(new Set(all)).join(', ');
  }

  return {
    mode,
    to,
    cc,
    subject,
    quotedBody,
    accountId: email.accountId,
    inReplyToEmailId: email._id,
  };
}

/**
 * Format a timestamp for the email list. Today → HH:MM. Yesterday → "Hier".
 * Within 7 days → "Il y a Nj". Otherwise → e.g. "12 mars".
 */
export function formatRelativeDate(ms: number): string {
  const now = new Date();
  const d = new Date(ms);
  const diff = now.getTime() - d.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0 && now.getDate() === d.getDate()) {
    return new Intl.DateTimeFormat('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(d);
  }
  if (days <= 1) return 'Hier';
  if (days < 7) return `Il y a ${days}j`;
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' }).format(d);
}

/**
 * Full readable date for the reading pane header.
 */
export function formatFullDate(ms: number): string {
  return new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(ms));
}
