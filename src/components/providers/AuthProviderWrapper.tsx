'use client'

import { SessionProvider } from 'next-auth/react'
import { usePathname } from 'next/navigation'
import { Session } from 'next-auth'

export function AuthProviderWrapper({
  children,
  session,
}: {
  children: React.ReactNode
  session: Session | null
}) {
  const pathname = usePathname()

  const isWorkshopRoute = pathname?.startsWith('/workshop')

  if (isWorkshopRoute) {
    return <>{children}</>
  }

  return <SessionProvider session={session}>{children}</SessionProvider>
}
