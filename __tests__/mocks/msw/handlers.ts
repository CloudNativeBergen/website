import { http, HttpResponse } from 'msw'

/**
 * Default MSW request handlers for the external HTTP the auth/identity and
 * ticketing paths call. Until now `__tests__/mocks/*` were module ALIASES, not
 * a network server — outbound HTTP (GitHub `/user/emails`, LinkedIn userinfo,
 * the Checkin.no GraphQL API) wasn't intercepted, so any test exercising those
 * paths would hit the real network. The handlers below cover the endpoints
 * currently reached in tests — GitHub `/user/emails` and Checkin.no GraphQL;
 * add a LinkedIn userinfo handler here when a test first needs one. Individual
 * tests override a handler with `server.use(...)` to exercise error/edge
 * responses (see __tests__/lib/profile/github.test.ts).
 *
 * The server is registered with `onUnhandledRequest: 'bypass'` (see
 * vitest.setup.ts), so adding these handlers does NOT change the behaviour of
 * the ~2000 existing tests that make no outbound requests — it only intercepts
 * these specific hosts.
 */

/** A stable, verified GitHub email set returned by the default handler. */
export const DEFAULT_GITHUB_EMAILS = [
  { email: 'primary@example.com', primary: true, verified: true },
  { email: 'secondary@example.com', primary: false, verified: true },
  { email: 'unverified@example.com', primary: false, verified: false },
]

export const handlers = [
  // GitHub verified-emails API (src/lib/profile/github.ts). The OAuth userinfo
  // only exposes a verified primary email, so the app reads the full verified
  // set from here to power verified-email account matching.
  http.get('https://api.github.com/user/emails', () => {
    return HttpResponse.json(DEFAULT_GITHUB_EMAILS)
  }),

  // Checkin.no GraphQL ticketing API (src/lib/tickets/graphql-client.ts).
  // Default to an empty-but-well-formed GraphQL envelope; ticket tests override.
  http.post('https://api.checkin.no/graphql', () => {
    return HttpResponse.json({ data: {} })
  }),
]
