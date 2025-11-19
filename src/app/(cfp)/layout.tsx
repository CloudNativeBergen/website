import { CFPLayout } from '@/components/cfp/CFPLayout'
import { ImpersonationBanner } from '@/components/ImpersonationBanner'
import { getAuthSession } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'

export const dynamic = 'force-dynamic'

export default async function CFPGroupLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const headersList = await headers()
  const fullUrl = headersList.get('x-url') || ''
  const session = await getAuthSession({ url: fullUrl })

  if (!session?.speaker) {
    redirect('/api/auth/signin?callbackUrl=/cfp')
  }

  return (
    <>
      {session.isImpersonating && session.realAdmin && (
        <ImpersonationBanner
          impersonatedSpeaker={session.speaker}
          realAdmin={session.realAdmin}
        />
      )}
      <CFPLayout>{children}</CFPLayout>
    </>
  )
}
