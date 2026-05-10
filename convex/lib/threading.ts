/**
 * Threading helpers — port from the my-unified-mail POC `email-types.ts`.
 *
 * `normalizeSubject` strips Re:/Fwd:/Fw: prefixes so subject-based grouping
 * works when Gmail's native threadId is not available (IMAP fallback).
 *
 * `groupByThread` collapses a flat list of emails into thread groups. Used by
 * the AI agent for `getEmailThread` and by the email list UI fallback.
 */

export type ThreadableEmail = {
  threadId: string;
  subject: string;
  date: number;
  [key: string]: unknown;
};

export type ThreadGroup<T extends ThreadableEmail = ThreadableEmail> = {
  threadId: string;
  subject: string;
  latestDate: number;
  messageCount: number;
  messages: T[];
};

/** Strip Re:/Fwd:/Fw: prefixes (case-insensitive, repeatable). */
export function normalizeSubject(subject: string): string {
  return subject.replace(/^(Re:\s*|Fwd:\s*|Fw:\s*)+/i, '').trim();
}

/** Group a flat list of emails by threadId; newest thread first. */
export function groupByThread<T extends ThreadableEmail>(emails: T[]): ThreadGroup<T>[] {
  const map = new Map<string, T[]>();
  for (const e of emails) {
    const arr = map.get(e.threadId);
    if (arr) {
      arr.push(e);
    } else {
      map.set(e.threadId, [e]);
    }
  }
  const out: ThreadGroup<T>[] = [];
  for (const [threadId, messages] of map) {
    messages.sort((a, b) => a.date - b.date);
    const latest = messages[messages.length - 1];
    if (!latest) continue;
    out.push({
      threadId,
      subject: latest.subject,
      latestDate: latest.date,
      messageCount: messages.length,
      messages,
    });
  }
  return out.sort((a, b) => b.latestDate - a.latestDate);
}
