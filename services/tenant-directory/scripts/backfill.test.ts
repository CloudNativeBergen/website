import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { lifecycleOf, mapBackfill, toSql } from './backfill'

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

  it('skips every claimant of a hostname, platform hosts included', () => {
    const r = mapBackfill(
      [
        { _id: 'org-foo', name: 'Foo', slug: 'foo' },
        { _id: 'org-foo2025', name: 'Foo 2025', slug: 'foo-2025' },
      ],
      [
        { _id: 'c-foo', orgId: 'org-foo', startDate: '2025-01-01' },
        { _id: 'c-foo2025', orgId: 'org-foo2025', startDate: '2026-01-01' },
      ],
      [],
    )
    const hosts = r.domains.map((d) => d.hostname)
    expect(hosts).not.toContain('foo-2025.konf.run')
    expect(hosts).toEqual(
      expect.arrayContaining(['foo.konf.run', 'foo-2025-2026.konf.run']),
    )
    expect(r.anomalies).toContain(
      'domain foo-2025.konf.run: claimed by c-foo, c-foo2025; skipped',
    )
  })

  it('points the alias at the newest live edition, else the newest archived', () => {
    const r = mapBackfill(
      [
        { _id: 'org-a', slug: 'a' },
        { _id: 'org-b', slug: 'b' },
      ],
      [
        { _id: 'a-25', orgId: 'org-a', startDate: '2025-01-01' },
        {
          _id: 'a-26',
          orgId: 'org-a',
          startDate: '2026-01-01',
          lifecycleStatus: 'cancelled',
        },
        {
          _id: 'b-24',
          orgId: 'org-b',
          startDate: '2024-01-01',
          lifecycleStatus: 'archived',
        },
        {
          _id: 'b-25',
          orgId: 'org-b',
          startDate: '2025-01-01',
          lifecycleStatus: 'archived',
        },
      ],
      [],
    )
    const alias = (h: string) =>
      r.domains.find((d) => d.hostname === h)?.conferenceId
    expect(alias('a.konf.run')).toBe('a-25')
    expect(alias('b.konf.run')).toBe('b-25')
  })

  it('never moves ownership or Cloudflare-registered domains on rerun', () => {
    const sql = toSql(b).directory
    expect(sql).toContain(
      'WHERE domains.org_id = excluded.org_id AND domains.cf_custom_hostname_id IS NULL;',
    )
    const sets = sql.split('\n').map((l) => l.split(' WHERE ')[0])
    expect(sets.join('\n')).not.toMatch(/\b(slug|org_id) = excluded/)
  })
})

describe('lifecycleOf (#1997)', () => {
  it('maps every Sanity lifecycleStatus losslessly; absent is live', () => {
    // Read from the Sanity schema's option list, so a new value fails here.
    const schema = readFileSync(
      new URL('../../../sanity/schemaTypes/conference.ts', import.meta.url),
      'utf8',
    )
    const field = schema.slice(
      schema.indexOf("name: 'lifecycleStatus'"),
      schema.indexOf("name: 'lifecycleHeadline'"),
    )
    const values = [...field.matchAll(/value: '([^']+)'/g)].map((m) => m[1])
    expect(values).toEqual(['cancelled', 'archived'])
    for (const v of values) expect(lifecycleOf(v)).toBe(v)
    for (const v of [undefined, null, '', 'bogus'])
      expect(lifecycleOf(v)).toBe('live')
  })

  it('writes cancelled through to the directory row', () => {
    const r = mapBackfill(
      [{ _id: 'o', name: 'O', slug: 'o' }],
      [
        {
          _id: 'c',
          orgId: 'o',
          startDate: '2026-01-01',
          lifecycleStatus: 'cancelled',
        },
      ],
      [],
    )
    expect(r.conferences[0].lifecycle).toBe('cancelled')
  })
})

describe('plan (#2129)', () => {
  it('maps an unknown Sanity plan to free and never overwrites a D1 plan', () => {
    const out = mapBackfill(
      [{ _id: 'org-x', name: 'X', slug: 'x', plan: 'enterprise' }],
      [],
      [],
    )
    expect(out.orgs[0].plan).toBe('free')
    expect(toSql(out).directory).toContain(
      'ON CONFLICT (id) DO UPDATE SET name = excluded.name;',
    )
  })
})
