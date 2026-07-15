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

  return (
    <SessionProvider session={sanitizedSession}>
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
