'use node';

import {
  type CreateAuth as ConvexBetterAuthCreateAuth,
  createClient,
  type GenericCtx,
} from '@convex-dev/better-auth';
import { convex } from '@convex-dev/better-auth/plugins';
import { betterAuth } from 'better-auth';
import { components } from './_generated/api';
import type { DataModel } from './_generated/dataModel';
import authConfig from './auth.config';

/**
 * Better Auth client wired to Convex.
 *
 * - email + password signup with NO forced verification, NO forced MFA
 * - Auto sign-in after signup (`autoSignIn: true`) → user lands in /app immediately
 * - First user created becomes admin via lazy provisioning in `users.provisionMe`
 *   (called once from the client when `me` query returns the not-yet-provisioned
 *   sentinel)
 *
 * To require email verification on a per-project basis, flip `requireEmailVerification: true`
 * below AND set RESEND_API_KEY + RESEND_EMAIL_SENDER in Convex env.
 *
 * Why lazy provisioning instead of triggers?
 *   `@convex-dev/better-auth` v0.12 has a typing constraint that makes inline
 *   `triggers` callbacks create a circular type-inference loop with `internal.users.*`.
 *   Lazy provisioning is also more robust: if a trigger fails, the user is still
 *   created on first /app load.
 */
export const authComponent: ReturnType<typeof createClient<DataModel>> = createClient<DataModel>(
  components.betterAuth,
  {
    verbose: false,
  },
);

export const createAuth: ConvexBetterAuthCreateAuth<DataModel> = (ctx) => {
  const baseURL = process.env.BETTER_AUTH_URL ?? 'http://localhost:3000';
  const secret = process.env.BETTER_AUTH_SECRET ?? '';

  if (!secret) {
    console.warn(
      '[auth] BETTER_AUTH_SECRET not set — auth will fail. Run `pnpm exec convex env set BETTER_AUTH_SECRET <hex>`.',
    );
  }

  return betterAuth({
    baseURL,
    secret,
    database: authComponent.adapter(ctx),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
      autoSignIn: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
    },
    plugins: [
      // The convex plugin issues JWTs that Convex's auth.config.ts can verify.
      // We don't load BA's `admin` plugin — admin role is handled in our own
      // `users` table (first user becomes admin via lazy provisioning in users.ts).
      //
      // jwks: only pass when it's a real key set, NOT when it's the empty
      // placeholder `[]` that the bootstrap script uses just to satisfy Convex's
      // env-var-must-exist constraint on auth.config.ts. With `[]`, BA's convex
      // plugin throws "Not implemented" when minting tokens because static-mode
      // disables key generation. Leaving jwks undefined lets BA generate keys
      // on-the-fly and store them in its own `jwks` table — no chicken-and-egg.
      convex({ authConfig, jwks: parseStaticJwks(process.env.JWKS) }),
    ],
  });
};

/** Returns undefined when JWKS env is unset OR is the empty-array placeholder. */
function parseStaticJwks(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length === 0) return undefined;
    return raw;
  } catch {
    return undefined;
  }
}

/** Returns the current Better Auth user (or null). For queries / mutations / actions. */
export async function getAuthUserOrNull(ctx: GenericCtx<DataModel>) {
  return await authComponent.safeGetAuthUser(ctx);
}

/** Returns the current Better Auth user, throws UNAUTHENTICATED if missing. */
export async function getAuthUserOrThrow(ctx: GenericCtx<DataModel>) {
  return await authComponent.getAuthUser(ctx);
}
