import { SessionProvider } from 'next-auth/react'
import type { Session } from 'next-auth'
import { auth } from '@/lib/auth'
import { SessionRefreshOnRestore } from './SessionRefreshOnRestore'

async function SessionLoader({ children }: { children: React.ReactNode }) {
  const session = await auth()

  // Sanitize session to only expose safe data to the client.
  // If session exists but has no user, treat it as no session.
  //
  // SECURITY: narrow `account` to just `{ provider }`. The full account carries
  // the OAuth `access_token`/`refresh_token`; only the provider name is needed
  // client-side (e.g. to highlight the current provider on the profile page).
  // Server-side consumers that need the tokens read them via `auth()`, which is
  // unaffected — this narrowing applies only to the client-serialized session.
  const sanitizedSession =
    session && session.user
      ? {
          ...session,
          user: {
            name: session.user.name,
            email: session.user.email,
            picture: session.user.picture,
          },
          // Only the provider name is safe/needed client-side; drop the OAuth
          // tokens. Cast is required because the client `Session` type still
          // declares the full `Account` shape.
          account: session.account
            ? ({
                provider: session.account.provider,
              } as unknown as Session['account'])
            : undefined,
        }
      : null

  // Pass `undefined` (not `null`) when there is no server session.
  //
  // NextAuth's SessionProvider treats an explicitly-provided `session` prop —
  // including `null` — as authoritative: `hasInitialSession = props.session
  // !== undefined`, and its mount effect skips the `/api/auth/session` fetch
  // when `_session === null` (see next-auth/react.js). So a `null` that reaches
  // the client is *sticky*: the header renders signed-out and never
  // self-corrects until a tab refocus fires `visibilitychange`.
  //
  // Under `cacheComponents`, the session is a per-request streamed hole, so a
  // logged-in user on the same host normally gets the real session here. But
  // whenever `auth()` returns falsy for a request that actually has a valid
  // session — e.g. a host-only cookie not sent across subdomains — seeding
  // `null` would freeze the UI signed-out. Passing `undefined` instead leaves
  // `hasInitialSession` false, so the client fetches the session on mount and
  // heals the state. Present sessions are still passed through for SSR (no
  // signed-out flash on dynamic, authenticated renders).
  return (
    <SessionProvider session={sanitizedSession ?? undefined}>
      <SessionRefreshOnRestore />
      {children}
    </SessionProvider>
  )
}

export async function SessionProviderWrapper({
  children,
}: {
  children: React.ReactNode
}) {
  return <SessionLoader>{children}</SessionLoader>
}
