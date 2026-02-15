import { redirect } from 'next/navigation'

interface RegistrationRedirectPageProps {
  params: Promise<{ token: string }>
}

export default async function SponsorRegistrationRedirect({
  params,
}: RegistrationRedirectPageProps) {
  const { token } = await params
  redirect(`/sponsor/portal/${token}`)
}
