import 'server-only'
import { cacheLife, cacheTag } from 'next/cache'
import { clientReadUncached } from '@/lib/sanity/client'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { organizationTag } from '@/lib/cache/tags'
import type { Organization } from './types'

/**
 * Multi-tenant (CaaS T1-1, #613) organization resolution + stamping helpers.
 *
 * These are the ONLY plumbing the creation paths need to be born with the tenant
 * key. Every helper is BEST-EFFORT and non-throwing: if the organization cannot
 * be resolved (a legacy conference lacking `organization` before the 044
 * backfill, a context without a request domain, or any transient error) it
 * returns `null` and the caller simply stamps nothing. Server code MUST tolerate
 * an absent key until the backfill has run.
 */

/** A Sanity reference object suitable for `create`/`patch`. */
interface OrganizationRef {
  _type: 'reference'
  _ref: string
}

/**
 * Build the `organization` reference field for a document being created, or an
 * EMPTY OBJECT when there is no organization to stamp — so callers can always
 * spread the result and an absent org contributes no key:
 *
 *   ...organizationField(orgId)
 */
export function organizationField(
  orgId: string | null | undefined,
): { organization: OrganizationRef } | Record<string, never> {
  if (!orgId) return {}
  return { organization: { _type: 'reference', _ref: orgId } }
}

/** Build a bare organization reference, or `undefined`. */
export function organizationReference(
  orgId: string | null | undefined,
): OrganizationRef | undefined {
  return orgId ? { _type: 'reference', _ref: orgId } : undefined
}

/**
 * The organization ref of the CURRENT-domain conference (its tenant). Used by
 * creation paths for the GLOBAL tenant-scoped types (speaker membership, topic,
 * staff, sponsor, sponsorEmailTemplate) that have no parent document to derive a
 * tenant from and instead take the tenant of the conference they are created in.
 */
export async function getOrganizationRefForCurrentConference(): Promise<
  string | null
> {
  try {
    const { conference, error } = await getConferenceForCurrentDomain()
    if (error) return null
    return conference?.organization?._ref ?? null
  } catch {
    return null
  }
}

/**
 * The organization ref reached transitively through a PARENT document that
 * carries a `conference` reference (a conversation, a sponsorForConference, a
 * travelSupport, …). Used by the denormalized-key TRANSITIVE types (message,
 * conversationPreference, travelExpense, sponsorActivity) so a new child is born
 * carrying the same tenant as the conference two hops up — document-level
 * security (#614) can't traverse references at read time, so the key is copied
 * down at write time.
 */
export async function getOrganizationRefViaParentConference(
  parentId: string | null | undefined,
): Promise<string | null> {
  if (!parentId) return null
  try {
    const ref = await clientReadUncached.fetch<string | null>(
      // groq-global: the same shape as `getDocumentTenant` in
      // `src/server/tenancy.ts` — a read whose whole job is to RESOLVE THE
      // TENANT of an arbitrary id, so it must be able to see a document in any
      // tenant. It projects nothing but the organization ref (the tenant key
      // itself, no tenant data), and the value is used to STAMP the child being
      // created so it is born inside the parent's tenant rather than outside
      // one. Authorization over the parent id belongs to the calling procedure.
      `*[_id == $parentId][0].conference->organization._ref`,
      { parentId },
    )
    return ref ?? null
  } catch {
    return null
  }
}

/**
 * Projection shared by the organization reads below. `slug` is flattened to a
 * plain string; `plan`/`featureOverrides` feed the entitlement resolver
 * (`src/lib/features/entitlements.ts`).
 */
const ORGANIZATION_PROJECTION = `{
  _id,
  name,
  "slug": slug.current,
  contactEmail,
  plan,
  featureOverrides
}`

/**
 * One organization document by id, CACHED and tagged with the org's own
 * tenant tag: any mutation that edits the organization (plan or overrides —
 * see the platform router) revalidates `organizationTag(orgId)` and busts
 * exactly this read. Returns `null` for an unknown id.
 */
export async function getOrganizationById(
  orgId: string,
): Promise<Organization | null> {
  'use cache'
  cacheLife('hours')
  cacheTag('content:organizations')
  cacheTag(organizationTag(orgId))
  const org = await clientReadUncached.fetch<Organization | null>(
    // groq-global: the organization document IS the tenant (id-keyed read).
    `*[_type == "organization" && _id == $orgId][0]${ORGANIZATION_PROJECTION}`,
    { orgId },
  )
  return org ?? null
}

/** One organization's operator-assigned secret env slug. */
export interface OrganizationSecretEnvSlugRow {
  _id: string
  secretEnvSlug: string
}

/**
 * EVERY organization that carries a `secretEnvSlug`, as `_id → slug` rows —
 * the Sanity-resident replacement for the `TENANT_ENV_SLUGS` code constant
 * (RunKonf/platform#57). Consumed only by `@/lib/secrets/env-per-org`, which
 * turns it into `TENANT_<SLUG>_<FAMILY>_<FIELD>` variable names.
 *
 * THE WHOLE MAP, NOT ONE ROW, AND THAT IS THE POINT. The constant validated
 * UNIQUENESS at import — two orgs sharing a slug would read each other's
 * credentials. A per-id read cannot see that; this one can, so the resolver
 * keeps the same guarantee at runtime. It is also one Sanity round trip
 * instead of two (the org's own slug plus a uniqueness probe).
 *
 * CACHED, deliberately, because it sits on the credential path of every send:
 * `'use cache'` + `cacheLife('hours')`, the same shape (and the same
 * `content:organizations` tag) {@link getOrganizationById} already uses, so
 * there is no uncached Sanity read per send. Each returned org's own
 * `organizationTag` is registered too, so an organization mutation busts this
 * map as well — with one honest gap: an org that has NO slug yet is not in the
 * rows, so its tag is not registered and granting it a slug is picked up by
 * the hourly expiry rather than instantly. That is fine, because the variables
 * the slug names need a Vercel redeploy anyway, and a redeploy is a cold cache.
 *
 * PROJECTS THE SLUG AND NOTHING ELSE. It is not a secret — it names variables,
 * it does not carry their values — but it is operator-facing plumbing, so it
 * stays out of {@link ORGANIZATION_PROJECTION} and never reaches an admin
 * client component.
 *
 * NEVER SWALLOWS AN ERROR. A rejected read propagates, so the resolver can
 * tell "this org has no slug" (fine) from "we could not find out" (an error
 * state that must NOT resolve to the platform account). See website#855.
 */
export async function getOrganizationSecretEnvSlugs(): Promise<
  OrganizationSecretEnvSlugRow[]
> {
  'use cache'
  cacheLife('hours')
  cacheTag('content:organizations')
  const rows = await readOrganizationSecretEnvSlugs()
  for (const row of rows) cacheTag(organizationTag(row._id))
  return rows
}

/**
 * The same read WITHOUT `'use cache'` — the resolver's second attempt when the
 * cached one throws.
 *
 * WHY THIS EXISTS, AND WHY IT IS NOT THE DEFAULT. `'use cache'` needs Next's
 * cache scope (`cacheComponents: true` in `next.config.ts`); called outside one,
 * `cacheLife()` throws — and on this path a throw means "refuse to send",
 * because the resolver is not allowed to treat an unanswered question as "no
 * credentials". A wiring mistake or a context Next does not run cached functions
 * in would therefore stop mail rather than degrade. Retrying uncached collapses
 * that whole class into a cache MISS, and leaves `unavailable` meaning what it
 * says: Sanity itself could not answer.
 *
 * It costs an extra round trip only when the cached read already failed, so the
 * "no uncached read per send" property is unaffected on the healthy path.
 */
export async function readOrganizationSecretEnvSlugs(): Promise<
  OrganizationSecretEnvSlugRow[]
> {
  const rows = await clientReadUncached.fetch<OrganizationSecretEnvSlugRow[]>(
    // groq-global: intentionally cross-tenant — this read IS the tenant→env-var
    // map, so it must see every tenant to answer "is this slug unique?". It
    // projects the organization id and an opaque operator label, no tenant data,
    // and is reachable only from the server-side secret resolver.
    // DRAFTS ARE EXCLUDED EXPLICITLY rather than left to the client's
    // perspective: a draft copy would arrive as `drafts.<id>`, which matches no
    // org id the resolver is ever asked about AND would read as a second
    // organization holding the same slug — turning an unpublished edit into a
    // duplicate-slug refusal for the live tenant.
    `*[_type == "organization" && defined(secretEnvSlug) && !(_id in path("drafts.**"))]{ _id, secretEnvSlug }`,
  )
  return rows ?? []
}

/**
 * MINIMAL projection for the platform management list: exactly the fields the
 * `PlatformOrgManager` card renders/edits and nothing else. Deliberately NOT
 * {@link ORGANIZATION_PROJECTION} — that one carries `contactEmail`, and a
 * cross-tenant list must not ship every org's contact email to the client
 * (data minimization, even for an operator-only surface).
 */
const PLATFORM_ORG_LIST_PROJECTION = `{
  _id,
  name,
  "slug": slug.current,
  plan,
  featureOverrides
}`

/** What {@link getAllOrganizations} returns — the org sans contact details. */
type PlatformOrganizationSummary = Omit<Organization, 'contactEmail'>

/**
 * EVERY organization document, name-ordered — the platform management list.
 * Deliberately UNCACHED: it is a cross-tenant admin read (platform card only)
 * and must reflect a just-saved plan/override immediately.
 */
export async function getAllOrganizations(): Promise<
  PlatformOrganizationSummary[]
> {
  const orgs = await clientReadUncached.fetch<PlatformOrganizationSummary[]>(
    // groq-global: intentionally cross-tenant — the PLATFORM management list, reachable only behind the platform gate (src/lib/features/platform.ts).
    `*[_type == "organization"] | order(name asc)${PLATFORM_ORG_LIST_PROJECTION}`,
  )
  return orgs ?? []
}
