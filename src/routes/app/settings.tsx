import { createFileRoute } from '@tanstack/react-router';
import { api } from '@convex/_generated/api';
import { useMutation, useQuery } from 'convex/react';
import { useEffect, useState, type FormEvent } from 'react';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';

export const Route = createFileRoute('/app/settings')({
  component: SettingsPage,
});

function SettingsPage() {
  const me = useQuery(api.users.me, {});
  const update = useMutation(api.users.updateMyProfile);
  const [name, setName] = useState('');
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    if (me && me.kind === 'ready') {
      setName(me.name ?? '');
    }
  }, [me]);

  if (!me || me.kind !== 'ready') return null;

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    await update({ name: name.trim() });
    setSavedAt(Date.now());
  }

  return (
    <div className="mx-auto max-w-xl px-8 py-10">
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
    </div>
  );
}
