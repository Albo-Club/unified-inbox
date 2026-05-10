import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

/**
 * App-level schema. Better Auth user/session/account/jwks tables live in the
 * `betterAuth` component (see `convex/convex.config.ts`), not here.
 *
 * Our `users` table is the *application* user — we mirror it from Better Auth
 * via a trigger (see `convex/auth.ts`) and add app-level fields like `role`.
 */
export default defineSchema({
  /** Application user. One row per Better Auth user, created via trigger on signup. */
  users: defineTable({
    authUserId: v.string(),
    email: v.string(),
    name: v.optional(v.string()),
    role: v.union(v.literal('admin'), v.literal('user')),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_auth_user_id', ['authUserId'])
    .index('by_email', ['email']),

  /** A simple to-do with optional notes. Demo feature for the MVP. */
  todos: defineTable({
    userId: v.id('users'),
    title: v.string(),
    notes: v.string(), // markdown body, can be ''
    done: v.boolean(),
    dueAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_user', ['userId'])
    .index('by_user_done', ['userId', 'done']),
});
