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
import type { OperatorAuditEvent } from '@runkonf/tenancy'
import { importJWK, SignJWT, type JWK } from 'jose'
import { effectivePlan, signupSlugProblem, type Plan } from '@runkonf/tenancy'
import { generateVerificationToken } from '@runkonf/tenancy/challenge'
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
  inviteRequests,
  provisioningRequests,
  signupCodes,
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
    ensure(orgId: string, slug: string, name?: string): Promise<unknown>
    /** Organizer membership sync (#1907); identity has no cron of its own. */
    syncMembers(): Promise<unknown>
    /** The orgs a user is a member of, with the role there (#2036). */
    memberships(userId: string): Promise<{ orgId: string; role: string }[]>
    /** An operator write as an audit_event row (docs/AUTHORIZATION.md §3.6). */
    audit(event: OperatorAuditEvent): Promise<void>
    /** Sign-up (#2163): org, owner membership and `org.signup` audit, atomic. */
    signupOwner(
      orgId: string,
      slug: string,
      name: string,
      userId: string,
      codeId: string,
    ): Promise<void>
    /** Whether `userId` owns `orgId` (a lost signupOwner reply). */
    isOwner(orgId: string, userId: string): Promise<boolean>
  }
  /** Sign-up attempts per user (#2163), Workers Rate Limiting. */
  SIGNUP_LIMIT: RateLimit
  /** requestInvite attempts (#2161), keyed per caller IP and per email. */
  INVITE_LIMIT: RateLimit
  /** wrangler secret put INVITE_TOKEN_SECRET: HMAC key for the form's time token. Without it requestInvite refuses. */
  INVITE_TOKEN_SECRET?: string
  /** konf-conference's ProgramDate entrypoint: is an edition ticketed? */
  CONFERENCE: {
    ticketed(orgId: string, conferenceId: string): Promise<boolean>
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
const RECHECK_LIMIT_MS = 60 * 1000

/** A hostname a tenant may claim: not a platform host (addCustomDomain, #2207). */
function customHostname(input: string) {
  const hostname = normalizeHost(input)
  if (
    !hostname ||
    !hostname.includes('.') ||
    hostname === PLATFORM_DOMAIN ||
    hostname.endsWith(`.${PLATFORM_DOMAIN}`)
  ) {
    throw fail('BAD_USER_INPUT', 'not a custom hostname')
  }
  return hostname
}

const fail = (code: string, message: string) =>
  createGraphQLError(message, { extensions: { code } })

/** Stable BAD_USER_INPUT reasons (kontroll#81); the gateway passes these on. */
type Reason =
  | 'SLUG_TAKEN'
  | 'DOMAIN_TAKEN'
  | 'IDEMPOTENCY_KEY_REUSED'
  | 'INVALID_INPUT'
  | 'COPY_FROM_NOT_IN_ORG'
const refuse = (reason: Reason, message: string, field?: string) =>
  createGraphQLError(message, {
    extensions: { code: 'BAD_USER_INPUT', reason, ...(field && { field }) },
  })
const invalid = (field: string, message: string) =>
  refuse('INVALID_INPUT', message, field)

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

/**
 * The only hosts createOrganization sends a signed assertion and an owner
 * email to: this website's own deployment. A SITE_URL elsewhere (konf.app is
 * a different, third-party site) is refused, never called.
 */
export const SITE_HOSTS = new Set(['auth.konf.app'])

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
// An impossible date (2027-13-01) parses to NaN; toISOString would throw.
const isDate = (s: string) => {
  const t = Date.parse(`${s}T00:00:00Z`)
  return (
    DATE.test(s) && !Number.isNaN(t) && new Date(t).toISOString().startsWith(s)
  )
}
const HOSTNAME =
  /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Every input rule, checked before anything is read or written. */
/** The rules createOrganization and provisionConference share. */
function validateEdition(
  e: { startDate: string; endDate: string; domain?: string | null },
  key: string,
) {
  // The site's Idempotency-Key rule (src/lib/provisioning/constants.ts).
  if (!/^[\x20-\x7e]{16,200}$/.test(key))
    throw invalid(
      'idempotencyKey',
      'idempotencyKey is 16-200 printable ASCII characters',
    )
  if (!isDate(e.startDate)) throw invalid('startDate', 'dates are YYYY-MM-DD')
  if (!isDate(e.endDate)) throw invalid('endDate', 'dates are YYYY-MM-DD')
  if (e.endDate < e.startDate)
    throw invalid('endDate', 'endDate is before startDate')
  if (
    e.domain != null &&
    (!HOSTNAME.test(e.domain) ||
      e.domain === PLATFORM_DOMAIN ||
      e.domain.endsWith(`.${PLATFORM_DOMAIN}`))
  )
    throw invalid(
      'domain',
      'domain must be a lowercase hostname outside the platform zone',
    )
}

/** Every input rule, checked before anything is read or written. */
function validateCreate(input: CreateOrganizationInput, key: string) {
  if (!input.name.trim() || input.name.length > 200)
    throw invalid('name', 'name is required')
  if (!input.conferenceTitle.trim() || input.conferenceTitle.length > 200)
    throw invalid('conferenceTitle', 'conferenceTitle is required')
  if (input.slug.length > 63 || !SLUG.test(input.slug))
    throw invalid('slug', 'slugs are lowercase a-z, 0-9 and -')
  if (RESERVED_SLUGS.has(input.slug))
    throw invalid('slug', `"${input.slug}" is reserved for a platform host`)
  validateEdition(input, key)
  if (input.ownerEmail.length > 254 || !EMAIL.test(input.ownerEmail))
    throw invalid('ownerEmail', 'ownerEmail is not an email address')
}

/** provisionConference's input (kontroll#85). */
export interface ProvisionConferenceInput {
  title: string
  startDate: string
  endDate: string
  domain?: string | null
  copyFrom?: string | null
}

/** Site refusal codes (the service routes' 400/409 `code`) to reasons. */
const SITE_REFUSALS: Record<string, [Reason, string?]> = {
  idempotency_conflict: ['IDEMPOTENCY_KEY_REUSED', 'idempotencyKey'],
  slug_taken: ['SLUG_TAKEN', 'slug'],
  platform_host_taken: ['SLUG_TAKEN', 'slug'],
  domain_claimed: ['DOMAIN_TAKEN', 'domain'],
  copy_from_not_in_org: ['COPY_FROM_NOT_IN_ORG', 'copyFrom'],
}
const siteRefusal = (code: string | undefined, status: number) => {
  const [reason, field] = SITE_REFUSALS[code ?? ''] ?? ['INVALID_INPUT']
  return refuse(reason, `refused by the site (${code ?? status})`, field)
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

/** 128 random bits as base-36 byte pairs, grouped for reading aloud. */
function newSignupCode() {
  const b = crypto.getRandomValues(new Uint8Array(16))
  const s = [...b].map((x) => x.toString(36).padStart(2, '0')).join('')
  return s.match(/.{1,8}/g)!.join('-')
}

/** SHA-256 hex. A code is random, so no salt or slow hash is needed. */
export async function hashSignupCode(code: string) {
  const d = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(code),
  )
  return [...new Uint8Array(d)]
    .map((x) => x.toString(16).padStart(2, '0'))
    .join('')
}

export function createData(
  env: DataEnv,
  hostnames: CustomHostnames = cloudflareHostnames(env),
) {
  const db = rawDb(env.DB)

  /** The configured site, only on an allowlisted https host. */
  const siteUrl = () => {
    const site = env.SITE_URL ? URL.parse(env.SITE_URL) : null
    if (
      !site ||
      site.protocol !== 'https:' ||
      !SITE_HOSTS.has(site.hostname) ||
      !env.PROVISIONING_SIGNING_KEY
    ) {
      throw fail('INTERNAL_SERVER_ERROR', 'site provisioning is not configured')
    }
    return site
  }

  /** POSTs `payload` to a site service route under a body-bound assertion. */
  const callSite = async (
    site: URL,
    path: string,
    payload: unknown,
    createdBy: string,
  ) => {
    const body = JSON.stringify(payload)
    let res: Response
    try {
      res = await fetch(new URL(path, site), {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-konf-service': await siteAssertion(
            env.PROVISIONING_SIGNING_KEY!,
            createdBy,
            body,
          ),
        },
        body,
        signal: AbortSignal.timeout(30_000),
      })
    } catch {
      throw fail('INTERNAL_SERVER_ERROR', 'the site did not answer')
    }
    const out = ((await res.json().catch(() => null)) ?? {}) as {
      organizationId?: string
      conferenceId?: string
      domains?: unknown[]
      code?: string
    }
    if (res.status === 400 || res.status === 409)
      throw siteRefusal(out.code, res.status)
    if (!res.ok)
      throw fail(
        'INTERNAL_SERVER_ERROR',
        `site provisioning failed (${res.status})`,
      )
    return out
  }

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
      status: 'cancelled' | 'archived' | 'draft' | 'live' | null,
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

    /** Whether the edition sells tickets (`sellsTickets`). */
    ticketed: (orgId: string, id: string) => env.CONFERENCE.ticketed(orgId, id),

    /**
     * Sign-up slug check (#2129): format and reserved first (no read), then
     * an existing org slug or host. One answer for reserved and taken, so
     * the check reveals no more than the public hosts already do.
     */
    async signupSlugProblem(
      slug: string,
    ): Promise<'format' | 'unavailable' | null> {
      const pure = signupSlugProblem(slug)
      if (pure === 'format') return 'format'
      if (pure === 'reserved') return 'unavailable'
      const [org, host] = await Promise.all([
        db.query.organizations.findFirst({
          where: eq(organizations.slug, slug),
          columns: { id: true },
        }),
        db.query.domains.findFirst({
          where: eq(domains.hostname, aliasHost(slug)),
          columns: { hostname: true },
        }),
      ])
      return org || host ? 'unavailable' : null
    },

    /** Operator-only: a new code, returned once; only its hash is stored. */
    async createSignupCode(
      createdBy: string,
      note: string,
      maxUses: number,
      expiresAt: string,
    ) {
      const code = newSignupCode()
      const [row] = await db
        .insert(signupCodes)
        .values({
          id: crypto.randomUUID(),
          codeHash: await hashSignupCode(code),
          note,
          maxUses,
          expiresAt,
          createdBy,
          createdAt: new Date().toISOString(),
        })
        .returning()
      return { ...row, code }
    },

    /** Operator-only: every code, newest first, without hashes. */
    signupCodes: () =>
      db.query.signupCodes.findMany({
        orderBy: sql`${signupCodes.createdAt} DESC`,
      }),

    /** Operator-only: revokes a code; null for an unknown id. */
    async revokeSignupCode(id: string) {
      const [row] = await db
        .update(signupCodes)
        .set({
          revokedAt: sql`coalesce(${signupCodes.revokedAt}, ${new Date().toISOString()})`,
        })
        .where(eq(signupCodes.id, id))
        .returning()
      return row ?? null
    },

    /** One sign-up attempt per call, keyed on the user, never the code. */
    async signupAttempt(userId: string) {
      const { success } = await env.SIGNUP_LIMIT.limit({
        key: `signup|user:${userId}`,
      })
      return success
    },

    /** A signed `<issued ms>.<hmac>` for the invite form; null without a secret. */
    async inviteToken(now = Date.now()) {
      if (!env.INVITE_TOKEN_SECRET) return null
      return `${now}.${await hmac(env.INVITE_TOKEN_SECRET, String(now))}`
    },

    /** Milliseconds since a valid token was issued; null if forged or malformed. */
    async inviteTokenAge(token: string, now = Date.now()) {
      const [ts, sig, extra] = token.split('.')
      if (!env.INVITE_TOKEN_SECRET || !ts || !sig || extra !== undefined)
        return null
      if (!/^\d{1,15}$/.test(ts)) return null
      const expected = await hmac(env.INVITE_TOKEN_SECRET, ts)
      if (!timingSafeEqual(sig, expected)) return null
      return now - Number(ts)
    },

    /** One invite request attempt: both the IP and the email budget must allow it. */
    async inviteAttempt(ip: string, email: string) {
      const [byIp, byEmail] = await Promise.all([
        env.INVITE_LIMIT.limit({ key: `invite|ip:${ip}` }),
        env.INVITE_LIMIT.limit({ key: `invite|email:${email}` }),
      ])
      return byIp.success && byEmail.success
    },

    /** Stores a request; a second open one for the same email is dropped. */
    async requestInvite(input: {
      name: string
      email: string
      conference: string
      size: string
      ticketed: boolean
      message: string | null
    }) {
      await db
        .insert(inviteRequests)
        .values({
          id: crypto.randomUUID(),
          ...input,
          createdAt: new Date().toISOString(),
        })
        .onConflictDoNothing()
    },

    /** Operator-only: requests, newest first, optionally by status. */
    inviteRequests: (status?: InviteStatus | null) =>
      db.query.inviteRequests.findMany({
        where: status ? eq(inviteRequests.status, status) : undefined,
        orderBy: sql`${inviteRequests.createdAt} DESC`,
        limit: 500,
      }),

    /** Operator-only: sets a status (and code); null for an unknown id. */
    async resolveInviteRequest(
      id: string,
      status: InviteStatus,
      codeId: string | null,
    ) {
      const [row] = await db
        .update(inviteRequests)
        .set({
          status,
          codeId,
          resolvedAt: status === 'new' ? null : new Date().toISOString(),
        })
        .where(eq(inviteRequests.id, id))
        .returning()
      return row ?? null
    },

    /** Operator-only: deletes every request from an email; the number deleted. */
    async eraseInviteRequests(email: string) {
      const rows = await db
        .delete(inviteRequests)
        .where(eq(inviteRequests.email, email))
        .returning({ id: inviteRequests.id })
      return rows.length
    },

    /** Retention: 12 months after resolved_at, or after created_at if unresolved. */
    async purgeInviteRequests(now = new Date()) {
      const cutoff = new Date(now)
      cutoff.setUTCFullYear(cutoff.getUTCFullYear() - 1)
      const c = cutoff.toISOString()
      await db
        .delete(inviteRequests)
        .where(
          or(
            lt(inviteRequests.resolvedAt, c),
            and(
              isNull(inviteRequests.resolvedAt),
              lt(inviteRequests.createdAt, c),
            ),
          ),
        )
    },

    /** The id of a code that can still be spent; null otherwise. Read only. */
    async signupCodeId(code: string, now = new Date()) {
      const row = await db.query.signupCodes.findFirst({
        where: and(
          eq(signupCodes.codeHash, await hashSignupCode(code.trim())),
          isNull(signupCodes.revokedAt),
          gt(signupCodes.expiresAt, now.toISOString()),
          lt(signupCodes.uses, signupCodes.maxUses),
        ),
        columns: { id: true },
      })
      return row?.id ?? null
    },

    /**
     * Self-serve sign-up (#2163), after the resolver's checks. Steps and
     * what undoes them when a later one fails:
     * 1. spend the code (conditional UPDATE): losing a race on the last use
     *    refuses with `inviteCode`, nothing written;
     * 2. one D1 batch: the org (free, customer), its first draft edition and
     *    `<slug>.konf.run` (verified, platform cert), as provision() writes
     *    them; on failure (a slug race) the use is refunded;
     * 3. identity's signupOwner: org, OWNER membership and audit in one
     *    batch, and it fails if identity already has the org. On an error
     *    identity is asked whether the caller owns the org: yes (a lost
     *    reply) is success; no deletes the step-2 rows and refunds the use;
     *    no answer logs `signup.unresolved` with the org id and keeps both.
     * Returns after step 3, so membership is readable on the next request.
     */
    async signUp(userId: string, name: string, slug: string, code: string) {
      const codeId = await api.consumeSignupCode(code)
      if (!codeId) return null
      const refund = () =>
        db
          .update(signupCodes)
          .set({ uses: sql`${signupCodes.uses} - 1` })
          .where(eq(signupCodes.id, codeId))
      const orgId = `organization.${slug}`
      const host = aliasHost(slug)
      const conference = {
        id: `conference.${crypto.randomUUID()}`,
        orgId,
        slug: String(new Date().getUTCFullYear()),
        name,
        lifecycle: 'draft' as const,
      }
      try {
        await db.batch([
          db.insert(organizations).values({
            id: orgId,
            slug,
            name,
            status: 'active',
            plan: 'free',
            kind: 'customer',
            createdAt: new Date().toISOString(),
          }),
          db.insert(conferences).values(conference),
          db.insert(domains).values({
            hostname: host,
            kind: 'platform-alias',
            orgId,
            conferenceId: conference.id,
            verification: 'verified',
          }),
        ])
      } catch (error) {
        console.error(error)
        await refund()
        throw invalid('slug', 'this slug is not available')
      }
      try {
        await env.IDENTITY.signupOwner(orgId, slug, name, userId, codeId)
      } catch (error) {
        console.error(error)
        // The write may have committed with only the reply lost: ask.
        const owned = await env.IDENTITY.isOwner(orgId, userId).catch(
          () => null,
        )
        if (owned === null) {
          console.error(JSON.stringify({ event: 'signup.unresolved', orgId }))
          throw fail('INTERNAL_SERVER_ERROR', 'sign-up state is unknown')
        }
        if (!owned) {
          await db.batch([
            db.delete(domains).where(eq(domains.orgId, orgId)),
            db.delete(conferences).where(eq(conferences.orgId, orgId)),
            db.delete(organizations).where(eq(organizations.id, orgId)),
            refund(),
          ])
          throw fail(
            'INTERNAL_SERVER_ERROR',
            'sign-up failed; nothing was kept',
          )
        }
      }
      return {
        organization: (await organization(orgId))!,
        conference,
        host,
      }
    },

    /**
     * Spends one use of a valid code in a single conditional UPDATE: not
     * revoked, not expired, uses left. The spent code's id, or null.
     */
    async consumeSignupCode(code: string, now = new Date()) {
      const rows = await db
        .update(signupCodes)
        .set({ uses: sql`${signupCodes.uses} + 1` })
        .where(
          and(
            eq(signupCodes.codeHash, await hashSignupCode(code.trim())),
            isNull(signupCodes.revokedAt),
            gt(signupCodes.expiresAt, now.toISOString()),
            lt(signupCodes.uses, signupCodes.maxUses),
          ),
        )
        .returning({ id: signupCodes.id })
      return rows[0]?.id ?? null
    },

    /**
     * Operator-only (#2129): grants `plan` until `until` (ISO 8601, null for
     * no end), or with `free` ends a grant. Records the change in identity's
     * audit_event, then writes. Null for an unknown org.
     */
    async setComplimentaryPlan(
      actorId: string,
      orgId: string,
      plan: Plan,
      until: string | null,
      reason: string,
    ) {
      const free = plan === 'free'
      // Audit first: a failed audit call leaves no unaudited change. An
      // unknown org is refused before either.
      if (!(await organization(orgId))) return null
      const event: OperatorAuditEvent = {
        type: 'operator.write',
        actorId,
        organizationId: orgId,
        conferenceId: null,
        fields: ['plan', 'plan_source', 'comp_until', 'comp_reason'],
      }
      await env.IDENTITY.audit(event)
      console.log(JSON.stringify({ event: 'billing.comp_plan', orgId, plan }))
      const [row] = await db
        .update(organizations)
        .set({
          plan,
          planSource: free ? 'default' : 'comp',
          compUntil: free ? null : until,
          compReason: free ? null : reason,
        })
        .where(eq(organizations.id, orgId))
        .returning()
      return row
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
    async resolveHost(input: string, trusted: boolean, conferenceId?: string) {
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
          plan: organizations.plan,
          planSource: organizations.planSource,
          subscriptionStatus: organizations.subscriptionStatus,
          currentPeriodEnd: organizations.currentPeriodEnd,
          compUntil: organizations.compUntil,
          orgKind: organizations.kind,
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
      // #2150: the operator lane may name another edition of the host's org.
      // The org is part of the query, so another org's id resolves nothing.
      if (conferenceId) {
        const conf = await db.query.conferences.findFirst({
          where: and(
            eq(conferences.id, conferenceId),
            eq(conferences.orgId, row.orgId),
          ),
        })
        if (!conf) return null
        Object.assign(row, {
          conferenceId: conf.id,
          lifecycle: conf.lifecycle,
          apiRead: conf.apiRead,
          identityLogin: conf.identityLogin,
          d1Write: conf.d1Write,
          d1Override: conf.d1Override,
        })
      }
      const {
        apiRead,
        identityLogin,
        d1Write,
        d1Override,
        plan,
        planSource,
        subscriptionStatus,
        currentPeriodEnd,
        compUntil,
        orgKind,
        ...rest
      } = row
      return {
        ...rest,
        flags: { apiRead, identityLogin, d1Write, d1Override },
        // The gateway mints it into the envelope (#2129).
        plan: effectivePlan({
          plan,
          planSource,
          subscriptionStatus,
          currentPeriodEnd,
          compUntil,
          kind: orgKind,
        }),
        orgKind,
      }
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
        await env.IDENTITY.ensure(org.id, org.slug, org.name ?? undefined)
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
      const site = siteUrl()
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
        if (slugRow) throw refuse('SLUG_TAKEN', 'that slug is taken', 'slug')
        if (domainRow)
          throw refuse('DOMAIN_TAKEN', 'that domain is claimed', 'domain')
      }
      const out = await callSite(
        site,
        '/api/provisioning/service/organizations',
        { idempotencyKey, input },
        createdBy,
      )
      if (!out.organizationId || !out.conferenceId) {
        throw fail('INTERNAL_SERVER_ERROR', 'site provisioning failed')
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

    /**
     * kontroll#85: a new edition of an existing org. The caller is already
     * authorised for `orgId` (src/subgraph.ts). Checks the input and
     * `copyFrom` against D1 before the site writes anything; the site writes
     * the Sanity conference (cloning `copyFrom`, or the org's latest edition
     * with nothing but its identity) under its own input-hashed receipt, then
     * the D1 row lands as a draft with this key's receipt.
     */
    async provisionConference(
      orgId: string,
      input: ProvisionConferenceInput,
      idempotencyKey: string,
      createdBy: string,
    ) {
      if (!input.title.trim() || input.title.length > 200)
        throw invalid('title', 'title is required')
      validateEdition(input, idempotencyKey)
      if (input.copyFrom != null && !SANITY_ID.test(input.copyFrom))
        throw invalid('copyFrom', 'copyFrom is not a conference id')
      const site = siteUrl()
      // Its own keyspace: a createOrganization key never replays here.
      const keyHash = await sha256(`conference|${idempotencyKey}`)
      const receipt = () =>
        db.query.provisioningRequests.findFirst({
          where: eq(provisioningRequests.idempotencyKey, keyHash),
        })
      const [org, source, done] = await Promise.all([
        organization(orgId),
        input.copyFrom ? conference(input.copyFrom) : undefined,
        receipt(),
      ])
      if (!org) throw invalid('orgId', 'no such organization')
      // Same answer for a missing and a foreign edition: no existence oracle.
      if (input.copyFrom && source?.orgId !== orgId)
        throw refuse(
          'COPY_FROM_NOT_IN_ORG',
          'copyFrom is not an edition of this organization',
          'copyFrom',
        )
      if (done && done.orgId !== orgId)
        throw refuse(
          'IDEMPOTENCY_KEY_REUSED',
          'idempotencyKey was used with different arguments',
          'idempotencyKey',
        )
      if (!done && input.domain) {
        const taken = await db.query.domains.findFirst({
          where: eq(domains.hostname, input.domain),
        })
        if (taken)
          throw refuse('DOMAIN_TAKEN', 'that domain is claimed', 'domain')
      }
      const out = await callSite(
        site,
        '/api/provisioning/service/conferences',
        { idempotencyKey, orgId, input },
        createdBy,
      )
      const conferenceId = out.conferenceId
      if (typeof conferenceId !== 'string' || !SANITY_ID.test(conferenceId))
        throw fail('INTERNAL_SERVER_ERROR', 'site provisioning failed')
      if (done) {
        if (done.conferenceId !== conferenceId)
          throw fail('INTERNAL_SERVER_ERROR', 'receipt mismatch')
        return { conferenceId }
      }
      // Rollout flags: on only where every other edition of the org has it
      // on, so a new edition never runs a path its siblings do not; the
      // column defaults (off) for an org with no editions in D1.
      const siblings = await db.query.conferences.findMany({
        where: eq(conferences.orgId, orgId),
      })
      const flags = Object.fromEntries(
        (['apiRead', 'identityLogin', 'd1Write', 'd1Override'] as const).map(
          (f) => [f, siblings.length > 0 && siblings.every((c) => c[f])],
        ),
      )
      const year = input.startDate.slice(0, 4)
      const host = editionHost(org.slug, year)
      const minted = (out.domains ?? []).some(
        (d: unknown) => typeof d === 'string' && normalizeHost(d) === host,
      )
      try {
        await db.batch([
          db.insert(conferences).values({
            id: conferenceId,
            orgId,
            slug: year,
            name: input.title,
            lifecycle: 'draft',
            ...flags,
          }),
          ...(minted
            ? [
                db.insert(domains).values({
                  hostname: host,
                  kind: 'platform-edition' as const,
                  orgId,
                  conferenceId,
                  verification: 'verified' as const,
                }),
              ]
            : []),
          db.insert(provisioningRequests).values({
            idempotencyKey: keyHash,
            orgId,
            conferenceId,
            createdBy,
          }),
        ])
      } catch (error) {
        // A concurrent request with the same key won the race.
        if ((await receipt())?.conferenceId === conferenceId)
          return { conferenceId }
        console.error(error)
        throw fail('CONFLICT', 'conference or platform host is taken')
      }
      return { conferenceId }
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
      const hostname = customHostname(input)
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

    /**
     * #2207: `orgId`'s hostnames of one of its conferences; null when the
     * org has no such conference, so a foreign id reads as a missing one.
     */
    async conferenceDomains(orgId: string, conferenceId: string) {
      if (!(await api.conferenceOf(orgId, conferenceId))) return null
      return db.query.domains.findMany({
        where: and(
          eq(domains.orgId, orgId),
          eq(domains.conferenceId, conferenceId),
        ),
        orderBy: domains.hostname,
      })
    },

    /**
     * #2207: a pending DNS-TXT claim with a fresh token. Writes only D1 and
     * never `verification = 'verified'`, so routing does not change.
     */
    async claimDomain(orgId: string, conferenceId: string, input: string) {
      const hostname = customHostname(input)
      if (!(await api.conferenceOf(orgId, conferenceId)))
        throw fail('NOT_FOUND', 'conference not found')
      const [claimed] = await db
        .insert(domains)
        .values({
          hostname,
          kind: 'custom',
          orgId,
          conferenceId,
          verification: 'pending',
          method: 'dns-txt',
          status: 'pending',
          token: generateVerificationToken(),
        })
        .onConflictDoNothing()
        .returning()
      if (!claimed) throw fail('CONFLICT', 'hostname is already claimed')
      return claimed
    },

    /**
     * #2207: at most one recheck per hostname per RECHECK_LIMIT_MS, taken
     * atomically in SQL. Phase 1 has no DNS check: it returns the row as is.
     */
    async recheckDomain(orgId: string, input: string, now = Date.now()) {
      const hostname = normalizeHost(input) ?? ''
      const mine = and(eq(domains.hostname, hostname), eq(domains.orgId, orgId))
      const [row] = await db
        .update(domains)
        .set({ lastRecheckAt: now })
        .where(
          and(
            mine,
            or(
              isNull(domains.lastRecheckAt),
              lt(domains.lastRecheckAt, now - RECHECK_LIMIT_MS),
            ),
          ),
        )
        .returning()
      if (row) return row
      if (await db.query.domains.findFirst({ where: mine }))
        throw fail('RATE_LIMITED', 'checked less than a minute ago')
      throw fail('NOT_FOUND', 'no such hostname')
    },

    /** #2207: removes one of `orgId`'s custom hostnames; platform hosts stay. */
    async removeDomain(orgId: string, input: string) {
      const hostname = normalizeHost(input) ?? ''
      const row = await db.query.domains.findFirst({
        where: and(eq(domains.hostname, hostname), eq(domains.orgId, orgId)),
      })
      if (!row) throw fail('NOT_FOUND', 'no such hostname')
      if (row.kind !== 'custom')
        throw fail('FORBIDDEN', 'a platform hostname cannot be removed')
      if (row.cfCustomHostnameId) await hostnames.delete(row.cfCustomHostnameId)
      await db.delete(domains).where(eq(domains.hostname, hostname))
      return row
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

export type InviteStatus = 'new' | 'invited' | 'declined' | 'spam'

async function hmac(secret: string, msg: string) {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(msg))
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
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
  // Invite request retention (#2161) rides the 03:00 UTC run, once a day.
  if (new Date(scheduledTime).getUTCHours() === 3)
    await data.purgeInviteRequests(new Date(scheduledTime)).catch((e) =>
      console.error(
        JSON.stringify({
          event: 'invite_requests.purge_failed',
          error: e instanceof Error ? e.name : 'unknown',
        }),
      ),
    )
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
