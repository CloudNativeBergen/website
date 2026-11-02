// Public data layer. createData is the ONLY export resolvers see.
// tenancy: false: the directory is the registry every tenant is resolved
// from, so its reads span Organizations. Who may call what is decided in
// the resolvers (src/subgraph.ts).
import { and, eq } from 'drizzle-orm'
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

/** Bindings the data layer needs; the generated WorkerEnv extends it. */
export interface DataEnv extends CloudflareEnv {
  DB: D1Database
}

/** The platform-host naming convention, owned here. */
export const PLATFORM_DOMAIN = 'konf.run'
const editionHost = (org: string, conf: string) =>
  `${org}-${conf}.${PLATFORM_DOMAIN}`
const aliasHost = (org: string) => `${org}.${PLATFORM_DOMAIN}`

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/

const fail = (code: string, message: string) =>
  createGraphQLError(message, { extensions: { code } })

/** Accepts an Origin (`https://host:port`) or a bare hostname. */
export function normalizeHost(input: string): string | null {
  const s = input.trim().toLowerCase()
  if (!s) return null
  try {
    const host = new URL(s.includes('://') ? s : `https://${s}`).hostname
    return host.replace(/\.$/, '') || null
  } catch {
    return null
  }
}

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
    organization,

    /**
     * `trusted` (a PlatformContext) sees every row. Everyone else only gets
     * a verified hostname of an active Organization.
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
        })
        .from(domains)
        .innerJoin(organizations, eq(organizations.id, domains.orgId))
        .where(eq(domains.hostname, hostname))
      if (!row) return null
      if (
        !trusted &&
        (row.verification !== 'verified' || row.orgStatus !== 'active')
      ) {
        return null
      }
      return row
    },

    async conference(id: string, trusted: boolean) {
      const conf = await conference(id)
      if (!conf || trusted) return conf ?? null
      const org = await organization(conf.orgId)
      return org?.status === 'active' ? conf : null
    },

    /** Same key twice returns the first Organization; nothing is created twice. */
    async provision(input: ProvisionInput) {
      if (!input.idempotencyKey.trim()) {
        throw fail('BAD_USER_INPUT', 'idempotencyKey is required')
      }
      if (!SLUG.test(input.orgSlug) || !SLUG.test(input.conferenceSlug)) {
        throw fail('BAD_USER_INPUT', 'slugs are lowercase a-z, 0-9 and -')
      }
      const earlier = async () => {
        const req = await db.query.provisioningRequests.findFirst({
          where: eq(provisioningRequests.idempotencyKey, input.idempotencyKey),
        })
        return req ? organization(req.orgId) : undefined
      }
      const done = await earlier()
      if (done) return done

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
        if (raced) return raced
        console.error(error)
        throw fail('CONFLICT', 'organization slug or platform host is taken')
      }
      return (await organization(orgId))!
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
      try {
        const created = await hostnames.create(hostname)
        const [row] = await db
          .update(domains)
          .set({
            cfCustomHostnameId: created.id,
            verification: created.verification,
          })
          .where(eq(domains.hostname, hostname))
          .returning()
        return row
      } catch (error) {
        // Release the claim so the hostname can be retried.
        await db.delete(domains).where(eq(domains.hostname, hostname))
        throw error
      }
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
        .set({ verification: await hostnames.get(row.cfCustomHostnameId) })
        .where(eq(domains.hostname, hostname))
        .returning()
      return updated
    },
  }
}
