/**
 * @vitest-environment node
 *
 * A BULK SEND of the workshop early-access email (#1347): who is mailed, the
 * budget it stops at, and the refusals that refuse the whole call. The same
 * harness as `sponsor.sendEarlyAccess.test.ts`: the link module, the send
 * primitive and the audit record are real; the conference, the domain claim
 * and the provider are supplied.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { VersionedSanityStore } from '../../../__tests__/helpers/versionedSanityStore'
import type { DomainClaim } from '@/lib/domain-verification/types'
import {
  claimsById,
  provenClaim,
} from '../../../__tests__/helpers/domainClaims'

vi.mock('@/lib/auth', () => ({
  getAuthSession: vi.fn().mockResolvedValue(null),
}))
vi.mock('@/lib/events/registry', () => ({}))

const h = vi.hoisted(() => ({
  store: null as null | VersionedSanityStore,
  getConference: vi.fn(),
  workshopsEnabled: vi.fn<(c: unknown) => Promise<boolean>>(),
  getDomainClaim: vi.fn<(id: string) => Promise<DomainClaim | null>>(),
  revalidateTag: vi.fn(),
  send: vi.fn(),
}))

vi.mock('@/lib/sanity/client', async () => {
  const { createVersionedSanityStore } =
    await import('../../../__tests__/helpers/versionedSanityStore')
  h.store = createVersionedSanityStore()
  const write = h.store.clients.clientWrite as {
    transaction: () => {
      create: (doc: Record<string, unknown>) => unknown
      commit: () => Promise<{ documentIds: string[] }>
    }
  }
  return {
    ...h.store.clients,
    clientWrite: {
      ...write,
      // The audit record is written with `create`: stored like every other
      // write, so the tests read the record back from the dataset.
      create: async (doc: Record<string, unknown>) => {
        const transaction = write.transaction()
        transaction.create(doc)
        const { documentIds } = await transaction.commit()
        return { _id: documentIds[0] }
      },
    },
  }
})
vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: h.getConference,
}))
vi.mock('@/lib/features/workshops', () => ({
  isWorkshopsEnabledForConference: h.workshopsEnabled,
}))
vi.mock('@/lib/domain-verification/sanity', () => ({
  getDomainClaim: h.getDomainClaim,
}))
vi.mock('next/cache', () => ({
  revalidateTag: h.revalidateTag,
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
}))
vi.mock('@/lib/email/config', async (importOriginal) => ({
  ...((await importOriginal()) as Record<string, unknown>),
  resolveEmailSender: async () => ({ client: { emails: { send: h.send } } }),
  retryWithBackoff: async <T>(fn: () => Promise<T>) => fn(),
}))

import {
  BULK_MAX_SENDS,
  BULK_TIME_BUDGET_MS,
  sendEarlyAccessBulk,
} from './sponsorEarlyAccess'

const ORG = 'org-a'
const CONF = 'conf-a'
const MAIN_HOST = 'conf.example.org'
const NOW = '2026-09-20T12:00:00.000Z'
const ref = (id: string) => ({ _type: 'reference', _ref: id })

function sponsor(id: string, overrides: Record<string, unknown> = {}) {
  return [
    { _id: `s-${id}`, _type: 'sponsor', name: `Sponsor ${id}` },
    {
      _id: id,
      _type: 'sponsorForConference',
      _rev: 'r0',
      conference: ref(CONF),
      sponsor: ref(`s-${id}`),
      status: 'closed-won',
      contactPersons: [
        {
          _key: 'c1',
          name: `Contact ${id}`,
          email: `${id}@x.test`,
          isPrimary: true,
        },
      ],
      ...overrides,
    },
  ]
}

const BASE = [
  { _id: CONF, _type: 'conference', organization: ref(ORG) },
  { _id: 'conf-b', _type: 'conference', organization: ref('org-b') },
  ...sponsor('sfc-foreign', { conference: ref('conf-b') }),
]

function conference(overrides: Record<string, unknown> = {}) {
  return {
    _id: CONF,
    title: 'Cloud Native Days Bergen',
    organizer: 'CNDN',
    organization: { _ref: ORG },
    sponsorEmail: 'sponsors@example.test',
    startDate: '2026-10-28',
    domains: [MAIN_HOST],
    workshopRegistrationSponsorStart: '2026-09-24T08:00:00.000Z',
    workshopRegistrationStart: '2026-10-01T08:00:00.000Z',
    workshopRegistrationEnd: '2026-10-20T16:00:00.000Z',
    ...overrides,
  }
}

const bulk = (args: { sponsorIds?: string[]; onlyUnsent?: boolean } = {}) =>
  sendEarlyAccessBulk({
    conference: conference() as never,
    domain: MAIN_HOST,
    orgId: ORG,
    actor: { id: 'sp-admin', names: ['Admin'] },
    onlyUnsent: true,
    ...args,
  })

const sentTo = () => h.send.mock.calls.map(([e]) => e.to[0])

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(NOW))
  h.store!.reset([...BASE, ...sponsor('sfc-a'), ...sponsor('sfc-b')])
  h.getConference.mockResolvedValue({
    conference: conference(),
    domain: MAIN_HOST,
    error: null,
  })
  h.getDomainClaim.mockImplementation(
    claimsById(provenClaim(MAIN_HOST, {}, { _id: CONF })),
  )
  h.send.mockResolvedValue({ data: { id: 'msg' }, error: null })
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => vi.useRealTimers())

describe('sendEarlyAccessBulk', () => {
  it('mails every Closed Won sponsor once, and a second run mails nobody', async () => {
    h.store!.reset([
      ...BASE,
      ...sponsor('sfc-a'),
      ...sponsor('sfc-b'),
      ...sponsor('sfc-lost', { status: 'closed-lost' }),
    ])
    const first = await bulk()
    expect(first.sent.map((s) => s.id)).toEqual(['sfc-a', 'sfc-b'])
    expect(first).toMatchObject({ skipped: [], remaining: 0 })
    expect(sentTo()).toEqual(['sfc-a@x.test', 'sfc-b@x.test'])

    const again = await bulk()
    expect(again).toEqual({ sent: [], skipped: [], remaining: 0 })
    expect(h.send).toHaveBeenCalledTimes(2)

    // Without onlyUnsent, the sent ones are mailed again.
    expect((await bulk({ onlyUnsent: false })).sent).toHaveLength(2)
  })

  it('refuses the whole batch when an id is outside the conference', async () => {
    await expect(
      bulk({ sponsorIds: ['sfc-a', 'sfc-foreign'] }),
    ).rejects.toThrow(/not in this conference/)
    expect(h.send).not.toHaveBeenCalled()
  })

  it('refuses the whole call when the conference has no early-access window', async () => {
    h.getConference.mockResolvedValue({
      conference: conference({ workshopRegistrationSponsorStart: null }),
      domain: MAIN_HOST,
      error: null,
    })
    await expect(bulk()).rejects.toThrow(/no early-access period/)
    expect(h.send).not.toHaveBeenCalled()
  })

  it("lists one sponsor's refusal and failure and goes on", async () => {
    h.store!.reset([
      ...BASE,
      ...sponsor('sfc-a', { contactPersons: [] }),
      ...sponsor('sfc-b'),
      ...sponsor('sfc-c'),
      ...sponsor('sfc-lost', { status: 'closed-lost' }),
    ])
    h.send
      .mockResolvedValueOnce({
        data: null,
        error: { message: 'boom', statusCode: 422 },
      })
      .mockResolvedValue({ data: { id: 'msg' }, error: null })
    const result = await bulk({
      sponsorIds: ['sfc-a', 'sfc-b', 'sfc-c', 'sfc-lost'],
    })
    expect(result.sent.map((s) => s.id)).toEqual(['sfc-c'])
    expect(result.skipped.map((s) => s.id)).toEqual([
      'sfc-a',
      'sfc-b',
      'sfc-lost',
    ])
    expect(result.skipped[2].reason).toMatch(/won deal/)
    expect(result.remaining).toBe(0)
  })

  it('stops starting sends when the time budget is spent, and a rerun continues', async () => {
    h.send.mockImplementation(async () => {
      vi.setSystemTime(new Date(Date.now() + BULK_TIME_BUDGET_MS))
      return { data: { id: 'msg' }, error: null }
    })
    const first = await bulk()
    expect(first.sent.map((s) => s.id)).toEqual(['sfc-a'])
    expect(first.remaining).toBe(1)
    const second = await bulk()
    expect(second.sent.map((s) => s.id)).toEqual(['sfc-b'])
    expect(second.remaining).toBe(0)
  })

  it(`mails at most ${BULK_MAX_SENDS} in one call`, async () => {
    const many = Array.from({ length: BULK_MAX_SENDS + 2 }, (_, i) =>
      sponsor(`sfc-${String(i).padStart(2, '0')}`),
    ).flat()
    h.store!.reset([...BASE, ...many])
    const result = await bulk()
    expect(result.sent).toHaveLength(BULK_MAX_SENDS)
    expect(result.remaining).toBe(2)
  })
})
