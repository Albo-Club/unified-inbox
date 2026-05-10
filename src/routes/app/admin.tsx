import { createFileRoute, Navigate } from '@tanstack/react-router';
import { api } from '@convex/_generated/api';
import { useQuery } from 'convex/react';

export const Route = createFileRoute('/app/admin')({
  component: AdminPage,
});

function AdminPage() {
  const me = useQuery(api.users.me, {});
  const stats = useQuery(api.users.getStatsAdmin, {});
  const users = useQuery(api.users.listAllAdmin, {});

  if (!me || me.kind !== 'ready') return null;
  if (me.role !== 'admin') return <Navigate to="/app" replace />;

  return (
    <div className="mx-auto max-w-4xl px-8 py-10">
      <h1 className="albo-h2 mb-1">Admin</h1>
      <p className="albo-paragraph text-muted-foreground mb-8">
        You see this because you were the first user to sign up.
      </p>

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
          <Stat label="Users" value={stats.totalUsers} />
          <Stat label="Admins" value={stats.totalAdmins} />
          <Stat label="Todos" value={stats.totalTodos} />
          <Stat label="Done" value={stats.doneTodos} />
        </div>
      )}

      <h2 className="albo-title mb-3">Users</h2>
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Email</th>
              <th className="text-left px-4 py-3 font-medium">Name</th>
              <th className="text-left px-4 py-3 font-medium">Role</th>
              <th className="text-left px-4 py-3 font-medium">Created</th>
            </tr>
          </thead>
          <tbody>
            {users?.map((u) => (
              <tr key={u._id} className="border-t border-border/50">
                <td className="px-4 py-3">{u.email}</td>
                <td className="px-4 py-3">{u.name ?? '—'}</td>
                <td className="px-4 py-3">
                  <span
                    className={
                      u.role === 'admin'
                        ? 'inline-flex items-center rounded-full bg-primary/10 text-primary px-2 py-0.5 text-xs font-medium'
                        : 'inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground'
                    }
                  >
                    {u.role}
                  </span>
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {new Date(u.createdAt).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-card px-5 py-4">
      <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="albo-h3 mt-1">{value}</p>
    </div>
  );
}
