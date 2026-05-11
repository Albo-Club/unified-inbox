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
import { Avatar, AvatarFallback } from '~/components/ui/avatar';
import { Button } from '~/components/ui/button';
import { Separator } from '~/components/ui/separator';
import type { EmailFolder } from '~/types/email';
import { cn } from '~/lib/utils';

const FOLDERS: {
  id: EmailFolder;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
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
    <div className="flex h-full flex-col">
      <div className="flex h-[52px] items-center px-4">
        <h2 className="text-sm font-semibold tracking-tight">Mail</h2>
      </div>
      <Separator />

      <nav className="grid gap-1 p-2">
        {FOLDERS.map(({ id, label, icon: Icon }) => {
          const active = currentFolder === id;
          return (
            <Button
              key={id}
              variant={active ? 'secondary' : 'ghost'}
              className={cn('justify-start gap-3', !active && 'text-muted-foreground')}
              onClick={() => onSelectFolder(id)}
            >
              <Icon className="size-4" />
              {label}
            </Button>
          );
        })}
      </nav>

      <Separator />

      <div className="px-4 pt-3 pb-1 text-xs uppercase tracking-wide text-muted-foreground">
        Comptes
      </div>
      <div className="flex-1 overflow-y-auto px-2 pb-2">
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
            className="flex items-center gap-3 rounded-md px-2 py-2 text-sm"
            title={a.email}
          >
            <Avatar className="size-6">
              <AvatarFallback className="text-[10px]">
                {(a.label || a.email).slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <span className="truncate flex-1">{a.label || a.email}</span>
            <span
              className={cn(
                'inline-block size-1.5 rounded-full shrink-0',
                a.status === 'active' && 'bg-foreground',
                a.status === 'error' && 'bg-destructive',
                a.status !== 'active' && a.status !== 'error' && 'bg-muted-foreground/40',
              )}
              aria-label={a.status ?? 'unknown'}
            />
          </div>
        ))}
      </div>

      <Separator />
      <div className="p-2">
        <Button asChild variant="outline" size="sm" className="w-full">
          <Link to="/app/settings" hash="email-accounts">
            <Plus className="size-3.5" />
            Ajouter un compte
          </Link>
        </Button>
      </div>
    </div>
  );
}
