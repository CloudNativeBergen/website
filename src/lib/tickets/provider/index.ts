import { CheckinProvider } from './checkin'
import { TitoProvider } from './tito'
import { resolveTenantSecrets, perOrgSecretsStore } from '@/lib/secrets/store'
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
 * The env-backed default-tenant credential source. Still the direct source for
 * consumers that operate outside an org context (webhooks, cross-tenant admin
 * reads). The org-aware request boundary resolves through
 * {@link resolveTicketingProvider}, which layers a per-org secret store
 * (CaaS #617) IN FRONT of this via `resolveTenantSecrets`.
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
 * NOTE on the resolver: the env-backed `ticketing` family in
 * {@link EnvSecretsStore} is Checkin-shaped (it reads `CHECKIN_*`), so the Tito
 * branch of {@link resolveTicketingProvider} does NOT use that env store as its
 * fallback — it resolves per-org Tito secrets through the provider-agnostic
 * JSON store and falls back to THIS function.
 */
export function platformTitoCredentials(): TicketingProviderCredentials {
  return {
    apiKey: process.env.TITO_API_KEY,
    webhookSecret: process.env.TITO_WEBHOOK_SECRET,
  }
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
 * CREDENTIALS (CaaS #617): resolved through `resolveTenantSecrets(orgId,
 * 'ticketing')` — a per-org secret store hit wins, otherwise the platform env
 * default (`platformCheckinCredentials`), preserved as the terminal fallback so
 * behavior is UNCHANGED for every tenant until a per-org secret is provisioned.
 * Like today, this does NOT pre-check API credentials; when those are absent the
 * provider's operations throw at call time and are caught by each consumer's
 * existing error path.
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
    // The env-backed `ticketing` family is Checkin-shaped, so the Tito branch
    // resolves per-org secrets through the provider-agnostic JSON store ONLY,
    // then falls back to the platform Tito env creds. A per-org Tito ticketing
    // secret is an opaque `{ apiKey, webhookSecret? }` record.
    const credentials =
      (await resolveTenantSecrets(orgId, 'ticketing', [perOrgSecretsStore])) ??
      platformTitoCredentials()

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

  const credentials =
    (await resolveTenantSecrets(orgId, 'ticketing')) ??
    platformCheckinCredentials()

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
