import { SponsorOnboardingForm } from '@/components/sponsor/SponsorOnboardingForm'

interface OnboardingPageProps {
  params: Promise<{ token: string }>
}

export default async function SponsorOnboardingPage({
  params,
}: OnboardingPageProps) {
  const { token } = await params

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
      <SponsorOnboardingForm token={token} />
    </div>
  )
}
