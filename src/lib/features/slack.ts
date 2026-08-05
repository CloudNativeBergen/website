import 'server-only'
import { getOrganizationById } from '@/lib/organization/sanity'
import { resolveCurrentOrgId } from '@/lib/authz/organizer'
import { computeEntitlements, hasActiveOverride } from './entitlements'
import { isPlatformOrganization } from './platform'

/**
 * THE single gate for the `slack-mirror` feature — enforcement for the registry
 * id that has existed since the entitlements work but gated nothing.
 *
 * WHY IT IS GATED. `SLACK_BOT_TOKEN` is ONE bot installed in ONE Slack
 * workspace: the platform org's. The channel each message goes to, however, is
 * TENANT-EDITABLE — `cfpNotificationChannel` and `salesNotificationChannel` are
 * plain string fields on the conference document, editable from any tenant's own
 * admin settings page. So a shared token plus a tenant-typed channel name means
 * one tenant's CFP submissions, sponsor contracts and weekly revenue updates are
 * posted into the platform's workspace, addressed by a string that tenant chose.
 * There is no cross-check that the channel belongs to the tenant, because there
 * cannot be: it is the platform's workspace, and every channel in it is the
 * platform's. Withholding the token is the only isolation available.
 *
 * A tenant that legitimately wants Slack gets its OWN bot token provisioned into
 * the per-org secret store, which this gate does not stand in front of (see
 * `resolveConferenceSlackToken`) — that token addresses the tenant's own
 * workspace, so no isolation question arises.
 *
 * RESOLUTION ORDER — fail-CLOSED at every step, identical in shape to
 * `./workshops.ts` (read that first; the ordering there is deliberate):
 *
 *  1. No resolvable org (unknown domain, missing org document, or a REJECTED
 *     org read) → DISABLED. An unresolvable tenant must never degrade into
 *     "send it anyway".
 *  2. An ACTIVE `featureOverrides` entry for `slack-mirror` wins, in BOTH
 *     directions — `enabled: true` grants it, `enabled: false` revokes it even
 *     from the platform org (rule 3). NOTE: a grant hands out the PLATFORM's bot
 *     token, so it should be reserved for orgs operated on the platform's own
 *     workspace; provisioning a per-org token is the right answer for everyone
 *     else and needs no override at all.
 *  3. The org whose id is `PLATFORM_ORG_ID` keeps Slack by default. The bot and
 *     the workspace belong to the platform deployment, so the platform org is
 *     the one tenant the shared token is actually FOR — this is what keeps
 *     today's behaviour byte-identical for it without a data migration.
 *  4. Anything else → DISABLED, i.e. `resolveConferenceSlackToken` returns
 *     `undefined` and `postSlackMessage` takes its existing no-op-warn path.
 *
 * ONE READ ONLY: `plan` and `featureOverrides` come from `getOrganizationById`
 * (cached, tagged `organizationTag(orgId)`, so an override flip takes effect by
 * invalidation); rule 3's identity comes from `isPlatformOrganization`, a pure id
 * comparison against `PLATFORM_ORG_ID` with no read and no staleness window.
 * Override expiry is evaluated per call against a fresh `now`.
 *
 * DEV BEHAVIOUR: `PLATFORM_ORG_ID` is set on production and preview but NOT in
 * local development, so this returns false for everything locally and no Slack
 * token resolves. That is the intended posture — `postSlackMessage` already
 * short-circuits to a console log when `NODE_ENV === 'development'`, so a
 * developer never had a working send to lose. There is deliberately NO
 * development-only fallback: one would have to live in the same code path that
 * runs in production, and a gate with a bypass branch is not a gate.
 */

/** The registry id this module gates. */
const SLACK_MIRROR_FEATURE = 'slack-mirror' as const

/**
 * Whether the organization may use the PLATFORM's Slack bot token. See the
 * module doc for the exact resolution order; a nullish org id is DISABLED (fail
 * closed).
 */
export async function isSlackMirrorEnabledForOrg(
  orgId: string | null | undefined,
): Promise<boolean> {
  if (!orgId) return false

  // A REJECTED read (transient Sanity failure) must resolve to DISABLED like any
  // other unresolvable org — never propagate, or one flaky read would turn a
  // best-effort notification into a thrown error inside the mutation that
  // triggered it.
  let org
  try {
    org = await getOrganizationById(orgId)
  } catch (error) {
    console.error(
      `[slack] organization read failed for ${orgId}; treating Slack mirroring as DISABLED`,
      error,
    )
    return false
  }
  if (!org) return false

  const now = new Date()
  if (
    computeEntitlements(org.plan, org.featureOverrides, now).has(
      SLACK_MIRROR_FEATURE,
    )
  ) {
    return true
  }

  // Not entitled by plan/override. An ACTIVE override at this point can only be
  // an explicit `enabled: false`, which must beat the platform default below.
  if (hasActiveOverride(org.featureOverrides, SLACK_MIRROR_FEATURE, now)) {
    return false
  }

  // ID comparison against the ONE resolver, never `org.slug` off the cached read
  // above — see `./platform`. This is a grant, and this deployment has an org
  // that is both the platform org and a tenant, so a revocation must take effect
  // NOW rather than whenever the cached document happens to expire.
  return isPlatformOrganization(orgId)
}

/** The minimum conference shape this gate reads — its owning tenant. */
interface ConferenceTenant {
  organization?: { _ref?: string; _type?: 'reference' } | null
}

/**
 * Whether Slack mirroring is enabled for the tenant that OWNS this conference.
 * Use this wherever a conference is already in hand (every Slack sender) so the
 * decision keys on the conference's real owner rather than on whatever host the
 * request happens to carry.
 */
export async function isSlackMirrorEnabledForConference(
  conference: ConferenceTenant | null | undefined,
): Promise<boolean> {
  return isSlackMirrorEnabledForOrg(conference?.organization?._ref)
}

/**
 * Whether Slack mirroring is enabled for the CURRENT request's domain-resolved
 * org. For surfaces with no conference in hand; an unresolvable org is DISABLED.
 */
export async function isSlackMirrorEnabledForCurrentOrg(): Promise<boolean> {
  return isSlackMirrorEnabledForOrg(await resolveCurrentOrgId())
}
