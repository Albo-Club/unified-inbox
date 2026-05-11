import { api } from '@convex/_generated/api';
import { useQuery } from 'convex/react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useCallback, useMemo } from 'react';
import { z } from 'zod';
import { MailFolderNav } from '~/components/mail/MailFolderNav';
import { EmailList } from '~/components/mail/EmailList';
import { EmailView } from '~/components/mail/EmailView';
import { EmailComposer } from '~/components/mail/EmailComposer';
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '~/components/ui/resizable';
import { TooltipProvider } from '~/components/ui/tooltip';
import type { ComposeMode, ComposeState, EmailFolder } from '~/types/email';
import { buildComposeState } from '~/types/email';

const FOLDER_VALUES = ['inbox', 'sent', 'trash', 'archive', 'starred', 'all'] as const;
const COMPOSE_VALUES = ['new', 'reply', 'replyAll', 'forward'] as const;

const mailSearchSchema = z.object({
  folder: z.enum(FOLDER_VALUES).default('inbox').catch('inbox'),
  id: z.string().optional(),
  compose: z.enum(COMPOSE_VALUES).optional(),
});

type MailSearch = z.infer<typeof mailSearchSchema>;

export const Route = createFileRoute('/app/mail')({
  validateSearch: (search): MailSearch => mailSearchSchema.parse(search),
  component: MailPage,
});

type ListableFolder = 'inbox' | 'sent' | 'trash' | 'starred' | 'all';
function toListableFolder(f: EmailFolder): ListableFolder {
  return f === 'archive' ? 'all' : (f as ListableFolder);
}

function MailPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });

  const folder: EmailFolder = search.folder;
  const selectedId = search.id;
  const composeMode = search.compose;

  const meQuery = useQuery(api.users.me, {});
  const myEmail = meQuery && meQuery.kind === 'ready' ? meQuery.email : '';

  const emails = useQuery(api.emails.listByFolder, {
    folder: toListableFolder(folder),
  });

  const selectedEmail = useMemo(
    () => emails?.find((e) => e._id === selectedId),
    [emails, selectedId],
  );

  const setFolder = useCallback(
    (next: EmailFolder) => {
      void navigate({
        search: (prev: MailSearch) => ({ ...prev, folder: next, id: undefined }),
      });
    },
    [navigate],
  );

  const setSelected = useCallback(
    (id: string | undefined) => {
      void navigate({ search: (prev: MailSearch) => ({ ...prev, id }) });
    },
    [navigate],
  );

  const openCompose = useCallback(
    (mode: ComposeMode) => {
      void navigate({ search: (prev: MailSearch) => ({ ...prev, compose: mode }) });
    },
    [navigate],
  );

  const closeCompose = useCallback(() => {
    void navigate({ search: (prev: MailSearch) => ({ ...prev, compose: undefined }) });
  }, [navigate]);

  const composeInitial: ComposeState | null = useMemo(() => {
    if (!composeMode) return null;
    if (composeMode === 'new' || !selectedEmail) {
      return {
        mode: composeMode,
        to: '',
        cc: '',
        subject: '',
        quotedBody: '<p></p>',
        accountId: selectedEmail?.accountId ?? '',
      };
    }
    return buildComposeState(composeMode, selectedEmail, '', myEmail);
  }, [composeMode, selectedEmail, myEmail]);

  return (
    <TooltipProvider delayDuration={0}>
      <ResizablePanelGroup direction="horizontal" className="h-full items-stretch">
        <ResizablePanel defaultSize={20} minSize={15} maxSize={25}>
          <MailFolderNav currentFolder={folder} onSelectFolder={setFolder} />
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={32} minSize={28}>
          <EmailList
            folder={folder}
            selectedId={selectedId}
            onSelect={(id) => setSelected(id)}
          />
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={48}>
          <EmailView
            emailId={selectedId ?? ''}
            email={selectedEmail}
            onReply={() => openCompose('reply')}
            onReplyAll={() => openCompose('replyAll')}
            onForward={() => openCompose('forward')}
            onClose={() => setSelected(undefined)}
          />
        </ResizablePanel>
      </ResizablePanelGroup>

      {composeMode && composeInitial && (
        <EmailComposer
          open
          onClose={closeCompose}
          initial={composeInitial}
          defaultAccountId={selectedEmail?.accountId}
        />
      )}
    </TooltipProvider>
  );
}
