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
import {
  buildActivationChecklist,
  type ActivationChecklist,
  type ConferenceForActivation,
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
): Promise<ActivationChecklist> {
  const orgId = conferenceOrgId(conference)
  const [ticketingAvailable, emailDeliveryManagedByPlatform, hasInvitations] =
    await Promise.all([
      isTicketingEnabledForOrg(orgId),
      isEmailDeliveryPlatformManaged(orgId),
      resolveHasOrganizerInvitations(conference),
    ])

  return buildActivationChecklist(
    conference,
    checks ?? collectStaticChecks(conference),
    {
      ticketingAvailable,
      emailDeliveryManagedByPlatform,
      hasOrganizerInvitations: hasInvitations,
    },
  )
}
