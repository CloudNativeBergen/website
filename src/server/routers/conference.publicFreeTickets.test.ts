/**
 * @vitest-environment node
 *
 * THE WRITE SHAPE of `conference.updatePublicFreeTickets` (#860).
 *
 * The mutation must patch the stored `publicFreeTicketIds` array with PER-ID
 * operations — never a read-modify-write of the whole array, whose window lets
 * two concurrent toggles drop each other's change. These tests pin the exact
 * operation sequence:
 *
 *  - show: `setIfMissing` (first toggle ever), then `unset` of any existing
 *    occurrence, then append — remove-before-append is what makes a repeated
 *    "on" idempotent instead of a double insert;
 *  - hide: a single `unset` by value, and NO insert;
 *  - both: no Sanity read at all, one atomic transaction, and the
 *    tenant-scoped cache tag revalidated so the public /tickets page reflects
 *    the flip.
 */

const h = vi.hoisted(() => {
  /** Every patch operation across the transaction, in application order. */
  const ops: Array<[string, unknown]> = []
  return {
    ops,
    getConference: vi.fn(),
    getOrganizationById: vi.fn(),
    uncachedFetch: vi.fn(),
    txCommit: vi.fn(),
    revalidateTag: vi.fn(),
  }
})

vi.mock('@/lib/auth', () => ({
  getAuthSession: vi.fn().mockResolvedValue(null),
}))
vi.mock('@/lib/events/registry', () => ({}))
vi.mock('next/cache', () => ({ revalidateTag: h.revalidateTag }))
vi.mock('next/headers', () => ({
  headers: async () => ({
    get: (key: string) => (key === 'host' ? 'cloudnativebergen.no' : null),
  }),
}))

vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: h.getConference,
  getConferenceForDomain: vi.fn(),
}))
vi.mock('@/lib/organization/sanity', () => ({
  getOrganizationById: h.getOrganizationById,
  getOrganizationRefForCurrentConference: () => null,
}))
vi.mock('@/lib/sanity/client', () => {
  /** Records each builder call as an ordered `[op, args]` entry. */
  const recordingPatch = {
    setIfMissing: (value: unknown) => {
      h.ops.push(['setIfMissing', value])
      return recordingPatch
    },
    unset: (paths: unknown) => {
      h.ops.push(['unset', paths])
      return recordingPatch
    },
    insert: (...args: unknown[]) => {
      h.ops.push(['insert', args])
      return recordingPatch
    },
  }
  const tx = {
    patch: (_id: string, build: (p: typeof recordingPatch) => unknown) => {
      build(recordingPatch)
      return tx
    },
    commit: h.txCommit,
  }
  return {
    clientWrite: { transaction: () => tx },
    clientReadUncached: { fetch: h.uncachedFetch },
  }
})
vi.mock('@/lib/teams', () => ({ clearConferenceTeamsCache: vi.fn() }))

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { initTRPC } from '@trpc/server'
import type { Context } from '@/server/trpc'
import { conferenceTag } from '@/lib/cache/tags'
import { conferenceRouter } from './conference'

const t = initTRPC.context<Context>().create()

const ORG = 'organization-cloud-native-days'
const CONF = 'conf-cndn'

function ctx(): Context {
  const speaker = {
    _id: 'sp-admin',
    name: 'Admin',
    isOrganizer: true,
    organizerOrgIds: [ORG],
  }
  const user = { email: 'a@example.com', name: 'Admin', picture: '' }
  return {
    req: {
      headers: new Headers(),
      url: 'http://localhost:3000',
    } as unknown as Context['req'],
    session: {
      expires: new Date(Date.now() + 86_400_000).toISOString(),
      user,
      speaker,
    } as unknown as Context['session'],
    speaker: speaker as unknown as Context['speaker'],
    user,
    workosUser: null,
    ipAddress: '127.0.0.1',
  } as unknown as Context
}

const conference = () => t.createCallerFactory(conferenceRouter)(ctx())

beforeEach(() => {
  vi.clearAllMocks()
  h.ops.length = 0
  h.getConference.mockResolvedValue({
    conference: {
      _id: CONF,
      title: 'Cloud Native Days Bergen',
      organization: { _ref: ORG },
    },
    domain: 'cloudnativebergen.no',
    error: null,
  })
  // No entitlement decision — an ungated community org (rule 2 is exercised in
  // conference.killswitch.test.ts; here the gate just has to admit the call).
  h.getOrganizationById.mockResolvedValue({
    _id: ORG,
    name: 'Cloud Native Days Norway',
    slug: 'cloud-native-days-norway',
  })
  h.txCommit.mockResolvedValue({})
})

describe('showing a type (visible: true)', () => {
  it('removes any existing occurrence BEFORE appending — a repeated "on" cannot double-insert', async () => {
    await conference().updatePublicFreeTickets({ ticketId: 7, visible: true })

    expect(h.ops).toEqual([
      ['setIfMissing', { publicFreeTicketIds: [] }],
      ['unset', ['publicFreeTicketIds[@ == 7]']],
      ['insert', ['after', 'publicFreeTicketIds[-1]', [7]]],
    ])
    expect(h.txCommit).toHaveBeenCalledTimes(1)
  })

  it('never reads the stored array — there is nothing stale to write back', async () => {
    await conference().updatePublicFreeTickets({ ticketId: 7, visible: true })
    expect(h.uncachedFetch).not.toHaveBeenCalled()
  })

  it('revalidates the tenant-scoped conference tag so /tickets reflects the flip', async () => {
    await conference().updatePublicFreeTickets({ ticketId: 7, visible: true })
    expect(h.revalidateTag).toHaveBeenCalledWith(conferenceTag(CONF), 'default')
  })
})

describe('hiding a type (visible: false)', () => {
  it('unsets every occurrence by value and inserts nothing', async () => {
    await conference().updatePublicFreeTickets({ ticketId: 42, visible: false })

    expect(h.ops).toEqual([['unset', ['publicFreeTicketIds[@ == 42]']]])
    expect(h.txCommit).toHaveBeenCalledTimes(1)
  })
})

describe('input validation', () => {
  it.each([
    ['a fractional id', { ticketId: 1.5, visible: true }],
    ['a zero id', { ticketId: 0, visible: true }],
    ['a negative id', { ticketId: -7, visible: true }],
  ])('rejects %s before any write', async (_name, input) => {
    await expect(
      conference().updatePublicFreeTickets(
        input as { ticketId: number; visible: boolean },
      ),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    expect(h.txCommit).not.toHaveBeenCalled()
  })
})
