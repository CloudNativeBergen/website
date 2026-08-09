import 'server-only'
import type { TenantSecretsStore } from './store'
import type {
  EmailCredentials,
  FamilyCredentials,
  SecretFamily,
  TicketingCredentials,
} from './types'

/**
 * PER-ORG DISCRETE ENV VARS — `TENANT_<SLUG>_<FAMILY>_<FIELD>`
 * (RunKonf/platform#57, milestone M-A).
 *
 * WHY THIS EXISTS ALONGSIDE `TENANT_SECRETS_JSON`. Vercel marks secret env vars
 * **Sensitive**: once written they cannot be read back. A single JSON blob
 * holding every tenant's credentials is therefore only editable by
 * reconstructing it from a copy kept somewhere else — which is exactly the copy
 * a secret store exists to avoid. Discrete variables are independently settable:
 * adding a tenant, or rotating one field, touches one variable and needs no
 * knowledge of any other tenant's secrets. The JSON blob is NOT removed; it
 * stays behind this store in the chain and keeps working for anything using it.
 *
 * THE NAME IS DERIVED FROM A DEPLOY-TIME CONSTANT, NEVER FROM SANITY. See
 * {@link TENANT_ENV_SLUGS}.
 *
 * IT FAILS CLOSED. An unknown org id, an org with no slug, an unsupported
 * family, or an INCOMPLETE set of variables all return `null` — never a bag with
 * `undefined` fields. A half-configured tenant must resolve to "unconfigured"
 * and take the caller's existing soft-fail path, because the alternative is a
 * credential bag that looks configured, fails at the provider, and (for email)
 * silently falls back to the platform account.
 *
 * `process.env` is read at CALL time, not import time, so the module is
 * import-safe and honours test env stubbing.
 *
 * See docs/TENANT_SECRETS.md for the operator-facing variable names.
 */

/**
 * A slug must be uppercase alphanumeric: it is spliced into an env var name, so
 * anything else (lowercase, `-`, `.`, or an embedded `_`) either produces a name
 * no shell/Vercel UI can round-trip or makes `TENANT_<SLUG>_<FAMILY>_<FIELD>`
 * ambiguous to read.
 */
const SLUG_PATTERN = /^[A-Z0-9]+$/

/**
 * The orgId → env-var slug map. **A DEPLOY-TIME CONSTANT, IN CODE, ON PURPOSE.**
 *
 * WHY THIS IS NOT A SANITY FIELD. We have already had a production incident
 * from deriving privilege from a MUTABLE Sanity field: platform-operator
 * standing was resolved through the organization SLUG, an org rename moved the
 * slug, and the platform locked itself out. The fix (RunKonf/platform#43) was to
 * bind the contract to the immutable document `_id` via a `PLATFORM_ORG_ID` env
 * var — see the note in `@/lib/authz/platform`.
 *
 * Deriving ENV VAR NAMES from a customer-editable field is the same mistake with
 * a QUIETER failure mode. A rename would not throw: `TENANT_<newslug>_EMAIL_*`
 * simply does not exist, every lookup returns `null`, and the tenant silently
 * drops back to the platform account — dedicated sending off, sender policy back
 * on, nobody paged. A rename is a routine organizer action; a credential
 * rebinding must not be.
 *
 * So the mapping is source code: auditable in `git log`, reviewed like any other
 * change, and impossible for an organizer to edit. The KEY is the immutable
 * document `_id` (the same tenant key the rest of the secrets layer uses); the
 * VALUE is an opaque label that exists only to name env vars and has no meaning
 * anywhere else — it is deliberately NOT the org's slug, so the two can never be
 * confused for one another.
 */
export const TENANT_ENV_SLUGS: Readonly<Record<string, string>> =
  /* Declared after SLUG_PATTERN so this initializer is not in its TDZ. */
  validateTenantEnvSlugs({
    'organization-cloud-native-days': 'CNDN',
  })

/**
 * Validate the map at MODULE LOAD so a bad entry fails loudly at import (build,
 * boot, and the test suite) rather than silently resolving no credentials at
 * send time. Exported so tests can exercise the rejection paths without editing
 * the real map.
 *
 * Duplicate slugs are rejected too: two orgs sharing a slug would read the SAME
 * variables, which is a cross-tenant credential leak by typo.
 */
export function validateTenantEnvSlugs(
  map: Record<string, string>,
): Readonly<Record<string, string>> {
  const byslug = new Map<string, string>()
  for (const [orgId, slug] of Object.entries(map)) {
    if (!orgId.trim()) {
      throw new Error(
        `[secrets] TENANT_ENV_SLUGS has an empty organization id (slug ${JSON.stringify(slug)})`,
      )
    }
    if (!SLUG_PATTERN.test(slug)) {
      throw new Error(
        `[secrets] TENANT_ENV_SLUGS slug ${JSON.stringify(slug)} for ${orgId} is not uppercase alphanumeric; it is spliced into a TENANT_<SLUG>_<FAMILY>_<FIELD> env var name`,
      )
    }
    const clash = byslug.get(slug)
    if (clash) {
      throw new Error(
        `[secrets] TENANT_ENV_SLUGS slug ${slug} is used by both ${clash} and ${orgId}; two organizations would read the same credentials`,
      )
    }
    byslug.set(slug, orgId)
  }
  return Object.freeze({ ...map })
}

/**
 * The env-var FAMILY segment. Deliberately NOT the `SecretFamily` name for
 * ticketing: the bag this store assembles is CHECKIN-shaped (it mirrors the
 * platform's `CHECKIN_*` vars), and naming it `TICKETING` would imply it can
 * answer for a Tito conference, which it cannot. Only the families with a wired
 * consumer appear here; every other family resolves to `null`.
 *
 * ADDING A FAMILY IS NOT A ONE-LINE CHANGE. Some consumers ask ONE store rather
 * than the chain and would not see the new variables: `resolveConferenceSlackToken`
 * (`@/lib/slack/token`) reads `perOrgSecretsStore` directly, so adding `slack`
 * here without switching that call to `PER_ORG_SECRETS_STORES` would resolve
 * nothing. Audit every `perOrgSecretsStore.get(…, '<family>')` call site first.
 */
const FAMILY_SEGMENT = {
  email: 'EMAIL',
  ticketing: 'CHECKIN',
} as const satisfies Partial<Record<SecretFamily, string>>

type SupportedFamily = keyof typeof FAMILY_SEGMENT

/** The env var an operator sets for one tenant/family/field. */
export function tenantEnvVarName(
  slug: string,
  family: SupportedFamily,
  field: string,
): string {
  return `TENANT_${slug}_${FAMILY_SEGMENT[family]}_${field}`
}

/**
 * The tenant slug for an org id, or `null` when the org is not mapped.
 *
 * `Object.hasOwn`, not a bare index: a plain object inherits from
 * `Object.prototype`, so `TENANT_ENV_SLUGS['constructor']` would otherwise
 * return a FUNCTION and break the `string | null` contract. No such value can
 * name a real env var, so this is a contract fix rather than a vulnerability —
 * but a lookup that can return a non-string is exactly the kind of thing a later
 * caller assumes away.
 */
export function tenantEnvSlug(orgId: string | null | undefined): string | null {
  if (!orgId) return null
  return Object.hasOwn(TENANT_ENV_SLUGS, orgId) ? TENANT_ENV_SLUGS[orgId] : null
}

/**
 * (c) The per-org DISCRETE ENV VAR store. See the module doc for why it exists
 * and why the slug map is code.
 */
export class EnvPerOrgSecretsStore implements TenantSecretsStore {
  /** Partial-configuration warnings already emitted, keyed `slug/family`. */
  private warned = new Set<string>()

  async get<F extends SecretFamily>(
    orgId: string | null | undefined,
    family: F,
  ): Promise<FamilyCredentials<F> | null> {
    const slug = tenantEnvSlug(orgId)
    // Unknown/unmapped org → this store has nothing to say. Not an error: the
    // resolver falls through to the next store in the chain.
    if (!slug) return null

    switch (family) {
      case 'email':
        return this.email(slug) as FamilyCredentials<F> | null
      case 'ticketing':
        return this.ticketing(slug) as FamilyCredentials<F> | null
      default:
        // slack / push / badge have no discrete-var consumer yet. Returning
        // `null` (rather than assembling a bag from names nobody documents)
        // keeps the chain falling through to exactly today's behaviour.
        return null
    }
  }

  /** A trimmed non-empty value, or `undefined`. */
  private read(
    slug: string,
    family: SupportedFamily,
    field: string,
  ): string | undefined {
    const value = process.env[tenantEnvVarName(slug, family, field)]?.trim()
    return value ? value : undefined
  }

  /**
   * Warn ONCE per tenant/family that a partial set was ignored. This is the
   * failure the whole store exists to make visible: a half-configured tenant
   * that silently keeps sending on the platform account looks identical to one
   * that was never configured.
   */
  private warnPartial(
    slug: string,
    family: SupportedFamily,
    missing: string[],
  ): void {
    const key = `${slug}/${family}`
    if (this.warned.has(key)) return
    this.warned.add(key)
    console.warn(
      `[secrets] TENANT_${slug}_${FAMILY_SEGMENT[family]}_* is partially configured; ignoring it (missing: ${missing
        .map((field) => tenantEnvVarName(slug, family, field))
        .join(', ')})`,
    )
  }

  /**
   * `TENANT_<SLUG>_EMAIL_API_KEY` (required) + `TENANT_<SLUG>_EMAIL_FROM`
   * (optional default From). The key alone is a complete credential; a FROM
   * without a key is not, and resolves to `null`.
   */
  private email(slug: string): EmailCredentials | null {
    const apiKey = this.read(slug, 'email', 'API_KEY')
    const from = this.read(slug, 'email', 'FROM')
    if (!apiKey) {
      if (from) this.warnPartial(slug, 'email', ['API_KEY'])
      return null
    }
    return from ? { apiKey, fallbackFrom: from } : { apiKey }
  }

  /**
   * `TENANT_<SLUG>_CHECKIN_API_KEY` / `_API_SECRET` / `_WEBHOOK_SECRET` — ALL
   * THREE required.
   *
   * Why all three rather than "whatever is set": `TicketingCredentials` fields
   * are all optional in the type, so a partial bag is a perfectly well-typed
   * value that `CheckinProvider` accepts and then fails on at call time, deep
   * inside a consumer's error path. Requiring the full set means a tenant is
   * either fully cut over or untouched — there is no in-between state where
   * reads work and webhook verification silently does not.
   */
  private ticketing(slug: string): TicketingCredentials | null {
    const fields = ['API_KEY', 'API_SECRET', 'WEBHOOK_SECRET'] as const
    const values = fields.map((field) => this.read(slug, 'ticketing', field))
    const missing = fields.filter((_, i) => !values[i])
    if (missing.length > 0) {
      if (missing.length < fields.length) {
        this.warnPartial(slug, 'ticketing', [...missing])
      }
      return null
    }
    const [apiKey, apiSecret, webhookSecret] = values
    return { apiKey, apiSecret, webhookSecret }
  }
}

/** The per-org discrete-env-var store singleton. */
export const envPerOrgSecretsStore: TenantSecretsStore =
  new EnvPerOrgSecretsStore()
