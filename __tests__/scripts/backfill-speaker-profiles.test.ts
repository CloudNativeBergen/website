/**
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { DatabaseSync } from 'node:sqlite'
import {
  planProfiles,
  summarize,
  toSql,
  type SanitySpeaker,
} from '../../scripts/backfill-speaker-profiles'

const users = [
  { id: 'u-gh', email: 'gh@example.com', emailVerified: 1 },
  { id: 'u-ver', email: 'ver@example.com', emailVerified: 1 },
  { id: 'u-unver', email: 'unver@example.com', emailVerified: 0 },
  { id: 'u-shared', email: 'shared@example.com', emailVerified: 1 },
]
const accounts = [{ userId: 'u-gh', providerId: 'github', accountId: '42' }]
const sp = (o: Partial<SanitySpeaker> & { _id: string }): SanitySpeaker => ({
  name: 'Ada',
  ...o,
})
const status = (speakers: SanitySpeaker[]) =>
  Object.fromEntries(
    planProfiles(speakers, users, accounts).report.map((r) => [
      r.speakerId,
      [r.status, r.reason ?? r.matchedBy],
    ]),
  )

describe('planProfiles matching', () => {
  it('matches a provider account id', () => {
    expect(status([sp({ _id: 's', providers: ['github:42'] })])).toEqual({
      s: ['matched', 'provider'],
    })
  })
  it('matches a verified known email, case-insensitively', () => {
    expect(
      status([sp({ _id: 's', knownEmails: ['VER@example.com'] })]),
    ).toEqual({
      s: ['matched', 'email'],
    })
  })
  it('refuses the display email and unverified identity emails', () => {
    expect(
      status([
        sp({ _id: 'display', email: 'ver@example.com' }),
        sp({ _id: 'unver', knownEmails: ['unver@example.com'] }),
        sp({ _id: 'other-provider', providers: ['linkedin:42'] }),
      ]),
    ).toEqual({
      display: ['skipped', 'no-user'],
      unver: ['skipped', 'no-user'],
      'other-provider': ['skipped', 'no-user'],
    })
  })
  it('refuses a known email that is a ticket grant', () => {
    expect(
      status([
        sp({
          _id: 's',
          knownEmails: ['ver@example.com'],
          ticketGrantEmails: ['VER@example.com'],
        }),
      ]),
    ).toEqual({ s: ['skipped', 'no-user'] })
  })
  it('skips one speaker matching two users', () => {
    expect(
      status([
        sp({
          _id: 's',
          providers: ['github:42'],
          knownEmails: ['ver@example.com'],
        }),
      ]),
    ).toEqual({ s: ['skipped', 'ambiguous'] })
  })
  it('skips both speakers when two match one user', () => {
    const p = planProfiles(
      [
        sp({ _id: 'a', knownEmails: ['shared@example.com'] }),
        sp({ _id: 'b', knownEmails: ['shared@example.com'] }),
      ],
      users,
      accounts,
    )
    expect(p.rows).toEqual([])
    expect(p.report.map((r) => r.reason)).toEqual(['ambiguous', 'ambiguous'])
    expect(p.report[0].userIds).toEqual(['u-shared'])
  })
})

describe('profile mapping', () => {
  it('is always private, records consent, drops bad links and external photos', () => {
    const p = planProfiles(
      [
        sp({
          _id: 's',
          providers: ['github:42'],
          bio: 'Hi',
          publicProfile: true,
          imageURL: 'https://cdn.example.com/a.png',
          links: [
            'http://insecure.example.com',
            'javascript:alert(1)',
            'https://u:p@example.com',
            ...Array.from(
              { length: 12 },
              (_, i) => `https://e${i}.example.com/`,
            ),
          ],
        }),
      ],
      users,
      accounts,
    )
    const [row] = p.rows
    expect(toSql(p.rows)).toContain("'private', ")
    expect(row.profile.photoKey).toBeNull()
    expect(row.profile.links).toHaveLength(10)
    expect(row.profile.links.every((l) => l.startsWith('https://e'))).toBe(true)
    expect(p.report[0]).toMatchObject({
      publicProfileConsent: true,
      photoDropped: true,
      linksDropped: 5,
    })
    expect(summarize(p.report)).toMatchObject({
      matched: 1,
      publicProfileConsent: 1,
    })
  })
  it('keeps a photo that is already an R2 key', () => {
    const p = planProfiles(
      [
        sp({
          _id: 's',
          providers: ['github:42'],
          imageURL: 'speakers/s/photo.jpg',
        }),
      ],
      users,
      accounts,
    )
    expect(p.rows[0].profile.photoKey).toBe('speakers/s/photo.jpg')
  })
  it('skips a speaker without a name as invalid', () => {
    expect(
      status([sp({ _id: 's', name: ' ', providers: ['github:42'] })]),
    ).toEqual({
      s: ['skipped', 'invalid'],
    })
  })
})

describe('toSql', () => {
  const migration = readFileSync(
    'services/identity/migrations/0008_speaker_profile.sql',
    'utf8',
  )
  const plan = planProfiles(
    [
      sp({
        _id: 'a',
        name: "O'Brien",
        providers: ['github:42'],
        links: ['https://x.example.com'],
      }),
      sp({ _id: 'b', knownEmails: ['ver@example.com'] }),
    ],
    users,
    accounts,
  )
  const sql = toSql(plan.rows)

  it('never deletes or updates', () => {
    expect(sql).not.toMatch(/\b(DELETE|UPDATE|DROP|REPLACE)\b/i)
    expect(sql.trim().split('\n')).toHaveLength(2)
    for (const line of sql.trim().split('\n'))
      expect(line).toMatch(
        /^INSERT INTO speaker_profile .* ON CONFLICT\(user_id\) DO NOTHING;$/,
      )
  })

  it('keeps an existing profile untouched in real SQLite', () => {
    const db = new DatabaseSync(':memory:')
    db.exec('CREATE TABLE user (id TEXT PRIMARY KEY)')
    db.exec("INSERT INTO user VALUES ('u-gh'), ('u-ver')")
    db.exec(migration)
    db.exec(
      "INSERT INTO speaker_profile (user_id, id, name, visibility, created_at, updated_at) VALUES ('u-gh', 'p-old', 'Mine', 'network', 1, 1)",
    )
    db.exec(sql)
    db.exec(sql) // re-run is a no-op
    const rows = db
      .prepare(
        'SELECT user_id, id, name, visibility, links FROM speaker_profile ORDER BY user_id',
      )
      .all()
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({
      user_id: 'u-gh',
      id: 'p-old',
      name: 'Mine',
      visibility: 'network',
    })
    expect(rows[1]).toMatchObject({
      user_id: 'u-ver',
      name: 'Ada',
      visibility: 'private',
    })
  })
})
