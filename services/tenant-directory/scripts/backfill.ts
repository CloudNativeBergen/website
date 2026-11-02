// Sanity -> tenant-directory D1 backfill (#1825). Pure: documents in, rows
// and SQL out. The Sanity read lives in scripts/backfill-tenant-directory.ts
// at the repo root, because services may not import Sanity (eslint, #1800).
// Ids are the Sanity `_id`s, so a rerun upserts the same rows.
import {
  PLATFORM_DOMAIN,
  RESERVED_SLUGS,
  SLUG,
  aliasHost,
  editionHost,
  normalizeHost,
} from '../src/data/naming'

export interface SanityOrg {
  _id: string
  name?: string | null
  slug?: string | null
  plan?: string | null
}
export interface SanityConference {
  _id: string
  title?: string | null
  orgId?: string | null
  startDate?: string | null
  lifecycleStatus?: string | null
  domains?: string[] | null
}
export interface SanityVerification {
  hostname: string
  conferenceId?: string | null
  status?: string | null
}

type Verification = 'pending' | 'verified' | 'failed'
export interface Backfill {
  orgs: { id: string; slug: string; name: string; plan: string }[]
  conferences: {
    id: string
    orgId: string
    slug: string
    name: string
    lifecycle: 'live' | 'archived'
  }[]
  domains: {
    hostname: string
    orgId: string
    conferenceId: string
    kind: 'platform-edition' | 'platform-alias' | 'custom'
    verification: Verification
  }[]
  anomalies: string[]
}

const VERIFICATION: Record<string, Verification> = {
  verified: 'verified',
  failing: 'failed',
  revoked: 'failed',
}

export function mapBackfill(
  sanityOrgs: SanityOrg[],
  sanityConfs: SanityConference[],
  verifications: SanityVerification[],
): Backfill {
  const out: Backfill = {
    orgs: [],
    conferences: [],
    domains: [],
    anomalies: [],
  }
  const flag = (s: string) => out.anomalies.push(s)
  const byId = (a: { _id: string }, b: { _id: string }) =>
    a._id.localeCompare(b._id)

  const orgs = new Map<string, Backfill['orgs'][number]>()
  const platformOk = new Set<string>()
  const slugs = new Set<string>()
  for (const o of [...sanityOrgs].sort(byId)) {
    const slug = o.slug?.trim() ?? ''
    if (!SLUG.test(slug) || slugs.has(slug)) {
      flag(
        `org ${o._id}: slug "${slug}" is missing, malformed or taken; skipped`,
      )
      continue
    }
    slugs.add(slug)
    const row = {
      id: o._id,
      slug,
      name: o.name || slug,
      plan: o.plan || 'free',
    }
    orgs.set(o._id, row)
    out.orgs.push(row)
    if (RESERVED_SLUGS.has(slug)) {
      flag(`org ${o._id}: slug "${slug}" is reserved; platform hosts skipped`)
    } else platformOk.add(o._id)
  }

  // Custom hostnames, by claimant. A hostname with two claimants is skipped.
  const claims = new Map<string, Set<string>>()
  const latest = new Map<string, { id: string; slug: string; date: string }>()
  const confSlugs = new Set<string>()
  for (const c of [...sanityConfs].sort(byId)) {
    const org = c.orgId ? orgs.get(c.orgId) : undefined
    if (!org) {
      flag(
        `conference ${c._id}: organization ${c.orgId ?? '(none)'} not migrated; skipped`,
      )
      continue
    }
    const date = c.startDate?.trim() ?? ''
    const slug = /^(\d{4})-\d{2}-\d{2}$/.exec(date)?.[1]
    if (!slug || confSlugs.has(`${org.id}/${slug}`)) {
      flag(
        `conference ${c._id}: no start date, or a second ${org.slug} edition in ${slug}; skipped`,
      )
      continue
    }
    confSlugs.add(`${org.id}/${slug}`)
    const archived = ['cancelled', 'archived'].includes(c.lifecycleStatus ?? '')
    out.conferences.push({
      id: c._id,
      orgId: org.id,
      slug,
      name: c.title || `${org.name} ${slug}`,
      lifecycle: archived ? 'archived' : 'live',
    })
    if (platformOk.has(org.id)) {
      out.domains.push({
        hostname: editionHost(org.slug, slug),
        orgId: org.id,
        conferenceId: c._id,
        kind: 'platform-edition',
        verification: 'verified',
      })
      const prev = latest.get(org.id)
      if (!prev || date > prev.date)
        latest.set(org.id, { id: c._id, slug, date })
    }
    for (const entry of c.domains ?? []) {
      const host = normalizeHost(entry)
      if (!host || entry.includes('*') || /:\d+$/.test(entry.trim())) {
        flag(
          `conference ${c._id}: "${entry}" is a wildcard, port or invalid host; skipped`,
        )
        continue
      }
      if (host === PLATFORM_DOMAIN || host.endsWith(`.${PLATFORM_DOMAIN}`)) {
        const expected = [editionHost(org.slug, slug), aliasHost(org.slug)]
        if (!expected.includes(host))
          flag(
            `conference ${c._id}: platform host ${host} does not follow <org>-<year>; skipped`,
          )
        continue
      }
      claims.set(host, (claims.get(host) ?? new Set()).add(c._id))
    }
  }
  for (const [orgId, conf] of latest) {
    out.domains.push({
      hostname: aliasHost(orgs.get(orgId)!.slug),
      orgId,
      conferenceId: conf.id,
      kind: 'platform-alias',
      verification: 'verified',
    })
  }

  const status = new Map(
    verifications.map((v) => [normalizeHost(v.hostname), v]),
  )
  const confOrg = new Map(out.conferences.map((c) => [c.id, c.orgId]))
  for (const [hostname, ids] of [...claims].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    if (ids.size > 1) {
      flag(`domain ${hostname}: claimed by ${[...ids].join(', ')}; skipped`)
      continue
    }
    const [conferenceId] = ids
    const v = status.get(hostname)
    const verification =
      v && v.conferenceId === conferenceId
        ? (VERIFICATION[v.status ?? ''] ?? 'pending')
        : 'pending'
    if (verification !== 'verified') flag(`domain ${hostname}: ${verification}`)
    out.domains.push({
      hostname,
      orgId: confOrg.get(conferenceId)!,
      conferenceId,
      kind: 'custom',
      verification,
    })
  }

  const used = new Set(out.conferences.map((c) => c.orgId))
  for (const o of out.orgs)
    if (!used.has(o.id)) flag(`org ${o.id} (${o.slug}): no conferences`)
  return out
}

const q = (s: string) => `'${s.replace(/'/g, "''")}'`

/** Upserts for the tenant-directory D1 and the identity D1, in FK order. */
export function toSql(b: Backfill) {
  const directory = [
    ...b.orgs.map(
      (o) =>
        `INSERT INTO organizations (id, slug, name, plan) VALUES (${q(o.id)}, ${q(o.slug)}, ${q(o.name)}, ${q(o.plan)}) ON CONFLICT (id) DO UPDATE SET slug = excluded.slug, name = excluded.name, plan = excluded.plan;`,
    ),
    ...b.conferences.map(
      (c) =>
        `INSERT INTO conferences (id, org_id, slug, name, lifecycle) VALUES (${q(c.id)}, ${q(c.orgId)}, ${q(c.slug)}, ${q(c.name)}, ${q(c.lifecycle)}) ON CONFLICT (id) DO UPDATE SET org_id = excluded.org_id, slug = excluded.slug, name = excluded.name, lifecycle = excluded.lifecycle;`,
    ),
    ...b.domains.map(
      (d) =>
        `INSERT INTO domains (hostname, org_id, conference_id, kind, verification) VALUES (${q(d.hostname)}, ${q(d.orgId)}, ${q(d.conferenceId)}, ${q(d.kind)}, ${q(d.verification)}) ON CONFLICT (hostname) DO UPDATE SET org_id = excluded.org_id, conference_id = excluded.conference_id, kind = excluded.kind, verification = excluded.verification;`,
    ),
  ]
  const identity = b.orgs.map(
    (o) =>
      `INSERT INTO organization (id, name, slug) VALUES (${q(o.id)}, ${q(o.name)}, ${q(o.slug)}) ON CONFLICT (id) DO UPDATE SET name = excluded.name, slug = excluded.slug;`,
  )
  return {
    directory: directory.join('\n') + '\n',
    identity: identity.join('\n') + '\n',
  }
}
