/**
 * Parity pins for the speaker write seam (#1876): each function must record
 * exactly the client calls the inline router/lib code made before it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const calls: unknown[][] = []
// Identity of every transaction a patch landed on, and of every transaction
// clientWrite.transaction() minted: a fresh uncommitted one loses the write.
const patchedTxs: unknown[] = []
const mintedTxs: unknown[] = []
function chain(): Record<string, unknown> {
  const c: Record<string, unknown> = {}
  for (const op of ['set', 'setIfMissing', 'append', 'unset', 'insert']) {
    c[op] = (...a: unknown[]) => (calls.push([op, ...a]), c)
  }
  c.commit = async () => (calls.push(['commit']), {})
  return c
}
function makeTx(): Record<string, unknown> {
  const tx: Record<string, unknown> = {
    patch: (id: string, fn: (p: unknown) => unknown) => {
      calls.push(['tx.patch', id])
      patchedTxs.push(tx)
      fn(chain())
      return tx
    },
    commit: async () => (calls.push(['tx.commit']), {}),
  }
  return tx
}
vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: { fetch: vi.fn() },
  clientReadCached: { fetch: vi.fn() },
  clientWrite: {
    patch: (...a: unknown[]) => (calls.push(['patch', ...a]), chain()),
    delete: async (...a: unknown[]) => (calls.push(['delete', ...a]), {}),
    transaction: () => {
      const tx = makeTx()
      mintedTxs.push(tx)
      return tx
    },
  },
}))
vi.mock('next/cache', () => ({ cacheLife: vi.fn(), cacheTag: vi.fn() }))
vi.mock('@/lib/proposal/server', () => ({ listPublicTalks: vi.fn() }))

import {
  addSpeakerOrganization,
  addSpeakerTicketEmail,
  deleteSpeaker,
  removeSpeakerTicketEmail,
  updateSpeakerEmail,
} from './server'
import { updateProfileEmail } from '@/lib/profile/sanity'
import {
  addPushSubscription,
  prunePushSubscription,
  removePushSubscription,
  setPushPreferences,
} from '@/lib/push/sanity'
import { clientReadUncached } from '@/lib/sanity/client'
import { normalizePushPreferences } from '@/lib/push/types'

beforeEach(() => {
  calls.length = 0
  patchedTxs.length = 0
  mintedTxs.length = 0
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

  it('addSpeakerTicketEmail appends only the grant', async () => {
    await addSpeakerTicketEmail('speaker-1', grant)
    expect(calls).toStrictEqual([
      ['patch', 'speaker-1'],
      ['setIfMissing', { ticketEmailGrants: [] }],
      ['append', 'ticketEmailGrants', [grant]],
      ['commit'],
    ])
  })

  // The builder calls above are recorded against a mock. Replay them on the
  // REAL @sanity/client Patch and assert what it would send: chaining two
  // `append`s keeps only the last insert, which is how #1914's grant never
  // reached `knownEmails` in production.
  it('addSpeakerTicketEmail serializes to a single grant insert', async () => {
    const { Patch } =
      await vi.importActual<typeof import('@sanity/client')>('@sanity/client')
    await addSpeakerTicketEmail('speaker-1', grant)
    let real = new Patch('speaker-1')
    for (const [op, ...args] of calls.slice(1, -1)) {
      real = (
        real as unknown as Record<string, (...a: unknown[]) => typeof real>
      )[op as string](...args)
    }
    expect(real.serialize()).toStrictEqual({
      id: 'speaker-1',
      setIfMissing: { ticketEmailGrants: [] },
      insert: { after: 'ticketEmailGrants[-1]', items: [grant] },
    })
  })

  it('removeSpeakerTicketEmail unsets by predicate for a selector-safe address', async () => {
    await removeSpeakerTicketEmail('speaker-1', 'ada@work.example', [grant])
    expect(calls).toStrictEqual([
      ['patch', 'speaker-1'],
      ['unset', ['ticketEmailGrants[email == "ada@work.example"]']],
      ['commit'],
    ])
  })

  it('removeSpeakerTicketEmail rewrites the grants for an unsafe address', async () => {
    const odd = 'a"b@work.example'
    const other = { ...grant, _key: 'k2', email: 'ada@home.example' }
    await removeSpeakerTicketEmail('speaker-1', odd, [
      { ...grant, email: odd },
      other,
    ])
    expect(calls).toStrictEqual([
      ['patch', 'speaker-1'],
      ['set', { ticketEmailGrants: [other] }],
      ['commit'],
    ])
  })
})

// Expected sequences are the pre-seam inline code in push/sanity.ts and
// onboarding/provision.ts, transcribed call for call.
describe('speaker write seam: push + onboarding', () => {
  const sel = (e: string) => `pushSubscriptions[endpoint=="${e}"]`

  it('addSpeakerOrganization queues the membership append on the given transaction', () => {
    const tx = makeTx()
    addSpeakerOrganization('sp-1', 'org-1', {
      transaction: tx as never,
    })
    expect(calls).toStrictEqual([
      ['tx.patch', 'sp-1'],
      ['setIfMissing', { organizations: [] }],
      [
        'insert',
        'after',
        'organizations[-1]',
        [{ _type: 'reference', _ref: 'org-1', _key: 'org-1' }],
      ],
    ])
    expect(patchedTxs).toHaveLength(1)
    expect(patchedTxs[0]).toBe(tx)
    expect(mintedTxs).toHaveLength(0)
  })

  it('addPushSubscription: dedup + eviction unset, then append, in one transaction', async () => {
    const old = (n: number) => ({
      endpoint: `https://p/${n}`,
      keys: { p256dh: 'k', auth: 'a' },
      createdAt: `2026-01-${String(n).padStart(2, '0')}`,
    })
    vi.mocked(clientReadUncached.fetch).mockResolvedValueOnce({
      pushSubscriptions: Array.from({ length: 20 }, (_, i) => old(i + 1)),
    } as never)
    await addPushSubscription('sp-1', {
      endpoint: 'https://p/new"\\',
      keys: { p256dh: 'P', auth: 'A' },
      createdAt: '2026-11-04T00:00:00.000Z',
      userAgent: 'UA',
    })
    const insert = calls[4] as [string, string, string, Array<{ _key: string }>]
    expect(insert[3][0]._key).toMatch(/^push/)
    expect(calls).toStrictEqual([
      ['tx.patch', 'sp-1'],
      ['unset', [sel('https://p/new\\"\\\\'), sel('https://p/1')]],
      ['tx.patch', 'sp-1'],
      ['setIfMissing', { pushSubscriptions: [] }],
      [
        'insert',
        'after',
        'pushSubscriptions[-1]',
        [
          {
            _key: insert[3][0]._key,
            endpoint: 'https://p/new"\\',
            keys: { p256dh: 'P', auth: 'A' },
            createdAt: '2026-11-04T00:00:00.000Z',
            userAgent: 'UA',
          },
        ],
      ],
      ['tx.commit'],
    ])
  })

  it('remove/prune unset by endpoint selector', async () => {
    await removePushSubscription('sp-1', 'https://p/1')
    await prunePushSubscription('sp-1', 'https://p/2')
    expect(calls).toStrictEqual([
      ['patch', 'sp-1'],
      ['unset', [sel('https://p/1')]],
      ['commit'],
      ['patch', 'sp-1'],
      ['unset', [sel('https://p/2')]],
      ['commit'],
    ])
  })

  it('setPushPreferences sets the normalised preferences', async () => {
    const prefs = normalizePushPreferences({})
    await setPushPreferences('sp-1', prefs)
    expect(calls).toStrictEqual([
      ['patch', 'sp-1'],
      ['set', { pushPreferences: prefs }],
      ['commit'],
    ])
  })
})
