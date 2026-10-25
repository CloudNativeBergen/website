/**
 * @vitest-environment node
 *
 * The `organization` router through the tRPC caller and the REAL authz
 * waist, on the versioned in-memory store: writes are built by the real
 * `@sanity/client` and applied with `@sanity/mutator`. Only the conference
 * resolution (the request's host) and the cache expiry are replaced.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { VersionedSanityStore } from '../../../__tests__/helpers/versionedSanityStore'

vi.mock('@/lib/auth', () => ({
  getAuthSession: vi.fn().mockResolvedValue(null),
}))
const h = vi.hoisted(() => ({
  store: null as null | VersionedSanityStore,
  revalidateTag: vi.fn(),
}))
vi.mock('next/cache', () => ({
  revalidateTag: h.revalidateTag,
  updateTag: vi.fn(),
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
}))
vi.mock('@/lib/sanity/client', async () => {
  const { createVersionedSanityStore } =
    await import('../../../__tests__/helpers/versionedSanityStore')
  h.store = createVersionedSanityStore()
  return h.store.clients
})
vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: vi.fn(async () => ({
    conference: { _id: 'conf-A', organization: { _ref: 'org-A' } },
    error: null,
  })),
}))

import { initTRPC } from '@trpc/server'
import type { Context } from '@/server/trpc'
import { organizationRouter } from './organization'

type Doc = Record<string, unknown> & { _id: string }
const store = () => h.store!

const t = initTRPC.context<Context>().create()
function caller(speakerId: string, orgIds?: string[]) {
  const speaker = {
    _id: speakerId,
    name: speakerId,
    ...(orgIds && { organizerOrgIds: orgIds }),
  }
  const user = { email: `${speakerId}@example.com`, name: 'x', picture: '' }
  return t.createCallerFactory(organizationRouter)({
    req: { headers: new Headers(), url: 'http://localhost:3000' },
    session: { expires: '2099-01-01T00:00:00Z', user, speaker },
    speaker,
    user,
    workosUser: null,
    ipAddress: '127.0.0.1',
  } as unknown as Context)
}
const organizer = () => caller('sp-org', ['org-A'])

const org = (id: string, fields: Record<string, unknown> = {}) =>
  ({ _id: id, _type: 'organization', name: id, ...fields }) as Doc

beforeEach(() => {
  store().reset([
    org('org-A', { analyticsPosthogToken: 'phc_keep' }),
    org('org-B'),
  ])
  h.revalidateTag.mockClear()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-25T12:00:00Z'))
})

describe('organization.updateContentJudgement', () => {
  it('turns it on for the request’s organization, recording who and when', async () => {
    await expect(
      organizer().updateContentJudgement({ enabled: true }),
    ).resolves.toEqual({ success: true })
    expect(store().doc('org-A')).toMatchObject({
      analyticsPosthogToken: 'phc_keep',
      contentJudgement: {
        enabled: true,
        changedAt: '2026-10-25T12:00:00.000Z',
        changedBy: { _type: 'reference', _ref: 'sp-org', _weak: true },
      },
    })
    expect(store().doc('org-B')).toEqual(org('org-B'))
    expect(h.revalidateTag).toHaveBeenCalledWith(
      'sanity:organization-org-A',
      'default',
    )
  })

  it('turns it off again and keeps the other content judgement fields', async () => {
    store().reset([
      org('org-A', {
        contentJudgement: { enabled: true, enforceWallPosts: false },
      }),
    ])
    await organizer().updateContentJudgement({ enabled: false })
    expect(store().doc('org-A')).toMatchObject({
      contentJudgement: {
        enabled: false,
        enforceWallPosts: false,
        changedBy: { _ref: 'sp-org' },
      },
    })
  })

  it('refuses a speaker who is not an organizer, and writes nothing', async () => {
    await expect(
      caller('sp-speaker').updateContentJudgement({ enabled: true }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(store().doc('org-A')).toEqual(
      org('org-A', { analyticsPosthogToken: 'phc_keep' }),
    )
  })

  it('refuses an organizer of another organization, and writes nothing', async () => {
    await expect(
      caller('sp-other', ['org-B']).updateContentJudgement({ enabled: true }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(store().doc('org-A')?.contentJudgement).toBeUndefined()
    expect(store().doc('org-B')?.contentJudgement).toBeUndefined()
  })

  it('takes no organization from the client', async () => {
    await organizer().updateContentJudgement({
      enabled: true,
      orgId: 'org-B',
    } as { enabled: boolean })
    expect(store().doc('org-B')?.contentJudgement).toBeUndefined()
    expect(store().doc('org-A')?.contentJudgement).toMatchObject({
      enabled: true,
    })
  })
})

describe('the organization mutation surface is pinned', () => {
  it('lists every mutation', () => {
    const procedures = (
      organizationRouter as unknown as {
        _def: { procedures: Record<string, { _def?: { type?: string } }> }
      }
    )._def.procedures
    expect(
      Object.entries(procedures)
        .filter(([, p]) => p._def?.type === 'mutation')
        .map(([path]) => path)
        .sort(),
    ).toEqual(['updateAnalytics', 'updateContentJudgement'])
  })
})
