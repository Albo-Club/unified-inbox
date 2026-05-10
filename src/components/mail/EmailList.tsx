import { api } from '@convex/_generated/api';
import { useQuery } from 'convex/react';
import { useEffect, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Paperclip, Star } from 'lucide-react';
import { Input } from '~/components/ui/input';
import { Skeleton } from '~/components/ui/skeleton';
import type { EmailFolder, EmailHeader } from '~/types/email';
import { formatRelativeDate } from '~/types/email';
import { cn } from '~/lib/utils';

const ROW_HEIGHT = 84; // px — fixed for virtualization

// Folders the backend's `listByFolder` query supports.
type ListableFolder = 'inbox' | 'sent' | 'trash' | 'starred' | 'all';

function toListableFolder(f: EmailFolder): ListableFolder {
  // Backend doesn't expose an explicit 'archive' folder — fall back to 'all'.
  return f === 'archive' ? 'all' : (f as ListableFolder);
}

export function EmailList({
  folder,
  selectedId,
  onSelect,
}: {
  folder: EmailFolder;
  selectedId?: string;
  onSelect: (id: string) => void;
}) {
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchInput.trim()), 250);
    return () => clearTimeout(t);
  }, [searchInput]);

  const emails = useQuery(api.emails.listByFolder, {
    folder: toListableFolder(folder),
    search: debouncedSearch || undefined,
  });

  const parentRef = useRef<HTMLDivElement>(null);
  const items: EmailHeader[] = emails ?? [];

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
  });

  return (
    <div className="flex h-full flex-col border-r border-border/50 bg-background w-full lg:w-[450px] shrink-0">
      <div className="shrink-0 border-b border-border/50 px-4 py-3">
        <Input
          placeholder="Rechercher…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="h-9"
        />
      </div>
      <div ref={parentRef} className="flex-1 overflow-y-auto">
        {emails === undefined && (
          <div className="p-4 space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-3 w-3/4" />
                <Skeleton className="h-3 w-2/3" />
              </div>
            ))}
          </div>
        )}
        {emails && emails.length === 0 && (
          <div className="p-8 text-center text-sm text-muted-foreground">
            Aucun email dans ce dossier.
          </div>
        )}
        {items.length > 0 && (
          <div
            style={{ height: virtualizer.getTotalSize(), width: '100%', position: 'relative' }}
          >
            {virtualizer.getVirtualItems().map((vRow) => {
              const email = items[vRow.index];
              if (!email) return null;
              const isSelected = email._id === selectedId;
              return (
                <div
                  key={email._id}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: vRow.size,
                    transform: `translateY(${vRow.start}px)`,
                  }}
                >
                  <EmailRow
                    email={email}
                    isSelected={isSelected}
                    onClick={() => onSelect(email._id)}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function EmailRow({
  email,
  isSelected,
  onClick,
}: {
  email: EmailHeader;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full flex-col gap-1 px-4 py-3 text-left text-sm border-b border-border/50 transition-colors h-[84px]',
        isSelected ? 'bg-accent/60 text-accent-foreground' : 'hover:bg-muted/60',
      )}
    >
      <div className="flex w-full items-center gap-2">
        <span
          className={cn(
            'truncate flex-1',
            !email.isRead ? 'font-semibold text-foreground' : 'text-foreground/90',
          )}
        >
          {email.sender || email.senderEmail}
        </span>
        {!email.isRead && (
          <span className="size-2 shrink-0 rounded-full bg-foreground" aria-label="Non lu" />
        )}
        {email.isStarred && (
          <Star className="size-3.5 shrink-0 fill-current text-accent" aria-label="Suivi" />
        )}
        {email.hasAttachments && (
          <Paperclip className="size-3.5 shrink-0 text-muted-foreground" aria-label="Pièce jointe" />
        )}
        <span className="ml-1 shrink-0 text-xs text-muted-foreground">
          {formatRelativeDate(email.date)}
        </span>
      </div>
      <div
        className={cn(
          'truncate w-full text-sm',
          !email.isRead ? 'font-medium text-foreground' : 'text-foreground/80',
        )}
      >
        {email.subject || '(Sans objet)'}
      </div>
      <div className="truncate w-full text-xs text-muted-foreground">{email.snippet}</div>
    </button>
  );
}
