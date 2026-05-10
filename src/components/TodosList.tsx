import { api } from '@convex/_generated/api';
import { useMutation, useQuery } from 'convex/react';
import { Check, Trash2, Plus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Button } from '~/components/ui/button';
import { Checkbox } from '~/components/ui/checkbox';
import { Input } from '~/components/ui/input';
import { cn } from '~/lib/utils';

export function TodosList() {
  const todos = useQuery(api.todos.listMine, {});
  const create = useMutation(api.todos.create);
  const toggle = useMutation(api.todos.toggle);
  const remove = useMutation(api.todos.remove);

  const [draft, setDraft] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleAdd(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const title = draft.trim();
    if (!title || submitting) return;
    setSubmitting(true);
    try {
      await create({ title });
      setDraft('');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleAdd} className="flex gap-2">
        <Input
          placeholder="Add a todo…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={submitting}
          className="flex-1"
        />
        <Button type="submit" disabled={!draft.trim() || submitting}>
          <Plus className="size-4" />
          <span className="ml-1">Add</span>
        </Button>
      </form>

      {todos === undefined ? (
        <p className="albo-paragraph text-muted-foreground">Loading…</p>
      ) : todos.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border/60 bg-muted/40 px-6 py-12 text-center">
          <Check className="size-8 mx-auto text-muted-foreground mb-2" />
          <p className="albo-paragraph text-muted-foreground">
            No todos yet. Add one above, or ask the AI on the right.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {todos.map((t) => (
            <li
              key={t._id}
              className="group flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3"
            >
              <Checkbox
                checked={t.done}
                onCheckedChange={() => void toggle({ id: t._id })}
                aria-label={t.done ? 'Mark as not done' : 'Mark as done'}
              />
              <div className="flex-1 min-w-0">
                <p
                  className={cn(
                    'text-sm',
                    t.done && 'line-through text-muted-foreground',
                  )}
                >
                  {t.title}
                </p>
                {t.notes && (
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                    {t.notes}
                  </p>
                )}
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={() => void remove({ id: t._id })}
                aria-label="Delete todo"
              >
                <Trash2 className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
