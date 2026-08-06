import 'server-only'
import { getOrganizationById } from '@/lib/organization/sanity'
import { perOrgSecretsStore } from '@/lib/secrets/store'
import { resolveConferenceSlackToken } from '@/lib/slack/token'
import { isWorkshopsEnabledForConference } from '@/lib/features/workshops'
import {
  conferenceProviderType,
  hasTicketingBinding,
} from '@/lib/tickets/provider'
import type { Conference } from '@/lib/conference/types'
import {
  buildSubprocessorDisclosure,
  type SubprocessorDisclosure,
  type TenantProcessingFacts,
} from './subprocessors'

/**
 * Gather the tenant's real processing facts and build the /privacy + /terms
 * subprocessor disclosure. See `./subprocessors` for the two rules this obeys;
 * the one that shapes THIS file is rule 2.
 *
 * ── WHY THE ORGANIZATION READ IS PROBED FIRST ───────────────────────────────
 *
 * The Slack and workshop gates both fail CLOSED on a rejected Sanity read:
 * `resolveConferenceSlackToken` swallows the rejection inside
 * `isSlackMirrorEnabledForOrg` and answers `undefined`, and
 * `isWorkshopsEnabledForConference` runs through `resolveRegistryEntitlement`,
 * which classifies a rejected read as `'denied'`. That is the correct posture for
 * handing out a bot token, and exactly the wrong one for a legal disclosure: a
 * transient read failure would silently publish a SHORTER subprocessor list.
 *
 * Neither gate exposes the difference, so this probes `getOrganizationById`
 * directly — the SAME cached, `organizationTag`-tagged read both gates use, so
 * the probe costs nothing extra and, when it succeeds, the gates below are
 * answering from a healthy read. A rejection sets `organizationReadFailed`, which
 * turns both org-gated signals UNKNOWN, and UNKNOWN discloses.
 *
 * A `null` result is NOT a failure: the read succeeded and the organization does
 * not exist, so the gates genuinely deny and the tenant genuinely uses neither.
 * Likewise a conference with no `organization` ref: every gate keys on that ref
 * and fails closed on its absence, so "no ref" is a fact about what runs, not an
 * unanswered question.
 *
 * CACHING: callers run inside a `'use cache'` scope that already tags
 * `conferenceTag(conference._id)` and `organizationTag(orgRef)` (asserted by
 * `__tests__/lib/cache/organization-tag-coverage.test.ts`), which is exactly the
 * invalidation this needs — an override flip or a provider change busts the page.
 */
export async function resolveSubprocessorDisclosure(
  conference: Conference | null | undefined,
): Promise<SubprocessorDisclosure> {
  return buildSubprocessorDisclosure(await resolveProcessingFacts(conference))
}

async function resolveProcessingFacts(
  conference: Conference | null | undefined,
): Promise<TenantProcessingFacts> {
  const tenantKnown = Boolean(conference?._id)
  if (!conference || !tenantKnown) {
    return {
      tenantKnown: false,
      organizationReadFailed: false,
      ticketing: null,
      analyticsCode: null,
      slackToken: null,
      workshops: null,
      dedicatedEmailAccount: null,
    }
  }

  const orgRef = conference.organization?._ref ?? null
  const organizationReadFailed = await organizationReadRejected(orgRef)

  // Both gates are asked ONLY when the org document read is healthy; otherwise
  // their fail-closed `false` would be indistinguishable from a real "no".
  const [slackToken, workshops, dedicatedEmailAccount] = organizationReadFailed
    ? ([null, null, null] as const)
    : await Promise.all([
        // Coerced to a boolean IMMEDIATELY: this is the token resolver, and the
        // token itself must never travel further than this expression.
        resolveConferenceSlackToken(conference).then(Boolean),
        isWorkshopsEnabledForConference(conference),
        // The per-org secret store never throws (a malformed TENANT_SECRETS_JSON
        // is logged once and treated as empty), so a `null` here is a real "uses
        // the shared platform account".
        perOrgSecretsStore
          .get(orgRef, 'email')
          .then((creds) => Boolean(creds?.apiKey)),
      ])

  return {
    tenantKnown: true,
    organizationReadFailed,
    ticketing: {
      provider: conferenceProviderType(conference),
      // The BINDING, not the credentials. `resolveTicketingProvider` collapses
      // "no credentials" into the same `configured: false` as "no event id", so
      // asking it would drop the disclosure for a conference that is plainly
      // bound to a vendor and merely mid-provisioning — the under-report
      // direction. A binding present with credentials absent over-discloses,
      // which is the direction this page is allowed to err in.
      bound: hasTicketingBinding(conference),
      explicitlySelected:
        conference.ticketingProvider === 'checkin' ||
        conference.ticketingProvider === 'tito',
      registrationLink: conference.registrationLink,
    },
    analyticsCode: conference.analyticsPirschCode,
    slackToken,
    workshops,
    dedicatedEmailAccount,
  }
}

/**
 * Did the organization document read FAIL? `false` for a nullish ref and for a
 * read that succeeded and found nothing — only a rejection counts.
 */
async function organizationReadRejected(
  orgRef: string | null,
): Promise<boolean> {
  if (!orgRef) return false
  try {
    await getOrganizationById(orgRef)
    return false
  } catch (error) {
    console.error(
      `[legal] organization read failed for ${orgRef}; disclosing every org-gated subprocessor as POSSIBLE rather than omitting it`,
      error,
    )
    return true
  }
}
