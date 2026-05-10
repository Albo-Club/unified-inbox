import { useEffect } from 'react';
import { Archive, Forward, Reply, ReplyAll, Star, StarOff, Trash2 } from 'lucide-react';
import { Button } from '~/components/ui/button';

export type MailActionHandlers = {
  onArchive: () => void;
  onTrash: () => void;
  onReply: () => void;
  onReplyAll: () => void;
  onForward: () => void;
  onToggleStar: () => void;
  isStarred?: boolean;
};

/**
 * Action toolbar for the reading pane. Hosts keyboard shortcuts:
 *  - `r`        reply
 *  - `Shift+R`  reply all
 *  - `f`        forward
 *  - `e`        archive
 *  - `#` / `Backspace` trash
 *  - `s`        star/unstar
 */
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
      // Ignore when typing in a form field / contenteditable
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
    <div className="flex items-center gap-1">
      <Button variant="ghost" size="sm" onClick={onArchive} title="Archiver (e)">
        <Archive className="size-4" />
      </Button>
      <Button variant="ghost" size="sm" onClick={onTrash} title="Supprimer (#)">
        <Trash2 className="size-4" />
      </Button>
      <Button variant="ghost" size="sm" onClick={onToggleStar} title="Suivre (s)">
        {isStarred ? (
          <StarOff className="size-4" />
        ) : (
          <Star className="size-4" />
        )}
      </Button>
      <div className="mx-1 h-5 w-px bg-border" />
      <Button variant="ghost" size="sm" onClick={onReply} title="Répondre (r)">
        <Reply className="size-4" />
      </Button>
      <Button variant="ghost" size="sm" onClick={onReplyAll} title="Répondre à tous (Shift+R)">
        <ReplyAll className="size-4" />
      </Button>
      <Button variant="ghost" size="sm" onClick={onForward} title="Transférer (f)">
        <Forward className="size-4" />
      </Button>
    </div>
  );
}
