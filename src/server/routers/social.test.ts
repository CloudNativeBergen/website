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
  deleteSocialPost: vi.fn(),
  updateSocialPostDefaultTime: vi.fn(),
  listSocialPostVariants: vi.fn(),
  getSocialPostVariant: vi.fn(),
  getSocialPostDefaultTime: vi.fn(),
  transition: vi.fn(),
  resolveAdapter: vi.fn(),
  getSocialVariantEditorData: vi.fn(),
  getSocialPostEditorInputs: vi.fn(),
  updateSocialVariantContent: vi.fn(),
  addSocialPostAttachment: vi.fn(),
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
  deleteSocialPost: h.deleteSocialPost,
  updateSocialPostDefaultTime: h.updateSocialPostDefaultTime,
  listSocialPostVariants: h.listSocialPostVariants,
  getSocialPostVariant: h.getSocialPostVariant,
  getSocialPostDefaultTime: h.getSocialPostDefaultTime,
  sanitySocialVariantStore: { transition: h.transition },
  getSocialVariantEditorData: h.getSocialVariantEditorData,
  getSocialPostEditorInputs: h.getSocialPostEditorInputs,
  updateSocialVariantContent: h.updateSocialVariantContent,
  addSocialPostAttachment: h.addSocialPostAttachment,
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
    orgId: ORG_A,
    platform: 'linkedin',
    body: 'Tickets are live',
    status: 'draft',
    scheduledAt: '2026-10-01T08:00:00.000Z',
    usesCustomTime: false,
    claimedAt: null,
    link: null,
    attachments: [],
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
  h.deleteSocialPost.mockResolvedValue({ deleted: true, variants: 2 })
  h.listSocialPostVariants.mockResolvedValue([])
  h.getSocialPostVariant.mockResolvedValue(variant())
  h.getSocialPostDefaultTime.mockResolvedValue('2026-10-01T08:00:00.000Z')
  h.transition.mockResolvedValue(true)
  h.resolveAdapter.mockResolvedValue(null)
  h.getSocialPostEditorInputs.mockResolvedValue({
    attachments: [POST_IMAGE],
    defaultScheduledAt: '2026-10-01T08:00:00.000Z',
    rev: 'post-rev-3',
  })
  h.getSocialVariantEditorData.mockResolvedValue({
    variant: variant(),
    post: { attachments: [POST_IMAGE], defaultScheduledAt: null },
  })
  h.updateSocialVariantContent.mockResolvedValue(true)
  h.addSocialPostAttachment.mockResolvedValue({ key: 'att-new' })
})

const ASSET_ID = 'image-0123456789abcdef0123456789abcdef01234567-2000x1000-jpg'
const POST_IMAGE = {
  _key: 'att-1',
  assetId: ASSET_ID,
  width: 2000,
  height: 1000,
  hotspot: null,
  crop: null,
  alt: 'Keynote crowd',
}

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

describe('social.deletePost', () => {
  it('deletes our post and its variants', async () => {
    const result = await social().deletePost({ postId: 'post-ours' })
    expect(result).toEqual({ deleted: true, variants: 2 })
    expect(h.deleteSocialPost).toHaveBeenCalledWith('post-ours', CONF_A)
  })

  it('refuses when a variant has been published, keeping the record', async () => {
    h.deleteSocialPost.mockResolvedValue({
      deleted: false,
      reason: 'published',
    })
    await expect(
      social().deletePost({ postId: 'post-ours' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })

  it('surfaces a variant that changed under the delete as CONFLICT', async () => {
    h.deleteSocialPost.mockResolvedValue({ deleted: false, reason: 'changed' })
    await expect(
      social().deletePost({ postId: 'post-ours' }),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
  })

  it("refuses another conference's post before touching it", async () => {
    await expect(
      social().deletePost({ postId: 'post-theirs' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(h.deleteSocialPost).not.toHaveBeenCalled()
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
    expect(h.getSocialPostDefaultTime).toHaveBeenCalledWith('post-ours', CONF_A)
    expect(h.transition).toHaveBeenCalledWith(
      'variant-ours',
      expect.objectContaining({
        scheduledAt: '2026-10-01T08:00:00.000Z',
        usesCustomTime: false,
      }),
      { ifRevision: 'rev-7' },
    )
  })

  it('refuses a draft twin id before reading anything', async () => {
    await expect(
      social().scheduleVariant({ variantId: 'drafts.variant-ours' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    expect(h.tenantRead).not.toHaveBeenCalled()
    expect(h.getSocialPostVariant).not.toHaveBeenCalled()
  })

  it('refuses a time whose UTC form overflows four-digit years', async () => {
    await expect(
      social().scheduleVariant({
        variantId: 'variant-ours',
        scheduledAt: '9999-12-31T23:59:59-23:59',
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    expect(h.transition).not.toHaveBeenCalled()
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

describe('social.unscheduleVariant', () => {
  it('pulls a scheduled variant back to draft via CAS on the revision read', async () => {
    h.getSocialPostVariant.mockResolvedValue(variant({ status: 'scheduled' }))
    const result = await social().unscheduleVariant({
      variantId: 'variant-ours',
    })
    expect(result.status).toBe('draft')
    expect(h.transition).toHaveBeenCalledWith(
      'variant-ours',
      { status: 'draft' },
      { ifRevision: 'rev-7' },
    )
  })

  it('cannot pull back a variant the cron has already claimed', async () => {
    h.getSocialPostVariant.mockResolvedValue(
      variant({ status: 'publishing', claimedAt: '2026-09-13T09:00:00Z' }),
    )
    await expect(
      social().unscheduleVariant({ variantId: 'variant-ours' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    expect(h.transition).not.toHaveBeenCalled()
  })

  it("refuses another conference's variant before reading it", async () => {
    await expect(
      social().unscheduleVariant({ variantId: 'variant-theirs' }),
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

describe('social.getVariantEditor', () => {
  it('returns our variant with the post inputs the editor needs', async () => {
    const result = await social().getVariantEditor({
      variantId: 'variant-ours',
    })
    expect(result.variant._id).toBe('variant-ours')
    expect(result.post.attachments).toEqual([POST_IMAGE])
    expect(h.getSocialVariantEditorData).toHaveBeenCalledWith('variant-ours')
  })

  it("refuses another conference's variant before reading it", async () => {
    await expect(
      social().getVariantEditor({ variantId: 'variant-theirs' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(h.getSocialVariantEditorData).not.toHaveBeenCalled()
  })
})

describe('social.updateVariant', () => {
  const content = {
    body: 'Tickets are live 🎟️',
    link: 'https://2027.cloudnativebergen.dev/tickets?utm_campaign=x',
    attachments: [
      {
        source: 'att-1',
        // A 1.91:1 window on the 2000×1000 source (LinkedIn's feed aspect).
        crop: { x: 0.02, y: 0, width: 0.955, height: 1 },
        altOverride: 'Crowd at the keynote',
      },
    ],
  }

  it('saves body, link, attachments and a custom time with compare-and-set', async () => {
    const result = await social().updateVariant({
      variantId: 'variant-ours',
      rev: 'rev-7',
      ...content,
      timing: { mode: 'custom', scheduledAt: '2026-10-05T14:00:00+02:00' },
    })
    expect(result).toEqual({ success: true })
    expect(h.updateSocialVariantContent).toHaveBeenCalledWith(
      'variant-ours',
      {
        body: 'Tickets are live 🎟️',
        link: 'https://2027.cloudnativebergen.dev/tickets?utm_campaign=x',
        attachments: content.attachments,
        scheduledAt: '2026-10-05T12:00:00.000Z',
        usesCustomTime: true,
      },
      { ifRevision: 'rev-7' },
    )
  })

  it('re-attaches to the post default time when timing follows the post', async () => {
    await social().updateVariant({
      variantId: 'variant-ours',
      rev: 'rev-7',
      body: 'x',
      link: null,
      attachments: [],
      timing: { mode: 'default' },
    })
    expect(h.updateSocialVariantContent).toHaveBeenCalledWith(
      'variant-ours',
      expect.objectContaining({
        scheduledAt: '2026-10-01T08:00:00.000Z',
        usesCustomTime: false,
        link: null,
      }),
      // Following the default: the post is compare-and-set too, so a
      // default-time cascade racing this save cannot strand the variant.
      {
        ifRevision: 'rev-7',
        followsPost: { id: 'post-ours', rev: 'post-rev-3' },
      },
    )
  })

  it('refuses a body over the platform limit and never writes', async () => {
    h.getSocialPostVariant.mockResolvedValue(variant({ platform: 'bluesky' }))
    await expect(
      social().updateVariant({
        variantId: 'variant-ours',
        rev: 'rev-7',
        body: 'a'.repeat(301),
        link: null,
        attachments: [],
        timing: { mode: 'default' },
      }),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: expect.stringMatching(/301.*300/),
    })
    expect(h.updateSocialVariantContent).not.toHaveBeenCalled()
  })

  it('refuses an attachment whose alt override blanks the alt text on Bluesky', async () => {
    h.getSocialPostVariant.mockResolvedValue(variant({ platform: 'bluesky' }))
    await expect(
      social().updateVariant({
        variantId: 'variant-ours',
        rev: 'rev-7',
        body: 'x',
        link: null,
        attachments: [{ source: 'att-1', crop: null, altOverride: '  ' }],
        timing: { mode: 'default' },
      }),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: expect.stringMatching(/alt/i),
    })
    expect(h.updateSocialVariantContent).not.toHaveBeenCalled()
  })

  it('refuses a crop override that is not the platform aspect', async () => {
    await expect(
      social().updateVariant({
        variantId: 'variant-ours',
        rev: 'rev-7',
        body: 'x',
        link: null,
        attachments: [
          {
            source: 'att-1',
            // A square window on a 1.91:1 platform (LinkedIn).
            crop: { x: 0, y: 0, width: 0.5, height: 1 },
            altOverride: null,
          },
        ],
        timing: { mode: 'default' },
      }),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: expect.stringMatching(/aspect/),
    })
    expect(h.updateSocialVariantContent).not.toHaveBeenCalled()
  })

  it('refuses an attachment that is not on the post', async () => {
    await expect(
      social().updateVariant({
        variantId: 'variant-ours',
        rev: 'rev-7',
        body: 'x',
        link: null,
        attachments: [{ source: 'att-missing', crop: null, altOverride: null }],
        timing: { mode: 'default' },
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    expect(h.updateSocialVariantContent).not.toHaveBeenCalled()
  })

  it.each(['publishing', 'awaiting-manual', 'published'] as const)(
    'refuses to edit a %s variant',
    async (status) => {
      h.getSocialPostVariant.mockResolvedValue(variant({ status }))
      await expect(
        social().updateVariant({
          variantId: 'variant-ours',
          rev: 'rev-7',
          body: 'x',
          link: null,
          attachments: [],
          timing: { mode: 'default' },
        }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
      expect(h.updateSocialVariantContent).not.toHaveBeenCalled()
    },
  )

  it('compare-and-sets on the revision the EDITOR loaded, not the one just read', async () => {
    h.getSocialPostVariant.mockResolvedValue(variant({ _rev: 'rev-9' }))
    await social().updateVariant({
      variantId: 'variant-ours',
      rev: 'rev-7',
      body: 'x',
      link: null,
      attachments: [],
      timing: { mode: 'default' },
    })
    expect(h.updateSocialVariantContent).toHaveBeenCalledWith(
      'variant-ours',
      expect.anything(),
      expect.objectContaining({ ifRevision: 'rev-7' }),
    )
  })

  it('refuses an empty body on a platform with no rules', async () => {
    h.getSocialPostVariant.mockResolvedValue(variant({ platform: 'mastodon' }))
    await expect(
      social().updateVariant({
        variantId: 'variant-ours',
        rev: 'rev-7',
        body: '   ',
        link: null,
        attachments: [],
        timing: { mode: 'default' },
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    expect(h.updateSocialVariantContent).not.toHaveBeenCalled()
  })

  it('surfaces a lost compare-and-set as CONFLICT', async () => {
    h.updateSocialVariantContent.mockResolvedValue(false)
    await expect(
      social().updateVariant({
        variantId: 'variant-ours',
        rev: 'rev-7',
        body: 'x',
        link: null,
        attachments: [],
        timing: { mode: 'default' },
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
  })

  it("refuses another conference's variant before reading it", async () => {
    await expect(
      social().updateVariant({
        variantId: 'variant-theirs',
        rev: 'rev-7',
        body: 'x',
        link: null,
        attachments: [],
        timing: { mode: 'default' },
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(h.getSocialPostVariant).not.toHaveBeenCalled()
    expect(h.updateSocialVariantContent).not.toHaveBeenCalled()
  })
})

describe('social.addPostAttachment', () => {
  it('appends an image asset with alt text to our post', async () => {
    const result = await social().addPostAttachment({
      postId: 'post-ours',
      assetId: ASSET_ID,
      alt: 'Keynote crowd',
    })
    expect(result).toEqual({ key: 'att-new' })
    expect(h.addSocialPostAttachment).toHaveBeenCalledWith(
      'post-ours',
      CONF_A,
      {
        assetId: ASSET_ID,
        alt: 'Keynote crowd',
        hotspot: null,
        crop: null,
      },
    )
  })

  it('reports a post deleted between the guard and the write as NOT_FOUND', async () => {
    h.addSocialPostAttachment.mockResolvedValue({ refused: 'post-gone' })
    await expect(
      social().addPostAttachment({
        postId: 'post-ours',
        assetId: ASSET_ID,
        alt: 'x',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it("refuses an asset only another conference's documents reference", async () => {
    h.addSocialPostAttachment.mockResolvedValue({ refused: 'foreign-asset' })
    await expect(
      social().addPostAttachment({
        postId: 'post-ours',
        assetId: ASSET_ID,
        alt: 'x',
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })

  it('refuses a Studio crop that leaves nothing of the image', async () => {
    await expect(
      social().addPostAttachment({
        postId: 'post-ours',
        assetId: ASSET_ID,
        alt: 'x',
        crop: { left: 0.6, right: 0.6, top: 0, bottom: 0 },
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    expect(h.addSocialPostAttachment).not.toHaveBeenCalled()
  })

  it('refuses an asset id that is not one of our image assets', async () => {
    await expect(
      social().addPostAttachment({
        postId: 'post-ours',
        assetId: 'https://evil.example/x.jpg',
        alt: 'x',
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    expect(h.addSocialPostAttachment).not.toHaveBeenCalled()
  })

  it("refuses another conference's post before writing", async () => {
    await expect(
      social().addPostAttachment({
        postId: 'post-theirs',
        assetId: ASSET_ID,
        alt: 'x',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(h.addSocialPostAttachment).not.toHaveBeenCalled()
  })
})

describe('social.updateVariant timing on a queued variant', () => {
  it('refuses to follow a post default that does not exist while scheduled', async () => {
    h.getSocialPostVariant.mockResolvedValue(
      variant({ status: 'scheduled', usesCustomTime: true }),
    )
    h.getSocialPostEditorInputs.mockResolvedValue({
      attachments: [],
      defaultScheduledAt: null,
    })
    await expect(
      social().updateVariant({
        variantId: 'variant-ours',
        rev: 'rev-7',
        body: 'x',
        link: null,
        attachments: [],
        timing: { mode: 'default' },
      }),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: expect.stringMatching(/no default time/),
    })
    expect(h.updateSocialVariantContent).not.toHaveBeenCalled()
  })

  it('lets a draft follow a missing default (no time yet)', async () => {
    h.getSocialPostEditorInputs.mockResolvedValue({
      attachments: [],
      defaultScheduledAt: null,
      rev: 'post-rev-3',
    })
    await social().updateVariant({
      variantId: 'variant-ours',
      rev: 'rev-7',
      body: 'x',
      link: null,
      attachments: [],
      timing: { mode: 'default' },
    })
    expect(h.updateSocialVariantContent).toHaveBeenCalledWith(
      'variant-ours',
      expect.objectContaining({ scheduledAt: null, usesCustomTime: false }),
      expect.objectContaining({ ifRevision: 'rev-7' }),
    )
  })
})
