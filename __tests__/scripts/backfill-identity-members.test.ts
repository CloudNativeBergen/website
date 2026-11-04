/**
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest'
import { mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  ORGANIZER_ROLE,
  memberId,
  planMembers,
  readRows,
  toSql,
} from '../../scripts/backfill-identity-members'

const CNDN = 'organization-cloud-native-days'
const users = [
  { id: 'u-owner', email: 'owner@example.com', emailVerified: 1 },
  { id: 'u-ver', email: 'ver@example.com', emailVerified: 1 },
  { id: 'u-unver', email: 'unver@example.com', emailVerified: 0 },
]

describe('planMembers', () => {
  it('matches only a verified identity email', () => {
    const p = planMembers(
      [
        { orgId: CNDN, speakerId: 's1', knownEmails: ['VER@example.com'] },
        { orgId: CNDN, speakerId: 's2', knownEmails: ['unver@example.com'] },
      ],
      users,
    )
    expect(p.rows.map((r) => r.userId)).toEqual(['u-ver'])
    expect(p.unmatched).toEqual([{ orgId: CNDN, speakerId: 's2' }])
  })

  it('reports organizers with no known email as unmatched, never as SQL', () => {
    const p = planMembers(
      [{ orgId: CNDN, speakerId: 's3', knownEmails: null }],
      users,
    )
    expect(p.rows).toEqual([])
    expect(p.unmatched).toEqual([{ orgId: CNDN, speakerId: 's3' }])
    expect(toSql(p.rows)).not.toContain('s3')
  })

  it('skips the hand-added owner row and never emits UPDATE or DELETE', () => {
    const p = planMembers(
      [
        { orgId: CNDN, speakerId: 's0', knownEmails: ['owner@example.com'] },
        { orgId: CNDN, speakerId: 's1', knownEmails: ['ver@example.com'] },
      ],
      users,
      [{ organizationId: CNDN, userId: 'u-owner' }],
    )
    expect(p.skippedExisting).toBe(1)
    const sql = toSql(p.rows)
    expect(sql).not.toContain('u-owner')
    expect(sql).not.toContain('mem-cndn-owner-1')
    expect(sql).not.toMatch(/UPDATE|DELETE|REPLACE/i)
  })

  it('maps every organizer to ORGANIZER_ROLE', () => {
    const p = planMembers(
      [{ orgId: CNDN, speakerId: 's1', knownEmails: ['ver@example.com'] }],
      users,
    )
    expect(ORGANIZER_ROLE).toBe('admin')
    expect(p.rows[0].role).toBe('admin')
  })

  it('is idempotent: deterministic ids, insert-or-nothing, deduped per org/user', () => {
    const orgs = [
      { orgId: CNDN, speakerId: 's1', knownEmails: ['ver@example.com'] },
      { orgId: CNDN, speakerId: 's1b', knownEmails: ['ver@example.com'] },
    ]
    const a = toSql(planMembers(orgs, users).rows)
    expect(a).toBe(toSql(planMembers(orgs, users).rows))
    expect(a.trim().split('\n')).toEqual([
      `INSERT INTO member (id, organizationId, userId, role) VALUES ('${memberId(CNDN, 'u-ver')}', '${CNDN}', 'u-ver', 'admin') ON CONFLICT DO NOTHING;`,
    ])
  })
})

it('readRows accepts wrangler --json output', () => {
  const f = join(mkdtempSync(join(tmpdir(), 'bf-')), 'u.json')
  writeFileSync(f, JSON.stringify([{ results: users, success: true }]))
  expect(readRows(f)).toEqual(users)
})
