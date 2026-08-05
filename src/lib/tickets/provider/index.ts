import { CheckinProvider } from './checkin'
import { TitoProvider } from './tito'
import { resolveTenantSecrets, perOrgSecretsStore } from '@/lib/secrets/store'
import { isPlatformOrganization } from '@/lib/features/platform'
import type {
  EventRef,
  TicketingProvider,
  TicketingProviderCredentials,
} from './types'

export type {
  TicketingProvider,
  TicketingProviderCredentials,
  EventRef,
  CheckinEventRef,
  TitoEventRef,
}
export { ProviderUnsupportedError } from './types'
export type {
  PublicEventInfo,
  PublicTicketType,
  TicketPrice,
  WebhookVerifyResult,
  CheckinWebhookPayload,
  CheckinOrderCreatedData,
  CheckinWebhookUser,
} from './types'
import type { CheckinEventRef, TitoEventRef } from './types'

/** Provider discriminator. Checkin.no is the default; Tito (this PR) is the
 * second provider — the proof the adapter generalizes. */
export type TicketingProviderType = 'checkin' | 'tito'

/**
 * Returns a ticketing provider bound to the given credentials.
 *
 * The provider NEVER reads `process.env` — credentials are injected here. An
 * unknown/absent `providerType` defaults to Checkin (today's only provider),
 * mirroring the contract-signing factory's default-provider behavior.
 */
export function getTicketingProvider(
  providerType: TicketingProviderType | null | undefined,
  credentials: TicketingProviderCredentials,
): TicketingProvider {
  switch (providerType) {
    case 'tito':
      return new TitoProvider(credentials)
    case 'checkin':
    default:
      return new CheckinProvider(credentials)
  }
}

/**
 * Platform-default credentials, assembled from environment variables.
 *
 * These are the PLATFORM ORG's credentials, not a universal default. Org-aware
 * callers MUST go through {@link resolveTicketingCredentials} /
 * {@link resolveTicketingProvider}, which hand these out only when the org IS
 * the platform org. The one legitimate direct consumer is the inbound
 * `/api/webhooks/checkin/ticket-sold` route, which verifies a signature BEFORE
 * any tenant is known and so has no org to key on.
 */
export function platformCheckinCredentials(): TicketingProviderCredentials {
  return {
    apiKey: process.env.CHECKIN_API_KEY,
    apiSecret: process.env.CHECKIN_API_SECRET,
    webhookSecret: process.env.CHECKIN_WEBHOOK_SECRET,
  }
}

/**
 * Platform-default TITO credentials, assembled from environment variables —
 * the Tito mirror of {@link platformCheckinCredentials}. Tito authenticates with
 * a single API token (`TITO_API_KEY`) and signs webhooks with the endpoint
 * security token (`TITO_WEBHOOK_SECRET`).
 *
 * NOTE on the resolver: the env-backed `ticketing` family in `EnvSecretsStore`
 * is Checkin-shaped (it reads `CHECKIN_*`) AND org-blind, so
 * {@link resolveTicketingCredentials} does not use that store at all — it reads
 * per-org secrets from the provider-agnostic JSON store and layers the
 * platform-org-only env fallback (this function for Tito) on top itself.
 */
export function platformTitoCredentials(): TicketingProviderCredentials {
  return {
    apiKey: process.env.TITO_API_KEY,
    webhookSecret: process.env.TITO_WEBHOOK_SECRET,
  }
}

/**
 * THE single place ticketing credentials are chosen for an organization.
 *
 * ORDER:
 *  1. A per-org secret (`TENANT_SECRETS_JSON` → the org's own provider account)
 *     always wins. That is the tenant's OWN credential; nothing is shared.
 *  2. Otherwise the platform env credentials, but ONLY for the platform org
 *     (`PLATFORM_ORG_ID`). This deployment's platform org is also a tenant, so
 *     it must keep the env account it has always used — every existing surface
 *     stays byte-identical for it.
 *  3. Otherwise `null`. A tenant without its own provider secret gets NO
 *     credentials rather than the platform's.
 *
 * WHY (cross-tenant isolation). The env credentials are one Checkin/Tito
 * ACCOUNT. A conference's `checkinEventId` / `titoEventSlug` is a provider-side
 * id that no Sanity document guard can see, so handing that account to an
 * arbitrary tenant makes their own binding fields address the platform's
 * account. `ticketingBindingIsClaimed` (`src/server/routers/conference.ts`)
 * already refuses a binding another conference document has claimed, but an
 * event that exists in the platform account and is bound to NO conference
 * document is invisible to that check — it needs a provider round-trip to
 * detect. Withholding the credential closes that residue at the source: with no
 * account to address, an unclaimed event id resolves to nothing.
 *
 * FAILS CLOSED on a nullish `orgId` — an unresolvable tenant gets nothing.
 *
 * DEV NOTE: `PLATFORM_ORG_ID` is set on production and preview but NOT in local
 * development, so locally this returns `null` and ticketing surfaces render
 * their existing unconfigured empty states. That is deliberate: a developer
 * pointing a local checkout at the real Checkin account is the same
 * cross-account hazard this function exists to remove. Set `PLATFORM_ORG_ID`
 * (and the provider env vars) locally to exercise the real integration.
 */
export async function resolveTicketingCredentials(
  orgId: string | null | undefined,
  providerType: TicketingProviderType,
): Promise<TicketingProviderCredentials | null> {
  // The env-backed `ticketing` family in `EnvSecretsStore` is Checkin-shaped AND
  // org-blind (it returns the platform env for ANY org id), so the chain here is
  // the per-org store ONLY; the platform env is layered back on below, gated.
  const perOrg = await resolveTenantSecrets(orgId, 'ticketing', [
    perOrgSecretsStore,
  ])
  if (perOrg) return perOrg

  if (!(await isPlatformOrganization(orgId))) return null

  return providerType === 'tito'
    ? platformTitoCredentials()
    : platformCheckinCredentials()
}

/**
 * Just the conference fields the ticketing resolver needs.
 *
 * PROVIDER-DISCRIMINATED (Tito, this PR): `ticketingProvider` selects the vendor
 * (ABSENT ⇒ 'checkin', preserving every legacy conference's behavior). Each
 * provider reads only its own binding fields — Checkin the numeric
 * customer/event ids, Tito the account/event slugs.
 */
export type ConferenceTicketingBinding = {
  /** Selected vendor. Absent ⇒ 'checkin' (zero behavior change for legacy docs). */
  ticketingProvider?: TicketingProviderType | null
  checkinCustomerId?: number
  checkinEventId?: number
  titoAccountSlug?: string | null
  titoEventSlug?: string | null
  /** The owning organization (tenant), used to resolve per-org credentials. */
  organization?: { _ref?: string } | null
}

/** The vendor a conference is bound to (absent ⇒ Checkin, the historical default). */
export function conferenceProviderType(
  conference: ConferenceTicketingBinding,
): TicketingProviderType {
  return conference.ticketingProvider === 'tito' ? 'tito' : 'checkin'
}

/**
 * Extract the minimal {@link ConferenceTicketingBinding} from a (potentially
 * huge) conference object. Callers of CACHED ticketing reads (e.g.
 * `getPublicTicketTypes`, a `'use cache'` function) must pass THIS rather than
 * the whole conference: `'use cache'` keys on the serialized arguments, so a
 * full conference payload (schedules, featured content, …) would fragment the
 * cache on every unrelated field change.
 */
export function ticketingBinding(
  conference: ConferenceTicketingBinding,
): ConferenceTicketingBinding {
  return {
    ticketingProvider: conference.ticketingProvider ?? undefined,
    checkinCustomerId: conference.checkinCustomerId,
    checkinEventId: conference.checkinEventId,
    titoAccountSlug: conference.titoAccountSlug ?? undefined,
    titoEventSlug: conference.titoEventSlug ?? undefined,
    organization: conference.organization?._ref
      ? { _ref: conference.organization._ref }
      : null,
  }
}

/**
 * True when the conference carries the FULL ticketing binding for its selected
 * provider ({@link resolveTicketingProvider} requires BOTH of a provider's
 * binding fields — one alone is a configuration error, not a supported state).
 * Callers should gate on this before invoking cached ticketing reads so an
 * unconfigured conference skips the fetch instead of soft-failing inside it.
 */
export function hasTicketingBinding(
  conference: ConferenceTicketingBinding,
): boolean {
  if (conferenceProviderType(conference) === 'tito') {
    return Boolean(conference.titoAccountSlug && conference.titoEventSlug)
  }
  return Boolean(conference.checkinCustomerId && conference.checkinEventId)
}

/**
 * Request-boundary resolution of a ticketing provider for an already
 * domain-resolved conference.
 *
 * Returns `{ configured: true, provider, eventRef }` when the conference is
 * bound to a customer + event id, or an unconfigured result otherwise. This
 * mirrors today's per-consumer `!checkinCustomerId || !checkinEventId` guard —
 * unconfigured behaves IDENTICALLY to before (callers short-circuit to their
 * existing empty/soft-fail path).
 *
 * CREDENTIALS: resolved through {@link resolveTicketingCredentials} — a per-org
 * secret wins, the platform env applies to the PLATFORM ORG ONLY, and anything
 * else resolves to `null`. A `null` resolution returns the SAME unconfigured
 * result as a missing binding, so callers short-circuit to the empty states they
 * already render; nothing new has to be handled. Like today, this does NOT
 * pre-check that the resolved credentials work; when the values are absent the
 * provider's operations throw at call time into each consumer's error path.
 */
export async function resolveTicketingProvider(
  conference: ConferenceTicketingBinding,
): Promise<ResolvedTicketing> {
  const orgId = conference.organization?._ref
  const providerType = conferenceProviderType(conference)

  if (providerType === 'tito') {
    if (!conference.titoAccountSlug || !conference.titoEventSlug) {
      return { configured: false, provider: null, eventRef: null }
    }
    // A per-org Tito ticketing secret is an opaque `{ apiKey, webhookSecret? }`
    // record; the platform Tito env applies to the platform org only.
    const credentials = await resolveTicketingCredentials(orgId, 'tito')
    if (!credentials) {
      return { configured: false, provider: null, eventRef: null }
    }

    const eventRef: TitoEventRef = {
      provider: 'tito',
      accountSlug: conference.titoAccountSlug,
      eventSlug: conference.titoEventSlug,
    }
    return {
      configured: true,
      provider: getTicketingProvider('tito', credentials),
      eventRef,
    }
  }

  // Checkin (default) — unchanged behavior: requires customer + event id.
  if (!conference.checkinCustomerId || !conference.checkinEventId) {
    return { configured: false, provider: null, eventRef: null }
  }

  const credentials = await resolveTicketingCredentials(orgId, 'checkin')
  if (!credentials) {
    return { configured: false, provider: null, eventRef: null }
  }

  const eventRef: CheckinEventRef = {
    customerId: conference.checkinCustomerId,
    eventId: conference.checkinEventId,
  }
  return {
    configured: true,
    provider: getTicketingProvider('checkin', credentials),
    eventRef,
  }
}

export type ResolvedTicketing =
  | { configured: true; provider: TicketingProvider; eventRef: EventRef }
  | { configured: false; provider: null; eventRef: null }
