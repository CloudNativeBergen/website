import type { Metadata } from 'next'
import { ContractSigningPage } from '@/components/sponsor/ContractSigningPage'

export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

interface SigningPageProps {
  params: Promise<{ token: string }>
}

export default async function ContractSignPage({ params }: SigningPageProps) {
  const { token } = await params

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
      <ContractSigningPage token={token} />
    </div>
  )
}
