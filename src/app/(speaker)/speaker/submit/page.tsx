import { redirect } from 'next/navigation'

// This route has been moved to /speaker/proposal
// Redirect old URLs to the new location
export default async function Submit({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>
}) {
  const { id: proposalId } = (await searchParams) || {}

  if (proposalId) {
    redirect(`/speaker/proposal/${proposalId}`)
  }

  redirect('/speaker/proposal')
}
