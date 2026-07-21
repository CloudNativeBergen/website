import { SessionProvider } from 'next-auth/react'
import type { Session } from 'next-auth'
import { auth } from '@/lib/auth'
import { SessionRefreshOnRestore } from './SessionRefreshOnRestore'
import {
  AppBadgeSync,
  NotificationClickSync,
  StandaloneLaunchRedirect,
} from '@/components/pwa'

/**
 * Narrow the server session into what is safe to serialize to the client, and
 * return `undefined` (never `null`) when there is no usable session.
 *
 * Two things happen here:
 *
 * 1. **Security narrowing** — expose only `user.{name,email,picture}` and the
 *    account *provider name*. The full `account` carries the OAuth
 *    `access_token`/`refresh_token`; those must never reach the client. Server
 *    consumers that need the tokens read them via `auth()`, which is unaffected.
 *
 * 2. **`undefined`, not `null`, when absent** — NextAuth's `SessionProvider`
 *    treats an explicit `session` prop (including `null`) as authoritative:
 *    `hasInitialSession = props.session !== undefined`, and its mount effect
 *    skips the `/api/auth/session` fetch when the seeded session is `null` (see
 *    next-auth/react.js). So a `null` handed to the client is *sticky* — the
 *    header renders signed-out and only self-corrects on a later tab refocus.
 *    Returning `undefined` leaves `hasInitialSession` false, so the client
 *    fetches the session on mount and heals the state. This matters under
 *    `cacheComponents`, where `auth()` can return falsy for a request that
 *    actually has a session (e.g. a host-only cookie not sent across
 *    subdomains) — most visibly on the heavily-linked front page.
 *
 * Present sessions are still returned for SSR, so authenticated dynamic renders
 * show the signed-in header with no flash.
 */
export function sanitizeSession(session: Session | null): Session | undefined {
  if (!session || !session.user) return undefined

  return {
    ...session,
    user: {
      name: session.user.name,
      email: session.user.email,
      picture: session.user.picture,
    },
    // Only the provider name is safe/needed client-side; drop the OAuth tokens.
    // Cast is required because the client `Session` type still declares the
    // full `Account` shape.
    account: session.account
      ? ({
          provider: session.account.provider,
        } as unknown as Session['account'])
      : undefined,
  } as Session
}

async function SessionLoader({ children }: { children: React.ReactNode }) {
  const session = await auth()

  return (
    <SessionProvider session={sanitizeSession(session)}>
      <SessionRefreshOnRestore />
      {/*
        App-wide, signed-in-only PWA side effects. Both render null and self-gate
        on the session, so they are inert for signed-out visitors:
          - AppBadgeSync mirrors the unread count to the app-icon badge;
          - NotificationClickSync marks a notification read when its push is
            clicked (see public/sw.js postMessage);
          - StandaloneLaunchRedirect rescues iOS installed launches that land on
            `/` instead of the manifest `start_url` (see the component).
        Mounted here so they run on EVERY page (the bell only mounts in some
        shells), inside SessionProvider + the layout's TRPCProvider.
      */}
      <AppBadgeSync />
      <NotificationClickSync />
      <StandaloneLaunchRedirect />
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
