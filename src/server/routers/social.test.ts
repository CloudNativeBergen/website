/**
 * @vitest-environment node
 *
 * The posting core's organizer surface through the tRPC caller: create,
 * schedule, the compare-and-set conflict path, stale-publishing refusal, and
 * tenancy. The Sanity store is mocked at `@/lib/social/sanity`; the tenancy
 * guard runs for REAL against a mocked `clientReadUncached.fetch`, so a
 * cross-tenant id is refused by the guard itself, not by a stub.
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
  tenantRead: vi.fn(),
  createSocialPost: vi.fn(),
  updateSocialPostDefaultTime: vi.fn(),
  listSocialPostVariants: vi.fn(),
  getSocialPostVariant: vi.fn(),
  getSocialPostDefaultTime: vi.fn(),
  transition: vi.fn(),
  resolveAdapter: vi.fn(),
}))

vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: h.getConference,
}))
vi.mock('@/lib/sanity/client', () => ({
  clientWrite: { patch: vi.fn(), fetch: vi.fn() },
  clientReadUncached: { fetch: h.tenantRead },
}))
vi.mock('@/lib/social/sanity', () => ({
  createSocialPost: h.createSocialPost,
  updateSocialPostDefaultTime: h.updateSocialPostDefaultTime,
  listSocialPostVariants: h.listSocialPostVariants,
  getSocialPostVariant: h.getSocialPostVariant,
  getSocialPostDefaultTime: h.getSocialPostDefaultTime,
  sanitySocialVariantStore: { transition: h.transition },
}))
vi.mock('@/lib/social/provider', () => ({
  resolveSocialPublishAdapter: h.resolveAdapter,
}))

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { initTRPC } from '@trpc/server'
import type { Context } from '@/server/trpc'
import type { SocialPostVariant } from '@/lib/social/types'
import { socialRouter } from './social'

const t = initTRPC.context<Context>().create()
const ORG_A = 'org-A'
const CONF_A = 'conf-A'
const CONF_B = 'conf-B'
const ADMIN_ID = 'sp-admin'

/** The tenancy the guard reads for each fixture id. */
const TENANTS: Record<string, { _type: string; conferenceId: string }> = {
  'variant-ours': { _type: 'socialPostVariant', conferenceId: CONF_A },
  'variant-theirs': { _type: 'socialPostVariant', conferenceId: CONF_B },
  'post-ours': { _type: 'socialPost', conferenceId: CONF_A },
  'post-theirs': { _type: 'socialPost', conferenceId: CONF_B },
}

function ctx(orgId: string = ORG_A): Context {
  const speaker = { _id: ADMIN_ID, name: 'Admin', organizerOrgIds: [orgId] }
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

const social = (orgId?: string) =>
  t.createCallerFactory(socialRouter)(ctx(orgId))

function variant(
  overrides: Partial<SocialPostVariant> = {},
): SocialPostVariant {
  return {
    _id: 'variant-ours',
    _rev: 'rev-7',
    postId: 'post-ours',
    conferenceId: CONF_A,
    platform: 'linkedin',
    body: 'Tickets are live',
    status: 'draft',
    scheduledAt: '2026-10-01T08:00:00.000Z',
    usesCustomTime: false,
    claimedAt: null,
    link: null,
    publishResult: null,
    attempts: [],
    attemptCount: 0,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  h.getConference.mockResolvedValue({
    conference: { _id: CONF_A, organization: { _ref: ORG_A } },
    domain: 'localhost',
    error: null,
  })
  h.tenantRead.mockImplementation(
    async (_query: string, params: { id?: string }) => {
      const tenant = params?.id ? TENANTS[params.id] : undefined
      if (!tenant) return null
      return {
        _type: tenant._type,
        orgId: null,
        conferenceId: tenant.conferenceId,
        conferenceOrgId: ORG_A,
        memberOrgIds: [],
      }
    },
  )
  h.createSocialPost.mockResolvedValue({
    postId: 'post-new',
    variantIds: ['v1', 'v2'],
  })
  h.updateSocialPostDefaultTime.mockResolvedValue({ rewritten: 2 })
  h.listSocialPostVariants.mockResolvedValue([])
  h.getSocialPostVariant.mockResolvedValue(variant())
  h.getSocialPostDefaultTime.mockResolvedValue('2026-10-01T08:00:00.000Z')
  h.transition.mockResolvedValue(true)
  h.resolveAdapter.mockResolvedValue(null)
})

describe('social.createPost', () => {
  it('creates the post for the REQUEST conference with one draft variant per platform', async () => {
    const result = await social().createPost({
      body: 'Tickets are live',
      defaultScheduledAt: '2026-10-01T08:00:00.000Z',
      platforms: ['linkedin', 'bluesky'],
    })

    expect(result).toEqual({ postId: 'post-new', variantIds: ['v1', 'v2'] })
    expect(h.createSocialPost).toHaveBeenCalledWith({
      conferenceId: CONF_A,
      body: 'Tickets are live',
      defaultScheduledAt: '2026-10-01T08:00:00.000Z',
      platforms: ['linkedin', 'bluesky'],
      createdBy: ADMIN_ID,
    })
  })

  it('refuses a duplicate platform', async () => {
    await expect(
      social().createPost({ body: 'x', platforms: ['bluesky', 'bluesky'] }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    expect(h.createSocialPost).not.toHaveBeenCalled()
  })

  it('denies a non-organizer of this org', async () => {
    await expect(
      social('org-Z').createPost({ body: 'x', platforms: ['bluesky'] }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(h.createSocialPost).not.toHaveBeenCalled()
  })
})

describe('social.updatePostDefaultTime', () => {
  it('rewrites the default time through the cascade for our post', async () => {
    const result = await social().updatePostDefaultTime({
      postId: 'post-ours',
      defaultScheduledAt: '2026-10-02T09:00:00.000Z',
    })
    expect(result).toEqual({ rewritten: 2 })
    expect(h.updateSocialPostDefaultTime).toHaveBeenCalledWith(
      'post-ours',
      CONF_A,
      '2026-10-02T09:00:00.000Z',
    )
  })

  it('normalizes an offset timestamp to UTC before it reaches storage', async () => {
    await social().updatePostDefaultTime({
      postId: 'post-ours',
      defaultScheduledAt: '2026-10-02T11:00:00+02:00',
    })
    expect(h.updateSocialPostDefaultTime).toHaveBeenCalledWith(
      'post-ours',
      CONF_A,
      '2026-10-02T09:00:00.000Z',
    )
  })

  it('surfaces a lost compare-and-set in the cascade as CONFLICT', async () => {
    h.updateSocialPostDefaultTime.mockResolvedValue({ conflict: true })
    await expect(
      social().updatePostDefaultTime({
        postId: 'post-ours',
        defaultScheduledAt: '2026-10-02T09:00:00.000Z',
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
  })

  it("refuses another conference's post with NOT_FOUND and never writes", async () => {
    await expect(
      social().updatePostDefaultTime({
        postId: 'post-theirs',
        defaultScheduledAt: '2026-10-02T09:00:00.000Z',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(h.updateSocialPostDefaultTime).not.toHaveBeenCalled()
  })
})

describe('social.scheduleVariant', () => {
  it('moves a draft to scheduled on the POST default via CAS on the revision read', async () => {
    const result = await social().scheduleVariant({ variantId: 'variant-ours' })

    expect(result).toEqual({ success: true, status: 'scheduled' })
    expect(h.transition).toHaveBeenCalledWith(
      'variant-ours',
      {
        status: 'scheduled',
        scheduledAt: '2026-10-01T08:00:00.000Z',
        attemptCount: 0,
        usesCustomTime: false,
      },
      { ifRevision: 'rev-7' },
    )
  })

  it('a retry without a time re-attaches to the post default, dropping the engine backoff override', async () => {
    h.getSocialPostVariant.mockResolvedValue(
      variant({
        status: 'failed',
        usesCustomTime: true,
        scheduledAt: '2026-10-01T08:15:00.000Z',
      }),
    )
    await social().scheduleVariant({ variantId: 'variant-ours' })
    expect(h.transition).toHaveBeenCalledWith(
      'variant-ours',
      expect.objectContaining({
        scheduledAt: '2026-10-01T08:00:00.000Z',
        usesCustomTime: false,
      }),
      { ifRevision: 'rev-7' },
    )
  })

  it('with no post default, keeps the time the variant carries', async () => {
    h.getSocialPostDefaultTime.mockResolvedValue(null)
    h.getSocialPostVariant.mockResolvedValue(
      variant({
        usesCustomTime: true,
        scheduledAt: '2026-10-03T08:00:00.000Z',
      }),
    )
    await social().scheduleVariant({ variantId: 'variant-ours' })
    expect(h.transition).toHaveBeenCalledWith(
      'variant-ours',
      expect.objectContaining({
        scheduledAt: '2026-10-03T08:00:00.000Z',
        usesCustomTime: true,
      }),
      { ifRevision: 'rev-7' },
    )
  })

  it('a supplied time becomes a per-variant override', async () => {
    await social().scheduleVariant({
      variantId: 'variant-ours',
      scheduledAt: '2026-10-05T12:00:00.000Z',
    })
    expect(h.transition).toHaveBeenCalledWith(
      'variant-ours',
      {
        status: 'scheduled',
        scheduledAt: '2026-10-05T12:00:00.000Z',
        attemptCount: 0,
        usesCustomTime: true,
      },
      { ifRevision: 'rev-7' },
    )
    expect(h.getSocialPostDefaultTime).not.toHaveBeenCalled()
  })

  it('refuses a variant with no time at all', async () => {
    h.getSocialPostDefaultTime.mockResolvedValue(null)
    h.getSocialPostVariant.mockResolvedValue(variant({ scheduledAt: null }))
    await expect(
      social().scheduleVariant({ variantId: 'variant-ours' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    expect(h.transition).not.toHaveBeenCalled()
  })

  it('re-schedules a failed variant with a fresh retry budget (organizer retry)', async () => {
    h.getSocialPostVariant.mockResolvedValue(
      variant({ status: 'failed', attemptCount: 3 }),
    )
    const result = await social().scheduleVariant({ variantId: 'variant-ours' })
    expect(result.status).toBe('scheduled')
    expect(h.transition).toHaveBeenCalledWith(
      'variant-ours',
      expect.objectContaining({ status: 'scheduled', attemptCount: 0 }),
      { ifRevision: 'rev-7' },
    )
  })

  it('surfaces a lost compare-and-set as CONFLICT', async () => {
    h.transition.mockResolvedValue(false)
    await expect(
      social().scheduleVariant({ variantId: 'variant-ours' }),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
  })

  it('a variant stuck in publishing cannot be re-scheduled by hand — it must fail first', async () => {
    h.getSocialPostVariant.mockResolvedValue(
      variant({ status: 'publishing', claimedAt: '2026-09-13T09:00:00Z' }),
    )
    await expect(
      social().scheduleVariant({ variantId: 'variant-ours' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    expect(h.transition).not.toHaveBeenCalled()
  })

  it('a published variant is terminal', async () => {
    h.getSocialPostVariant.mockResolvedValue(variant({ status: 'published' }))
    await expect(
      social().scheduleVariant({ variantId: 'variant-ours' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })

  it("blocks scheduling when the platform's adapter rejects the body", async () => {
    h.resolveAdapter.mockResolvedValue({
      validate: () => [{ field: 'body', message: 'exceeds 300 graphemes' }],
    })
    await expect(
      social().scheduleVariant({ variantId: 'variant-ours' }),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'body: exceeds 300 graphemes',
    })
    expect(h.transition).not.toHaveBeenCalled()
  })

  it("refuses another conference's variant BEFORE reading it (no existence oracle)", async () => {
    await expect(
      social().scheduleVariant({ variantId: 'variant-theirs' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(h.getSocialPostVariant).not.toHaveBeenCalled()
    expect(h.transition).not.toHaveBeenCalled()
  })

  it('refuses an unknown id the same way', async () => {
    await expect(
      social().scheduleVariant({ variantId: 'variant-nope' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(h.getSocialPostVariant).not.toHaveBeenCalled()
  })

  it('refuses an id that is a different document type in our conference', async () => {
    await expect(
      social().scheduleVariant({ variantId: 'post-ours' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(h.getSocialPostVariant).not.toHaveBeenCalled()
  })
})

describe('social.markPosted', () => {
  it('completes an awaiting-manual variant with the URL and a manual attempt by the caller', async () => {
    h.getSocialPostVariant.mockResolvedValue(
      variant({ status: 'awaiting-manual' }),
    )
    const result = await social().markPosted({
      variantId: 'variant-ours',
      url: 'https://www.linkedin.com/posts/abc',
    })

    expect(result.status).toBe('published')
    expect(h.transition).toHaveBeenCalledWith(
      'variant-ours',
      expect.objectContaining({
        status: 'published',
        publishResult: { url: 'https://www.linkedin.com/posts/abc' },
        attempt: expect.objectContaining({ outcome: 'manual', by: ADMIN_ID }),
      }),
      { ifRevision: 'rev-7' },
    )
  })

  it('requires a web URL (spec §3.2)', async () => {
    h.getSocialPostVariant.mockResolvedValue(
      variant({ status: 'awaiting-manual' }),
    )
    await expect(
      social().markPosted({
        variantId: 'variant-ours',
        url: 'javascript:alert(1)',
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    expect(h.transition).not.toHaveBeenCalled()
  })

  it('refuses to mark a scheduled variant posted — only awaiting-manual completes by hand', async () => {
    h.getSocialPostVariant.mockResolvedValue(variant({ status: 'scheduled' }))
    await expect(
      social().markPosted({
        variantId: 'variant-ours',
        url: 'https://www.linkedin.com/posts/abc',
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    expect(h.transition).not.toHaveBeenCalled()
  })

  it("refuses another conference's variant before reading it", async () => {
    await expect(
      social().markPosted({
        variantId: 'variant-theirs',
        url: 'https://www.linkedin.com/posts/abc',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(h.getSocialPostVariant).not.toHaveBeenCalled()
  })
})

describe('social.listVariants', () => {
  it('lists for the REQUEST conference only', async () => {
    await social().listVariants()
    expect(h.listSocialPostVariants).toHaveBeenCalledWith(CONF_A)
  })
})
