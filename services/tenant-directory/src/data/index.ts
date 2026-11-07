// Public data layer. createData is the ONLY export resolvers see.
// tenancy: false: the directory is the registry every tenant is resolved
// from, so its reads span Organizations. Who may call what is decided in
// the resolvers (src/subgraph.ts).
import {
  and,
  eq,
  gt,
  inArray,
  isNotNull,
  isNull,
  lt,
  or,
  sql,
} from 'drizzle-orm'
import { createGraphQLError } from 'graphql-yoga'
import { importJWK, SignJWT, type JWK } from 'jose'
import { rawDb } from './db'
import {
  cloudflareHostnames,
  type CloudflareEnv,
  type CustomHostnames,
} from './cloudflare'
import {
  conferences,
  domains,
  organizations,
  provisioningRequests,
} from './schema'
import {
  PLATFORM_DOMAIN,
  RESERVED_SLUGS,
  SLUG,
  aliasHost,
  editionHost,
  normalizeHost,
} from './naming'

export { PLATFORM_DOMAIN, normalizeHost }

/** Bindings the data layer needs; the generated WorkerEnv extends it. */
export interface DataEnv extends CloudflareEnv {
  DB: D1Database
  /** identity's Organizations entrypoint: creates the org on its side. */
  IDENTITY: {
    ensure(orgId: string, slug: string): Promise<unknown>
    /** Organizer membership sync (#1907); identity has no cron of its own. */
    syncMembers(): Promise<unknown>
    /** The orgs a user is a member of, with the role there (#2036). */
    memberships(userId: string): Promise<{ orgId: string; role: string }[]>
  }
  /** Sanity ids as in services/identity; provisioning verifies against it. */
  SANITY_PROJECT_ID?: string
  SANITY_DATASET?: string
  /** wrangler secret put SANITY_API_TOKEN_READ (per environment) */
  SANITY_API_TOKEN_READ?: string
  /** The site createOrganization asks to write the Sanity docs (kontroll#79). */
  SITE_URL?: string
  /** wrangler secret put PROVISIONING_SIGNING_KEY: private Ed25519 JWK with kid. */
  PROVISIONING_SIGNING_KEY?: string
}

/** How often a verified custom domain is re-checked with Cloudflare. */
const RECHECK_VERIFIED_MS = 60 * 60 * 1000

const fail = (code: string, message: string) =>
  createGraphQLError(message, { extensions: { code } })

/** Sanity document ids: what the site mints for a conference. */
const SANITY_ID = /^[A-Za-z0-9._-]{1,128}$/

export interface ProvisionInput {
  idempotencyKey: string
  /** Sanity `_id`s minted by the site (src/lib/onboarding/provision.ts). */
  orgId: string
  orgSlug: string
  conferenceId: string
  /** The operator's user id, recorded on the receipt row (audit). */
  createdBy?: string
}

/** createOrganization's input (RunKonf/kontroll#79). */
export interface CreateOrganizationInput {
  name: string
  slug: string
  conferenceTitle: string
  startDate: string
  endDate: string
  domain?: string | null
  ownerEmail: string
}

const DATE = /^\d{4}-\d{2}-\d{2}$/
const isDate = (s: string) =>
  DATE.test(s) && new Date(`${s}T00:00:00Z`).toISOString().startsWith(s)
const HOSTNAME =
  /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Every input rule, checked before anything is read or written. */
function validateCreate(input: CreateOrganizationInput, key: string) {
  const bad = (m: string) => fail('BAD_USER_INPUT', m)
  // The site's Idempotency-Key rule (src/lib/provisioning/constants.ts).
  if (!/^[\x20-\x7e]{16,200}$/.test(key))
    throw bad('idempotencyKey is 16-200 printable ASCII characters')
  if (!input.name.trim() || input.name.length > 200)
    throw bad('name is required')
  if (!input.conferenceTitle.trim() || input.conferenceTitle.length > 200)
    throw bad('conferenceTitle is required')
  if (input.slug.length > 63 || !SLUG.test(input.slug))
    throw bad('slugs are lowercase a-z, 0-9 and -')
  if (RESERVED_SLUGS.has(input.slug))
    throw bad(`"${input.slug}" is reserved for a platform host`)
  if (!isDate(input.startDate) || !isDate(input.endDate))
    throw bad('dates are YYYY-MM-DD')
  if (input.endDate < input.startDate) throw bad('endDate is before startDate')
  if (
    input.domain != null &&
    (!HOSTNAME.test(input.domain) ||
      input.domain === PLATFORM_DOMAIN ||
      input.domain.endsWith(`.${PLATFORM_DOMAIN}`))
  )
    throw bad('domain must be a lowercase hostname outside the platform zone')
  if (input.ownerEmail.length > 254 || !EMAIL.test(input.ownerEmail))
    throw bad('ownerEmail is not an email address')
}

/** A tenant-directory assertion over `body` (src/lib/provisioning/service.ts). */
async function siteAssertion(jwkJson: string, sub: string, body: string) {
  const jwk = JSON.parse(jwkJson) as JWK
  if (!jwk.kid) throw new Error('PROVISIONING_SIGNING_KEY has no kid')
  const bh = btoa(
    String.fromCharCode(
      ...new Uint8Array(
        await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body)),
      ),
    ),
  )
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
  const now = Math.floor(Date.now() / 1000)
  return new SignJWT({ bh })
    .setProtectedHeader({ alg: 'EdDSA', kid: jwk.kid })
    .setIssuer('konf-tenant-directory')
    .setAudience('konf-site-provisioning')
    .setSubject(sub)
    .setIssuedAt(now)
    .setExpirationTime(now + 60)
    .sign(await importJWK(jwk, 'EdDSA'))
}

interface SanityTenant {
  org: { slug: string | null; name: string | null } | null
  conf: {
    orgRef: string | null
    title: string | null
    startDate: string | null
    domains: string[] | null
  } | null
}

// Published documents only: a draft id never equals a published `_id`, and
// the path filter says so explicitly.
const TENANT = `{
  "org": *[_type == "organization" && _id == $orgId && !(_id in path("drafts.**"))][0]{ "slug": slug.current, name },
  "conf": *[_type == "conference" && _id == $conferenceId && !(_id in path("drafts.**"))][0]{ "orgRef": organization._ref, title, startDate, domains }
}`

/** As identity's member sync. */
export const SANITY_TIMEOUT_MS = 5000

/** Raw GROQ, the same pattern as identity's member sync. Fails closed. */
async function sanityTenant(env: DataEnv, params: Record<string, string>) {
  if (
    !env.SANITY_API_TOKEN_READ ||
    !env.SANITY_PROJECT_ID ||
    !env.SANITY_DATASET
  ) {
    throw fail('INTERNAL_SERVER_ERROR', 'Sanity read token is not configured')
  }
  let res: Response
  try {
    res = await fetch(
      `https://${env.SANITY_PROJECT_ID}.api.sanity.io/v2023-05-03/data/query/${env.SANITY_DATASET}`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${env.SANITY_API_TOKEN_READ}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ query: TENANT, params }),
        // A hung read must not hold the provisioning call open (#1957).
        signal: AbortSignal.timeout(SANITY_TIMEOUT_MS),
      },
    )
  } catch {
    throw fail('INTERNAL_SERVER_ERROR', 'Sanity read failed')
  }
  if (!res.ok)
    throw fail('INTERNAL_SERVER_ERROR', `Sanity read failed (${res.status})`)
  const body = (await res.json().catch(() => null)) as {
    result?: SanityTenant
  } | null
  if (!body?.result) throw fail('INTERNAL_SERVER_ERROR', 'Sanity read failed')
  return body.result
}

const sha256 = async (s: string) =>
  [
    ...new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)),
    ),
  ]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')

type DomainRow = typeof domains.$inferSelect

/**
 * THE canonical host of one edition (#1977): its verified custom domain,
 * else its verified platform-edition host (`<org>-<year>`), else null. Never
 * a pending or failed row, never the moving `<org>` alias. `rows` must be
 * the edition's own org's (domainsByOrg scopes the read). Ties break by
 * hostname so the answer is stable.
 */
function primaryHost(
  rows: readonly DomainRow[],
  conferenceId: string,
): string | null {
  const ok = rows.filter(
    (d) => d.conferenceId === conferenceId && d.verification === 'verified',
  )
  for (const kind of ['custom', 'platform-edition'] as const) {
    const hit = ok
      .filter((d) => d.kind === kind)
      .map((d) => d.hostname)
      .sort()[0]
    if (hit) return hit
  }
  return null
}

export function createData(
  env: DataEnv,
  hostnames: CustomHostnames = cloudflareHostnames(env),
) {
  const db = rawDb(env.DB)

  const organization = (id: string) =>
    db.query.organizations.findFirst({ where: eq(organizations.id, id) })
  const conference = (id: string) =>
    db.query.conferences.findFirst({ where: eq(conferences.id, id) })

  // Domains by org, one D1 query per batch of orgs (#1977): every
  // primaryHost asked in the same tick shares it, and an org already loaded
  // in this request is not read again.
  const byOrg = new Map<string, Promise<DomainRow[]>>()
  let batch: Map<
    string,
    { resolve: (r: DomainRow[]) => void; reject: (e: unknown) => void }
  > | null = null
  const domainsByOrg = (orgId: string) => {
    let p = byOrg.get(orgId)
    if (!p) {
      if (!batch) {
        const b = (batch = new Map())
        queueMicrotask(() => {
          batch = null
          db.query.domains
            .findMany({
              where: inArray(domains.orgId, [...b.keys()]),
            })
            .then(
              (rows) =>
                b.forEach((w, org) =>
                  w.resolve(rows.filter((d) => d.orgId === org)),
                ),
              (e) => b.forEach((w) => w.reject(e)),
            )
        })
      }
      const b = batch
      p = new Promise((resolve, reject) => b.set(orgId, { resolve, reject }))
      byOrg.set(orgId, p)
    }
    return p
  }

  const api = {
    syncMembers: () => env.IDENTITY.syncMembers(),

    /** {@link primaryHost} of one edition; the caller decided it may see it. */
    primaryHostOf: async (orgId: string, conferenceId: string) =>
      primaryHost(await domainsByOrg(orgId), conferenceId),
    organization,

    /**
     * The orgs `userId` is a member of, by slug, each with the caller's role
     * and its conferences (#2036). Membership comes from identity; the org
     * ids it returns are the only ones read here.
     */
    async myOrganizations(userId: string) {
      const mine = await env.IDENTITY.memberships(userId)
      if (!mine.length) return []
      const ids = mine.map((m) => m.orgId)
      const role = new Map(mine.map((m) => [m.orgId, m.role]))
      // D1 caps bound parameters at 100: chunk in batches of 90 (#2043).
      const CHUNK_SIZE = 90
      const chunks: string[][] = []
      for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
        chunks.push(ids.slice(i, i + CHUNK_SIZE))
      }
      const results = await Promise.all(
        chunks.map((batch) =>
          Promise.all([
            db.query.organizations.findMany({
              where: inArray(organizations.id, batch),
              orderBy: organizations.slug,
            }),
            db.query.conferences.findMany({
              where: inArray(conferences.orgId, batch),
              orderBy: conferences.id,
            }),
          ]),
        ),
      )
      const orgs = results.flatMap(([batchOrgs]) => batchOrgs)
      const confs = results.flatMap(([, batchConfs]) => batchConfs)
      orgs.sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
      return orgs.map((org) => ({
        id: org.id,
        name: org.name,
        role: role.get(org.id)!,
        editions: confs.filter((c) => c.orgId === org.id),
      }))
    },

    /** Every org, by slug, `first` after the `after` slug. Operator-only. */
    organizations: (first: number, after?: string | null) =>
      db.query.organizations.findMany({
        where: after ? gt(organizations.slug, after) : undefined,
        orderBy: organizations.slug,
        limit: first,
      }),

    /**
     * Every org's conferences joined to their org, by conference id, `first`
     * after the `after` id, optionally only one lifecycle or one flag on.
     * Operator-only (#1985).
     */
    allConferences: (
      first: number,
      after?: string | null,
      lifecycle?: 'draft' | 'live' | 'cancelled' | 'archived' | null,
      flag?: 'apiRead' | 'identityLogin' | 'd1Write' | 'd1Override' | null,
    ) =>
      db
        .select({ conf: conferences, org: organizations })
        .from(conferences)
        .innerJoin(organizations, eq(organizations.id, conferences.orgId))
        .where(
          and(
            after ? gt(conferences.id, after) : undefined,
            lifecycle ? eq(conferences.lifecycle, lifecycle) : undefined,
            flag ? eq(conferences[flag], true) : undefined,
          ),
        )
        .orderBy(conferences.id)
        .limit(first),

    /**
     * One of `orgId`'s conferences, by id. The org is part of the query, so
     * another org's id finds nothing (#1971).
     */
    conferenceOf: (orgId: string, id: string) =>
      db.query.conferences.findFirst({
        where: and(eq(conferences.id, id), eq(conferences.orgId, orgId)),
      }),

    /**
     * Sets or clears the homepage override (#1997) on one of `orgId`'s
     * conferences. Clearing returns a cancelled or archived edition to
     * `live`; a draft stays draft. Null when the org has no such conference.
     */
    async setLifecycle(
      orgId: string,
      id: string,
      status: 'cancelled' | 'archived' | null,
    ) {
      const where = and(eq(conferences.id, id), eq(conferences.orgId, orgId))
      const [row] = await db
        .update(conferences)
        .set({
          lifecycle: status
            ? status
            : sql`CASE WHEN ${conferences.lifecycle} = 'draft' THEN 'draft' ELSE 'live' END`,
        })
        .where(where)
        .returning()
      return row ?? null
    },

    /** One org's hostnames; the caller already decided it may see them. */
    domainsOf: (orgId: string) =>
      db.query.domains.findMany({
        where: eq(domains.orgId, orgId),
        orderBy: domains.hostname,
      }),

    /**
     * `trusted` (a PlatformContext) sees every row. Everyone else only gets
     * a verified hostname of an active Organization's non-draft Conference.
     */
    async resolveHost(input: string, trusted: boolean) {
      const hostname = normalizeHost(input)
      if (!hostname) return null
      const [row] = await db
        .select({
          hostname: domains.hostname,
          kind: domains.kind,
          verification: domains.verification,
          orgId: domains.orgId,
          conferenceId: domains.conferenceId,
          orgStatus: organizations.status,
          lifecycle: conferences.lifecycle,
          apiRead: conferences.apiRead,
          identityLogin: conferences.identityLogin,
          d1Write: conferences.d1Write,
          d1Override: conferences.d1Override,
        })
        .from(domains)
        .innerJoin(organizations, eq(organizations.id, domains.orgId))
        .innerJoin(conferences, eq(conferences.id, domains.conferenceId))
        .where(eq(domains.hostname, hostname))
      if (!row) return null
      if (
        !trusted &&
        (row.verification !== 'verified' ||
          row.orgStatus !== 'active' ||
          row.lifecycle === 'draft')
      ) {
        return null
      }
      const { apiRead, identityLogin, d1Write, d1Override, ...rest } = row
      return { ...rest, flags: { apiRead, identityLogin, d1Write, d1Override } }
    },

    async conference(id: string, trusted: boolean) {
      const conf = await conference(id)
      if (!conf || trusted) return conf ?? null
      if (conf.lifecycle === 'draft') return null
      const org = await organization(conf.orgId)
      return org?.status === 'active' ? conf : null
    },

    /**
     * Registers a tenant the site already created in Sanity (#1924), under
     * the Sanity `_id`s. Every check runs before any D1 write; the hostname
     * primary key is the final guard. Same key and same arguments returns
     * the first Organization (a no-op); same key with other arguments is
     * refused. identity's ensure runs on every call, so a retry heals a
     * failed ensure.
     */
    async provision(input: ProvisionInput) {
      const { orgId, orgSlug, conferenceId } = input
      if (!input.idempotencyKey.trim()) {
        throw fail('BAD_USER_INPUT', 'idempotencyKey is required')
      }
      if (!SLUG.test(orgSlug)) {
        throw fail('BAD_USER_INPUT', 'slugs are lowercase a-z, 0-9 and -')
      }
      if (RESERVED_SLUGS.has(orgSlug)) {
        throw fail(
          'BAD_USER_INPUT',
          `"${orgSlug}" is reserved for a platform host`,
        )
      }
      // The site's id rule (provision.ts orgIdForSlug). Legacy orgs such as
      // `organization-cloud-native-days` fail this by design: they enter
      // the directory through scripts/backfill.ts only.
      if (orgId !== `organization.${orgSlug}`) {
        throw fail('BAD_USER_INPUT', 'orgId must be "organization.<orgSlug>"')
      }
      if (
        !SANITY_ID.test(conferenceId) ||
        conferenceId.startsWith('drafts.') ||
        conferenceId.startsWith('versions.')
      ) {
        throw fail(
          'BAD_USER_INPUT',
          'conferenceId is not a published Sanity id',
        )
      }

      // sha256(key), not the raw key. The site hashes with AUTH_SECRET;
      // tenant-directory has none, and the two hashes are never compared.
      const keyHash = await sha256(input.idempotencyKey)
      const earlier = () =>
        db.query.provisioningRequests.findFirst({
          where: eq(provisioningRequests.idempotencyKey, keyHash),
        })
      // The key's own arguments: its org, and its conference since 0006
      // (#1957; null on older rows, which keep the org-only check).
      const replay = async (
        orgOfKey: string,
        conferenceOfKey: string | null,
      ) => {
        const [org, conf] = await Promise.all([
          organization(orgOfKey),
          conference(conferenceId),
        ])
        if (
          (conferenceOfKey !== null && conferenceOfKey !== conferenceId) ||
          !org ||
          org.id !== orgId ||
          org.slug !== orgSlug ||
          conf?.orgId !== orgId
        ) {
          throw fail(
            'CONFLICT',
            'idempotencyKey was used with different arguments',
          )
        }
        await env.IDENTITY.ensure(org.id, org.slug)
        return org
      }
      const done = await earlier()
      if (done) return replay(done.orgId, done.conferenceId)

      const { org, conf } = await sanityTenant(env, { orgId, conferenceId })
      if (!org || org.slug !== orgSlug) {
        throw fail(
          'BAD_USER_INPUT',
          'no published Sanity organization with that id and slug',
        )
      }
      if (!conf || conf.orgRef !== orgId) {
        throw fail(
          'BAD_USER_INPUT',
          'no published Sanity conference with that id in this organization',
        )
      }
      if (!conf.startDate) {
        throw fail('BAD_USER_INPUT', 'the conference has no start date yet')
      }
      const sanityHosts = new Set(
        (conf.domains ?? []).map((d) => normalizeHost(d)),
      )
      // The edition year comes from the host the site minted, never from
      // startDate: the site does not re-derive hosts either.
      const dated = new RegExp(
        `^${orgSlug}-(\\d{4})\\.${PLATFORM_DOMAIN.replace('.', '\\.')}$`,
      )
      const editions = [...sanityHosts].flatMap(
        (h) => dated.exec(h ?? '')?.[1] ?? [],
      )
      if (editions.length !== 1) {
        throw fail(
          'BAD_USER_INPUT',
          `conference.domains needs exactly one ${orgSlug}-<year>.${PLATFORM_DOMAIN} host`,
        )
      }
      const year = editions[0]
      const hosts = [
        [editionHost(orgSlug, year), 'platform-edition'],
        [aliasHost(orgSlug), 'platform-alias'],
      ] as const
      for (const [h] of hosts) {
        if (!sanityHosts.has(h)) {
          throw fail('BAD_USER_INPUT', `${h} is not in conference.domains`)
        }
      }

      try {
        // One D1 batch: all rows land, or none do.
        await db.batch([
          db.insert(organizations).values({
            id: orgId,
            slug: orgSlug,
            name: org.name ?? orgSlug,
            status: 'active',
            plan: 'free',
            createdAt: new Date().toISOString(),
          }),
          db.insert(conferences).values({
            id: conferenceId,
            orgId,
            slug: year,
            name: conf.title ?? year,
            lifecycle: 'draft',
          }),
          ...hosts.map(([hostname, kind]) =>
            db.insert(domains).values({
              hostname,
              kind,
              orgId,
              conferenceId,
              // Platform hosts sit under the platform's own certificate.
              verification: 'verified',
            }),
          ),
          db.insert(provisioningRequests).values({
            idempotencyKey: keyHash,
            orgId,
            conferenceId,
            createdBy: input.createdBy ?? null,
          }),
        ])
      } catch (error) {
        // A concurrent request with the same key won the race.
        const raced = await earlier()
        if (raced) return replay(raced.orgId, raced.conferenceId)
        console.error(error)
        throw fail(
          'CONFLICT',
          'organization, conference or platform host is taken',
        )
      }
      return replay(orgId, conferenceId)
    },

    /**
     * kontroll#79: creates the tenant end to end. The site writes the Sanity
     * organization and conference (it owns that write and its idempotency
     * receipt), then provision() registers them in D1 and runs identity's
     * ensure. Both steps are idempotent on the same key, so a retry after a
     * failure between them completes without duplicates.
     */
    async createOrganization(
      input: CreateOrganizationInput,
      idempotencyKey: string,
      createdBy: string,
    ) {
      validateCreate(input, idempotencyKey)
      if (!env.SITE_URL || !env.PROVISIONING_SIGNING_KEY) {
        throw fail(
          'INTERNAL_SERVER_ERROR',
          'createOrganization is not configured',
        )
      }
      const done = await db.query.provisioningRequests.findFirst({
        where: eq(
          provisioningRequests.idempotencyKey,
          await sha256(idempotencyKey),
        ),
      })
      if (!done) {
        // D1 holds claims Sanity does not (custom domains): refuse those
        // before the site writes anything.
        const [slugRow, domainRow] = await Promise.all([
          db.query.organizations.findFirst({
            where: eq(organizations.slug, input.slug),
          }),
          input.domain
            ? db.query.domains.findFirst({
                where: eq(domains.hostname, input.domain),
              })
            : undefined,
        ])
        if (slugRow) throw fail('BAD_USER_INPUT', 'that slug is taken')
        if (domainRow) throw fail('BAD_USER_INPUT', 'that domain is claimed')
      }
      const body = JSON.stringify({ idempotencyKey, input })
      let res: Response
      try {
        res = await fetch(
          new URL('/api/provisioning/service/organizations', env.SITE_URL),
          {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              'x-konf-service': await siteAssertion(
                env.PROVISIONING_SIGNING_KEY,
                createdBy,
                body,
              ),
            },
            body,
            signal: AbortSignal.timeout(30_000),
          },
        )
      } catch {
        throw fail('INTERNAL_SERVER_ERROR', 'the site did not answer')
      }
      const out = (await res.json().catch(() => null)) as {
        organizationId?: string
        conferenceId?: string
        code?: string
      } | null
      if (res.status === 400 || res.status === 409) {
        throw fail(
          'BAD_USER_INPUT',
          `refused by the site (${out?.code ?? res.status})`,
        )
      }
      if (!res.ok || !out?.organizationId || !out.conferenceId) {
        throw fail(
          'INTERNAL_SERVER_ERROR',
          `site provisioning failed (${res.status})`,
        )
      }
      await api.provision({
        idempotencyKey,
        orgId: out.organizationId,
        orgSlug: input.slug,
        conferenceId: out.conferenceId,
        createdBy,
      })
      return {
        organizationId: out.organizationId,
        conferenceId: out.conferenceId,
      }
    },

    /** Points the Organization's latest-edition alias at this Conference. */
    async repointAlias(conferenceId: string) {
      const conf = await conference(conferenceId)
      if (!conf) throw fail('NOT_FOUND', 'conference not found')
      await db
        .update(domains)
        .set({ conferenceId })
        .where(
          and(
            eq(domains.orgId, conf.orgId),
            eq(domains.kind, 'platform-alias'),
          ),
        )
      return conf
    },

    /** Claims the hostname, then asks Cloudflare for a custom hostname. */
    async addCustomDomain(conferenceId: string, input: string) {
      const hostname = normalizeHost(input)
      if (
        !hostname ||
        !hostname.includes('.') ||
        hostname === PLATFORM_DOMAIN ||
        hostname.endsWith(`.${PLATFORM_DOMAIN}`)
      ) {
        throw fail('BAD_USER_INPUT', 'not a custom hostname')
      }
      const conf = await conference(conferenceId)
      if (!conf) throw fail('NOT_FOUND', 'conference not found')
      // The primary key is the routing claim: first writer wins.
      const [claimed] = await db
        .insert(domains)
        .values({
          hostname,
          kind: 'custom',
          orgId: conf.orgId,
          conferenceId,
          verification: 'pending',
        })
        .onConflictDoNothing()
        .returning()
      if (!claimed) throw fail('CONFLICT', 'hostname is already claimed')
      let cfId: string | undefined
      try {
        const created = await hostnames.create(hostname)
        cfId = created.id
        const [row] = await db
          .update(domains)
          .set({
            cfCustomHostnameId: created.id,
            verification: created.verification,
            checkedAt: Date.now(),
          })
          .where(eq(domains.hostname, hostname))
          .returning()
        return row
      } catch (error) {
        // Undo both sides so the hostname can be retried.
        if (cfId) {
          try {
            await hostnames.delete(cfId)
          } catch (cleanup) {
            // Orphaned on Cloudflare; the claim is still released below.
            console.error(cleanup)
          }
        }
        await db.delete(domains).where(eq(domains.hostname, hostname))
        throw error
      }
    },

    /** Deletes the Cloudflare custom hostname, then the routing claim. */
    async removeCustomDomain(input: string) {
      const hostname = normalizeHost(input) ?? ''
      const row = await db.query.domains.findFirst({
        where: and(eq(domains.hostname, hostname), eq(domains.kind, 'custom')),
      })
      if (!row) throw fail('NOT_FOUND', 'no custom hostname')
      if (row.cfCustomHostnameId) await hostnames.delete(row.cfCustomHostnameId)
      await db.delete(domains).where(eq(domains.hostname, hostname))
      return row
    },

    /** Mirrors Cloudflare's current status onto the domain row. */
    async refreshCustomDomain(input: string) {
      const hostname = normalizeHost(input) ?? ''
      const row = await db.query.domains.findFirst({
        where: eq(domains.hostname, hostname),
      })
      if (!row?.cfCustomHostnameId)
        throw fail('NOT_FOUND', 'no custom hostname')
      const [updated] = await db
        .update(domains)
        .set({
          verification: await hostnames.get(row.cfCustomHostnameId),
          checkedAt: Date.now(),
        })
        .where(eq(domains.hostname, hostname))
        .returning()
      return updated
    },

    /**
     * Custom domains due a status check: every pending one, and verified
     * ones not checked in the last hour (a moved or deleted hostname must
     * stop resolving).
     */
    async customDomainsToCheck(now = Date.now()) {
      const rows = await db
        .select({ hostname: domains.hostname })
        .from(domains)
        .where(
          and(
            eq(domains.kind, 'custom'),
            isNotNull(domains.cfCustomHostnameId),
            or(
              eq(domains.verification, 'pending'),
              and(
                eq(domains.verification, 'verified'),
                or(
                  isNull(domains.checkedAt),
                  lt(domains.checkedAt, now - RECHECK_VERIFIED_MS),
                ),
              ),
            ),
          ),
        )
      return rows.map((r) => r.hostname)
    },
  }
  return api
}

/** Cron Trigger: mirror Cloudflare status onto custom domains due a check. */
export async function scheduled(
  data: ReturnType<typeof createData>,
  scheduledTime: number,
) {
  for (const hostname of await data.customDomainsToCheck()) {
    // One failing hostname must not stop the rest; the next run retries it.
    await data.refreshCustomDomain(hostname).catch(console.error)
  }
  // Identity's membership sync rides this cron (the account allows 5 crons).
  // Gate on the scheduled minute, not the clock: a late or retried run keeps
  // its scheduledTime, so it neither skips nor repeats an hour. The sync is
  // insert-only, so a rare double run is harmless anyway.
  if (new Date(scheduledTime).getUTCMinutes() !== 0) return
  try {
    await data.syncMembers()
  } catch (e) {
    console.error(
      JSON.stringify({
        event: 'identity.membership.sync_failed',
        reason: 'rpc',
        // Name only: an RPC error message is not ours to vet for emails.
        error: e instanceof Error ? e.name : 'unknown',
      }),
    )
  }
}
