// #1881 & #1997: the admin's conference writes for moved fields go ONLY to D1
// through api.konf.app for d1_write tenants. Sanity copies are frozen and no
// longer updated. Non-moved fields still go to Sanity.
import 'server-only'
import { cookies, headers } from 'next/headers'
import { requestDomain } from '@/lib/conference/request-domain'
import { IDENTITY_SESSION_COOKIE } from '@/lib/auth/identity-cookie'
import { TRPCError } from '@trpc/server'
import { rolloutFlags } from '@/lib/conference/konf-api'
import { konfApiHeaders, konfApiUrl } from './client'
import { graphql, type ResultOf } from './graphql'
import {
  LIFECYCLE_STATUS_VALUES,
  type LifecycleStatus,
} from '@/lib/homepage/lifecycle'

const TIMEOUT_MS = 5000

/** The `ConferencePatch` fields in services/conference/src/subgraph.ts. */
const MOVED = new Set([
  'title',
  'tagline',
  'city',
  'country',
  'venueName',
  'venueAddress',
  'startDate',
  'endDate',
  'backgroundPattern',
  'primaryColor',
  'accentColor',
  'registrationLink',
  'visibility',
  'socialLinks',
])

/**
 * Settings phase 1 (#2019), public fields: read from D1 through the merge
 * (src/lib/conference/konf-api.ts), so for a d1_write tenant they go to D1
 * only. `ticketCustomization.showVanityMetrics` is handled in
 * movedConferencePatch and stripped by the tickets router.
 */
const SETTINGS = new Set([
  'cfpStartDate',
  'cfpEndDate',
  'cfpNotifyDate',
  'programDate',
  'travelSupportPaymentDate',
  'earlyBirdEndDate',
  'registrationCloseDate',
  'speakersAnnouncedDate',
  'sponsorDeadlineDate',
  'recordingsLiveDate',
  'registrationEnabled',
  'organizer',
  'socialHashtag',
])

/**
 * Settings phase 1, members-only fields: in `ConferencePatch`, but the site
 * has no server-side member read for them (the site lane is not an org
 * member, and their readers include jobs with no signed-in user). So a
 * d1_write tenant still writes them to D1 AND Sanity, and readers stay on
 * Sanity, until such a read path exists.
 */
const SETTINGS_PRIVATE = new Set([
  'travelSupportBudget',
  'organizerAddress',
  'organizerOrgNumber',
  'analyticsPirschCode',
])

/**
 * Settings phase 2 (#2038): in `ConferencePatch`, not yet read from D1, so a
 * d1_write tenant writes them to D1 AND Sanity until the read flip.
 */
const SETTINGS_PHASE2 = new Set([
  'sponsorRegistrationLink',
  'speakerRegistrationLink',
  'volunteerRegistrationLink',
  'contactEmail',
  'cfpEmail',
  'sponsorEmail',
  'salesNotificationChannel',
  'cfpNotificationChannel',
  'speakerSlackChannel',
  'speakerSlackInviteUrl',
  'volunteerSlackInviteUrl',
])

/**
 * Settings phase 3 (#2080), ticket setup: dual-written like phase 2 until the
 * read flip. `ticketTargets` is flattened in movedConferencePatch. The
 * reminder state is not here: only the reminder writes it, to Sanity.
 */
const SETTINGS_PHASE3 = new Set([
  'ticketingProvider',
  'checkinCustomerId',
  'checkinEventId',
  'titoAccountSlug',
  'titoEventSlug',
  'ticketCapacity',
  'ticketTypeRoles',
  'publicFreeTicketIds',
  'workshopRegistrationSponsorStart',
  'workshopRegistrationStart',
  'workshopRegistrationEnd',
  'workshopEarlyAccessTicketTypes',
])

/**
 * Whether a conference settings input key represents a field moved to D1 (#1997).
 * Sanity groups primaryColor/accentColor under `theme`, and published is
 * derived from `lifecycleStatus`.
 */
export function isMovedConferenceField(key: string): boolean {
  // lifecycleStatus is NOT moved: D1 stores only the derived `published`
  // boolean, so cancelled vs archived lives in Sanity alone.
  return MOVED.has(key) || SETTINGS.has(key) || key === 'theme'
}

/**
 * The host's `d1Write` rollout flag (#1925). Throws when the flag cannot be
 * read and no recent good value exists (#1938): writing Sanity alone could
 * drift D1, so the moved-field save is refused instead.
 */
export async function isD1WriteTenant(
  host: string | null,
  conferenceId: string,
): Promise<boolean> {
  const f = await rolloutFlags(host, { _id: conferenceId }, { verify: true })
  if (f.unverified && !f.d1Write) {
    throw new TRPCError({
      code: 'SERVICE_UNAVAILABLE',
      message:
        'These settings cannot be saved right now. Wait a minute and try again.',
    })
  }
  return f.d1Write
}

/**
 * The moved keys of a router input, in `ConferencePatch` shape. Sanity keeps
 * the brand colours under `theme`; `theme: null` unsets both. Undefined values
 * are dropped (left untouched); null is kept (unset).
 */
export function movedConferencePatch(
  input: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(input)) {
    if (v === undefined) continue
    if (k === 'theme') {
      const t = v as { primaryColor: string; accentColor: string } | null
      out.primaryColor = t?.primaryColor ?? null
      out.accentColor = t?.accentColor ?? null
    } else if (k === 'lifecycleStatus') {
      // D1 `published` follows the Sanity override, as the backfill derives it
      // (services/conference/scripts/backfill.ts). null clears it: public.
      out.published = !LIFECYCLE_STATUS_VALUES.includes(v as LifecycleStatus)
    } else if (k === 'ticketCustomization') {
      // Sanity replaces the whole object, so an absent flag is an unset.
      const t = v as { showVanityMetrics?: boolean } | null
      out.showVanityMetrics = t?.showVanityMetrics ?? null
    } else if (k === 'ticketTargets') {
      // Sanity replaces the whole object, so an absent part is an unset.
      const t = v as {
        enabled?: boolean
        salesStartDate?: string
        targetCurve?: string
        milestones?: unknown[]
      } | null
      out.ticketTargetsEnabled = t?.enabled ?? null
      out.ticketSalesStartDate = t?.salesStartDate ?? null
      out.ticketTargetCurve = t?.targetCurve ?? null
      out.ticketTargetMilestones = t?.milestones ?? null
    } else if (k === 'ticketTypeRoles') {
      // D1 keeps no `_key`.
      out[k] =
        (v as Record<string, unknown>[] | null)?.map((role) => {
          const { _key, ...rest } = role
          void _key
          return rest
        }) ?? null
    } else if (
      MOVED.has(k) ||
      SETTINGS.has(k) ||
      SETTINGS_PRIVATE.has(k) ||
      SETTINGS_PHASE2.has(k) ||
      SETTINGS_PHASE3.has(k)
    ) {
      out[k] = v
    }
  }
  return out
}

/**
 * For a d1_write tenant, writes the D1 keys of `input` through the gateway
 * as the signed-in user, before any Sanity write. Returns whether it did.
 * Throws a TRPCError, leaving Sanity for the caller to skip, when the save
 * must not go to Sanity alone.
 */
export async function writeMovedToD1(
  conferenceId: string,
  input: Record<string, unknown>,
): Promise<boolean> {
  const moved = movedConferencePatch(input)
  if (Object.keys(moved).length === 0) return false
  // Outside a request scope (jobs, tests) there is no host: env lists only.
  const host = await requestHost().catch(() => null)
  // A null host still honours the env list, so the refusal below holds.
  if (!(await isD1WriteTenant(host, conferenceId))) return false
  const jwt = host && (await identityJwt())
  // Refuse rather than write Sanity alone: that would leave D1 stale with
  // nothing to flag it until parity runs.
  if (!host || !jwt) {
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message:
        'Saving these settings needs a Konf sign-in. Sign out and in again, then retry.',
    })
  }
  try {
    // The override's D1 home is tenant-directory (#1997); written first, as
    // the source of truth. `published` below is the conference gate.
    if (input.lifecycleStatus !== undefined)
      await setLifecycleViaApi(
        host,
        conferenceId,
        input.lifecycleStatus as LifecycleStatus | null,
        jwt,
      )
    await updateConferenceViaApi(host, conferenceId, moved, jwt)
  } catch (error) {
    console.error(
      `[conference] D1 write failed for ${conferenceId}; Sanity untouched`,
      error,
    )
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to update conference settings',
      cause: error,
    })
  }
  return true
}

/** The tenant's host: the same source resolveConferenceId uses. */
export async function requestHost(): Promise<string | null> {
  return (await requestDomain()) || null
}

/**
 * The signed-in organizer's identity JWT, minted from this browser's identity
 * session cookie (as /api/token does). Null without a session or on any
 * identity error. No NextAuth upgrade here: that stays a browser flow.
 */
export async function identityJwt(): Promise<string | null> {
  const session = (await cookies()).get(IDENTITY_SESSION_COOKIE)?.value
  if (!session || !process.env.IDENTITY_URL) return null
  try {
    const res = await fetch(
      new URL('/api/auth/token', process.env.IDENTITY_URL),
      {
        headers: { authorization: `Bearer ${session}` },
        cache: 'no-store',
        signal: AbortSignal.timeout(TIMEOUT_MS),
      },
    )
    if (!res.ok) return null
    return ((await res.json()) as { token?: string }).token ?? null
  } catch {
    return null
  }
}

const MUTATION =
  `mutation($input: ConferencePatch!) { updateConference(input: $input) { id } }` as const
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- typing only
const MUTATION_DOC = graphql(MUTATION)

/** One gateway mutation as the signed-in user. Throws on HTTP or GraphQL errors. */
async function mutate<T>(
  host: string,
  query: string,
  variables: Record<string, unknown>,
  userJwt: string,
): Promise<T | undefined> {
  const url = konfApiUrl()
  if (!url) throw new Error('KONF_API_URL is not set on this environment')
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      ...(await konfApiHeaders(host, await headers())),
      authorization: `Bearer ${userJwt}`,
    },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const json = (await res.json()) as {
    data?: T
    errors?: { message?: string }[]
  }
  if (json.errors?.length) {
    throw new Error(json.errors.map((e) => e.message).join('; '))
  }
  return json.data
}

/** Throws on any HTTP, GraphQL or tenant mismatch error. */
export async function updateConferenceViaApi(
  host: string,
  conferenceId: string,
  patch: Record<string, unknown>,
  userJwt: string,
): Promise<void> {
  const data = await mutate<ResultOf<typeof MUTATION_DOC>>(
    host,
    MUTATION,
    { input: patch },
    userJwt,
  )
  const id = data?.updateConference?.id
  if (id !== conferenceId) throw new Error(`conference id mismatch: ${id}`)
}

const LIFECYCLE_MUTATION =
  `mutation($s: ConferenceLifecycleOverride) { setConferenceLifecycle(status: $s) { id } }` as const
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- typing only
const LIFECYCLE_DOC = graphql(LIFECYCLE_MUTATION)

/**
 * Writes the homepage override to tenant-directory, its D1 home (#1997).
 * null clears it. Throws on any HTTP, GraphQL or tenant mismatch error.
 */
export async function setLifecycleViaApi(
  host: string,
  conferenceId: string,
  status: LifecycleStatus | null,
  userJwt: string,
): Promise<void> {
  const data = await mutate<ResultOf<typeof LIFECYCLE_DOC>>(
    host,
    LIFECYCLE_MUTATION,
    { s: status },
    userJwt,
  )
  const id = data?.setConferenceLifecycle?.id
  if (id !== conferenceId) throw new Error(`conference id mismatch: ${id}`)
}
