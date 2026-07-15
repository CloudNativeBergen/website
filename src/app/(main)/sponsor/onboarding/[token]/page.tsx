import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

interface RegistrationRedirectPageProps {
  params: Promise<{ token: string }>
}

export default async function SponsorRegistrationRedirect({
  params,
}: RegistrationRedirectPageProps) {
  const { token } = await params
  redirect(`/sponsor/portal/${token}`)
}
