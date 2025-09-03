import { CFPLayout } from '@/components/cfp/CFPLayout'
import { TRPCProvider } from '@/components/providers/TRPCProvider'
import { getAuthSession } from '@/lib/auth'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function CFPGroupLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getAuthSession()
  if (!session?.speaker) {
    redirect('/api/auth/signin?callbackUrl=/cfp')
  }

  return (
    <TRPCProvider>
      <CFPLayout>{children}</CFPLayout>
    </TRPCProvider>
  )
}
