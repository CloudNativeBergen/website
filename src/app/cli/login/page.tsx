import { getAuthSession } from '@/lib/auth'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { redirect } from 'next/navigation'
import CLILoginClient from './cli-login-client'

export default async function CLILoginPage(props: {
  searchParams: Promise<{ port?: string; state?: string }>
}) {
  const session = await getAuthSession()
  if (!session?.user) {
    redirect('/signin')
  }

  const searchParams = await props.searchParams
  const { conference } = await getConferenceForCurrentDomain()

  return (
    <main className="flex min-h-screen items-start justify-center bg-white dark:bg-gray-900">
      <CLILoginClient
        port={searchParams.port}
        state={searchParams.state}
        userName={session.user.name}
        userEmail={session.user.email}
        conferenceId={conference?._id ?? ''}
      />
    </main>
  )
}
