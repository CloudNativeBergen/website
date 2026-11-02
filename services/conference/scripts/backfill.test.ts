import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { mapBackfill, toSql } from './backfill'

const docs = [
  {
    _id: 'conf-b',
    orgId: 'org-a',
    title: "Acme's 2026",
    city: ' Bergen ',
    visibility: 'unlisted',
    theme: { primaryColor: '#123456' },
    socialLinks: ['https://x.example'],
  },
  { _id: 'conf-a', orgId: 'org-a', title: '' },
  { _id: 'conf-orphan', title: 'Orphan' },
  { _id: 'conf-unrouted', orgId: 'org-a', title: 'Unrouted' },
  {
    _id: 'conf-c',
    orgId: 'org-a',
    title: 'Cancelled',
    lifecycleStatus: 'cancelled',
  },
]
const routable = new Set(['conf-a', 'conf-b', 'conf-c', 'conf-orphan'])

describe('mapBackfill', () => {
  const b = mapBackfill(docs, routable)

  it('maps public fields under the Sanity ids', () => {
    expect(b.rows.map((r) => r.conference_id)).toEqual([
      'conf-a',
      'conf-b',
      'conf-c',
    ])
    expect(b.rows[2].published).toBe(0)
    expect(b.rows[1]).toMatchObject({
      org_id: 'org-a',
      published: 1,
      city: 'Bergen',
      visibility: 'unlisted',
      primary_color: '#123456',
      accent_color: null,
      social_links: '["https://x.example"]',
    })
    expect(b.rows[0]).toMatchObject({
      title: 'conf-a',
      visibility: 'live',
      social_links: '[]',
    })
  })

  it('reports the anomalies', () => {
    expect(b.anomalies).toEqual([
      'conference conf-a: no title',
      'conference conf-orphan: not in tenant-directory; skipped',
      'conference conf-unrouted: not in tenant-directory; skipped',
    ])
  })

  it('emits idempotent upserts that apply to the migration', () => {
    const sql = toSql(b.rows)
    expect(sql).toContain("'Acme''s 2026'")
    const sets = sql.split('\n').map((l) => l.split(' WHERE ')[0])
    expect(sets.join('\n')).not.toMatch(/\b(org_id|conference_id) = excluded/)
    const db = new DatabaseSync(':memory:')
    db.exec(
      readFileSync(
        new URL('../migrations/0001_init.sql', import.meta.url),
        'utf8',
      ),
    )
    db.exec(sql)
    db.exec(sql)
    expect(db.prepare('SELECT count(*) AS n FROM conferences').get()).toEqual({
      n: 3,
    })
    // A row owned by another org is left alone on rerun.
    db.exec(
      "UPDATE conferences SET org_id = 'org-x' WHERE conference_id = 'conf-b'",
    )
    db.exec(sql)
    expect(
      db
        .prepare(
          "SELECT org_id, city FROM conferences WHERE conference_id = 'conf-b'",
        )
        .get(),
    ).toEqual({ org_id: 'org-x', city: 'Bergen' })
  })
})
