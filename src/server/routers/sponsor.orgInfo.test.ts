/**
 * @vitest-environment node
 *
 * updateConferenceOrgInfo writes organizerOrgNumber/organizerAddress through
 * the settings phase 1 D1 path before Sanity (#2019).
 */

vi.mock('@/lib/auth', () => ({
  getAuthSession: vi.fn().mockResolvedValue(null),
}))
vi.mock('@/lib/events/registry', () => ({}))
vi.mock('next/cache', () => ({
  revalidateTag: vi.fn(),
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
}))

const h = vi.hoisted(() => ({
  getConference: vi.fn(),
  writeD1: vi.fn(),
  commit: vi.fn(),
  order: [] as string[],
}))

vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: h.getConference,
}))
vi.mock('@/lib/konf-api/conference-write', () => ({
  writeMovedToD1: h.writeD1,
}))
vi.mock('@/lib/sanity/client', () => {
  const client = {
    fetch: async () => null,
    patch: () => ({ set: () => ({ commit: h.commit }) }),
  }
  return {
    clientRead: client,
    clientReadCached: client,
    clientReadUncached: client,
    clientWrite: client,
  }
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { initTRPC } from '@trpc/server'
import type { Context } from '@/server/trpc'
import { sponsorRouter } from './sponsor'

const ORG = 'org-A'
const t = initTRPC.context<Context>().create()
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
const sponsor = () => t.createCallerFactory(sponsorRouter)(ctx())

beforeEach(() => {
  h.order.length = 0
  h.writeD1.mockImplementation(async () => (h.order.push('d1'), true))
  h.commit.mockImplementation(async () => (h.order.push('sanity'), {}))
  h.getConference.mockResolvedValue({
    conference: { _id: 'conf-A', organization: { _ref: ORG } },
    domain: 'localhost',
    error: null,
  })
})

describe('updateConferenceOrgInfo (#2019)', () => {
  it('writes D1 first, then Sanity', async () => {
    const fields = { organizerOrgNumber: '123', organizerAddress: 'Street 1' }
    await sponsor().contractTemplates.updateConferenceOrgInfo(fields)
    expect(h.writeD1).toHaveBeenCalledWith('conf-A', fields)
    expect(h.order).toEqual(['d1', 'sanity'])
  })

  it('never touches Sanity when the D1 write refuses', async () => {
    h.writeD1.mockRejectedValue(new Error('d1 down'))
    await expect(
      sponsor().contractTemplates.updateConferenceOrgInfo({
        organizerOrgNumber: '123',
      }),
    ).rejects.toThrow('d1 down')
    expect(h.commit).not.toHaveBeenCalled()
  })
})
