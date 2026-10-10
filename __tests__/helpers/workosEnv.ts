/**
 * Side-effect module: the environment the REAL `@workos-inc/authkit-nextjs`
 * needs, set before it loads. The SDK captures its configuration in module
 * scope, so a suite that runs it unmocked must import this file FIRST.
 *
 * `NEXT_PUBLIC_WORKOS_REDIRECT_URI` is a DECOY: it is the fallback the SDK
 * reaches for whenever a caller forgets to pass `redirectUri`. No assertion may
 * ever see it in a redirect. A deployment is meant to leave the variable unset
 * (#1299); `workosEnvWithoutRedirectUri.ts` is that shape.
 *
 * It is NOT inert, though. Where the SDK has no request URL to judge by
 * (`getSignInUrl`, `getSignUpUrl`, `signOut`) it takes the cookie's `Secure`
 * flag from this variable's scheme, and defaults to `Secure` when it is unset.
 * The decoy is `https`, so those cookies are `Secure` in these suites for that
 * reason and not because of the request.
 */
export const WORKOS_ENV_FALLBACK_REDIRECT_URI =
  'https://decoy.example.org/api/auth/callback'

export const WORKOS_TEST_CLIENT_ID = 'client_test'

process.env.WORKOS_CLIENT_ID = WORKOS_TEST_CLIENT_ID
process.env.WORKOS_API_KEY = 'sk_test_key'
process.env.WORKOS_COOKIE_PASSWORD = 'p'.repeat(48)
process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI = WORKOS_ENV_FALLBACK_REDIRECT_URI
delete process.env.WORKOS_COOKIE_DOMAIN
