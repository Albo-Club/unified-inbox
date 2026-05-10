import { createFileRoute, Link, Navigate, Outlet, useLocation } from '@tanstack/react-router';
import { api } from '@convex/_generated/api';
import { useMutation, useQuery } from 'convex/react';
import { useEffect } from 'react';
import { Check, LayoutDashboard, LogOut, Settings as SettingsIcon, Shield } from 'lucide-react';
import { authClient, useSession } from '~/lib/auth-client';
import { Button } from '~/components/ui/button';
import { ChatSidebar } from '~/components/ai/ChatSidebar';
import { cn } from '~/lib/utils';

export const Route = createFileRoute('/app')({
  component: AppLayout,
});

function AppLayout() {
  const { data: session, isPending: sessionLoading } = useSession();
  const me = useQuery(api.users.me, sessionLoading || !session?.user ? 'skip' : {});
  const provisionMe = useMutation(api.users.provisionMe);
  const location = useLocation();

  /* Lazy provisioning: first time the user lands on /app after signup, the
   * `me` query returns `{ kind: 'unprovisioned' }`. Call `provisionMe` once to
   * create the app user row + assign role. The query then re-runs and returns
   * the full `ready` payload. */
  useEffect(() => {
    if (me && me.kind === 'unprovisioned') {
      void provisionMe({});
    }
  }, [me, provisionMe]);

  if (sessionLoading) {
    return <FullPageSpinner label="Loading…" />;
  }

  if (!session?.user) {
    return <Navigate to="/login" replace />;
  }

  if (!me || me.kind === 'unprovisioned') {
    return <FullPageSpinner label="Setting up your account…" />;
  }

  const isAdmin = me.role === 'admin';

  return (
    <div className="min-h-screen bg-background text-foreground flex">
      {/* Left nav */}
      <aside className="w-56 border-r border-border/50 bg-card flex flex-col">
        <Link to="/app" className="albo-title block px-6 py-5 border-b border-border/50">
          Albo MVP
        </Link>
        <nav className="flex-1 px-3 py-4 space-y-1">
          <NavItem
            to="/app"
            label="Todos"
            icon={<LayoutDashboard className="size-4" />}
            current={location.pathname === '/app'}
          />
          <NavItem
            to="/app/settings"
            label="Settings"
            icon={<SettingsIcon className="size-4" />}
            current={location.pathname.startsWith('/app/settings')}
          />
          {isAdmin && (
            <NavItem
              to="/app/admin"
              label="Admin"
              icon={<Shield className="size-4" />}
              current={location.pathname.startsWith('/app/admin')}
            />
          )}
        </nav>
        <div className="px-3 py-4 border-t border-border/50">
          <div className="px-3 py-2 mb-2">
            <p className="text-sm font-medium truncate">{me.name || me.email}</p>
            <p className="text-xs text-muted-foreground truncate">{me.email}</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start"
            onClick={async () => {
              await authClient.signOut();
              window.location.href = '/';
            }}
          >
            <LogOut className="size-4 mr-2" />
            Sign out
          </Button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>

      {/* Right AI sidebar */}
      <aside className="w-[380px] border-l border-border/50 bg-card hidden lg:flex flex-col">
        <ChatSidebar />
      </aside>
    </div>
  );
}

function NavItem({
  to,
  label,
  icon,
  current,
}: {
  to: string;
  label: string;
  icon: React.ReactNode;
  current: boolean;
}) {
  return (
    <Link
      to={to}
      className={cn(
        'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
        current
          ? 'bg-primary/10 text-foreground font-medium'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      {icon}
      <span>{label}</span>
    </Link>
  );
}

function FullPageSpinner({ label }: { label: string }) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="flex items-center gap-3 text-muted-foreground">
        <Check className="size-4 animate-spin" />
        <span className="albo-paragraph">{label}</span>
      </div>
    </div>
  );
}
