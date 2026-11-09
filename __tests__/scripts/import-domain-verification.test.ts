/** @vitest-environment node */
import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { DatabaseSync } from 'node:sqlite'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  MUST_VERIFY,
  parity,
  parseD1Dump,
  cutoverCandidates,
  outDir,
  planImport,
  toSql,
  type D1Dump,
  type D1Row,
} from '../../scripts/import-domain-verification'
import type { DomainVerificationRecord } from '../../src/lib/domain-verification/types'

const NOW = new Date('2026-11-09T12:00:00Z')
const CONF = 'conf-cndn'
const MIGRATIONS = join(__dirname, '../../services/tenant-directory/migrations')

const doc = (
  hostname: string,
  over: Partial<DomainVerificationRecord> = {},
): DomainVerificationRecord => ({
  _id: `dv-${hostname}`,
  hostname,
  conferenceId: CONF,
  token: 'tok',
  status: 'verified',
  method: 'dns-txt',
  graceUntil: null,
  verifiedAt: '2026-11-01T00:00:00.000Z',
  lastSuccessAt: '2026-11-09T00:00:00.000Z',
  lastCheckedAt: null,
  firstFailureAt: null,
  consecutiveFailures: 0,
  consecutiveSoftFailures: 0,
  lastError: null,
  ...over,
})

const d1Row = (hostname: string, over: Partial<D1Row> = {}): D1Row => ({
  hostname,
  org_id: 'org-1',
  conference_id: CONF,
  kind: 'custom',
  verification: 'pending',
  method: null,
  token: null,
  status: null,
  verified_at: null,
  last_success_at: null,
  first_failure_at: null,
  grace_until: null,
  consecutive_failures: 0,
  consecutive_soft_failures: 0,
  last_error: null,
  claimed_at: null,
  ...over,
})

const dump = (rows: D1Row[] = []): D1Dump =>
  parseD1Dump(
    JSON.stringify([
      { results: [{ id: CONF, org_id: 'org-1' }] },
      { results: rows },
    ]),
  )

let db: DatabaseSync
beforeEach(() => {
  process.env.PLATFORM_DOMAIN_SUFFIX = 'konf.run'
  db = new DatabaseSync(':memory:')
  for (const f of readdirSync(MIGRATIONS).sort())
    db.exec(readFileSync(join(MIGRATIONS, f), 'utf8'))
  db.exec(`INSERT INTO organizations (id, slug, name) VALUES ('org-1', 'cndn', 'CNDN');
    INSERT INTO conferences (id, org_id, slug, name) VALUES ('${CONF}', 'org-1', '2026', 'CNDN 2026');
    INSERT INTO domains (hostname, org_id, conference_id, kind, verification)
      VALUES ('cndn-2026.konf.run', 'org-1', '${CONF}', 'platform-edition', 'verified');`)
})
const all = () => db.prepare('SELECT * FROM domains ORDER BY hostname').all()

describe('import-domain-verification mapping', () => {
  it('maps platform-owned to the D1 platform kind and the rest to custom', () => {
    const d1 = dump([d1Row('cndn-2026.konf.run', { kind: 'platform-edition' })])
    const { rows } = planImport(
      [
        doc('cndn-2026.konf.run', { method: 'platform-owned' }),
        doc(MUST_VERIFY),
        doc('old.example.org', { method: 'grandfathered', status: 'failing' }),
      ],
      d1,
    )
    const by = Object.fromEntries(rows.map((r) => [r.hostname, r]))
    expect(by['cndn-2026.konf.run']).toMatchObject({
      kind: 'platform-edition',
      method: 'platform',
    })
    expect(by[MUST_VERIFY]).toMatchObject({ kind: 'custom', method: 'dns-txt' })
    expect(by['old.example.org']).toMatchObject({
      kind: 'custom',
      method: 'dns-txt',
      verification: 'pending',
    })
  })

  it('skips and reports an orphan, a D1 claim, and dev or wildcard hosts', () => {
    const { rows, skipped } = planImport(
      [
        doc('orphan.example.org', { conferenceId: 'gone' }),
        doc('claimed.example.org'),
        doc('localhost:3000'),
        doc('x.vercel.app'),
        doc('abc.ngrok-free.app'),
        doc('*.example.org'),
      ],
      dump([d1Row('claimed.example.org', { claimed_at: 1, token: 'new' })]),
    )
    expect(rows).toEqual([])
    expect(skipped).toEqual([
      'claimed.example.org: claimed in D1; D1 wins',
      'orphan.example.org: conference gone not in D1',
    ])
  })
})

describe('import-domain-verification SQL', () => {
  it('is idempotent and never overwrites a newer D1 claim', () => {
    db.exec(`INSERT INTO domains (hostname, org_id, conference_id, kind, verification, token, status, method, claimed_at, cf_custom_hostname_id)
      VALUES ('claimed.example.org', 'org-1', '${CONF}', 'custom', 'pending', 'd1tok', 'pending', 'dns-txt', 5, 'cf-1')`)
    const { rows } = planImport(
      [doc(MUST_VERIFY), doc('claimed.example.org', { token: 'sanity' })],
      dump(),
    )
    const sql = toSql(rows)
    db.exec(sql)
    const once = all()
    db.exec(sql)
    expect(all()).toEqual(once)
    const by = Object.fromEntries(once.map((r) => [r.hostname, r]))
    expect(by['claimed.example.org']).toMatchObject({
      token: 'd1tok',
      claimed_at: 5,
      cf_custom_hostname_id: 'cf-1',
    })
    expect(by[MUST_VERIFY]).toMatchObject({ status: 'verified', token: 'tok' })
    // Pre-phase-3 platform rows get method and status.
    expect(by['cndn-2026.konf.run']).toMatchObject({
      method: 'platform',
      status: 'verified',
    })
  })
})

describe('import-domain-verification --verify', () => {
  const docs = [
    doc(MUST_VERIFY),
    doc('cndn-2026.konf.run', { method: 'platform-owned' }),
  ]
  const imported = () => {
    db.exec(toSql(planImport(docs, dump()).rows))
    return dump(all() as unknown as D1Row[])
  }

  it('passes after the import', () => {
    expect(parity(docs, [], imported(), NOW).diffs).toEqual([])
  })

  it('ignores a platform row with no Sanity doc', () => {
    const rows = [
      ...imported().domains.values(),
      d1Row('kk.konf.run', {
        kind: 'platform-edition',
        method: 'platform',
        status: 'verified',
      }),
    ]
    expect(parity(docs, [], dump(rows), NOW).diffs).toEqual([])
  })

  it('detects a verdict mismatch', () => {
    const d1 = imported()
    d1.domains.get(MUST_VERIFY)!.status = 'revoked'
    expect(parity(docs, [], d1, NOW).diffs).toEqual([
      `${MUST_VERIFY}: routing sanity=true d1=false`,
      `${MUST_VERIFY}: allowlist sanity=true d1=false`,
      `${MUST_VERIFY}: MUST be verified on both sides`,
    ])
  })

  it('fails when cloudnativedays is unverified on both sides', () => {
    const stale = [doc(MUST_VERIFY, { status: 'pending' }), docs[1]]
    db.exec(toSql(planImport(stale, dump()).rows))
    expect(
      parity(stale, [], dump(all() as unknown as D1Row[]), NOW).diffs,
    ).toEqual([`${MUST_VERIFY}: MUST be verified on both sides`])
    expect(parity([], [], dump(), NOW).diffs).toEqual([
      `${MUST_VERIFY}: missing on both sides`,
    ])
  })

  it('counts a routed conference.domains host with no record anywhere', () => {
    const { hosts, diffs } = parity(
      docs,
      [{ _id: CONF, domains: ['bare.example.org'] }],
      imported(),
      NOW,
    )
    expect(hosts).toBe(3)
    expect(diffs).toEqual([])
  })
})

describe('import-domain-verification never changes live routing', () => {
  it('inserts new rows as legacy pending and lists them as cutover candidates', () => {
    const docs = [doc(MUST_VERIFY)]
    db.exec(toSql(planImport(docs, dump()).rows))
    const row = all().find((r) => r.hostname === MUST_VERIFY)
    expect(row).toMatchObject({ verification: 'pending', status: 'verified' })
    expect(
      cutoverCandidates(docs, dump(all() as unknown as D1Row[]), NOW),
    ).toEqual([
      `${MUST_VERIFY}: legacy=pending sanity routing=true`,
      'cndn-2026.konf.run: legacy=verified sanity routing=false',
    ])
  })

  it('does not stamp a claimed platform row', () => {
    db.exec(`INSERT INTO domains (hostname, org_id, conference_id, kind, verification, claimed_at)
      VALUES ('cndn.konf.run', 'org-1', '${CONF}', 'platform-alias', 'verified', 7)`)
    db.exec(toSql([]))
    expect(all().find((r) => r.hostname === 'cndn.konf.run')).toMatchObject({
      method: null,
      status: null,
    })
  })

  it('refuses --out outside tmp/', () => {
    expect(outDir(undefined, '/r')).toBe('/r/tmp')
    expect(outDir('tmp/import', '/r')).toBe('/r/tmp/import')
    expect(() => outDir('.', '/r')).toThrow('--out must be inside')
    expect(() => outDir('tmp/../x', '/r')).toThrow('--out must be inside')
    expect(() => outDir('/r/tmpx', '/r')).toThrow('--out must be inside')
  })
})
