import { api } from '@convex/_generated/api';
import { useQuery } from 'convex/react';
import { Link } from '@tanstack/react-router';
import {
  Archive,
  Inbox,
  Layers,
  Plus,
  Send,
  Star,
  Trash2,
} from 'lucide-react';
import type { EmailFolder } from '~/types/email';
import { cn } from '~/lib/utils';

const FOLDERS: { id: EmailFolder; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'inbox', label: 'Boîte de réception', icon: Inbox },
  { id: 'starred', label: 'Suivis', icon: Star },
  { id: 'sent', label: 'Envoyés', icon: Send },
  { id: 'archive', label: 'Archives', icon: Archive },
  { id: 'trash', label: 'Corbeille', icon: Trash2 },
  { id: 'all', label: 'Tous les messages', icon: Layers },
];

export function MailFolderNav({
  currentFolder,
  onSelectFolder,
}: {
  currentFolder: EmailFolder;
  onSelectFolder: (folder: EmailFolder) => void;
}) {
  const accounts = useQuery(api.emailAccounts.listMine, {});

  return (
    <div className="flex h-full flex-col border-r border-border/50 bg-card">
      <div className="px-4 py-4 border-b border-border/50">
        <h2 className="albo-title text-lg">Mail</h2>
      </div>

      <nav className="px-2 py-3 space-y-0.5">
        {FOLDERS.map(({ id, label, icon: Icon }) => {
          const active = currentFolder === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onSelectFolder(id)}
              className={cn(
                'flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm text-left transition-colors',
                active
                  ? 'bg-primary/10 text-foreground font-medium'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              <Icon className="size-4" />
              <span>{label}</span>
            </button>
          );
        })}
      </nav>

      <div className="px-4 mt-2 mb-1 flex items-center justify-between">
        <span className="text-xs uppercase tracking-wide text-muted-foreground">Comptes</span>
      </div>
      <div className="px-2 space-y-0.5 flex-1 overflow-y-auto">
        {accounts === undefined && (
          <div className="px-3 py-2 text-xs text-muted-foreground">Chargement…</div>
        )}
        {accounts && accounts.length === 0 && (
          <div className="px-3 py-2 text-xs text-muted-foreground">
            Aucun compte connecté.
          </div>
        )}
        {accounts?.map((a) => (
          <div
            key={a._id}
            className="flex items-center gap-2 px-3 py-2 text-sm text-foreground"
            title={a.email}
          >
            <span
              className={cn(
                'inline-block size-2 rounded-full shrink-0',
                a.status === 'active'
                  ? 'bg-success'
                  : a.status === 'error'
                    ? 'bg-destructive'
                    : 'bg-muted-foreground/50',
              )}
              aria-label={a.status ?? 'unknown'}
            />
            <span className="truncate">{a.label || a.email}</span>
          </div>
        ))}
      </div>

      <div className="p-3 border-t border-border/50">
        <Link
          to="/app/settings"
          hash="email-accounts"
          className="flex items-center justify-center gap-2 w-full rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-accent/40 transition-colors"
        >
          <Plus className="size-3.5" />
          Ajouter un compte
        </Link>
      </div>
    </div>
  );
}
