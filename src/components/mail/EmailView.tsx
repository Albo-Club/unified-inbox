import { api } from '@convex/_generated/api';
import { useAction, useMutation, useQuery } from 'convex/react';
import type { Id } from '@convex/_generated/dataModel';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '~/components/ui/badge';
import { Skeleton } from '~/components/ui/skeleton';
import { MailActions } from './MailActions';
import type { EmailHeader } from '~/types/email';
import { formatFullDate } from '~/types/email';
import { sanitizeHtml } from '~/lib/sanitize';

type Props = {
  emailId: string;
  email?: EmailHeader;
  onReply: () => void;
  onReplyAll: () => void;
  onForward: () => void;
  onClose?: () => void;
};

export function EmailView({ emailId, email, onReply, onReplyAll, onForward, onClose }: Props) {
  /* `getBodyHtml` is a reactive query that returns a Convex Storage URL once
   * the body has been fetched server-side (or null otherwise). When null, we
   * trigger the `fetchBody` action which schedules a Gmail-API or IMAP fetch;
   * the query then re-runs reactively and we download the actual HTML. */
  const bodyUrl = useQuery(
    api.emails.getBodyHtml,
    emailId ? { emailId: emailId as Id<'emails'> } : 'skip',
  );
  const fetchBody = useAction(api.emails.fetchBody);
  const markRead = useMutation(api.emails.markRead);
  const archive = useMutation(api.emails.archive);
  const trash = useMutation(api.emails.trash);

  const [body, setBody] = useState<string | null | undefined>(undefined);
  const [bodyError, setBodyError] = useState<string | null>(null);
  const fetchTriggeredFor = useRef<string | null>(null);

  // Reset state when the selected email changes.
  useEffect(() => {
    setBody(undefined);
    setBodyError(null);
    fetchTriggeredFor.current = null;
  }, [emailId]);

  // If the body URL is null, ask the backend to fetch the body once.
  useEffect(() => {
    if (!emailId) return;
    if (bodyUrl === undefined) return; // still loading the query
    if (bodyUrl !== null) return; // URL is ready — no need to trigger
    if (fetchTriggeredFor.current === emailId) return; // already triggered

    fetchTriggeredFor.current = emailId;
    fetchBody({ emailId: emailId as Id<'emails'> }).catch((err: unknown) => {
      setBodyError(err instanceof Error ? err.message : 'Impossible de charger le contenu.');
    });
  }, [emailId, bodyUrl, fetchBody]);

  // Once we have a URL, download the HTML content.
  useEffect(() => {
    if (!emailId || !bodyUrl) {
      // either no selection or URL not ready yet (handled by the effect above)
      if (bodyUrl === null) return; // waiting for fetchBody
      setBody(undefined);
      return;
    }
    let cancelled = false;
    fetch(bodyUrl)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.text();
      })
      .then((html) => {
        if (cancelled) return;
        setBody(html);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setBody(null);
        setBodyError(err instanceof Error ? err.message : 'Impossible de charger le contenu.');
      });
    return () => {
      cancelled = true;
    };
  }, [emailId, bodyUrl]);

  // Auto mark-as-read once when entering the view.
  useEffect(() => {
    if (!emailId || !email || email.isRead) return;
    void markRead({ emailId: emailId as Id<'emails'>, isRead: true }).catch(() => {
      // silent — UI doesn't depend on this
    });
  }, [emailId, email, markRead]);

  const safeHtml = useMemo(() => (body ? sanitizeHtml(body) : ''), [body]);

  async function handleArchive() {
    try {
      await archive({ emailId: emailId as Id<'emails'> });
      toast.success('Email archivé');
      onClose?.();
    } catch (err) {
      toast.error("Impossible d'archiver l'email", {
        description: err instanceof Error ? err.message : undefined,
      });
    }
  }

  async function handleTrash() {
    try {
      await trash({ emailId: emailId as Id<'emails'> });
      toast.success('Email supprimé');
      onClose?.();
    } catch (err) {
      toast.error("Impossible de supprimer l'email", {
        description: err instanceof Error ? err.message : undefined,
      });
    }
  }

  function handleToggleStar() {
    toast.info('Le marquage des suivis arrive bientôt.');
  }

  if (!email) {
    return (
      <div className="flex h-full flex-1 flex-col items-center justify-center p-8 text-muted-foreground">
        <p className="albo-paragraph">Sélectionnez un email pour le lire.</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-1 flex-col bg-background">
      {/* Toolbar */}
      <div className="flex shrink-0 items-center justify-between border-b border-border/50 px-4 py-2">
        <MailActions
          onArchive={handleArchive}
          onTrash={handleTrash}
          onReply={onReply}
          onReplyAll={onReplyAll}
          onForward={onForward}
          onToggleStar={handleToggleStar}
          isStarred={email.isStarred}
        />
      </div>

      {/* Header */}
      <div className="shrink-0 px-6 py-4 border-b border-border/50">
        <div className="flex items-start justify-between gap-4">
          <h1 className="albo-title text-xl leading-snug">{email.subject || '(Sans objet)'}</h1>
          <Badge variant="outline" className="shrink-0" title={email.accountId}>
            {email.accountId.slice(0, 6)}
          </Badge>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{email.sender}</span>
          {email.senderEmail && email.senderEmail !== email.sender && (
            <span className="text-xs">&lt;{email.senderEmail}&gt;</span>
          )}
          <span>·</span>
          <span>{formatFullDate(email.date)}</span>
        </div>
        {email.recipients.length > 0 && (
          <div className="mt-1 text-xs text-muted-foreground truncate">
            À&nbsp;: {email.recipients.join(', ')}
          </div>
        )}
        {email.cc.length > 0 && (
          <div className="text-xs text-muted-foreground truncate">
            Cc&nbsp;: {email.cc.join(', ')}
          </div>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-6 py-5">
        {body === undefined && !bodyError && (
          <div className="space-y-3">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-full" />
          </div>
        )}
        {bodyError && <p className="text-sm text-destructive">{bodyError}</p>}
        {body === null && !bodyError && (
          <p className="text-sm text-muted-foreground">
            Le contenu de cet email n&apos;a pas pu être chargé.
          </p>
        )}
        {typeof body === 'string' && body.length > 0 && (
          <div
            className="prose prose-sm dark:prose-invert max-w-none overflow-x-auto"
            // sanitized via DOMPurify above
            dangerouslySetInnerHTML={{ __html: safeHtml }}
          />
        )}
      </div>
    </div>
  );
}
