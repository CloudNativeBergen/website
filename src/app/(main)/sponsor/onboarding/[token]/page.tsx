import { redirect } from 'next/navigation'

interface OnboardingPageProps {
  params: Promise<{ token: string }>
}

export default async function SponsorOnboardingRedirect({
  params,
}: OnboardingPageProps) {
  const { token } = await params
  redirect(`/sponsor/portal/${token}`)
}
