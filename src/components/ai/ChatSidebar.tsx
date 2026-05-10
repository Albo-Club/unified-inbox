import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { useAction, useMutation } from 'convex/react';
import { Loader2, Send, Sparkles } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { cn } from '~/lib/utils';

type Role = 'user' | 'assistant' | 'system';

interface PendingAction {
  toolCallId: string;
  type: 'create' | 'update' | 'toggle' | 'delete';
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
    "Hi — I'm your todo assistant. Ask me what's on your plate, or tell me to add / update / clean up todos. I'll always ask for your confirmation before changing anything.",
};

export function ChatSidebar() {
  const sendMessage = useAction(api.agent.sendMessage);
  const createTodo = useMutation(api.todos.create);
  const updateTodo = useMutation(api.todos.update);
  const toggleTodo = useMutation(api.todos.toggle);
  const removeTodo = useMutation(api.todos.remove);

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
        case 'create': {
          const p = action.payload as { title: string; notes?: string; dueAt?: number };
          await createTodo({ title: p.title, notes: p.notes, dueAt: p.dueAt });
          break;
        }
        case 'update': {
          const p = action.payload as {
            id: string;
            title?: string;
            notes?: string;
            dueAt?: number;
          };
          await updateTodo({
            id: p.id as Id<'todos'>,
            title: p.title,
            notes: p.notes,
            dueAt: p.dueAt,
          });
          break;
        }
        case 'toggle': {
          const p = action.payload as { id: string };
          await toggleTodo({ id: p.id as Id<'todos'> });
          break;
        }
        case 'delete': {
          const p = action.payload as { id: string };
          await removeTodo({ id: p.id as Id<'todos'> });
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
        <Sparkles className="size-4 text-primary" />
        <h2 className="albo-title text-base">AI assistant</h2>
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
          ? 'border-primary/30 bg-primary/5'
          : action.status === 'confirmed'
            ? 'border-success/30 bg-success/5 text-muted-foreground'
            : 'border-border bg-muted text-muted-foreground',
      )}
    >
      <div className="flex items-start gap-2">
        <Sparkles className="size-3.5 mt-0.5 text-primary shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="font-medium text-xs uppercase tracking-wide text-primary mb-1">
            {action.status === 'confirmed'
              ? '✓ Done'
              : action.status === 'cancelled'
                ? '✕ Cancelled'
                : 'AI proposes'}
          </p>
          <p className="text-foreground">{label}</p>
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
    case 'create': {
      const p = a.payload as { title?: string; notes?: string };
      return `Create todo "${p.title ?? '(no title)'}"${p.notes ? ' with notes' : ''}.`;
    }
    case 'update': {
      const p = a.payload as { title?: string; notes?: string };
      const parts: string[] = [];
      if (p.title) parts.push(`title → "${p.title}"`);
      if (p.notes !== undefined) parts.push('update notes');
      return `Update todo: ${parts.join(', ') || 'no changes'}.`;
    }
    case 'toggle':
      return 'Toggle done state of a todo.';
    case 'delete':
      return 'Delete a todo.';
  }
}
