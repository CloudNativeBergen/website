import { CheckinProvider } from './checkin'
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
 * This is the request boundary's credential source TODAY. TODO(#617): a
 * per-organization secret store plugs in here so each tenant can bring its own
 * ticketing account; the provider itself stays credential-agnostic.
 */
export function platformCheckinCredentials(): TicketingProviderCredentials {
  return {
    apiKey: process.env.CHECKIN_API_KEY,
    apiSecret: process.env.CHECKIN_API_SECRET,
    webhookSecret: process.env.CHECKIN_WEBHOOK_SECRET,
  }
}

/** Just the conference fields the ticketing resolver needs. */
type ConferenceTicketingBinding = {
  checkinCustomerId?: number
  checkinEventId?: number
}

/**
 * Request-boundary resolution of a ticketing provider for an already
 * domain-resolved conference.
 *
 * Returns `{ configured: true, provider, eventRef }` when the conference is
 * bound to a customer + event id, or an unconfigured result otherwise. This
 * mirrors today's per-consumer `!checkinCustomerId || !checkinEventId` guard —
 * unconfigured behaves IDENTICALLY to before (callers short-circuit to their
 * existing empty/soft-fail path). Note: like today, this does NOT pre-check API
 * credentials; when those are absent the provider's operations throw at call
 * time and are caught by each consumer's existing error path.
 */
export function resolveTicketingProvider(
  conference: ConferenceTicketingBinding,
): ResolvedTicketing {
  if (!conference.checkinCustomerId || !conference.checkinEventId) {
    return { configured: false, provider: null, eventRef: null }
  }

  return {
    configured: true,
    provider: getTicketingProvider('checkin', platformCheckinCredentials()),
    eventRef: {
      customerId: conference.checkinCustomerId,
      eventId: conference.checkinEventId,
    },
  }
}

export type ResolvedTicketing =
  | { configured: true; provider: TicketingProvider; eventRef: EventRef }
  | { configured: false; provider: null; eventRef: null }
