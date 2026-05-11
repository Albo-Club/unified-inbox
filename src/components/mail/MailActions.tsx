import { useEffect } from 'react';
import { Archive, Forward, Reply, ReplyAll, Star, StarOff, Trash2 } from 'lucide-react';
import { Button } from '~/components/ui/button';
import { Separator } from '~/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '~/components/ui/tooltip';

export type MailActionHandlers = {
  onArchive: () => void;
  onTrash: () => void;
  onReply: () => void;
  onReplyAll: () => void;
  onForward: () => void;
  onToggleStar: () => void;
  isStarred?: boolean;
};

export function MailActions({
  onArchive,
  onTrash,
  onReply,
  onReplyAll,
  onForward,
  onToggleStar,
  isStarred,
}: MailActionHandlers) {
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === 'r' && !e.shiftKey) {
        e.preventDefault();
        onReply();
      } else if (e.key === 'R' && e.shiftKey) {
        e.preventDefault();
        onReplyAll();
      } else if (e.key === 'f' && !e.shiftKey) {
        e.preventDefault();
        onForward();
      } else if (e.key === 'e' && !e.shiftKey) {
        e.preventDefault();
        onArchive();
      } else if (e.key === '#' || e.key === 'Backspace') {
        e.preventDefault();
        onTrash();
      } else if (e.key === 's' && !e.shiftKey) {
        e.preventDefault();
        onToggleStar();
      }
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onArchive, onTrash, onReply, onReplyAll, onForward, onToggleStar]);

  return (
    <div className="flex items-center gap-2">
      <ToolbarButton onClick={onArchive} label="Archiver" shortcut="e">
        <Archive className="size-4" />
      </ToolbarButton>
      <ToolbarButton onClick={onTrash} label="Supprimer" shortcut="#">
        <Trash2 className="size-4" />
      </ToolbarButton>
      <ToolbarButton onClick={onToggleStar} label={isStarred ? 'Retirer des suivis' : 'Suivre'} shortcut="s">
        {isStarred ? <StarOff className="size-4" /> : <Star className="size-4" />}
      </ToolbarButton>
      <Separator orientation="vertical" className="mx-1 h-6" />
      <ToolbarButton onClick={onReply} label="Répondre" shortcut="r">
        <Reply className="size-4" />
      </ToolbarButton>
      <ToolbarButton onClick={onReplyAll} label="Répondre à tous" shortcut="⇧R">
        <ReplyAll className="size-4" />
      </ToolbarButton>
      <ToolbarButton onClick={onForward} label="Transférer" shortcut="f">
        <Forward className="size-4" />
      </ToolbarButton>
    </div>
  );
}

function ToolbarButton({
  onClick,
  label,
  shortcut,
  children,
}: {
  onClick: () => void;
  label: string;
  shortcut?: string;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon" onClick={onClick} aria-label={label}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {label}
        {shortcut && <span className="ml-2 text-muted-foreground/80">{shortcut}</span>}
      </TooltipContent>
    </Tooltip>
  );
}
