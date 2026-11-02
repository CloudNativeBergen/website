import { describe, expect, it } from 'vitest'
import { mapBackfill, toSql } from './backfill'

const orgs = [
  { _id: 'org-acme', name: "Acme's Conf", slug: 'acme', plan: 'pro' },
  { _id: 'org-empty', name: 'Empty', slug: 'empty' },
  { _id: 'org-admin', name: 'Admin', slug: 'admin' },
]
const confs = [
  {
    _id: 'conf-2025',
    title: 'Acme 2025',
    orgId: 'org-acme',
    startDate: '2025-10-01',
    lifecycleStatus: 'archived',
    domains: ['acme.example.com', 'acme-2025.konf.run', 'localhost:3000'],
  },
  {
    _id: 'conf-2026',
    title: 'Acme 2026',
    orgId: 'org-acme',
    startDate: '2026-10-01',
    domains: ['2026.acme.example.com', 'shared.example.com', '*.acme.dev'],
  },
  {
    _id: 'conf-admin',
    title: 'Admin 2026',
    orgId: 'org-admin',
    startDate: '2026-05-01',
    domains: ['shared.example.com'],
  },
  { _id: 'conf-orphan', orgId: 'org-gone', startDate: '2026-01-01' },
]
const verifications = [
  {
    hostname: 'acme.example.com',
    conferenceId: 'conf-2025',
    status: 'verified',
  },
  {
    hostname: '2026.acme.example.com',
    conferenceId: 'conf-2026',
    status: 'failing',
  },
]

describe('mapBackfill', () => {
  const b = mapBackfill(orgs, confs, verifications)

  it('maps orgs, conferences and hosts with Sanity ids', () => {
    expect(b.orgs.map((o) => o.id)).toEqual([
      'org-acme',
      'org-admin',
      'org-empty',
    ])
    expect(b.conferences).toContainEqual({
      id: 'conf-2025',
      orgId: 'org-acme',
      slug: '2025',
      name: 'Acme 2025',
      lifecycle: 'archived',
    })
    expect(
      b.domains.map((d) => [
        d.hostname,
        d.kind,
        d.conferenceId,
        d.verification,
      ]),
    ).toEqual([
      ['acme-2025.konf.run', 'platform-edition', 'conf-2025', 'verified'],
      ['acme-2026.konf.run', 'platform-edition', 'conf-2026', 'verified'],
      ['acme.konf.run', 'platform-alias', 'conf-2026', 'verified'],
      ['2026.acme.example.com', 'custom', 'conf-2026', 'failed'],
      ['acme.example.com', 'custom', 'conf-2025', 'verified'],
    ])
  })

  it('reports the anomalies', () => {
    expect(b.anomalies).toEqual([
      'org org-admin: slug "admin" is reserved; platform hosts skipped',
      'conference conf-2025: "localhost:3000" is a wildcard, port or invalid host; skipped',
      'conference conf-2026: "*.acme.dev" is a wildcard, port or invalid host; skipped',
      'conference conf-orphan: organization org-gone not migrated; skipped',
      'domain 2026.acme.example.com: failed',
      'domain shared.example.com: claimed by conf-2026, conf-admin; skipped',
      'org org-empty (empty): no conferences',
    ])
  })

  it('emits idempotent upserts for both databases', () => {
    const sql = toSql(b)
    expect(sql.directory).toContain(
      "VALUES ('org-acme', 'acme', 'Acme''s Conf', 'pro') ON CONFLICT (id) DO UPDATE",
    )
    expect(sql.directory.indexOf('INSERT INTO domains')).toBeGreaterThan(
      sql.directory.lastIndexOf('INSERT INTO conferences'),
    )
    expect(sql.identity.split('\n').filter(Boolean)).toHaveLength(3)
    expect(toSql(mapBackfill(orgs, confs, verifications))).toEqual(sql)
  })
})
