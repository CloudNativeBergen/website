import { redirect } from 'next/navigation'

// This route has been moved to /cfp/proposal
// Redirect old URLs to the new location
export default async function Submit({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; token?: string }>
}) {
  const { id: proposalId, token } = (await searchParams) || {}

  if (proposalId) {
    redirect(
      token
        ? `/cfp/proposal/${proposalId}?token=${encodeURIComponent(token)}`
        : `/cfp/proposal/${proposalId}`,
    )
  }

  // Late-submission links (#249) land here; the token rides along to the form.
  redirect(
    token
      ? `/cfp/proposal?token=${encodeURIComponent(token)}`
      : '/cfp/proposal',
  )
}
