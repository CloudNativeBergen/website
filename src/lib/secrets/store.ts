import 'server-only'
import { resolvePlatformOrgId } from '@/lib/authz/platform'
import type {
  BadgeSigningCredentials,
  EmailCredentials,
  FamilyCredentials,
  PushCredentials,
  SecretFamily,
  SlackCredentials,
  TicketingCredentials,
} from './types'

/**
 * Per-organization secret RESOLUTION LAYER + storage interface (CaaS #617).
 *
 * WHAT THIS IS: the seam through which every integration's credentials are
 * resolved at the request boundary, keyed by organization, with the platform
 * environment as the DEFAULT TENANT's fallback. It lays the GROUNDWORK for
 * per-org secrets WITHOUT migrating today's setup — the global env stays the
 * platform-default tenant's credentials indefinitely.
 *
 * IT FAILS CLOSED (#844). "The default tenant" is a specific organization, not
 * everybody: the env credentials reach the platform org (or, on a deploy with no
 * `PLATFORM_ORG_ID`, the only org there is) and NOBODY else. A tenant with no
 * secret of its own resolves to `null`, which every consumer already handles as
 * "unconfigured". See {@link envCredentialsBelongToOrg}.
 *
 * WHAT THIS IS NOT: a management UI, and NOT a Sanity-backed store (secrets
 * never live in Sanity). #617's later wave adds the admin surface that writes
 * into a real secret manager behind this same interface.
 *
 * See docs/TENANT_SECRETS.md.
 */

/**
 * A read-only credential store keyed by organization + family.
 *
 * Implementations MUST NOT throw on a missing/partial secret — a miss is `null`
 * so the resolver can fall through to the next store. Encryption-at-rest is
 * delegated to whatever backs the concrete store (Vercel's encrypted env vars
 * today; a secret manager tomorrow).
 */
export interface TenantSecretsStore {
  /** The credentials for `orgId`'s `family`, or `null` when this store has none. */
  get<F extends SecretFamily>(
    orgId: string | null | undefined,
    family: F,
  ): Promise<FamilyCredentials<F> | null>
}

/** True when at least one field of a credential bag carries a non-empty value. */
function anyConfigured(bag: object): boolean {
  return Object.values(bag).some((v) => typeof v === 'string' && v.length > 0)
}

/**
 * Whether the DEPLOYMENT ENVIRONMENT's credentials are this organization's OWN.
 *
 * `RESEND_API_KEY`, `SLACK_BOT_TOKEN`, `CHECKIN_*` and friends are one set of
 * accounts belonging to whoever owns the deployment. The one signal in the
 * codebase for who that is, is the platform-org contract — the same three-case
 * reading `isEmailDeliveryPlatformManaged` (`@/lib/settings/activation-server`)
 * already uses:
 *
 *  - `PLATFORM_ORG_ID` UNSET → single-tenant / self-hosted. Nobody sits above
 *    the organizer, so the env IS theirs. This is what keeps every deploy that
 *    never opted into multi-tenancy — and every local checkout — byte-identical.
 *  - SET, and this IS the platform org → the operator's own tenant. Theirs too.
 *  - SET, and this is any OTHER tenant → the env belongs to the operator. The
 *    tenant gets `null`.
 *
 * FAILS CLOSED on a nullish `orgId` whenever the contract is set: an
 * unresolvable tenant must never resolve to someone else's account. (This is
 * the one place the reading differs from `isEmailDeliveryPlatformManaged`, which
 * answers a UI question — "is this row the organizer's to complete?" — and so
 * fails the other way on purpose. Handing out a credential and rendering a
 * checklist row have opposite safe directions.)
 *
 * Routed through `resolvePlatformOrgId()`, the ONE resolver for the contract
 * (`@/lib/authz/platform`) — a pure env read, no Sanity access, no cache to go
 * stale. It is imported directly rather than via `isPlatformOrganization`
 * (`@/lib/features/platform`) only to keep this module's import graph free of
 * `@/lib/organization/sanity`: `@/lib/email/config` imports this file and is in
 * turn imported almost everywhere, so a Sanity edge here reaches the whole app.
 * The comparison is the identical one.
 */
export function envCredentialsBelongToOrg(
  orgId: string | null | undefined,
): boolean {
  const platformOrgId = resolvePlatformOrgId()
  if (platformOrgId === null) return true
  return Boolean(orgId) && orgId === platformOrgId
}

/**
 * The DEPLOYMENT ENVIRONMENT's credentials for `family`, with NO org question
 * asked. Returns `null` for a family with ZERO configured env vars so a resolver
 * terminates at `null` and the consumer's own soft-fail path runs (identical to
 * unconfigured behavior today).
 *
 * NOT a `TenantSecretsStore`, and deliberately takes no `orgId`: this is the raw
 * platform credential, so every caller must have made its own authorization
 * decision first. Grep for it — there is exactly one caller
 * (`resolveConferenceSlackToken`, on the far side of the `slack-mirror` gate,
 * which grants the platform token to override orgs that {@link EnvSecretsStore}
 * itself would refuse). The org-KEYED way to ask for these is
 * {@link EnvSecretsStore}, which is what the default chain uses.
 *
 * The ticketing mirror of this shape is `platformCheckinCredentials()` /
 * `platformTitoCredentials()` in `@/lib/tickets/provider`.
 *
 * `process.env` is read at call time (not import) so this module stays
 * import-safe and honours test env stubbing.
 */
export function platformEnvCredentials<F extends SecretFamily>(
  family: F,
): FamilyCredentials<F> | null {
  const env = process.env
  switch (family) {
    case 'ticketing': {
      // The env-backed ticketing family is CHECKIN-SHAPED. Tito's platform
      // fallback is NOT here — it lives in `platformTitoCredentials()`
      // (TITO_API_KEY / TITO_WEBHOOK_SECRET) and the Tito resolver branch
      // skips this env store, because a single (orgId, 'ticketing') lookup
      // can't know which vendor a conference selected. Per-org Tito secrets
      // still flow through the provider-agnostic JSON store below.
      const bag: TicketingCredentials = {
        apiKey: env.CHECKIN_API_KEY,
        apiSecret: env.CHECKIN_API_SECRET,
        webhookSecret: env.CHECKIN_WEBHOOK_SECRET,
      }
      return (anyConfigured(bag) ? bag : null) as FamilyCredentials<F> | null
    }
    case 'email': {
      const apiKey = env.RESEND_API_KEY
      if (!apiKey) return null
      const bag: EmailCredentials = { apiKey }
      return bag as FamilyCredentials<F>
    }
    case 'slack': {
      const botToken = env.SLACK_BOT_TOKEN
      if (!botToken) return null
      const bag: SlackCredentials = { botToken }
      return bag as FamilyCredentials<F>
    }
    case 'push': {
      const bag: PushCredentials = {
        publicKey: env.VAPID_PUBLIC_KEY ?? '',
        privateKey: env.VAPID_PRIVATE_KEY ?? '',
        subject: env.VAPID_SUBJECT?.trim() ?? '',
      }
      return (anyConfigured(bag) ? bag : null) as FamilyCredentials<F> | null
    }
    case 'badge': {
      const rsaPrivateKey = env.BADGE_ISSUER_RSA_PRIVATE_KEY
      const rsaPublicKey = env.BADGE_ISSUER_RSA_PUBLIC_KEY
      const ed25519Seed = env.BADGE_ISSUER_ED25519_SEED
      if (!rsaPrivateKey && !rsaPublicKey && !ed25519Seed) return null
      const bag: BadgeSigningCredentials = {
        rsaPrivateKey: rsaPrivateKey ?? '',
        rsaPublicKey: rsaPublicKey ?? '',
        ed25519Seed: ed25519Seed ?? '',
        rsaOnly: env.BADGE_ISSUER_RSA_ONLY === 'true',
      }
      return bag as FamilyCredentials<F>
    }
    default:
      return null
  }
}

/**
 * (a) The platform-DEFAULT store: the deployment environment's credentials,
 * handed out ONLY to the organization those credentials actually belong to
 * ({@link envCredentialsBelongToOrg}). Any other tenant — and any unresolvable
 * tenant once `PLATFORM_ORG_ID` is set — gets `null`, so the default chain
 * terminates at `null` and the consumer takes the same soft-fail path it takes
 * when nothing is configured at all.
 *
 * WHY IT IS GATED HERE rather than at each consumer (#844). This store used to
 * be org-BLIND: it took an `orgId`, ignored it, and returned the platform's
 * accounts to anybody. Nothing in the type system or the call shape distinguished
 * a careless `resolveTenantSecrets(orgId, family)` from a correct one — the same
 * fail-open class as a scoped query that silently runs global when its org is
 * `null`. Two of the three consumers had already had to work around the default
 * (ticketing bypassed the chain, Slack gated it), which is the signal that the
 * default pointed the wrong way. Now the careless call gets `null`.
 *
 * NOT A REPLACEMENT for a consumer's own authorization. Answering "these
 * credentials are yours" is not the same question as "you may use this
 * integration": `resolveTicketingCredentials` and `resolveConferenceSlackToken`
 * both still decide their own, and this store is the floor beneath them.
 */
export class EnvSecretsStore implements TenantSecretsStore {
  async get<F extends SecretFamily>(
    orgId: string | null | undefined,
    family: F,
  ): Promise<FamilyCredentials<F> | null> {
    if (!envCredentialsBelongToOrg(orgId)) return null
    return platformEnvCredentials(family)
  }
}

/**
 * (b) The minimal PER-ORG mechanism that works TODAY on Vercel with NO new
 * infra: an optional `TENANT_SECRETS_JSON` env var holding a JSON map
 * `orgId -> family -> credentials`. Chosen over a per-org env-var naming
 * convention (`TENANT_<ORGID>_CHECKIN_API_KEY`, …) because org ids are Sanity
 * document ids not known at deploy time and a flat convention explodes the env
 * surface; a single JSON blob is self-contained, encrypted at rest by Vercel's
 * env storage, and trivially superseded by a real secret manager behind this
 * same interface later.
 *
 * A malformed blob is logged ONCE and treated as empty (never throws) so a bad
 * secret payload degrades to the env fallback rather than breaking every tenant.
 */
type TenantSecretsJson = Partial<
  Record<string, Partial<Record<SecretFamily, unknown>>>
>

export class JsonEnvSecretsStore implements TenantSecretsStore {
  private cacheKey: string | undefined
  private parsed: TenantSecretsJson | null = null
  private warned = false

  private load(): TenantSecretsJson | null {
    const raw = process.env.TENANT_SECRETS_JSON
    if (!raw) {
      this.cacheKey = undefined
      this.parsed = null
      return null
    }
    if (raw === this.cacheKey) return this.parsed
    try {
      this.parsed = JSON.parse(raw) as TenantSecretsJson
      this.warned = false
    } catch (err) {
      if (!this.warned) {
        this.warned = true
        console.warn(
          '[secrets] TENANT_SECRETS_JSON is not valid JSON; ignoring per-org secrets and using the env fallback.',
          err instanceof Error ? err.message : err,
        )
      }
      this.parsed = null
    }
    this.cacheKey = raw
    return this.parsed
  }

  async get<F extends SecretFamily>(
    orgId: string | null | undefined,
    family: F,
  ): Promise<FamilyCredentials<F> | null> {
    if (!orgId) return null
    const map = this.load()
    const creds = map?.[orgId]?.[family]
    // Shape guard: only a NON-EMPTY plain object counts as a per-org hit. A
    // non-object or empty entry in TENANT_SECRETS_JSON must not shadow the env
    // fallback (a "hit" of junk would disable the platform default silently).
    if (
      !creds ||
      typeof creds !== 'object' ||
      Array.isArray(creds) ||
      Object.keys(creds).length === 0
    ) {
      if (creds !== undefined && creds !== null) {
        console.warn(
          `[secrets] TENANT_SECRETS_JSON entry for ${orgId}/${family} is not a non-empty object; ignoring (env fallback applies)`,
        )
      }
      return null
    }
    return creds as FamilyCredentials<F>
  }
}

/** The platform-default (env) store singleton. */
export const envSecretsStore: TenantSecretsStore = new EnvSecretsStore()

/** The per-org (TENANT_SECRETS_JSON) store singleton. */
export const perOrgSecretsStore: TenantSecretsStore = new JsonEnvSecretsStore()

/**
 * The production resolution chain: a per-org hit wins, otherwise the platform
 * env default IF the env belongs to that org, otherwise `null`. A real
 * secret-manager store slots in front of `envSecretsStore` here (or replaces
 * `perOrgSecretsStore`) behind the exact same interface — no consumer changes.
 *
 * SAFE TO USE NAIVELY (#844): `resolveTenantSecrets(orgId, family)` on this chain
 * hands a non-platform tenant its OWN credentials or nothing. It cannot hand it
 * the platform's.
 */
export const DEFAULT_SECRETS_CHAIN: readonly TenantSecretsStore[] = [
  perOrgSecretsStore,
  envSecretsStore,
]

/**
 * Resolve `family` credentials for `orgId` through a store chain (per-org hit →
 * env fallback → null). `stores` is injectable so consumers and tests can supply
 * an alternate chain; production uses {@link DEFAULT_SECRETS_CHAIN}.
 */
export async function resolveTenantSecrets<F extends SecretFamily>(
  orgId: string | null | undefined,
  family: F,
  stores: readonly TenantSecretsStore[] = DEFAULT_SECRETS_CHAIN,
): Promise<FamilyCredentials<F> | null> {
  for (const store of stores) {
    const hit = await store.get(orgId, family)
    if (hit) return hit
  }
  return null
}
