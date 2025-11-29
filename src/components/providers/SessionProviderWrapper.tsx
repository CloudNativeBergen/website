import { SessionProvider } from 'next-auth/react'
import { auth } from '@/lib/auth'

async function SessionLoader({ children }: { children: React.ReactNode }) {
  const session = await auth()

  // Sanitize session to only expose safe user data
  // If session exists but has no user, treat it as no session
  const sanitizedSession =
    session && session.user
      ? {
          ...session,
          user: {
            name: session.user.name,
            email: session.user.email,
            picture: session.user.picture,
          },
        }
      : null

  return (
    <SessionProvider session={sanitizedSession}>{children}</SessionProvider>
  )
}

export async function SessionProviderWrapper({
  children,
}: {
  children: React.ReactNode
}) {
  return <SessionLoader>{children}</SessionLoader>
}
