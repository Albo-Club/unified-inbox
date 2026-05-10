import { httpRouter } from 'convex/server';
import { httpAction } from './_generated/server';
import { authComponent, createAuth } from './auth';
import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';

const http = httpRouter();

/* ============================================================================
 * Better Auth HTTP routes
 * ========================================================================= */

authComponent.registerRoutes(http, createAuth, {
  cors: {
    allowedOrigins: [process.env.BETTER_AUTH_URL ?? 'http://localhost:3000'],
  },
});

/* ============================================================================
 * Google OAuth callback — exchange `code` for tokens, upsert account.
 *
 * The frontend opens the consent URL (built via internal.gmail.buildAuthUrl)
 * with the user's encrypted state embedded. Google redirects here with `code`
 * and `state` query params.
 * ========================================================================= */

http.route({
  path: '/api/oauth/google/callback',
  method: 'GET',
  handler: httpAction(async (ctx, req) => {
    const url = new URL(req.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const baseUrl = process.env.BETTER_AUTH_URL ?? 'http://localhost:3000';

    if (!code || !state) {
      return Response.redirect(`${baseUrl}/app/settings?gmailConnected=0`, 302);
    }

    try {
      await ctx.runAction(internal.gmail.completeOAuth, {
        code,
        stateEncrypted: state,
      });
      return Response.redirect(`${baseUrl}/app/settings?gmailConnected=1`, 302);
    } catch (err) {
      console.error('[oauth/google/callback] failed:', err);
      return Response.redirect(`${baseUrl}/app/settings?gmailConnected=0`, 302);
    }
  }),
});

/* ============================================================================
 * Gmail Pub/Sub push webhook (POST /gmail/push)
 *
 * Setup is manual:
 *   1. Enable Gmail API + Pub/Sub in Google Cloud Console
 *   2. Create a Pub/Sub topic and grant `gmail-api-push@system.gserviceaccount.com`
 *      Publisher rights on it.
 *   3. Create a push subscription with the endpoint set to:
 *        <CONVEX_HTTP_URL>/gmail/push
 *   4. Call gmail.users.watch({ userId: 'me', requestBody: { topicName, labelIds: ['INBOX'] } })
 *      from the per-account onboarding flow (TODO — not wired automatically).
 *
 * Body shape (decoded):
 *   { emailAddress: "user@example.com", historyId: "12345" }
 * ========================================================================= */

http.route({
  path: '/gmail/push',
  method: 'POST',
  handler: httpAction(async (ctx, req) => {
    try {
      const payload = (await req.json()) as { message?: { data?: string } };
      const data = payload.message?.data;
      if (!data) return new Response('No data', { status: 204 });

      const json = (typeof Buffer !== 'undefined'
        ? Buffer.from(data, 'base64').toString('utf-8')
        : atob(data));
      const decoded = JSON.parse(json) as { emailAddress?: string; historyId?: string };
      if (!decoded.emailAddress) return new Response('No emailAddress', { status: 204 });

      const account = (await ctx.runMutation(internal.emailAccounts.getByEmail, {
        email: decoded.emailAddress,
      })) as { _id: Id<'emailAccounts'>; authType: 'oauth' | 'imap' } | null;
      if (!account) return new Response('Unknown account', { status: 204 });

      if (account.authType === 'oauth') {
        await ctx.scheduler.runAfter(0, internal.gmail.syncAccount, {
          accountId: account._id,
        });
      }
      return new Response('OK', { status: 200 });
    } catch (err) {
      console.error('[/gmail/push] failed:', err);
      return new Response('Error', { status: 500 });
    }
  }),
});

export default http;
