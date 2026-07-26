import type { TicketingProviderCredentials } from '@/lib/tickets/provider'

/**
 * Typed credential families for the per-organization secret resolution layer
 * (CaaS #617).
 *
 * DESIGN CONTRACT:
 *  - Secrets do NOT live in Sanity. They are resolved at the request boundary
 *    from a {@link TenantSecretsStore} keyed by organization, with the platform
 *    environment as the fallback / default-tenant credential source.
 *  - Each family is a small, integration-specific credential bag. They mirror
 *    exactly what today's env-backed consumers already read — this wave adds a
 *    resolution seam, it does NOT change any credential's shape or meaning.
 *  - A provider/consumer decides "configured-ness" from the resolved bag exactly
 *    as it does today (e.g. the ticketing provider's own `isConfigured()`); the
 *    store layer never asserts or throws on a partially-populated family.
 */

/**
 * Ticketing provider credentials. This is the SAME shape #634 injects into a
 * `TicketingProvider` at construction — imported (not duplicated) so the secret
 * layer and the provider layer can never drift apart.
 */
export type TicketingCredentials = TicketingProviderCredentials

/** Resend email credentials. `fallbackFrom` is an optional default From address. */
export interface EmailCredentials {
  apiKey: string
  fallbackFrom?: string
}

/** Slack bot credentials (the `chat.postMessage` bearer token). */
export interface SlackCredentials {
  botToken: string
}

/**
 * Web-push VAPID key pair + contact subject (issue #444). Mirrors the three
 * `VAPID_*` env vars `@/lib/push/vapid` reads today.
 */
export interface PushCredentials {
  publicKey: string
  privateKey: string
  subject: string
}

/**
 * OpenBadges issuer signing material (`@/lib/badge/config`). RSA keys sign the
 * RS256 JWT proof; the Ed25519 seed signs the embedded Data Integrity proof.
 */
export interface BadgeSigningCredentials {
  rsaPrivateKey: string
  rsaPublicKey: string
  ed25519Seed: string
  /** Enforce PEM RSA keys (`BADGE_ISSUER_RSA_ONLY`). */
  rsaOnly?: boolean
}

/** The discriminator union over every credential family. */
export type SecretFamily = 'ticketing' | 'email' | 'slack' | 'push' | 'badge'

/** Family discriminator → its credential bag. */
export interface FamilyCredentialsMap {
  ticketing: TicketingCredentials
  email: EmailCredentials
  slack: SlackCredentials
  push: PushCredentials
  badge: BadgeSigningCredentials
}

/** The credential bag for a given family (defaults to the full union). */
export type FamilyCredentials<F extends SecretFamily = SecretFamily> =
  FamilyCredentialsMap[F]
