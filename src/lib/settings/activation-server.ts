import 'server-only'
import { collectStaticChecks } from '@/lib/system-status/checks'
import type { SystemCheck } from '@/lib/system-status/types'
import type { ConferenceForSystemChecks } from '@/lib/system-status/types'
import { resolvePlatformOrgId } from '@/lib/authz/platform'
import { isPlatformOrganization } from '@/lib/features/platform'
import { isTicketingEnabledForOrg } from '@/lib/features/ticketing'
import { hasAnyOrganizerInvitation } from '@/lib/organizer-invite/sanity'
import {
  conferenceOrgId,
  type ConferenceTenant,
} from '@/lib/features/platform-default'
import type { Conference, ConferenceSchedule } from '@/lib/conference/types'
import { scopedFetch } from '@/lib/sanity/scoped'
import { clientReadUncached } from '@/lib/sanity/client'
import { computeUnassigned } from '@/lib/schedule/operations'
import { getSpeakerInfoGaps } from '@/lib/speaker/briefing-checklist'
import { getSpeakerBriefing } from '@/lib/speaker/briefing'
import {
  briefingVersion,
  getBriefingSendHistory,
  loadBriefingSpeakers,
} from '@/lib/email/speaker-briefing'
import { readPhotoWall } from '@/lib/photo-wall/sanity'
import { Status } from '@/lib/proposal/types'
import {
  countSponsorsWaiting,
  SPONSOR_ACTION_ITEM_FIELDS,
} from '@/lib/sponsor-crm/action-items'
import type { SponsorForConferenceExpanded } from '@/lib/sponsor-crm/types'
import {
  buildActivationChecklist,
  isEventStageRelevant,
  type ActivationChecklist,
  type ConferenceForActivation,
  type EventPrepFacts,
} from './activation'

/**
 * The SERVER seam for the activation checklist.
 *
 * `@/lib/settings/activation` is deliberately pure and client-safe (a Storybook
 * story renders it), so it cannot ask the two questions that decide whether the
 * `ticketing` and `email-delivery` rows are the organizer's to complete. This
 * module asks them and hands the answers over as options, which keeps exactly
 * one derivation of the checklist for all three surfaces that render it: the
 * `/admin` activation hero, the unlisted banner in the admin shell, and the
 * "Get started" card on `/admin/settings`.
 */

/** The conference shape this resolver needs — the union of its three readers. */
export type ConferenceForActivationResolution = ConferenceForActivation &
  ConferenceTenant &
  ConferenceForSystemChecks & {
    /** Needed to scope the invitation-existence read; absent in tiny fixtures. */
    _id?: string
  }

/**
 * Whether at least one organizer invitation exists, resolved ONLY when the
 * organizer count cannot already satisfy the co-organizer row. The checklist
 * doctrine is "no extra probing", and this stays true to its spirit: the
 * organizer count rides the conference document every surface already holds
 * (raw refs survive even without the organizers expansion — see
 * `@/lib/conference/sections`), so the one metered `count()` here fires only
 * for a conference still at 0–1 organizers, i.e. exactly the fresh tenants the
 * row exists to nudge. Fails toward `false` — an unticked optional row, never
 * a wrong instruction.
 */
async function resolveHasOrganizerInvitations(
  conference: ConferenceForActivationResolution,
): Promise<boolean> {
  const organizerCount = Array.isArray(conference.organizers)
    ? conference.organizers.length
    : 0
  if (organizerCount >= 2 || !conference._id) return false
  try {
    return await hasAnyOrganizerInvitation(conference._id)
  } catch (error) {
    console.error('Error resolving organizer-invitation existence:', error)
    return false
  }
}

/**
 * Whether outbound email rides the PLATFORM's Resend credentials rather than
 * this tenant's own — i.e. whether "configure the Resend API key" is an
 * instruction this organizer could possibly follow.
 *
 * `RESEND_API_KEY` is a deployment environment variable; nothing in Sanity or
 * the per-org secret store can override it. So the question is really "who owns
 * this deployment's environment?", and the one signal for that already in the
 * codebase is the platform-org contract:
 *
 *  - `PLATFORM_ORG_ID` UNSET → single-tenant / self-hosted. There is no
 *    operator above the organizer; the key IS theirs to set, so the row stays a
 *    real, achievable requirement.
 *  - SET, and this is the platform org → the operator's own tenant. Same
 *    answer: they hold the environment.
 *  - SET, and this is any OTHER tenant → the shared platform. The key belongs
 *    to the operator, the tenant cannot see it, and telling them to configure
 *    it is the impossible step #839 is about.
 *
 * Fails toward "the organizer owns it" on an unresolvable org, which is the
 * safe direction here: the worst case is a row that stays visible and
 * actionable, not a launch requirement silently deleted.
 */
async function isEmailDeliveryPlatformManaged(
  orgId: string | null,
): Promise<boolean> {
  if (resolvePlatformOrgId() === null) return false
  if (!orgId) return false
  return !(await isPlatformOrganization(orgId))
}

interface EventPrepCounts {
  schedules: ConferenceSchedule[]
  sponsors: number
  sponsorsWithoutLogo: number
  sponsorActions: SponsorForConferenceExpanded[]
}

/**
 * The event-stage facts. Cost: the briefing speaker load (proposals, one batch
 * ticket-provider call, travel support), the send log, the photo wall and one
 * schedule/sponsor read (which also carries the lean sponsor action rows). Any failure leaves the rows out.
 */
async function resolveEventPrepFacts(
  conference: Conference,
): Promise<EventPrepFacts | undefined> {
  try {
    const conferenceId = conference._id
    const [speakers, counts, wall] = await Promise.all([
      loadBriefingSpeakers(conference),
      scopedFetch<EventPrepCounts>(
        clientReadUncached,
        { conferenceId },
        `{
          "schedules": *[_type == "schedule" && conference._ref == $conferenceId && (status == "official" || !defined(status))]{
            tracks[]{ talks[]{ startTime, endTime, "talk": select(defined(talk) => { "_id": talk._ref }) } }
          },
          "sponsors": count(*[_type == "sponsorForConference" && conference._ref == $conferenceId && status == "closed-won" && defined(sponsor->_id)]),
          "sponsorsWithoutLogo": count(*[_type == "sponsorForConference" && conference._ref == $conferenceId && status == "closed-won" && defined(sponsor->_id) && !defined(sponsor->logo) && !defined(sponsor->logoBright)]),
          "sponsorActions": *[_type == "sponsorForConference" && conference._ref == $conferenceId]{${SPONSOR_ACTION_ITEM_FIELDS}}
        }`,
      ),
      readPhotoWall(conferenceId),
    ])
    const history = await getBriefingSendHistory(
      conferenceId,
      speakers.map((s) => s._id),
      briefingVersion(conference),
    )
    // ponytail: confirmed talks come from the briefing speakers, so a talk whose
    // only speakers are erased or have no email is not counted as unscheduled.
    const confirmed = [
      ...new Map(
        speakers
          .flatMap((s) => s.proposals)
          .filter((p) => p.status === Status.confirmed)
          .map((p) => [p._id, p]),
      ).values(),
    ]
    const speakersWithTodos = speakers.filter((s) =>
      getSpeakerBriefing(conference, {
        proposals: s.proposals,
        speakerId: s._id,
        ticketState: s.ticketState,
      }).todos?.some((t) => t.kind !== 'travel-support'),
    ).length
    return {
      unscheduledTalks: computeUnassigned(confirmed, counts.schedules ?? [])
        .length,
      hasSpeakerInfo: !!conference.speakerInfo,
      speakerInfoGaps: getSpeakerInfoGaps(conference.speakerInfo).length,
      briefingSent:
        speakers.length > 0 && history.currentCount >= speakers.length,
      speakersWithTodos,
      hasPhotoWall: wall !== null,
      sponsors: counts.sponsors ?? 0,
      sponsorsWithoutLogo: counts.sponsorsWithoutLogo ?? 0,
      sponsorsWaiting: countSponsorsWaiting(counts.sponsorActions ?? []),
    }
  } catch (error) {
    console.error('Error resolving event-stage facts:', error)
    return undefined
  }
}

/**
 * Build the activation checklist for a conference with the entitlement and
 * platform answers already resolved.
 *
 * @param conference the conference document (a superset of every slice read)
 * @param checks     an ALREADY-built `SystemCheck[]` when the caller has one
 *                   (the settings page builds the full set for its own status
 *                   section). Omitted, the static checks are collected here —
 *                   the two ids the checklist reads (`email.resendKey`,
 *                   `slack.botToken`) are both static, so the two paths agree
 *                   by construction rather than by a second env derivation
 *                   that could drift from the check registry.
 */
export async function resolveActivationChecklist(
  conference: ConferenceForActivationResolution,
  checks?: SystemCheck[],
  /** Opt in to the event-stage facts; only the settings page renders them. */
  { eventFacts: wantEventFacts = false }: { eventFacts?: boolean } = {},
): Promise<ActivationChecklist> {
  const orgId = conferenceOrgId(conference)
  const [
    ticketingAvailable,
    emailDeliveryManagedByPlatform,
    hasInvitations,
    eventFacts,
  ] = await Promise.all([
    isTicketingEnabledForOrg(orgId),
    isEmailDeliveryPlatformManaged(orgId),
    resolveHasOrganizerInvitations(conference),
    // Opt-in, and only while the event stage is shown, so the dashboard and
    // the layout's banner check pay nothing.
    wantEventFacts && conference._id && isEventStageRelevant(conference)
      ? resolveEventPrepFacts(conference as Conference)
      : undefined,
  ])

  return buildActivationChecklist(
    conference,
    checks ?? collectStaticChecks(conference),
    {
      ticketingAvailable,
      emailDeliveryManagedByPlatform,
      hasOrganizerInvitations: hasInvitations,
      eventFacts,
    },
  )
}
