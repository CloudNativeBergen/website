import { CFPLayout } from '@/components/cfp/CFPLayout'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function CFPGroupLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()
  if (!session?.speaker) {
    redirect('/api/auth/signin?callbackUrl=/cfp')
  }

  return <CFPLayout>{children}</CFPLayout>
}
