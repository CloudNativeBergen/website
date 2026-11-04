/**
 * Parity pins for the speaker write seam (#1876): each function must record
 * exactly the client calls the inline router/lib code made before it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const calls: unknown[][] = []
function chain(): Record<string, unknown> {
  const c: Record<string, unknown> = {}
  for (const op of ['set', 'setIfMissing', 'append', 'unset']) {
    c[op] = (...a: unknown[]) => (calls.push([op, ...a]), c)
  }
  c.commit = async () => (calls.push(['commit']), {})
  return c
}
vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: { fetch: vi.fn() },
  clientReadCached: { fetch: vi.fn() },
  clientWrite: {
    patch: (...a: unknown[]) => (calls.push(['patch', ...a]), chain()),
    delete: async (...a: unknown[]) => (calls.push(['delete', ...a]), {}),
  },
}))
vi.mock('next/cache', () => ({ cacheLife: vi.fn(), cacheTag: vi.fn() }))
vi.mock('@/lib/proposal/server', () => ({ listPublicTalks: vi.fn() }))

import {
  addSpeakerTicketEmail,
  deleteSpeaker,
  removeSpeakerTicketEmail,
  updateSpeakerEmail,
} from './server'
import { updateProfileEmail } from '@/lib/profile/sanity'

beforeEach(() => {
  calls.length = 0
})

const grant = {
  _key: 'ticket-grant-1',
  email: 'ada@work.example',
  registeredEmail: 'Ada@Work.Example',
  ticketId: 9001,
  addedBy: 'admin-1',
  addedByName: 'Olav',
  addedByOrg: 'org-A',
  addedAt: '2026-11-04T00:00:00.000Z',
}

describe('speaker write seam', () => {
  it('deleteSpeaker deletes exactly the id', async () => {
    await deleteSpeaker('speaker-1')
    expect(calls).toStrictEqual([['delete', 'speaker-1']])
  })

  it('updateSpeakerEmail (and updateProfileEmail) set the canonical email', async () => {
    const expected = [
      ['patch', 'speaker-1'],
      ['set', { email: 'ada@example.com' }],
      ['commit'],
    ]
    await updateSpeakerEmail('speaker-1', '  Ada@Example.COM ')
    expect(calls).toStrictEqual(expected)
    calls.length = 0
    expect(await updateProfileEmail(' Ada@Example.COM', 'speaker-1')).toEqual({
      error: null,
    })
    expect(calls).toStrictEqual(expected)
  })

  it('addSpeakerTicketEmail appends the address and grant in one patch', async () => {
    await addSpeakerTicketEmail('speaker-1', grant)
    expect(calls).toStrictEqual([
      ['patch', 'speaker-1'],
      ['setIfMissing', { knownEmails: [], ticketEmailGrants: [] }],
      ['append', 'knownEmails', ['ada@work.example']],
      ['append', 'ticketEmailGrants', [grant]],
      ['commit'],
    ])
  })

  it('removeSpeakerTicketEmail unsets by predicate for a selector-safe address', async () => {
    await removeSpeakerTicketEmail('speaker-1', 'ada@work.example', {
      knownEmails: ['ada@work.example', 'ada@home.example'],
      grants: [grant],
    })
    expect(calls).toStrictEqual([
      ['patch', 'speaker-1'],
      [
        'unset',
        [
          'knownEmails[@ == "ada@work.example"]',
          'ticketEmailGrants[email == "ada@work.example"]',
        ],
      ],
      ['commit'],
    ])
  })

  it('removeSpeakerTicketEmail rewrites both arrays for an unsafe address', async () => {
    const odd = 'a"b@work.example'
    const other = { ...grant, _key: 'k2', email: 'ada@home.example' }
    await removeSpeakerTicketEmail('speaker-1', odd, {
      knownEmails: [odd, 'ada@home.example'],
      grants: [{ ...grant, email: odd }, other],
    })
    expect(calls).toStrictEqual([
      ['patch', 'speaker-1'],
      [
        'set',
        { knownEmails: ['ada@home.example'], ticketEmailGrants: [other] },
      ],
      ['commit'],
    ])
  })
})
