import { api } from '@convex/_generated/api';
import { useAction, useMutation, useQuery } from 'convex/react';
import type { Id } from '@convex/_generated/dataModel';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Avatar, AvatarFallback } from '~/components/ui/avatar';
import { Separator } from '~/components/ui/separator';
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

  useEffect(() => {
    setBody(undefined);
    setBodyError(null);
    fetchTriggeredFor.current = null;
  }, [emailId]);

  useEffect(() => {
    if (!emailId) return;
    if (bodyUrl === undefined) return;
    if (bodyUrl !== null) return;
    if (fetchTriggeredFor.current === emailId) return;

    fetchTriggeredFor.current = emailId;
    fetchBody({ emailId: emailId as Id<'emails'> }).catch((err: unknown) => {
      setBodyError(err instanceof Error ? err.message : 'Impossible de charger le contenu.');
    });
  }, [emailId, bodyUrl, fetchBody]);

  useEffect(() => {
    if (!emailId || !bodyUrl) {
      if (bodyUrl === null) return;
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

  useEffect(() => {
    if (!emailId || !email || email.isRead) return;
    void markRead({ emailId: emailId as Id<'emails'>, isRead: true }).catch(() => {});
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
      <div className="flex h-full flex-col items-center justify-center p-8 text-muted-foreground">
        <p className="text-sm">Sélectionnez un email pour le lire.</p>
      </div>
    );
  }

  const initials = (email.sender || email.senderEmail).slice(0, 2).toUpperCase();

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-[52px] items-center px-2">
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
      <Separator />

      <div className="flex items-start p-4">
        <div className="flex items-start gap-4 text-sm">
          <Avatar>
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
          <div className="grid gap-1">
            <div className="font-semibold">{email.sender || email.senderEmail}</div>
            <div className="line-clamp-1 text-xs">
              {email.subject || '(Sans objet)'}
            </div>
            <div className="line-clamp-1 text-xs text-muted-foreground">
              <span className="font-medium">À&nbsp;:</span> {email.recipients.join(', ') || '—'}
            </div>
            {email.cc.length > 0 && (
              <div className="line-clamp-1 text-xs text-muted-foreground">
                <span className="font-medium">Cc&nbsp;:</span> {email.cc.join(', ')}
              </div>
            )}
          </div>
        </div>
        <div className="ml-auto text-xs text-muted-foreground">
          {formatFullDate(email.date)}
        </div>
      </div>
      <Separator />

      <div className="flex-1 overflow-y-auto p-4 text-sm">
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
            dangerouslySetInnerHTML={{ __html: safeHtml }}
          />
        )}
      </div>
    </div>
  );
}
