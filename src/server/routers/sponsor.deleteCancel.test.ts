/**
 * @vitest-environment node
 *
 * Deleting a sponsor with "cancel the signing agreement" chosen: when the
 * provider refuses the cancel, that sponsor is kept, so no live agreement is
 * left without a record. Same harness as sponsor.earlyAccessExpiry.test.ts.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { initTRPC } from '@trpc/server'
import type { VersionedSanityStore } from '../../../__tests__/helpers/versionedSanityStore'

vi.mock('@/lib/auth', () => ({
  getAuthSession: vi.fn().mockResolvedValue(null),
}))
vi.mock('@/lib/events/registry', () => ({}))

const h = vi.hoisted(() => ({
  store: null as null | VersionedSanityStore,
  getConference: vi.fn(),
  revalidateTag: vi.fn(),
  cancel: vi.fn(),
}))

vi.mock('@/lib/contract-signing', async (orig) => ({
  ...(await orig<object>()),
  getSigningProvider: () => ({ cancelAgreement: h.cancel }),
}))

vi.mock('@/lib/sanity/client', async () => {
  const { createVersionedSanityStore } =
    await import('../../../__tests__/helpers/versionedSanityStore')
  h.store = createVersionedSanityStore()
  return h.store.clients
})
vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: h.getConference,
}))
vi.mock('next/cache', () => ({
  revalidateTag: h.revalidateTag,
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
}))

import type { Context } from '@/server/trpc'
import { sponsorRouter } from './sponsor'

const t = initTRPC.context<Context>().create()
const ORG = 'org-a'
const CONF = 'conf-a'

const store = () => h.store!
const ref = (id: string) => ({ _type: 'reference', _ref: id })

function sponsorIn(
  conferenceId: string,
  id: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    _id: id,
    _type: 'sponsorForConference',
    _rev: 'r0',
    conference: ref(conferenceId),
    sponsor: ref('sponsor-acme'),
    status: 'closed-won',
    ...overrides,
  }
}

const DATASET = [
  { _id: CONF, _type: 'conference', organization: ref(ORG) },
  {
    _id: 'sponsor-acme',
    _type: 'sponsor',
    name: 'Acme AS',
    organization: ref(ORG),
  },
  sponsorIn(CONF, 'sfc-acme', {
    signatureStatus: 'pending',
    signatureId: 'sig-acme',
  }),
  sponsorIn(CONF, 'sfc-other', {
    signatureStatus: 'pending',
    signatureId: 'sig-other',
  }),
  sponsorIn(CONF, 'sfc-plain'),
]

function caller() {
  const speaker = {
    _id: 'sp-admin',
    name: 'Admin',
    isOrganizer: true,
    organizerOrgIds: [ORG],
  }
  const user = { email: 'a@example.com', name: 'Admin', picture: '' }
  return t.createCallerFactory(sponsorRouter)({
    req: { headers: new Headers(), url: 'https://conf.example.org' },
    session: {
      expires: new Date(Date.now() + 86_400_000).toISOString(),
      user,
      speaker,
    },
    speaker,
    user,
    workosUser: null,
    ipAddress: '127.0.0.1',
  } as unknown as Context)
}

beforeEach(() => {
  vi.clearAllMocks()
  store().reset(DATASET)
  h.getConference.mockResolvedValue({
    conference: { _id: CONF, organization: { _ref: ORG } },
    domain: 'conf.example.org',
    error: null,
  })
})

describe('crm.delete', () => {
  it('cancels, then deletes', async () => {
    await caller().crm.delete({ id: 'sfc-acme', cancelAgreement: true })
    expect(h.cancel).toHaveBeenCalledWith('sig-acme')
    expect(store().doc('sfc-acme')).toBeUndefined()
  })

  it('deletes nothing and says so when the cancel fails', async () => {
    h.cancel.mockRejectedValue(new Error('provider down'))
    await expect(
      caller().crm.delete({ id: 'sfc-acme', cancelAgreement: true }),
    ).rejects.toThrow(/nothing was deleted/)
    expect(store().doc('sfc-acme')).toBeDefined()
  })
})

describe('crm.bulkDelete', () => {
  const ids = ['sfc-acme', 'sfc-other', 'sfc-plain']

  it('keeps only the sponsors whose cancel failed, and reports them', async () => {
    h.cancel.mockImplementation(async (sig: string) => {
      if (sig === 'sig-other') throw new Error('provider down')
    })
    const result = await caller().crm.bulkDelete({
      ids,
      cancelAgreements: true,
    })
    expect(result).toMatchObject({
      deletedCount: 2,
      totalCount: 3,
      cancelFailedIds: ['sfc-other'],
    })
    expect(store().doc('sfc-acme')).toBeUndefined()
    expect(store().doc('sfc-plain')).toBeUndefined()
    expect(store().doc('sfc-other')).toBeDefined()
  })

  it('deletes nothing when every cancel fails', async () => {
    h.cancel.mockRejectedValue(new Error('provider down'))
    const result = await caller().crm.bulkDelete({
      ids: ['sfc-acme', 'sfc-other'],
      cancelAgreements: true,
    })
    expect(result).toMatchObject({ deletedCount: 0, totalCount: 2 })
    expect(store().doc('sfc-acme')).toBeDefined()
    expect(store().doc('sfc-other')).toBeDefined()
  })
})
