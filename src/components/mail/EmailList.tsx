import { api } from '@convex/_generated/api';
import { useQuery } from 'convex/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Paperclip, Search, Star } from 'lucide-react';
import { Avatar, AvatarFallback } from '~/components/ui/avatar';
import { Input } from '~/components/ui/input';
import { Separator } from '~/components/ui/separator';
import { Skeleton } from '~/components/ui/skeleton';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '~/components/ui/tabs';
import type { EmailFolder, EmailHeader } from '~/types/email';
import { formatRelativeDate } from '~/types/email';
import { cn } from '~/lib/utils';

const ROW_HEIGHT = 92;

type ListableFolder = 'inbox' | 'sent' | 'trash' | 'starred' | 'all';

function toListableFolder(f: EmailFolder): ListableFolder {
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
  const [tab, setTab] = useState<'all' | 'unread'>('all');

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchInput.trim()), 250);
    return () => clearTimeout(t);
  }, [searchInput]);

  const emails = useQuery(api.emails.listByFolder, {
    folder: toListableFolder(folder),
    search: debouncedSearch || undefined,
  });

  const items = useMemo<EmailHeader[]>(() => {
    if (!emails) return [];
    return tab === 'unread' ? emails.filter((e: EmailHeader) => !e.isRead) : emails;
  }, [emails, tab]);

  return (
    <Tabs
      value={tab}
      onValueChange={(v) => setTab(v as 'all' | 'unread')}
      className="flex h-full flex-col"
    >
      <div className="flex items-center px-4 py-2">
        <h2 className="text-base font-semibold tracking-tight">Inbox</h2>
        <TabsList className="ml-auto">
          <TabsTrigger value="all">Tous</TabsTrigger>
          <TabsTrigger value="unread">Non lus</TabsTrigger>
        </TabsList>
      </div>
      <Separator />

      <div className="bg-background/95 p-4 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="relative">
          <Search className="absolute left-2 top-2.5 size-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-8"
          />
        </div>
      </div>

      <TabsContent value={tab} className="flex-1 overflow-hidden m-0">
        <ListBody items={items} loading={emails === undefined} selectedId={selectedId} onSelect={onSelect} />
      </TabsContent>
    </Tabs>
  );
}

function ListBody({
  items,
  loading,
  selectedId,
  onSelect,
}: {
  items: EmailHeader[];
  loading: boolean;
  selectedId?: string;
  onSelect: (id: string) => void;
}) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
  });

  if (loading) {
    return (
      <div className="space-y-3 p-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-3/4" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="p-8 text-center text-sm text-muted-foreground">
        Aucun email dans ce dossier.
      </div>
    );
  }

  return (
    <div ref={parentRef} className="h-full overflow-y-auto px-4 pb-4">
      <div
        style={{
          height: virtualizer.getTotalSize(),
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((vRow) => {
          const email = items[vRow.index];
          if (!email) return null;
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
                paddingBottom: 8,
              }}
            >
              <EmailRow
                email={email}
                isSelected={email._id === selectedId}
                onClick={() => onSelect(email._id)}
              />
            </div>
          );
        })}
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
  const initials = (email.sender || email.senderEmail).slice(0, 2).toUpperCase();
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full flex-col items-start gap-1 rounded-lg border p-3 text-left text-sm transition-all hover:bg-accent',
        isSelected ? 'bg-muted' : 'bg-transparent',
      )}
    >
      <div className="flex w-full items-center gap-3">
        <Avatar className="size-7">
          <AvatarFallback className="text-[10px]">{initials}</AvatarFallback>
        </Avatar>
        <div className="flex flex-1 items-center gap-2 min-w-0">
          <span
            className={cn(
              'truncate',
              !email.isRead ? 'font-semibold' : 'font-medium text-foreground/90',
            )}
          >
            {email.sender || email.senderEmail}
          </span>
          {!email.isRead && (
            <span className="size-2 shrink-0 rounded-full bg-foreground" aria-label="Non lu" />
          )}
          {email.isStarred && (
            <Star className="size-3.5 shrink-0 fill-current" aria-label="Suivi" />
          )}
          {email.hasAttachments && (
            <Paperclip className="size-3.5 shrink-0 text-muted-foreground" aria-label="Pièce jointe" />
          )}
        </div>
        <span className="ml-auto shrink-0 text-xs text-muted-foreground">
          {formatRelativeDate(email.date)}
        </span>
      </div>
      <div
        className={cn(
          'truncate w-full text-xs',
          !email.isRead ? 'font-medium text-foreground' : 'text-muted-foreground',
        )}
      >
        {email.subject || '(Sans objet)'}
      </div>
      <div className="line-clamp-2 w-full text-xs text-muted-foreground">
        {email.snippet}
      </div>
    </button>
  );
}
