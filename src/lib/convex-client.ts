import { ConvexReactClient } from 'convex/react';

const convexUrl = import.meta.env.VITE_CONVEX_URL;

if (!convexUrl) {
  throw new Error(
    'VITE_CONVEX_URL is not set. Run `pnpm exec convex dev --once` to provision a deployment.',
  );
}

export const convex = new ConvexReactClient(convexUrl);

/** Convex HTTP site URL (e.g. for the /api/chat endpoint). */
export function deriveConvexSiteUrl(cloudUrl: string): string {
  // Convex cloud URL format: https://<slug>.convex.cloud → site URL https://<slug>.convex.site
  // EU cloud: https://<slug>.eu-west-1.convex.cloud → https://<slug>.eu-west-1.convex.site
  return cloudUrl.replace(/\.convex\.cloud(\/|$)/, '.convex.site$1');
}

export const convexSiteUrl = deriveConvexSiteUrl(convexUrl);
