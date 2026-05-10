import { convexBetterAuthReactStart } from '@convex-dev/better-auth/react-start';

const convexUrl = process.env.VITE_CONVEX_URL;
if (!convexUrl) {
  throw new Error('VITE_CONVEX_URL is not set');
}

/**
 * Resolve the Convex *site* URL (where HTTP actions like Better Auth live).
 *   1. If VITE_CONVEX_SITE_URL is set (Convex CLI writes this for both cloud
 *      and anonymous-local deployments), use it as-is.
 *   2. Otherwise derive from the cloud URL by swapping `.convex.cloud` →
 *      `.convex.site`. This fallback only works for cloud deployments; in
 *      local mode the ports differ (3210 vs 3211) so the env var is required.
 */
function resolveSiteUrl(cloudUrl: string): string {
  const explicit = process.env.VITE_CONVEX_SITE_URL;
  if (explicit) return explicit;
  return cloudUrl.replace(/\.convex\.cloud(\/|$)/, '.convex.site$1');
}

/**
 * Server-side helper that proxies /api/auth/* TanStack Start requests to the
 * Better Auth handler running on Convex. Used by `src/routes/api/auth/$.ts`.
 *
 * Exposes:
 *   - `handler(request)` → forwards request to Convex /api/auth/*
 *   - `getToken()` → returns the current Convex JWT (after BA validates the cookie)
 *   - `fetchAuthQuery / fetchAuthMutation / fetchAuthAction` → call Convex with auth
 */
export const convexAuthReactStart = convexBetterAuthReactStart({
  convexUrl,
  convexSiteUrl: resolveSiteUrl(convexUrl),
});
