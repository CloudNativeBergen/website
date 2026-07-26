import { CheckinProvider } from './checkin'
import { resolveTenantSecrets } from '@/lib/secrets/store'
import type {
  EventRef,
  TicketingProvider,
  TicketingProviderCredentials,
} from './types'

export type { TicketingProvider, TicketingProviderCredentials, EventRef }
export type {
  PublicEventInfo,
  PublicTicketType,
  TicketPrice,
  WebhookVerifyResult,
  CheckinWebhookPayload,
  CheckinOrderCreatedData,
  CheckinWebhookUser,
} from './types'

/** Provider discriminator. Only Checkin.no exists today; the second provider
 * (a separate PR) extends this union. */
export type TicketingProviderType = 'checkin'

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

/** Just the conference fields the ticketing resolver needs. */
export type ConferenceTicketingBinding = {
  checkinCustomerId?: number
  checkinEventId?: number
  /** The owning organization (tenant), used to resolve per-org credentials. */
  organization?: { _ref?: string } | null
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
    checkinCustomerId: conference.checkinCustomerId,
    checkinEventId: conference.checkinEventId,
    organization: conference.organization?._ref
      ? { _ref: conference.organization._ref }
      : null,
  }
}

/**
 * True when the conference carries the FULL ticketing binding
 * ({@link resolveTicketingProvider} requires both the customer and event id —
 * an event id alone is a configuration error, not a supported state). Callers
 * should gate on this before invoking cached ticketing reads so an
 * unconfigured conference skips the fetch instead of soft-failing inside it.
 */
export function hasTicketingBinding(
  conference: ConferenceTicketingBinding,
): boolean {
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
  if (!conference.checkinCustomerId || !conference.checkinEventId) {
    return { configured: false, provider: null, eventRef: null }
  }

  const orgId = conference.organization?._ref
  const credentials =
    (await resolveTenantSecrets(orgId, 'ticketing')) ??
    platformCheckinCredentials()

  return {
    configured: true,
    provider: getTicketingProvider('checkin', credentials),
    eventRef: {
      customerId: conference.checkinCustomerId,
      eventId: conference.checkinEventId,
    },
  }
}

export type ResolvedTicketing =
  | { configured: true; provider: TicketingProvider; eventRef: EventRef }
  | { configured: false; provider: null; eventRef: null }
