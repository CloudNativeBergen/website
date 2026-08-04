import { ErrorDisplay } from '@/components/admin'
import { InvitationLettersPageClient } from '@/components/admin/invitation'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { parseInvitationPrefill } from '@/lib/invitation-letter/prefill'

export default async function AdminInvitationLetters({
  searchParams,
}: {
  // Seeded from an order — see `@/lib/invitation-letter/prefill`. Untrusted:
  // parsed defensively so a mangled link opens an empty form, never an error.
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { conference, error: conferenceError } =
    await getConferenceForCurrentDomain()

  if (conferenceError || !conference) {
    return (
      <ErrorDisplay
        title="Conference Not Found"
        message={conferenceError?.message || 'Could not load conference data'}
      />
    )
  }

  const prefill = parseInvitationPrefill(await searchParams)

  // Keyed on the seed: navigating from one order's "issue letter" link to
  // another keeps this route mounted, and the client seeds its form state in a
  // `useState` initializer — so without a remount the SECOND organizer would
  // see the FIRST applicant's details still in the fields. On a form that
  // produces an identity document, that is the one mistake worth a remount.
  return (
    <InvitationLettersPageClient
      key={JSON.stringify(prefill)}
      conference={conference}
      prefill={prefill}
    />
  )
}
