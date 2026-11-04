// Public data layer. createData is the ONLY export resolvers see.
// tenancy: false: the directory is the registry every tenant is resolved
// from, so its reads span Organizations. Who may call what is decided in
// the resolvers (src/subgraph.ts).
import { and, eq, isNotNull, isNull, lt, or } from 'drizzle-orm'
import { createGraphQLError } from 'graphql-yoga'
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
  }
}

/** How often a verified custom domain is re-checked with Cloudflare. */
const RECHECK_VERIFIED_MS = 60 * 60 * 1000

const fail = (code: string, message: string) =>
  createGraphQLError(message, { extensions: { code } })

export interface ProvisionInput {
  idempotencyKey: string
  orgSlug: string
  orgName: string
  conferenceSlug: string
  conferenceName: string
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

  return {
    syncMembers: () => env.IDENTITY.syncMembers(),
    organization,

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
     * Same key twice returns the first Organization; nothing is created
     * twice. identity's ensure runs on every call, so a retry heals a
     * failed ensure.
     */
    async provision(input: ProvisionInput) {
      if (!input.idempotencyKey.trim()) {
        throw fail('BAD_USER_INPUT', 'idempotencyKey is required')
      }
      if (!SLUG.test(input.orgSlug) || !SLUG.test(input.conferenceSlug)) {
        throw fail('BAD_USER_INPUT', 'slugs are lowercase a-z, 0-9 and -')
      }
      if (RESERVED_SLUGS.has(input.orgSlug)) {
        throw fail(
          'BAD_USER_INPUT',
          `"${input.orgSlug}" is reserved for a platform host`,
        )
      }
      const earlier = async () => {
        const req = await db.query.provisioningRequests.findFirst({
          where: eq(provisioningRequests.idempotencyKey, input.idempotencyKey),
        })
        return req ? organization(req.orgId) : undefined
      }
      const ensured = async <T extends { id: string; slug: string }>(
        org: T,
      ) => {
        await env.IDENTITY.ensure(org.id, org.slug)
        return org
      }
      const done = await earlier()
      if (done) return ensured(done)

      const orgId = crypto.randomUUID()
      const conferenceId = crypto.randomUUID()
      const host = (
        hostname: string,
        kind: 'platform-edition' | 'platform-alias',
      ) =>
        db.insert(domains).values({
          hostname,
          kind,
          orgId,
          conferenceId,
          // Platform hosts sit under the platform's own certificate.
          verification: 'verified',
        })
      try {
        // One D1 batch: all rows land, or none do.
        await db.batch([
          db.insert(organizations).values({
            id: orgId,
            slug: input.orgSlug,
            name: input.orgName,
            status: 'active',
            plan: 'free',
          }),
          db.insert(conferences).values({
            id: conferenceId,
            orgId,
            slug: input.conferenceSlug,
            name: input.conferenceName,
            lifecycle: 'draft',
          }),
          host(
            editionHost(input.orgSlug, input.conferenceSlug),
            'platform-edition',
          ),
          host(aliasHost(input.orgSlug), 'platform-alias'),
          db.insert(provisioningRequests).values({
            idempotencyKey: input.idempotencyKey,
            orgId,
          }),
        ])
      } catch (error) {
        // A concurrent request with the same key won the race.
        const raced = await earlier()
        if (raced) return ensured(raced)
        console.error(error)
        throw fail('CONFLICT', 'organization slug or platform host is taken')
      }
      return ensured((await organization(orgId))!)
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
