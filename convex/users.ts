import { ConvexError, v } from 'convex/values';
import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from './_generated/server';
import { authComponent } from './auth';

/* ============================================================================
 * Lazy provisioning of the app-level `users` row.
 *
 * The first time a freshly-signed-up user lands on /app, the client calls
 * `provisionMe` once (controlled by the `me` query result). That mutation
 * creates the corresponding row in our app `users` table and assigns
 * role 'admin' if there are no other users yet.
 *
 * If `me` returns null → not signed in (Better Auth has no session).
 * If `me` returns { kind: 'unprovisioned' } → call `provisionMe`, then re-query.
 * If `me` returns the full user object → ready to use.
 * ========================================================================= */

async function findAppUserByAuthId(ctx: QueryCtx | MutationCtx, authUserId: string) {
  return await ctx.db
    .query('users')
    .withIndex('by_auth_user_id', (q) => q.eq('authUserId', authUserId))
    .unique();
}

/** Get the current signed-in user's app profile. */
export const me = query({
  args: {},
  handler: async (
    ctx,
  ): Promise<
    | null
    | { kind: 'unprovisioned'; email: string; name: string | null }
    | {
        kind: 'ready';
        _id: string;
        email: string;
        name: string | null;
        role: 'admin' | 'user';
      }
  > => {
    const authUser = (await authComponent.safeGetAuthUser(ctx)) as
      | { _id: string; email?: string; name?: string }
      | null
      | undefined;
    if (!authUser) return null;

    const appUser = await findAppUserByAuthId(ctx, authUser._id);
    if (!appUser) {
      return {
        kind: 'unprovisioned',
        email: authUser.email ?? '',
        name: typeof authUser.name === 'string' ? authUser.name : null,
      };
    }

    return {
      kind: 'ready',
      _id: appUser._id,
      email: appUser.email,
      name: appUser.name ?? null,
      role: appUser.role,
    };
  },
});

/** Idempotent: create the app-level user row for the currently signed-in auth user. */
export const provisionMe = mutation({
  args: {},
  handler: async (ctx): Promise<{ _id: string; role: 'admin' | 'user' }> => {
    const authUser = (await authComponent.safeGetAuthUser(ctx)) as
      | { _id: string; email?: string; name?: string }
      | null
      | undefined;
    if (!authUser) {
      throw new ConvexError({ code: 'UNAUTHENTICATED', message: 'Not signed in' });
    }

    const existing = await findAppUserByAuthId(ctx, authUser._id);
    if (existing) {
      return { _id: existing._id, role: existing.role };
    }

    // First-ever user becomes admin.
    const anyExisting = await ctx.db.query('users').take(1);
    const role: 'admin' | 'user' = anyExisting.length === 0 ? 'admin' : 'user';

    const now = Date.now();
    const id = await ctx.db.insert('users', {
      authUserId: authUser._id,
      email: authUser.email ?? '',
      name: typeof authUser.name === 'string' ? authUser.name : undefined,
      role,
      createdAt: now,
      updatedAt: now,
    });
    return { _id: id, role };
  },
});

/** Internal helper used by emails.ts, emailAccounts.ts, and agent.ts. Throws if not signed in or not provisioned. */
export async function requireAppUser(ctx: QueryCtx | MutationCtx) {
  const authUser = (await authComponent.safeGetAuthUser(ctx)) as { _id: string } | null | undefined;
  if (!authUser) {
    throw new ConvexError({ code: 'UNAUTHENTICATED', message: 'Not signed in' });
  }
  const appUser = await findAppUserByAuthId(ctx, authUser._id);
  if (!appUser) {
    throw new ConvexError({
      code: 'NOT_PROVISIONED',
      message: 'App user not yet provisioned. Call provisionMe first.',
    });
  }
  return appUser;
}

async function requireAdmin(ctx: QueryCtx | MutationCtx) {
  const user = await requireAppUser(ctx);
  if (user.role !== 'admin') {
    throw new ConvexError({ code: 'FORBIDDEN', message: 'Admin access required' });
  }
  return user;
}

/** Admin-only: list all app users. */
export const listAllAdmin = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const users = await ctx.db.query('users').collect();
    return users
      .map((u) => ({
        _id: u._id,
        email: u.email,
        name: u.name ?? null,
        role: u.role,
        createdAt: u.createdAt,
      }))
      .sort((a, b) => b.createdAt - a.createdAt);
  },
});

/** Admin-only: aggregate stats. */
export const getStatsAdmin = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const [users, accounts, emails] = await Promise.all([
      ctx.db.query('users').collect(),
      ctx.db.query('emailAccounts').collect(),
      ctx.db.query('emails').collect(),
    ]);
    return {
      totalUsers: users.length,
      totalAdmins: users.filter((u) => u.role === 'admin').length,
      totalAccounts: accounts.length,
      totalEmails: emails.length,
    };
  },
});

/** Update current user's name. */
export const updateMyProfile = mutation({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    const user = await requireAppUser(ctx);
    await ctx.db.patch(user._id, {
      name: args.name.trim() || undefined,
      updatedAt: Date.now(),
    });
    return { success: true };
  },
});
