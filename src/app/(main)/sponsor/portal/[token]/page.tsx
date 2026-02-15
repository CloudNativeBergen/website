import { SponsorPortal } from '@/components/sponsor/SponsorPortal'

interface PortalPageProps {
  params: Promise<{ token: string }>
}

export default async function SponsorPortalPage({ params }: PortalPageProps) {
  const { token } = await params

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
      <SponsorPortal token={token} />
    </div>
  )
}
