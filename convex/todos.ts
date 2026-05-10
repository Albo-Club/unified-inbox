import { ConvexError, v } from 'convex/values';
import { mutation, query, type MutationCtx, type QueryCtx } from './_generated/server';
import type { Id } from './_generated/dataModel';
import { requireAppUser } from './users';

/* List the current user's todos, newest first. */
export const listMine = query({
  args: { onlyOpen: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const user = await requireAppUser(ctx);
    const all = await ctx.db
      .query('todos')
      .withIndex('by_user', (q) => q.eq('userId', user._id))
      .order('desc')
      .collect();
    const filtered = args.onlyOpen ? all.filter((t) => !t.done) : all;
    return filtered.map((t) => ({
      _id: t._id,
      title: t.title,
      notes: t.notes,
      done: t.done,
      dueAt: t.dueAt ?? null,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    }));
  },
});

/* Create a new todo for the current user. */
export const create = mutation({
  args: {
    title: v.string(),
    notes: v.optional(v.string()),
    dueAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireAppUser(ctx);
    const title = args.title.trim();
    if (!title) {
      throw new ConvexError({ code: 'BAD_REQUEST', message: 'Title is required' });
    }
    const now = Date.now();
    const id = await ctx.db.insert('todos', {
      userId: user._id,
      title,
      notes: args.notes ?? '',
      done: false,
      dueAt: args.dueAt,
      createdAt: now,
      updatedAt: now,
    });
    return { _id: id };
  },
});

async function loadOwnedTodo(ctx: QueryCtx | MutationCtx, todoId: Id<'todos'>) {
  const user = await requireAppUser(ctx);
  const todo = await ctx.db.get(todoId);
  if (!todo) {
    throw new ConvexError({ code: 'NOT_FOUND', message: 'Todo not found' });
  }
  if (todo.userId !== user._id) {
    throw new ConvexError({ code: 'FORBIDDEN', message: 'Not your todo' });
  }
  return { user, todo };
}

/* Update fields on a todo (title / notes / dueAt). */
export const update = mutation({
  args: {
    id: v.id('todos'),
    title: v.optional(v.string()),
    notes: v.optional(v.string()),
    dueAt: v.optional(v.union(v.number(), v.null())),
  },
  handler: async (ctx, args) => {
    const { todo } = await loadOwnedTodo(ctx, args.id);
    const patch: {
      title?: string;
      notes?: string;
      dueAt?: number | undefined;
      updatedAt: number;
    } = { updatedAt: Date.now() };
    if (args.title !== undefined) {
      const t = args.title.trim();
      if (!t) throw new ConvexError({ code: 'BAD_REQUEST', message: 'Title cannot be empty' });
      patch.title = t;
    }
    if (args.notes !== undefined) patch.notes = args.notes;
    if (args.dueAt !== undefined) patch.dueAt = args.dueAt ?? undefined;
    await ctx.db.patch(todo._id, patch);
    return { success: true };
  },
});

/* Toggle done state. */
export const toggle = mutation({
  args: { id: v.id('todos') },
  handler: async (ctx, args) => {
    const { todo } = await loadOwnedTodo(ctx, args.id);
    await ctx.db.patch(todo._id, { done: !todo.done, updatedAt: Date.now() });
    return { success: true, done: !todo.done };
  },
});

/* Delete a todo. */
export const remove = mutation({
  args: { id: v.id('todos') },
  handler: async (ctx, args) => {
    const { todo } = await loadOwnedTodo(ctx, args.id);
    await ctx.db.delete(todo._id);
    return { success: true };
  },
});

/* Search todos by title substring (case-insensitive). Used by the AI agent. */
export const search = query({
  args: {
    query: v.optional(v.string()),
    done: v.optional(v.boolean()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireAppUser(ctx);
    const all = await ctx.db
      .query('todos')
      .withIndex('by_user', (q) => q.eq('userId', user._id))
      .order('desc')
      .collect();
    const q = (args.query ?? '').trim().toLowerCase();
    const filtered = all
      .filter((t) => (args.done === undefined ? true : t.done === args.done))
      .filter((t) =>
        q ? t.title.toLowerCase().includes(q) || t.notes.toLowerCase().includes(q) : true,
      )
      .slice(0, args.limit ?? 20);
    return filtered.map((t) => ({
      _id: t._id,
      title: t.title,
      notes: t.notes,
      done: t.done,
      dueAt: t.dueAt ?? null,
    }));
  },
});

/* Stats for the current user. Used by the AI agent. */
export const getMyStats = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireAppUser(ctx);
    const all = await ctx.db
      .query('todos')
      .withIndex('by_user', (q) => q.eq('userId', user._id))
      .collect();
    const now = Date.now();
    return {
      total: all.length,
      done: all.filter((t) => t.done).length,
      open: all.filter((t) => !t.done).length,
      overdue: all.filter((t) => !t.done && t.dueAt && t.dueAt < now).length,
    };
  },
});
