/**
 * @vitest-environment node
 *
 * #745: tenant admins cannot set or change `checkinEventId` or the Tito
 * account/slug pair. Every tenant shares the platform's provider credentials,
 * so nothing proves a tenant owns an unbound event id; only a platform
 * operator may bind one. Mocks mirror `conference.killswitch.test.ts`.
 */

vi.mock('@/lib/auth', () => ({
  getAuthSession: vi.fn().mockResolvedValue(null),
}))
vi.mock('@/lib/events/registry', () => ({}))
vi.mock('next/cache', () => ({ revalidateTag: vi.fn() }))
vi.mock('next/headers', () => ({
  headers: async () => ({
    get: (key: string) => (key === 'host' ? 'cloudnativebergen.no' : null),
  }),
}))

const h = vi.hoisted(() => ({
  getConference: vi.fn(),
  getOrganizationById: vi.fn(),
  uncachedFetch: vi.fn(),
  commit: vi.fn(),
}))

vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: h.getConference,
  getConferenceForDomain: vi.fn(),
}))
vi.mock('@/lib/organization/sanity', () => ({
  getOrganizationById: h.getOrganizationById,
  getOrganizationRefForCurrentConference: () => null,
}))
vi.mock('@/lib/sanity/client', () => ({
  clientWrite: {
    patch: () => {
      const builder = {
        setIfMissing: () => builder,
        set: () => builder,
        unset: () => builder,
        commit: h.commit,
      }
      return builder
    },
  },
  clientReadUncached: { fetch: h.uncachedFetch },
}))
vi.mock('@/lib/teams', () => ({ clearConferenceTeamsCache: vi.fn() }))

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { initTRPC } from '@trpc/server'
import type { Context } from '@/server/trpc'
import { conferenceRouter } from './conference'

const t = initTRPC.context<Context>().create()

const ORG = 'organization-cloud-native-days'
const PLATFORM_ORG = 'organization-platform'
const CONF = 'conf-cndn'

function ctx(organizerOrgIds: string[]): Context {
  const speaker = {
    _id: 'sp-admin',
    name: 'Admin',
    isOrganizer: true,
    organizerOrgIds,
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

const caller = (orgIds: string[]) =>
  t.createCallerFactory(conferenceRouter)(ctx(orgIds))
const tenantAdmin = () => caller([ORG])
const operator = () => caller([ORG, PLATFORM_ORG])

const FORBIDDEN_MESSAGE =
  'Only a platform operator can change the ticketing event binding'

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('PLATFORM_ORG_ID', PLATFORM_ORG)
  h.getConference.mockResolvedValue({
    conference: {
      _id: CONF,
      title: 'Cloud Native Days Bergen',
      organization: { _ref: ORG },
    },
    domain: 'cloudnativebergen.no',
    error: null,
  })
  h.getOrganizationById.mockResolvedValue({ _id: ORG, plan: 'pro' })
  h.uncachedFetch.mockImplementation(async (query: string) =>
    query.startsWith('count(')
      ? 0
      : {
          checkinEventId: 4242,
          titoAccountSlug: 'acme',
          titoEventSlug: '2026',
        },
  )
  h.commit.mockResolvedValue({ _id: CONF })
})

describe('the ticketing event binding is platform-set only (#745)', () => {
  it.each([
    ['checkinEventId', { checkinEventId: 9999 }],
    ['checkinEventId to empty', { checkinEventId: null }],
    [
      'titoAccountSlug',
      {
        ticketingProvider: 'tito' as const,
        titoAccountSlug: 'other',
        titoEventSlug: '2026',
      },
    ],
    [
      'titoEventSlug',
      {
        ticketingProvider: 'tito' as const,
        titoAccountSlug: 'acme',
        titoEventSlug: '2027',
      },
    ],
  ])('refuses a tenant admin changing %s', async (_, input) => {
    await expect(tenantAdmin().updateTicketingIds(input)).rejects.toMatchObject(
      { code: 'FORBIDDEN', message: FORBIDDEN_MESSAGE },
    )
    expect(h.commit).not.toHaveBeenCalled()
  })

  it('lets a tenant admin re-save the stored binding alongside other fields', async () => {
    await expect(
      tenantAdmin().updateTicketingIds({
        ticketingProvider: 'tito',
        checkinCustomerId: 7,
        checkinEventId: 4242,
        titoAccountSlug: 'acme',
        titoEventSlug: '2026',
      }),
    ).resolves.toBeDefined()
    expect(h.commit).toHaveBeenCalled()
  })

  it('lets a platform operator change the binding', async () => {
    await expect(
      operator().updateTicketingIds({ checkinEventId: 9999 }),
    ).resolves.toBeDefined()
    expect(h.commit).toHaveBeenCalled()
  })

  it('still refuses an operator claiming a binding another conference holds', async () => {
    h.uncachedFetch.mockImplementation(async (query: string) =>
      query.startsWith('count(') ? 1 : { checkinEventId: 4242 },
    )
    await expect(
      operator().updateTicketingIds({ checkinEventId: 9999 }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    expect(h.commit).not.toHaveBeenCalled()
  })

  it('fails closed when PLATFORM_ORG_ID is unset', async () => {
    vi.stubEnv('PLATFORM_ORG_ID', '')
    await expect(
      operator().updateTicketingIds({ checkinEventId: 9999 }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN', message: FORBIDDEN_MESSAGE })
  })
})
