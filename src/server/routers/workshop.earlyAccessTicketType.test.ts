/**
 * @vitest-environment node
 *
 * EARLY ACCESS BY TICKET TYPE, the admin save
 * (`workshop.admin.setEarlyAccessTicketType`, spec
 * `docs/WORKSHOP_SPONSOR_EARLY_ACCESS_SPEC.md` §13), through the tRPC caller.
 *
 * REAL: the procedure, the organizer and feature gates, and the write,
 * run through the versioned store. SUPPLIED: the conference the request
 * resolves to, the workshop feature decision and `next/cache`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { initTRPC } from '@trpc/server'
import type { VersionedSanityStore } from '../../../__tests__/helpers/versionedSanityStore'

vi.mock('@/lib/auth', () => ({
  getAuthSession: vi.fn().mockResolvedValue(null),
}))

const h = vi.hoisted(() => ({
  store: null as null | VersionedSanityStore,
  getConference: vi.fn(),
  workshopsEnabled: vi.fn<(c: unknown) => Promise<boolean>>(),
  revalidateTag: vi.fn(),
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
vi.mock('@/lib/features/workshops', () => ({
  isWorkshopsEnabledForConference: h.workshopsEnabled,
}))
vi.mock('next/cache', () => ({
  revalidateTag: h.revalidateTag,
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
}))

import type { Context } from '@/server/trpc'
import { conferenceTag } from '@/lib/cache/tags'
import { workshopRouter } from './workshop'

const t = initTRPC.context<Context>().create()
const ORG = 'org-a'
const CONF = 'conf-a'
const store = () => h.store!
const stored = () =>
  store().doc(CONF)?.workshopEarlyAccessTicketTypes as string[] | undefined

function conference(early?: string[]) {
  return {
    _id: CONF,
    _type: 'conference',
    _rev: 'r0',
    organization: { _type: 'reference', _ref: ORG },
    ticketTypeRoles: [
      { _key: 'a', typeName: 'Two-day pass', grantsWorkshop: true },
      { _key: 'b', typeName: 'Day pass', grantsWorkshop: false },
    ],
    ...(early && { workshopEarlyAccessTicketTypes: early }),
  }
}

function caller(organizerOf: string = ORG) {
  const speaker = {
    _id: 'sp-admin',
    name: 'Admin',
    isOrganizer: true,
    organizerOrgIds: [organizerOf],
  }
  const user = { email: 'a@example.com', name: 'Admin', picture: '' }
  return t.createCallerFactory(workshopRouter)({
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

const set = (typeName: string, earlyAccess: boolean, who?: string) =>
  caller(who).admin.setEarlyAccessTicketType({ typeName, earlyAccess })

beforeEach(() => {
  vi.clearAllMocks()
  store().reset([conference()])
  h.getConference.mockResolvedValue({
    conference: { _id: CONF, organization: { _ref: ORG } },
    domain: 'conf.example.org',
    error: null,
  })
  h.workshopsEnabled.mockResolvedValue(true)
})

describe('workshop.admin.setEarlyAccessTicketType', () => {
  it('turns a granting type on, and expires the settings and conference tags', async () => {
    expect(await set('Two-day pass', true)).toEqual({ success: true })
    expect(stored()).toEqual(['Two-day pass'])
    expect(h.revalidateTag.mock.calls).toEqual([
      ['admin:settings', 'default'],
      [conferenceTag(CONF), { expire: 0 }],
    ])
  })

  it('refuses an organizer of another organization, and writes nothing', async () => {
    await expect(set('Two-day pass', true, 'org-b')).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
    expect(store().commits).toEqual([])
  })

  it('refuses when workshops are off for the conference', async () => {
    h.workshopsEnabled.mockResolvedValue(false)
    await expect(set('Two-day pass', true)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
    expect(store().commits).toEqual([])
  })

  it('refuses a type that does not grant workshops', async () => {
    await expect(set('Day pass', true)).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    })
    expect(stored()).toBeUndefined()
    expect(h.revalidateTag).not.toHaveBeenCalled()
  })

  it('removes a type by its folded name', async () => {
    store().reset([conference(['Two-day pass', 'Old pass'])])
    await set('TWO-DAY PASS', false)
    expect(stored()).toEqual(['Old pass'])
  })

  it('removes a type the provider no longer lists', async () => {
    store().reset([conference(['Old pass'])])
    await set('Old pass', false)
    expect(stored()).toEqual([])
  })

  it('turning it on again creates no duplicate', async () => {
    store().reset([conference(['Two-day pass'])])
    await set('two-day pass', true)
    expect(stored()).toEqual(['two-day pass'])
  })

  it('a write that lost the race is CONFLICT, and nothing is expired', async () => {
    store().beforeNextCommit(() =>
      store().put({ ...conference(), _rev: 'r-other' }),
    )
    await expect(set('Two-day pass', true)).rejects.toMatchObject({
      code: 'CONFLICT',
    })
    expect(stored()).toBeUndefined()
    expect(h.revalidateTag).not.toHaveBeenCalled()
  })

  it('refuses a type name over 200 characters', async () => {
    await expect(set('x'.repeat(201), false)).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    })
  })
})
