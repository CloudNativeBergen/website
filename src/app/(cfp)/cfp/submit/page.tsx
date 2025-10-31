import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

// This route has been moved to /cfp/proposal
// Redirect old URLs to the new location
export default async function Submit({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>
}) {
  const { id: proposalId } = (await searchParams) || {}

  if (proposalId) {
    redirect(`/cfp/proposal/${proposalId}`)
  }

  redirect('/cfp/proposal')
}
