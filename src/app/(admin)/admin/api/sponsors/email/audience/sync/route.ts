import { NextAuthRequest, auth } from '@/lib/auth'
import { checkOrganizerAccess } from '@/lib/auth/admin'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { syncSponsorAudience, Contact } from '@/lib/email/audience'
import { ConferenceSponsorWithContact } from '@/lib/sponsor/types'

export const dynamic = 'force-dynamic'

export const POST = auth(async (req: NextAuthRequest) => {
  const accessError = checkOrganizerAccess(req)
  if (accessError) {
    return accessError
  }

  try {
    const { conference, error: conferenceError } =
      await getConferenceForCurrentDomain({
        sponsors: true,
        sponsorContact: true,
        revalidate: 0,
      })

    if (conferenceError) {
      return Response.json({ error: conferenceError.message }, { status: 500 })
    }

    const sponsors = (conference.sponsors ||
      []) as ConferenceSponsorWithContact[]

    const eligibleSponsors = sponsors.filter(
      (sponsor: ConferenceSponsorWithContact) =>
        sponsor.sponsor.contact_persons &&
        sponsor.sponsor.contact_persons.length > 0 &&
        sponsor.sponsor.contact_persons.some((contact) => contact.email),
    )

    const sponsorContacts: Contact[] = eligibleSponsors.flatMap(
      (sponsor: ConferenceSponsorWithContact) =>
        sponsor.sponsor.contact_persons
          ?.filter((contact) => contact.email)
          .map((contact) => ({
            email: contact.email,
            firstName: contact.name?.split(' ')[0] || '',
            lastName: contact.name?.split(' ').slice(1).join(' ') || '',
            organization: sponsor.sponsor.name,
          })) || [],
    )

    const {
      success,
      audienceId,
      syncedCount,
      addedCount,
      removedCount,
      error: syncError,
    } = await syncSponsorAudience(conference, sponsorContacts)

    if (!success || syncError) {
      return Response.json(
        { error: syncError?.message || 'Failed to sync sponsor audience' },
        { status: 500 },
      )
    }

    return Response.json({
      success: true,
      audienceId,
      syncedCount,
      addedCount,
      removedCount,
      message: `Successfully synced ${syncedCount} sponsor contacts (${addedCount} added, ${removedCount} removed)`,
    })
  } catch (error) {
    console.error('Sponsor audience sync error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
})
