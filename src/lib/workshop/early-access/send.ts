import 'server-only'
import type { EarlyAccessSendRefusal } from '@/lib/sponsor-crm/early-access-email'
import { isLocalhostDomain } from '@/lib/environment/localhost'
import {
  earlyAccessWindow,
  workshopRegistrationWindow,
  type WorkshopRegistrationTimes,
} from '../registration-window'
import { earlyAccessUrl, readEarlyAccessSponsor } from './link'
import { earlyAccessPortalUrl } from './portal'

export type EarlyAccessSendDecision =
  /** No such sponsor in this conference. */
  | { refused: 'not-found' }
  | { refused: EarlyAccessSendRefusal }
  | {
      refused: null
      /** Where the link points: the portal on the conference's working host. */
      portalUrl: string
      /** The address of the link the sponsor already has, or null: a send creates one. */
      url: string | null
      /** The early-access window, as stored. */
      sponsorStart: string
      officialOpening: string
    }

/**
 * MAY A WORKSHOP EARLY-ACCESS EMAIL BE SENT TO THIS SPONSOR NOW? (#1347, spec
 * §8.) THE ONE DECISION: the Send action refuses with it, and the Send modal
 * shows its answer before the organizer writes anything.
 *
 * IT WRITES NOTHING, and reads only as far as it has to. In this order:
 *
 *  1. from localhost: a dev send would mail a real contact. Nothing is read;
 *  2. the conference has no early-access window (spec §2);
 *  3. the window is over: the one window rule's answer for a caller WITH
 *     early access is no longer an early one, which is exactly when
 *     `registrationWindowFor` stops looking a link up;
 *  4. the sponsor's deal is not won, the rule a link is created under. A send
 *     asks it also when a link exists. One read of the sponsor;
 *  5. the portal has no working host. THE LIVE READ, made last, so viewing a
 *     sponsor's record never makes it and a refused send rarely does.
 *
 * The caller has already proven that the sponsor belongs to `conference`.
 */
export async function decideEarlyAccessSend({
  conference,
  domain,
  sponsorForConferenceId,
  now,
}: {
  conference: WorkshopRegistrationTimes & {
    _id: string
    title?: string | null
    domains?: readonly string[] | null
  }
  /** The host the request arrived on. */
  domain: string | undefined
  sponsorForConferenceId: string
  now: Date
}): Promise<EarlyAccessSendDecision> {
  if (domain && isLocalhostDomain(domain)) return { refused: 'localhost' }

  const window = earlyAccessWindow(conference)
  if (!window) return { refused: 'no-window' }
  const early = workshopRegistrationWindow(conference, {
    now,
    earlyAccess: true,
  })
  if (early.status === 'closed' || !early.early) {
    return { refused: 'opening-passed' }
  }

  const sponsor = await readEarlyAccessSponsor(
    conference._id,
    sponsorForConferenceId,
  )
  if (!sponsor) return { refused: 'not-found' }
  if (sponsor.status !== 'closed-won') return { refused: 'not-won' }

  const portalUrl = await earlyAccessPortalUrl(conference)
  if (!portalUrl) return { refused: 'no-portal' }

  return {
    refused: null,
    portalUrl,
    url: sponsor.token ? earlyAccessUrl(portalUrl, sponsor.token) : null,
    ...window,
  }
}
