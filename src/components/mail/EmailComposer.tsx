import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { useAction, useMutation, useQuery } from 'convex/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import { EditorContent, useEditor } from '@tiptap/react';
import {
  Bold,
  Heading2,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Send,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Button } from '~/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { composeTitles, type ComposeState } from '~/types/email';

export function EmailComposer({
  open,
  onClose,
  initial,
  defaultAccountId,
}: {
  open: boolean;
  onClose: () => void;
  initial: ComposeState;
  defaultAccountId?: string;
}) {
  const accounts = useQuery(api.emailAccounts.listMine, {});
  const saveDraft = useMutation(api.emails.saveDraft);
  const sendEmail = useAction(api.emails.sendEmail);

  const [accountId, setAccountId] = useState(
    initial.accountId || defaultAccountId || '',
  );
  const [to, setTo] = useState(initial.to);
  const [cc, setCc] = useState(initial.cc);
  const [subject, setSubject] = useState(initial.subject);
  const [showCc, setShowCc] = useState(initial.mode === 'replyAll' || !!initial.cc);
  const [sending, setSending] = useState(false);
  const [draftId, setDraftId] = useState<Id<'drafts'> | null>(null);
  const lastSavedRef = useRef<string>('');

  const editor = useEditor({
    extensions: [StarterKit, Link.configure({ openOnClick: false })],
    content: initial.quotedBody || '<p></p>',
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class:
          'prose prose-sm max-w-none min-h-[260px] focus:outline-none px-4 py-3',
      },
    },
  });

  // Default account selection once accounts arrive
  useEffect(() => {
    if (!accountId && accounts && accounts.length > 0) {
      setAccountId(defaultAccountId || accounts[0]!._id);
    }
  }, [accounts, accountId, defaultAccountId]);

  // Reset when `initial` changes (e.g. user clicks reply on a new email).
  useEffect(() => {
    setTo(initial.to);
    setCc(initial.cc);
    setSubject(initial.subject);
    setShowCc(initial.mode === 'replyAll' || !!initial.cc);
    if (initial.accountId) setAccountId(initial.accountId);
    if (editor && initial.quotedBody) {
      editor.commands.setContent(initial.quotedBody);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial.mode, initial.to, initial.cc, initial.subject, initial.quotedBody, initial.accountId]);

  // Auto-save draft every 3s while there are changes.
  useEffect(() => {
    if (!open || !accountId) return;
    const interval = setInterval(() => {
      const bodyHtml = editor?.getHTML() ?? '';
      const snapshot = JSON.stringify({ to, cc, subject, bodyHtml, accountId });
      if (snapshot === lastSavedRef.current) return;
      if (!to && !subject && !bodyHtml.replace(/<[^>]+>/g, '').trim()) return;
      lastSavedRef.current = snapshot;
      void saveDraft({
        draftId: draftId ?? undefined,
        accountId: accountId as Id<'emailAccounts'>,
        to,
        cc,
        subject,
        bodyHtml,
        inReplyToEmailId: initial.inReplyToEmailId
          ? (initial.inReplyToEmailId as Id<'emails'>)
          : undefined,
        mode: initial.mode,
      })
        .then((res) => {
          const id = (res as { _id?: Id<'drafts'> } | undefined)?._id;
          if (id && !draftId) setDraftId(id);
        })
        .catch(() => {
          // Silent — keep UX flowing even when drafts can't save.
        });
    }, 3000);
    return () => clearInterval(interval);
  }, [open, editor, to, cc, subject, accountId, draftId, initial.inReplyToEmailId, initial.mode, saveDraft]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!to.trim() || !accountId) {
      toast.error('Destinataire et compte requis');
      return;
    }
    setSending(true);
    try {
      await sendEmail({
        accountId: accountId as Id<'emailAccounts'>,
        to,
        cc: cc || undefined,
        subject,
        bodyHtml: editor?.getHTML() ?? '',
        inReplyToEmailId: initial.inReplyToEmailId
          ? (initial.inReplyToEmailId as Id<'emails'>)
          : undefined,
      });
      toast.success('Email envoyé');
      onClose();
    } catch (err) {
      toast.error("L'envoi a échoué", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl p-0 gap-0 sm:rounded-lg overflow-hidden">
        <DialogHeader className="px-6 py-3 border-b border-border/50">
          <DialogTitle className="albo-title text-base flex items-center justify-between">
            <span>{composeTitles[initial.mode]}</span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="size-7"
              aria-label="Fermer"
            >
              <X className="size-4" />
            </Button>
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col">
          {/* From */}
          <div className="flex items-center gap-3 border-b border-border/50 px-6 py-2">
            <Label htmlFor="composer-from" className="text-sm text-muted-foreground w-12 shrink-0">
              De
            </Label>
            <select
              id="composer-from"
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="flex h-9 flex-1 rounded-md bg-transparent text-sm focus:outline-none"
            >
              {(!accounts || accounts.length === 0) && (
                <option value="">Aucun compte connecté</option>
              )}
              {accounts?.map((a) => (
                <option key={a._id} value={a._id}>
                  {a.label ? `${a.label} — ${a.email}` : a.email}
                </option>
              ))}
            </select>
          </div>

          {/* To */}
          <div className="flex items-center gap-3 border-b border-border/50 px-6 py-2">
            <Label htmlFor="composer-to" className="text-sm text-muted-foreground w-12 shrink-0">
              À
            </Label>
            <Input
              id="composer-to"
              type="email"
              required
              placeholder="destinataire@email.com"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="border-0 shadow-none focus-visible:ring-0 px-0 h-9"
            />
            {!showCc && (
              <button
                type="button"
                onClick={() => setShowCc(true)}
                className="text-xs text-muted-foreground hover:text-foreground shrink-0"
              >
                Cc
              </button>
            )}
          </div>

          {/* Cc */}
          {showCc && (
            <div className="flex items-center gap-3 border-b border-border/50 px-6 py-2">
              <Label htmlFor="composer-cc" className="text-sm text-muted-foreground w-12 shrink-0">
                Cc
              </Label>
              <Input
                id="composer-cc"
                placeholder="cc@email.com"
                value={cc}
                onChange={(e) => setCc(e.target.value)}
                className="border-0 shadow-none focus-visible:ring-0 px-0 h-9"
              />
            </div>
          )}

          {/* Subject */}
          <div className="flex items-center gap-3 border-b border-border/50 px-6 py-2">
            <Label
              htmlFor="composer-subject"
              className="text-sm text-muted-foreground w-12 shrink-0"
            >
              Objet
            </Label>
            <Input
              id="composer-subject"
              placeholder="Objet du message"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="border-0 shadow-none focus-visible:ring-0 px-0 h-9"
            />
          </div>

          {/* Toolbar */}
          {editor && (
            <div className="flex items-center gap-0.5 border-b border-border/50 px-4 py-1.5">
              <ToolbarButton
                onClick={() => editor.chain().focus().toggleBold().run()}
                isActive={editor.isActive('bold')}
                title="Gras"
              >
                <Bold className="size-4" />
              </ToolbarButton>
              <ToolbarButton
                onClick={() => editor.chain().focus().toggleItalic().run()}
                isActive={editor.isActive('italic')}
                title="Italique"
              >
                <Italic className="size-4" />
              </ToolbarButton>
              <ToolbarButton
                onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
                isActive={editor.isActive('heading', { level: 2 })}
                title="Titre"
              >
                <Heading2 className="size-4" />
              </ToolbarButton>
              <ToolbarButton
                onClick={() => editor.chain().focus().toggleBulletList().run()}
                isActive={editor.isActive('bulletList')}
                title="Liste à puces"
              >
                <List className="size-4" />
              </ToolbarButton>
              <ToolbarButton
                onClick={() => editor.chain().focus().toggleOrderedList().run()}
                isActive={editor.isActive('orderedList')}
                title="Liste numérotée"
              >
                <ListOrdered className="size-4" />
              </ToolbarButton>
              <ToolbarButton
                onClick={() => {
                  const url = window.prompt('URL du lien');
                  if (!url) return;
                  editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
                }}
                isActive={editor.isActive('link')}
                title="Lien"
              >
                <LinkIcon className="size-4" />
              </ToolbarButton>
            </div>
          )}

          {/* Editor */}
          <div className="max-h-[40vh] overflow-y-auto">
            <EditorContent editor={editor} />
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-border/50 px-6 py-3">
            <span className="text-xs text-muted-foreground">
              {draftId ? 'Brouillon enregistré' : 'Auto-save toutes les 3s'}
            </span>
            <Button type="submit" disabled={sending || !to || !accountId}>
              <Send className="size-4 mr-2" />
              {sending ? 'Envoi…' : 'Envoyer'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ToolbarButton({
  onClick,
  isActive,
  children,
  title,
}: {
  onClick: () => void;
  isActive?: boolean;
  children: React.ReactNode;
  title: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={
        isActive
          ? 'rounded p-1.5 bg-accent text-accent-foreground transition-colors'
          : 'rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors'
      }
    >
      {children}
    </button>
  );
}
