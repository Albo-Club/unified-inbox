import { getAuthConfigProvider } from '@convex-dev/better-auth/auth-config';

/**
 * Returns the JWKS string only when it's a real, non-empty key set. The
 * bootstrap script seeds an empty `[]` placeholder just to satisfy Convex's
 * env-var-must-exist check on this file — we treat that as "no static JWKS"
 * so BA generates keys on-the-fly and Convex verifies them via its own JWKS
 * endpoint at /api/auth/convex/.well-known/jwks.json.
 */
function staticJwksOrUndefined(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length === 0) return undefined;
    return raw;
  } catch {
    return undefined;
  }
}

export default {
  providers: [getAuthConfigProvider({ jwks: staticJwksOrUndefined(process.env.JWKS) })],
};
