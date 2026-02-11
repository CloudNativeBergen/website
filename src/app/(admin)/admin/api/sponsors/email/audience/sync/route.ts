import { NextAuthRequest, auth } from '@/lib/auth'
import { checkOrganizerAccess } from '@/lib/auth/admin'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { syncSponsorAudience, Contact } from '@/lib/email/audience'
import { listSponsorsForConference } from '@/lib/sponsor-crm/sanity'
import type { SponsorForConferenceExpanded } from '@/lib/sponsor-crm/types'

export const POST = auth(async (req: NextAuthRequest) => {
  const startTime = Date.now()
  const accessError = checkOrganizerAccess(req)
  if (accessError) {
    return accessError
  }

  try {
    const { conference, error: conferenceError } =
      await getConferenceForCurrentDomain()

    if (conferenceError) {
      console.error('[SponsorSync] Failed to load conference:', {
        error: conferenceError.message,
        stack: conferenceError.stack,
      })
      return Response.json(
        {
          error: 'Failed to load conference data',
          details: conferenceError.message,
        },
        { status: 500 },
      )
    }

    if (!conference) {
      console.error('[SponsorSync] Conference data is null/undefined')
      return Response.json(
        { error: 'Conference data not found' },
        { status: 500 },
      )
    }

    const { sponsors: crmSponsors, error: crmError } =
      await listSponsorsForConference(conference._id)

    if (crmError || !crmSponsors) {
      console.error('[SponsorSync] Failed to load CRM sponsors:', {
        error: crmError?.message,
      })
      return Response.json(
        {
          error: 'Failed to load sponsor CRM data',
          details: crmError?.message || 'Unknown error',
        },
        { status: 500 },
      )
    }

    const eligibleSponsors = crmSponsors.filter(
      (s: SponsorForConferenceExpanded) =>
        s.contactPersons &&
        s.contactPersons.length > 0 &&
        s.contactPersons.some((contact) => contact.email),
    )

    if (eligibleSponsors.length === 0) {
      console.warn(
        '[SponsorSync] No sponsors with valid contact information found',
      )
      return Response.json(
        {
          error: 'No sponsors with contact information found',
          details: 'Add contact information to sponsors before syncing',
        },
        { status: 400 },
      )
    }

    const sponsorContacts: Contact[] = eligibleSponsors.flatMap(
      (s: SponsorForConferenceExpanded) =>
        s.contactPersons
          ?.filter((contact) => contact.email)
          .map((contact) => ({
            email: contact.email,
            firstName: contact.name?.split(' ')[0] || '',
            lastName: contact.name?.split(' ').slice(1).join(' ') || '',
            organization: s.sponsor.name,
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
      console.error('[SponsorSync] Sync failed:', {
        error: syncError?.message,
        stack: syncError?.stack,
        audienceId,
        attemptedSyncCount: sponsorContacts.length,
      })
      return Response.json(
        {
          error: 'Failed to sync sponsor audience with email provider',
          details: syncError?.message || 'Unknown sync error',
          context: {
            attemptedContactCount: sponsorContacts.length,
            audienceId: audienceId || 'not created',
          },
        },
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
    const duration = Date.now() - startTime
    console.error('[SponsorSync] Unexpected error during sync:', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      type: error?.constructor?.name,
      durationMs: duration,
    })
    return Response.json(
      {
        error: 'Internal server error during sponsor sync',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    )
  }
})
