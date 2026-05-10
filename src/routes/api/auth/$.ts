import { createFileRoute } from '@tanstack/react-router';
import { convexAuthReactStart } from '~/lib/server/auth-proxy';

/**
 * Catch-all proxy for Better Auth requests.
 * The BA client (running in the browser) calls /api/auth/sign-up/email,
 * /api/auth/get-session, etc. We forward all of these to the Convex BA handler
 * which lives on the Convex site URL. See `src/lib/server/auth-proxy.ts`.
 */
export const Route = createFileRoute('/api/auth/$')({
  server: {
    handlers: {
      GET: ({ request }) => convexAuthReactStart.handler(request),
      POST: ({ request }) => convexAuthReactStart.handler(request),
      PUT: ({ request }) => convexAuthReactStart.handler(request),
      PATCH: ({ request }) => convexAuthReactStart.handler(request),
      DELETE: ({ request }) => convexAuthReactStart.handler(request),
    },
  },
});
