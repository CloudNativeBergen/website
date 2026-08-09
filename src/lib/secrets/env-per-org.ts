import 'server-only'
import { secretEnvSlugProblem } from '../../../sanity/lib/secretEnvSlug'
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
 * THE NAME COMES FROM `organization.secretEnvSlug` — an OPERATOR-ONLY,
 * effectively immutable Sanity field (RunKonf/platform#57, owner decision
 * 2026-08-09). It replaced a deploy-time code constant; see
 * {@link resolveTenantEnvSlug} for what the field had to earn back to be
 * allowed to replace it.
 *
 * IT FAILS CLOSED. An org with no slug, an unsupported family, or an INCOMPLETE
 * set of variables all return `null` — never a bag with `undefined` fields. A
 * half-configured tenant must resolve to "unconfigured" and take the caller's
 * existing soft-fail path, because the alternative is a credential bag that
 * looks configured, fails at the provider, and (for email) silently falls back
 * to the platform account.
 *
 * IT FAILS LOUD ON AN INDETERMINATE LOOKUP. "This org has no slug" and "we could
 * not find out whether it has one" are different answers and are not allowed to
 * share a return value — the second one THROWS
 * {@link TenantEnvSlugUnavailableError}. This is the website#855 idiom (make
 * "unknown" representable, then branch on it) applied to a credential path,
 * where the confident-wrong answer is not a 200 with bad copy but a send on
 * somebody else's account.
 *
 * `process.env` is read at CALL time, not import time, so the module is
 * import-safe and honours test env stubbing.
 *
 * See docs/TENANT_SECRETS.md for the operator-facing variable names.
 */

/**
 * "This tenant's env-var slug could not be DETERMINED." Distinct from "this
 * tenant has no slug", which is a `null` credential and a fall-through.
 *
 * WHY THIS IS AN EXCEPTION AND NOT A `null`. `resolveEmailSender`
 * (`@/lib/email/config`) ends with `return { client: resend }` — the PLATFORM
 * Resend client — for any org the chain answers `null` for. So `null` is not a
 * neutral value on this path; it is an instruction to send on the platform
 * account with the platform's sender policy. An exception is the only answer
 * that cannot be mistaken for that, and it is the answer a credential path
 * should give when it does not know whose credentials to use.
 */
export class TenantEnvSlugUnavailableError extends Error {
  constructor(
    readonly orgId: string,
    readonly reason: string,
  ) {
    super(
      `[secrets] cannot determine the env-var slug for organization ${orgId}: ${reason}. Refusing to resolve credentials — falling through here would silently send on the platform account.`,
    )
    this.name = 'TenantEnvSlugUnavailableError'
  }
}

/**
 * The three answers a slug lookup can give. `none` and `unavailable` are the
 * empty-vs-unknown split website#855 introduced; collapsing them is the bug.
 */
export type TenantEnvSlugResolution =
  /**
   * Every well-formed slug any organization holds — what lets a caller notice
   * that a `TENANT_<SLUG>_*` set names a slug NOBODY claims (an orphan, the
   * shape a cleared field or an un-run backfill leaves behind).
   *
   * `null` MEANS "NOT KNOWN", NOT "NOBODY CLAIMS ANYTHING". It is the same
   * empty-vs-unknown distinction as `status` itself, one level down: the
   * nullish-org path answers `none` WITHOUT reading Sanity, so it has no
   * standing to say what any OTHER organization claims. An empty `Set` there is
   * a fabrication, and a caller that believes it concludes "orphaned" about a
   * perfectly healthy tenant. Callers MUST abstain on `null`.
   */
  | { status: 'resolved'; slug: string; claimed: ReadonlySet<string> }
  | { status: 'none'; claimed: ReadonlySet<string> | null }
  | { status: 'unavailable'; reason: string }

/**
 * The tenant's env-var slug, read from `organization.secretEnvSlug`.
 *
 * ── WHY A SANITY FIELD IS ALLOWED TO REPLACE THE CODE CONSTANT ──────────────
 *
 * The constant existed because we had already been burned by deriving something
 * load-bearing from a MUTABLE Sanity field: platform-operator standing was
 * resolved through the organization SLUG, an org rename moved it, and the
 * platform locked itself out (fixed in RunKonf/platform#43 by binding to the
 * immutable `_id` via `PLATFORM_ORG_ID`). Env var NAMES are the same shape with
 * a quieter failure: the variables live in Vercel and are deploy-time, so if
 * the field moves they orphan, every lookup finds nothing, and the tenant drops
 * back to the platform account with nobody paged.
 *
 * A field replaces the constant only by earning back what the constant gave for
 * free. Five properties, and where each one actually lives:
 *
 *  1. OPERATOR-ONLY. kontroll's self-service `updateOrganization` writes a
 *     three-key allowlist (`name`, `contactEmail`, `billingEmail`) and its
 *     Sanity partition grants `organization` nothing but `patch` — no
 *     `create`/`createOrReplace`, so there is no whole-document back door.
 *     Verified against kontroll@dd20c17. This repo's own writes are equally
 *     narrow (`platform.updateEntitlements` sets `plan`/`featureOverrides`).
 *  2. EFFECTIVELY IMMUTABLE. Studio `readOnly` once populated, PLUS a
 *     validation rule that refuses a change against the PUBLISHED value. Both
 *     in `sanity/schemaTypes/organization.ts`, with the escape hatch (unset via
 *     a migration, then set) documented there and in docs/TENANT_SECRETS.md.
 *  3. UNIQUENESS. Enforced in BOTH places, because they catch different things.
 *     The Studio rule stops an operator typing a taken slug; it cannot see a
 *     document written by anything but the Studio. So this resolver checks it
 *     again over the whole map and, on a collision, answers `unavailable` for
 *     EVERY org holding that slug — refusing both rather than letting the first
 *     one win, which is what "a cross-tenant credential leak by typo" would be.
 *  4. LOUD ON AN INDETERMINATE READ. See {@link TenantEnvSlugUnavailableError}.
 *  5. SHAPE. `secretEnvSlugProblem` is the same vocabulary the schema validates
 *     against, so the resolver cannot accept a value the Studio would reject.
 *     A stored value that fails it is `unavailable`, not `none`: we know this
 *     tenant is meant to have its own credentials and we cannot name them.
 *
 * ── COST ───────────────────────────────────────────────────────────────────
 *
 * `getOrganizationSecretEnvSlugs` is `'use cache'` + `cacheLife('hours')` and
 * shares `getOrganizationById`'s `content:organizations` tag, so this is not an
 * uncached read per send. It is also not reached at all unless the deployment
 * has at least one discrete variable set for the family — see
 * {@link EnvPerOrgSecretsStore.get}.
 *
 * The import is DYNAMIC on purpose. `@/lib/email/config` imports `./store`,
 * which imports this module, and `@/lib/email/config` is imported almost
 * everywhere — a static edge to `@/lib/organization/sanity` (and through it
 * `@/lib/conference/sanity`) would reach the whole app's import graph. `./store`
 * already refuses that edge for the same reason. `__tests__` pins it.
 */
/** Whether the cached-read fallback has already been reported this process. */
let cachedSlugReadWarned = false

function warnCachedSlugReadFailed(error: unknown): void {
  if (cachedSlugReadWarned) return
  cachedSlugReadWarned = true
  console.warn(
    `[secrets] the CACHED organization env-slug read failed; falling back to an uncached read. If this persists, every credential resolution is paying an uncached cross-tenant Sanity fetch. Cause: ${error instanceof Error ? error.message : String(error)}`,
  )
}

/** Test seam: forget the once-per-process warning above. */
export function resetCachedSlugReadWarning(): void {
  cachedSlugReadWarned = false
}

export async function resolveTenantEnvSlug(
  orgId: string | null | undefined,
): Promise<TenantEnvSlugResolution> {
  // No org is a KNOWN answer, not an unknown one: there is no organization to
  // have a slug. The platform-env store makes its own fail-closed decision
  // about a nullish tenant (`envCredentialsBelongToOrg`).
  // A nullish org cannot claim anything — a real answer. But NO READ HAPPENS
  // here, so what OTHER organizations claim is simply not known: `claimed` is
  // `null`, never an empty set. Reporting `new Set()` made every nullish-org
  // send look like proof that nobody claims any slug, which fired the orphan
  // complaint against a healthy, fully backfilled tenant.
  if (!orgId) return { status: 'none', claimed: null }

  let rows: readonly { _id: string; secretEnvSlug: string }[]
  try {
    const org = await import('@/lib/organization/sanity')
    try {
      rows = await org.getOrganizationSecretEnvSlugs()
    } catch (cachedError) {
      // The CACHED read failed. That is not necessarily Sanity: `'use cache'`
      // throws outright when it is called without Next's cache scope, and
      // "unavailable" on this path means "stop sending". So take one uncached
      // attempt before concluding we cannot find out — it turns a whole class
      // of wiring failures into a cache miss instead of an outage. Only the
      // second failure is a real unknown.
      //
      // SAY SO, ONCE. If the cached read is permanently broken (a bad cache
      // scope rather than a Sanity blip) then every send is silently doing an
      // uncached cross-tenant fetch, which is exactly the cost this design
      // claims not to pay. Swallowing that quietly would make the claim
      // unfalsifiable in production. (Caught in review of this PR.)
      warnCachedSlugReadFailed(cachedError)
      rows = await org.readOrganizationSecretEnvSlugs()
    }
  } catch (error) {
    return {
      status: 'unavailable',
      reason: `the organization read failed (${error instanceof Error ? error.message : String(error)})`,
    }
  }

  /** slug → every org id claiming it, so a collision is visible. */
  const holders = new Map<string, string[]>()
  let own: string | undefined
  let ownProblem: string | null = null

  for (const row of rows) {
    if (!row || typeof row._id !== 'string' || !row._id) continue
    // Trimmed, so a value pasted with a trailing newline is not a different
    // tenant. The Studio rule rejects untrimmed input outright; being forgiving
    // HERE only ever moves a value from `unavailable` to `resolved`, and it
    // keeps " CNDN " and "CNDN" colliding rather than silently coexisting.
    const slug =
      typeof row.secretEnvSlug === 'string' ? row.secretEnvSlug.trim() : ''
    if (!slug) continue

    const problem = secretEnvSlugProblem(slug)
    if (row._id === orgId) {
      own = slug
      ownProblem = problem
    }
    // A malformed slug is not entered into the collision map: it can never name
    // a variable, so it must not be able to poison a well-formed org's lookup.
    if (problem) continue
    holders.set(slug, [...(holders.get(slug) ?? []), row._id])
  }

  const claimed = new Set(holders.keys())

  // The read SUCCEEDED and this org carries no slug. A real answer: it has no
  // discrete variables, and the chain falls through.
  if (own === undefined) return { status: 'none', claimed }

  if (ownProblem) {
    return {
      status: 'unavailable',
      reason: `its secretEnvSlug ${JSON.stringify(own)} ${ownProblem}`,
    }
  }

  const claimants = holders.get(own) ?? []
  if (claimants.length > 1) {
    return {
      status: 'unavailable',
      reason: `secretEnvSlug ${own} is claimed by ${claimants.length} organizations (${claimants.join(', ')}); they would read the same credentials`,
    }
  }

  return { status: 'resolved', slug: own, claimed }
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

/** Whether this store serves `family` at all. */
function isSupportedFamily(family: SecretFamily): family is SupportedFamily {
  return Object.hasOwn(FAMILY_SEGMENT, family)
}

/** The env var an operator sets for one tenant/family/field. */
export function tenantEnvVarName(
  slug: string,
  family: SupportedFamily,
  field: string,
): string {
  return `TENANT_${slug}_${FAMILY_SEGMENT[family]}_${field}`
}

/**
 * Every slug that has at least one NON-EMPTY variable set for `family` on this
 * deployment, read straight off `process.env`.
 *
 * The fields that MUST all be present for a family to produce a credential bag.
 * One declaration, used by the env scan below AND by the assembly methods, so
 * "what the scan counts as configured" and "what the store will actually
 * resolve" cannot drift apart. Email's `FROM` is deliberately absent: it is an
 * optional default, not a credential.
 */
const REQUIRED_FIELDS = {
  email: ['API_KEY'],
  ticketing: ['API_KEY', 'API_SECRET', 'WEBHOOK_SECRET'],
} as const satisfies Record<SupportedFamily, readonly string[]>

/** What the deployment's environment holds for one family. */
interface FamilyEnvSurvey {
  /** Slugs with at least ONE non-empty variable — including partial sets. */
  present: Set<string>
  /** Slugs with EVERY required variable — i.e. that can actually resolve. */
  complete: Set<string>
}

/**
 * Survey `process.env` for one family, by slug.
 *
 * THIS IS WHAT KEEPS EVERY DEPLOYMENT THAT DOES NOT USE THE MECHANISM
 * BYTE-IDENTICAL, and what bounds the blast radius of the loud path. Two sets,
 * because they answer two different questions:
 *
 *  - `present` decides whether the org lookup happens at all, and which slug may
 *    reach the assembly methods. It counts a PARTIAL set, so the half-configured
 *    warning (`warnPartial`) still fires — that warning is the whole reason a
 *    partial set is visible rather than silent.
 *  - `complete` decides whether an indeterminate lookup is allowed to THROW.
 *    A deployment where no slug has a full set could not have handed anybody
 *    credentials even with a perfectly healthy Sanity, so refusing to send
 *    there would be a pure loss. Caught in review of this PR.
 *
 * So a deployment with no `TENANT_*_EMAIL_*` at all never performs the lookup,
 * and one with only `TENANT_<SLUG>_EMAIL_FROM` performs it but stays quiet if it
 * fails. Local checkouts, self-hosts and previews are untouched either way.
 *
 * ── THE BOUND IS PER-DEPLOYMENT, NOT PER-ORG. SAY IT PLAINLY. ───────────────
 *
 * Once ANY tenant on a deployment holds a complete set, an indeterminate lookup
 * refuses resolution for EVERY organization asked — including tenants that have
 * no slug and never will. That is not an oversight and it cannot be narrowed:
 * the whole point is that we do not know which org the failed lookup concerned,
 * so "only refuse the affected tenant" is not a question we can answer. What is
 * bounded is the set of DEPLOYMENTS that can ever be affected — those actually
 * using the mechanism — not the set of tenants within one. An earlier draft of
 * this comment said `unavailable` "can only fire where a per-org credential
 * genuinely exists to be missed", which reads as a per-org bound and was wrong.
 *
 * Parsing follows the naming contract exactly: a slug may not contain `_`, so
 * the first `_` after the `TENANT_` prefix ends it and the remainder must open
 * with the family segment. `TENANT_SECRETS_JSON` parses to slug `SECRETS`,
 * remainder `JSON`, which opens with no family segment and is skipped.
 */
function surveyFamilyEnv(family: SupportedFamily): FamilyEnvSurvey {
  const prefix = 'TENANT_'
  const segment = `${FAMILY_SEGMENT[family]}_`
  /** slug → the field names set for it, e.g. `API_KEY`. */
  const fieldsBySlug = new Map<string, Set<string>>()

  for (const [name, value] of Object.entries(process.env)) {
    if (!name.startsWith(prefix)) continue
    // An empty/whitespace value is NOT configuration. `vi.stubEnv(name, '')`
    // and a Vercel variable cleared to the empty string must both read as
    // absent, exactly as `read()` below treats them.
    if (!value?.trim()) continue
    const rest = name.slice(prefix.length)
    const boundary = rest.indexOf('_')
    if (boundary <= 0) continue
    const slug = rest.slice(0, boundary)
    if (secretEnvSlugProblem(slug)) continue
    const tail = rest.slice(boundary + 1)
    if (!tail.startsWith(segment)) continue
    const field = tail.slice(segment.length)
    if (!field) continue
    const fields = fieldsBySlug.get(slug) ?? new Set<string>()
    fields.add(field)
    fieldsBySlug.set(slug, fields)
  }

  const present = new Set<string>()
  const complete = new Set<string>()
  for (const [slug, fields] of fieldsBySlug) {
    present.add(slug)
    if (REQUIRED_FIELDS[family].every((field) => fields.has(field))) {
      complete.add(slug)
    }
  }
  return { present, complete }
}

/**
 * (c) The per-org DISCRETE ENV VAR store. See the module doc for why it exists
 * and {@link resolveTenantEnvSlug} for where the slug comes from.
 */
export class EnvPerOrgSecretsStore implements TenantSecretsStore {
  /** Partial-configuration warnings already emitted, keyed `slug/family`. */
  private warned = new Set<string>()

  /**
   * @throws {TenantEnvSlugUnavailableError} when the deployment holds a
   * COMPLETE discrete credential set for some tenant in this family and the
   * org's slug cannot be determined. See the module doc: on a credential path,
   * `null` means "use the platform account", so it is not available as an
   * answer to "I do not know".
   */
  async get<F extends SecretFamily>(
    orgId: string | null | undefined,
    family: F,
  ): Promise<FamilyCredentials<F> | null> {
    // slack / push / badge have no discrete-var consumer yet. Returning `null`
    // (rather than assembling a bag from names nobody documents) keeps the
    // chain falling through to exactly today's behaviour — and short-circuits
    // before any lookup, so an unsupported family never reads Sanity.
    if (!isSupportedFamily(family)) return null

    const env = surveyFamilyEnv(family)
    if (env.present.size === 0) return null

    const resolution = await resolveTenantEnvSlug(orgId)
    if (resolution.status === 'unavailable') {
      // LOUD, but only when a complete set exists for SOMEBODY. Then a tenant
      // on this deployment really does have its own credentials for this family
      // and we cannot tell whether it is this one; falling through would send on
      // the platform account and log nothing.
      if (env.complete.size > 0) {
        throw new TenantEnvSlugUnavailableError(
          orgId ?? '(none)',
          resolution.reason,
        )
      }
      // Only PARTIAL sets exist, so no lookup outcome could have produced
      // credentials for anyone — a healthy Sanity would have resolved `null`
      // here too. Refusing the send would widen the failure past the guarantee
      // in the module doc for no gain, so this stays quiet.
      return null
    }
    // The read succeeded and this org has no slug → this store has nothing to
    // say. Not an error: the resolver falls through to the next store.
    if (resolution.status === 'none') {
      this.warnOrphanedSets(family, env, resolution.claimed)
      return null
    }

    this.warnOrphanedSets(family, env, resolution.claimed)

    const { slug } = resolution
    // A slug with no variable for THIS family is also a plain miss. `present`,
    // not `complete`: a partial set must still reach the assembly method below
    // so `warnPartial` fires. The method itself returns `null` for it.
    if (!env.present.has(slug)) return null

    switch (family) {
      case 'email':
        return this.email(slug) as FamilyCredentials<F> | null
      default:
        return this.ticketing(slug) as FamilyCredentials<F> | null
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
   * Complain ONCE per slug about a COMPLETE credential set that no organization
   * claims — `TENANT_CNDN_EMAIL_API_KEY` is set, and nothing carries
   * `secretEnvSlug: 'CNDN'`.
   *
   * WHY THIS IS `console.error` AND NOT A THROW. It is the residue of the
   * immutability design: the schema refuses to change OR clear a populated
   * slug, but a Sanity token can still clear it, and the state that leaves is
   * `{status:'none'}` — a perfectly well-formed answer meaning "no discrete
   * variables", which resolves to the platform account. Read failure loudness
   * does not cover it, because nothing failed. (Caught in review of this PR.)
   *
   * It does not throw because the identical state is the LEGITIMATE window
   * during provisioning: variables set before migration 049 has run, or an
   * intentional release of a tenant. Turning an ordering choice into an outage
   * would be worse than the thing it guards. So it is loud in the logs — the
   * same instrument, and the same once-per-key discipline, the partial-set
   * warning above already uses — and the silence is what gets removed.
   */
  private warnOrphanedSets(
    family: SupportedFamily,
    env: FamilyEnvSurvey,
    claimed: ReadonlySet<string> | null,
  ): void {
    // NOT KNOWN is not NOBODY. Without a read there is no evidence any slug is
    // orphaned, and complaining anyway would poison the one instrument an
    // operator has for the cleared-slug state — a false positive on the first
    // nullish-org send, then once-per-process suppression hiding the real thing.
    if (claimed === null) return
    for (const slug of env.complete) {
      if (claimed.has(slug)) continue
      const key = `orphan:${slug}/${family}`
      if (this.warned.has(key)) continue
      this.warned.add(key)
      console.error(
        `[secrets] TENANT_${slug}_${FAMILY_SEGMENT[family]}_* is fully configured but NO organization carries secretEnvSlug "${slug}", so it is being ignored and that tenant is falling back to the platform account. Either the backfill has not run yet, or the field was cleared. See docs/TENANT_SECRETS.md.`,
      )
    }
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
    const fields = REQUIRED_FIELDS.ticketing
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
