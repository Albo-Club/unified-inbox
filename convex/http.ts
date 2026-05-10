import { httpRouter } from 'convex/server';
import { authComponent, createAuth } from './auth';

const http = httpRouter();

/* ============================================================================
 * Better Auth HTTP routes
 *
 * The component registers everything under `/api/auth/*` plus the well-known
 * OpenID configuration. The chat AI uses a Convex action (`api.agent.sendMessage`)
 * directly, so we don't need a separate /api/chat HTTP route.
 * ========================================================================= */

authComponent.registerRoutes(http, createAuth, {
  cors: {
    allowedOrigins: [process.env.BETTER_AUTH_URL ?? 'http://localhost:3000'],
  },
});

export default http;
