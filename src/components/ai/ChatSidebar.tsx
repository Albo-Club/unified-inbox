import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { useAction, useMutation } from 'convex/react';
import { Link } from '@tanstack/react-router';
import { ExternalLink, Loader2, Mail, Send, Sparkles } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { cn } from '~/lib/utils';

type Role = 'user' | 'assistant' | 'system';

// Match backend `PendingActionType` in convex/agent.ts.
type ActionType = 'reply' | 'markRead' | 'archive' | 'trash';

interface PendingAction {
  toolCallId: string;
  type: ActionType;
  payload: Record<string, unknown>;
  status: 'pending' | 'confirmed' | 'cancelled';
}

interface Message {
  id: string;
  role: Role;
  content: string;
  pendingActions?: PendingAction[];
}

const WELCOME: Message = {
  id: 'welcome',
  role: 'assistant',
  content:
    "Hi — I'm your email assistant. Ask me to find threads, summarize a conversation, or draft a reply. I'll always ask for your confirmation before sending or modifying anything.",
};

export function ChatSidebar() {
  const sendMessage = useAction(api.agent.sendMessage);

  // Email mutations — wired to the unified-inbox backend.
  const saveDraft = useMutation(api.emails.saveDraft);
  const markRead = useMutation(api.emails.markRead);
  const archiveEmail = useMutation(api.emails.archive);
  const trashEmail = useMutation(api.emails.trash);

  const [messages, setMessages] = useState<Message[]>([WELCOME]);
  const [draft, setDraft] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || submitting) return;

    setError(null);
    setSubmitting(true);

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
    };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setDraft('');

    try {
      const result = await sendMessage({
        messages: nextMessages
          .filter((m) => m.id !== 'welcome')
          .map((m) => ({ role: m.role, content: m.content })),
      });

      const assistantMsg: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: result.text || (result.pendingActions.length > 0 ? '' : '(no response)'),
        pendingActions: result.pendingActions.map((a) => ({ ...a, status: 'pending' as const })),
      };
      setMessages((m) => [...m, assistantMsg]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleConfirm(messageId: string, action: PendingAction) {
    try {
      switch (action.type) {
        case 'reply': {
          const p = action.payload as {
            emailId: string;
            bodyHtml: string;
            to?: string;
            cc?: string;
            subject?: string;
            accountId?: string;
            mode?: 'reply' | 'replyAll' | 'forward' | 'new';
          };
          if (!p.accountId) {
            throw new Error('Aucun compte cible pour le brouillon.');
          }
          await saveDraft({
            accountId: p.accountId as Id<'emailAccounts'>,
            to: p.to ?? '',
            cc: p.cc ?? '',
            subject: p.subject ?? '',
            bodyHtml: p.bodyHtml,
            inReplyToEmailId: p.emailId as Id<'emails'>,
            mode: p.mode ?? 'reply',
          });
          toast.success('Brouillon enregistré');
          break;
        }
        case 'markRead': {
          const p = action.payload as { emailId: string; emailIds?: string[] };
          const ids = p.emailIds ?? [p.emailId];
          for (const id of ids) {
            // eslint-disable-next-line no-await-in-loop
            await markRead({ emailId: id as Id<'emails'>, isRead: true });
          }
          toast.success(ids.length > 1 ? `${ids.length} emails marqués lus` : 'Email marqué lu');
          break;
        }
        case 'archive': {
          const p = action.payload as { emailId: string; emailIds?: string[] };
          const ids = p.emailIds ?? [p.emailId];
          for (const id of ids) {
            // eslint-disable-next-line no-await-in-loop
            await archiveEmail({ emailId: id as Id<'emails'> });
          }
          toast.success(ids.length > 1 ? `${ids.length} emails archivés` : 'Email archivé');
          break;
        }
        case 'trash': {
          const p = action.payload as { emailId: string; emailIds?: string[] };
          const ids = p.emailIds ?? [p.emailId];
          for (const id of ids) {
            // eslint-disable-next-line no-await-in-loop
            await trashEmail({ emailId: id as Id<'emails'> });
          }
          toast.success(ids.length > 1 ? `${ids.length} emails supprimés` : 'Email supprimé');
          break;
        }
      }
      updateActionStatus(messageId, action.toolCallId, 'confirmed');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed.');
    }
  }

  function handleCancel(messageId: string, toolCallId: string) {
    updateActionStatus(messageId, toolCallId, 'cancelled');
  }

  function updateActionStatus(
    messageId: string,
    toolCallId: string,
    status: 'confirmed' | 'cancelled',
  ) {
    setMessages((msgs) =>
      msgs.map((m) =>
        m.id === messageId
          ? {
              ...m,
              pendingActions: m.pendingActions?.map((a) =>
                a.toolCallId === toolCallId ? { ...a, status } : a,
              ),
            }
          : m,
      ),
    );
  }

  return (
    <div className="flex flex-col h-full">
      <header className="px-5 py-4 border-b border-border/50 flex items-center gap-2">
        <Sparkles className="size-4" />
        <h2 className="text-sm font-semibold tracking-tight">AI assistant</h2>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.map((m) => (
          <ChatBubble
            key={m.id}
            message={m}
            onConfirm={(a) => handleConfirm(m.id, a)}
            onCancel={(toolCallId) => handleCancel(m.id, toolCallId)}
          />
        ))}
        {submitting && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground px-2">
            <Loader2 className="size-3 animate-spin" />
            Thinking…
          </div>
        )}
        {error && (
          <p className="text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-md px-3 py-2">
            {error}
          </p>
        )}
      </div>

      <form onSubmit={handleSubmit} className="border-t border-border/50 p-3 flex gap-2">
        <Input
          placeholder="Ask anything…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={submitting}
          className="flex-1"
        />
        <Button type="submit" size="icon" disabled={!draft.trim() || submitting}>
          <Send className="size-4" />
        </Button>
      </form>
    </div>
  );
}

function ChatBubble({
  message,
  onConfirm,
  onCancel,
}: {
  message: Message;
  onConfirm: (a: PendingAction) => void;
  onCancel: (toolCallId: string) => void;
}) {
  const isUser = message.role === 'user';
  return (
    <div className={cn('flex flex-col gap-2', isUser ? 'items-end' : 'items-start')}>
      {message.content && (
        <div
          className={cn(
            'max-w-[88%] rounded-lg px-3 py-2 text-sm',
            isUser ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground',
          )}
        >
          {message.content}
        </div>
      )}
      {message.pendingActions?.map((a) => (
        <PendingActionCard
          key={a.toolCallId}
          action={a}
          onConfirm={() => onConfirm(a)}
          onCancel={() => onCancel(a.toolCallId)}
        />
      ))}
    </div>
  );
}

function PendingActionCard({
  action,
  onConfirm,
  onCancel,
}: {
  action: PendingAction;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const isPending = action.status === 'pending';
  const label = describeAction(action);
  return (
    <div
      className={cn(
        'w-full rounded-lg border px-3 py-2.5 text-sm',
        isPending
          ? 'border-foreground/40 bg-muted/40'
          : 'border-border bg-muted text-muted-foreground',
      )}
    >
      <div className="flex items-start gap-2">
        <Mail className="size-3.5 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="font-medium text-xs uppercase tracking-wide mb-1">
            {action.status === 'confirmed'
              ? '✓ Done'
              : action.status === 'cancelled'
                ? '✕ Cancelled'
                : 'AI proposes'}
          </p>
          <p className="text-foreground">{label}</p>
          {action.type === 'reply' && <ReplyPreview payload={action.payload} />}
        </div>
      </div>
      {isPending && (
        <div className="flex gap-2 mt-3">
          <Button size="sm" onClick={onConfirm}>
            Confirm
          </Button>
          <Button size="sm" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      )}
    </div>
  );
}

function describeAction(a: PendingAction): string {
  switch (a.type) {
    case 'reply': {
      const p = a.payload as { subject?: string; to?: string };
      return p.subject
        ? `Préparer une réponse à "${p.subject}"${p.to ? ` pour ${p.to}` : ''}.`
        : 'Préparer une réponse à un email.';
    }
    case 'markRead': {
      const p = a.payload as { emailIds?: string[] };
      const n = p.emailIds?.length ?? 1;
      return n > 1 ? `Marquer ${n} emails comme lus.` : 'Marquer cet email comme lu.';
    }
    case 'archive': {
      const p = a.payload as { emailIds?: string[] };
      const n = p.emailIds?.length ?? 1;
      return n > 1 ? `Archiver ${n} emails.` : 'Archiver cet email.';
    }
    case 'trash': {
      const p = a.payload as { emailIds?: string[] };
      const n = p.emailIds?.length ?? 1;
      return n > 1 ? `Supprimer ${n} emails.` : 'Supprimer cet email.';
    }
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

function ReplyPreview({ payload }: { payload: Record<string, unknown> }) {
  const bodyHtml = typeof payload.bodyHtml === 'string' ? payload.bodyHtml : '';
  const emailId = typeof payload.emailId === 'string' ? payload.emailId : '';
  const mode = (typeof payload.mode === 'string' ? payload.mode : 'reply') as
    | 'reply'
    | 'replyAll'
    | 'forward'
    | 'new';
  const text = stripHtml(bodyHtml);
  const lines = text.split('\n').filter((l) => l.trim());
  const preview = lines.slice(0, 3).join(' ');
  const truncated = lines.length > 3 || preview.length > 200;

  return (
    <div className="mt-2 rounded-md border border-border/60 bg-background/40 p-2 space-y-2">
      <p className="text-xs text-foreground/90 line-clamp-3 italic">
        {preview.slice(0, 220)}
        {truncated ? '…' : ''}
      </p>
      {emailId && (
        <Link
          to="/app/mail"
          search={{ id: emailId, compose: mode } as never}
          className="inline-flex items-center gap-1 text-xs underline-offset-2 hover:underline"
        >
          <ExternalLink className="size-3" />
          Ouvrir dans la rédaction
        </Link>
      )}
    </div>
  );
}
