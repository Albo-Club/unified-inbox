import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { useMutation, useQuery } from 'convex/react';
import { useEffect, useState, type FormEvent } from 'react';
import { z } from 'zod';
import { Mail, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';

const settingsSearchSchema = z.object({
  gmailConnected: z.union([z.literal('0'), z.literal('1')]).optional(),
});

type SettingsSearch = z.infer<typeof settingsSearchSchema>;

export const Route = createFileRoute('/app/settings')({
  validateSearch: (s): SettingsSearch => settingsSearchSchema.parse(s),
  component: SettingsPage,
});

type Account = {
  _id: Id<'emailAccounts'>;
  email: string;
  label?: string | null;
  authType?: 'oauth' | 'imap' | string;
  status?: string;
  lastSyncAt?: number | null;
};

function SettingsPage() {
  const me = useQuery(api.users.me, {});
  const update = useMutation(api.users.updateMyProfile);
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });

  const [name, setName] = useState('');
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    if (me && me.kind === 'ready') {
      setName(me.name ?? '');
    }
  }, [me]);

  // Toast on OAuth callback redirect
  useEffect(() => {
    if (search.gmailConnected === '1') {
      toast.success('Compte Gmail connecté');
      void navigate({ search: () => ({}), replace: true });
    } else if (search.gmailConnected === '0') {
      toast.error('La connexion Gmail a échoué');
      void navigate({ search: () => ({}), replace: true });
    }
  }, [search.gmailConnected, navigate]);

  if (!me || me.kind !== 'ready') return null;

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    await update({ name: name.trim() });
    setSavedAt(Date.now());
  }

  return (
    <div className="mx-auto max-w-2xl px-8 py-10 space-y-12">
      <section>
        <h1 className="albo-h2 mb-1">Settings</h1>
        <p className="albo-paragraph text-muted-foreground mb-8">Manage your profile.</p>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" value={me.email} disabled readOnly />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="name">Display name</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="flex items-center gap-3">
            <Button type="submit">Save</Button>
            {savedAt && Date.now() - savedAt < 3000 && (
              <span className="text-sm text-muted-foreground">Saved.</span>
            )}
          </div>
        </form>
      </section>

      <EmailAccountsSection />
    </div>
  );
}

function EmailAccountsSection() {
  const accounts = useQuery(api.emailAccounts.listMine, {}) as Account[] | undefined;
  const addImap = useMutation(api.emailAccounts.addImapAccount);
  const removeAccount = useMutation(api.emailAccounts.removeAccount);

  const [imapOpen, setImapOpen] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<Account | null>(null);

  function handleStartOAuth() {
    // The Convex backend exposes the OAuth flow as `internal.gmail.startOAuthFlow`,
    // not a public action. Direct browser navigation to the start endpoint would
    // require a public wrapper. Until that's exposed, show a helpful toast.
    toast.info('La connexion OAuth Gmail arrive bientôt', {
      description: 'Utilise un mot de passe d’application IMAP en attendant.',
    });
  }

  async function handleRemove(account: Account) {
    try {
      await removeAccount({ accountId: account._id });
      toast.success('Compte supprimé');
    } catch (err) {
      toast.error('Suppression impossible', {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setConfirmRemove(null);
    }
  }

  return (
    <section id="email-accounts" className="scroll-mt-10">
      <h2 className="albo-title text-xl mb-1">Comptes email</h2>
      <p className="albo-paragraph text-muted-foreground mb-6">
        Connecte un ou plusieurs comptes pour les agréger dans la boîte unifiée.
      </p>

      <div className="space-y-2 mb-6">
        {accounts === undefined && (
          <div className="text-sm text-muted-foreground">Chargement…</div>
        )}
        {accounts && accounts.length === 0 && (
          <div className="rounded-md border border-dashed border-border/60 px-4 py-6 text-sm text-muted-foreground text-center">
            Aucun compte connecté pour l&apos;instant.
          </div>
        )}
        {accounts?.map((a) => (
          <div
            key={a._id}
            className="flex items-center gap-3 rounded-md border border-border/50 bg-card px-4 py-3"
          >
            <Mail className="size-4 text-muted-foreground" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium truncate">{a.email}</span>
                {a.label && (
                  <span className="text-xs text-muted-foreground">— {a.label}</span>
                )}
              </div>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant={a.authType === 'oauth' ? 'secondary' : 'outline'}>
                  {a.authType === 'oauth' ? 'OAuth' : 'IMAP'}
                </Badge>
                <Badge variant={a.status === 'active' ? 'success' : 'outline'}>
                  {a.status ?? 'unknown'}
                </Badge>
                {a.lastSyncAt && (
                  <span className="text-xs text-muted-foreground">
                    sync: {new Date(a.lastSyncAt).toLocaleString('fr-FR')}
                  </span>
                )}
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setConfirmRemove(a)}
              title="Supprimer le compte"
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button onClick={handleStartOAuth}>
          <Plus className="size-4 mr-2" />
          Connecter Gmail (OAuth)
        </Button>
        <Button variant="outline" onClick={() => setImapOpen(true)}>
          <Plus className="size-4 mr-2" />
          Ajouter un compte IMAP (App Password)
        </Button>
      </div>

      <ImapAccountDialog
        open={imapOpen}
        onOpenChange={setImapOpen}
        onAdd={async (payload) => {
          try {
            await addImap(payload);
            toast.success('Compte IMAP ajouté');
            setImapOpen(false);
          } catch (err) {
            toast.error("Échec de l'ajout", {
              description: err instanceof Error ? err.message : undefined,
            });
          }
        }}
      />

      <Dialog open={!!confirmRemove} onOpenChange={(o) => !o && setConfirmRemove(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Supprimer ce compte ?</DialogTitle>
            <DialogDescription>
              {confirmRemove?.email} sera déconnecté. Les emails déjà synchronisés ne seront plus
              accessibles depuis Albo. Cette action est irréversible.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmRemove(null)}>
              Annuler
            </Button>
            <Button
              variant="destructive"
              onClick={() => confirmRemove && handleRemove(confirmRemove)}
            >
              Supprimer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function ImapAccountDialog({
  open,
  onOpenChange,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onAdd: (payload: {
    email: string;
    label: string;
    appPassword: string;
    imapHost?: string;
    smtpHost?: string;
  }) => Promise<void>;
}) {
  const [email, setEmail] = useState('');
  const [label, setLabel] = useState('');
  const [password, setPassword] = useState('');
  const [imapHost, setImapHost] = useState('');
  const [smtpHost, setSmtpHost] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      setEmail('');
      setLabel('');
      setPassword('');
      setImapHost('');
      setSmtpHost('');
    }
  }, [open]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await onAdd({
        email: email.trim(),
        label: label.trim(),
        appPassword: password,
        imapHost: imapHost.trim() || undefined,
        smtpHost: smtpHost.trim() || undefined,
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Connecter un compte IMAP</DialogTitle>
          <DialogDescription>
            Utilise un mot de passe d&apos;application Gmail ou les identifiants IMAP/SMTP d&apos;un
            autre fournisseur.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="imap-email">Email</Label>
            <Input
              id="imap-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="prenom@example.com"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="imap-label">Libellé (optionnel)</Label>
            <Input
              id="imap-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Perso / Pro / …"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="imap-password">Mot de passe d&apos;application</Label>
            <Input
              id="imap-password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="off"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="imap-host">Hôte IMAP</Label>
              <Input
                id="imap-host"
                value={imapHost}
                onChange={(e) => setImapHost(e.target.value)}
                placeholder="imap.gmail.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="smtp-host">Hôte SMTP</Label>
              <Input
                id="smtp-host"
                value={smtpHost}
                onChange={(e) => setSmtpHost(e.target.value)}
                placeholder="smtp.gmail.com"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Ajout…' : 'Ajouter'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
