import { convexBetterAuthReactStart } from '@convex-dev/better-auth/react-start';

const convexUrl = process.env.VITE_CONVEX_URL;
if (!convexUrl) {
  throw new Error('VITE_CONVEX_URL is not set');
}

function deriveSiteUrl(cloudUrl: string) {
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
  convexSiteUrl: deriveSiteUrl(convexUrl),
});
