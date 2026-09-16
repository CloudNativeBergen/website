/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { evaluate, parse } from 'groq-js'
const h = vi.hoisted(() => ({
  fetch: vi.fn(),
  patches: [] as {
    id: string
    rev?: string
    fields?: Record<string, unknown>
    appended?: { path: string; items: unknown[] }
  }[],
  commit: vi.fn(),
}))
vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: { fetch: h.fetch },
  clientWrite: {
    transaction: () => {
      const tx = {
        patch(id: string, callback: (p: unknown) => unknown) {
          const recorded: (typeof h.patches)[number] = { id }
          h.patches.push(recorded)
          const p = {
            ifRevisionId(rev: string) {
              recorded.rev = rev
              return p
            },
            set(fields: Record<string, unknown>) {
              recorded.fields = { ...recorded.fields, ...fields }
              return p
            },
            setIfMissing() {
              return p
            },
            append(path: string, items: unknown[]) {
              recorded.appended = { path, items }
              return p
            },
          }
          callback(p)
          return tx
        },
        commit: h.commit,
      }
      return tx
    },
  },
}))
import { handoffStudioAttachment } from '@/lib/social/sanity'
import { getStudioTask, getRenderSiblings } from './render-sanity'

beforeEach(() => {
  vi.clearAllMocks()
  h.patches.length = 0
  h.commit.mockReset().mockResolvedValue({})
  h.fetch
    .mockReset()
    .mockResolvedValueOnce({
      _id: 'variant',
      _rev: 'v1',
      postId: 'post',
      status: 'draft',
    })
    .mockResolvedValueOnce({ _id: 'post', _rev: 'p1', count: 0 })
})

describe('atomic studio attachment handoff', () => {
  const image = { assetId: 'image-render-1200x630-png', alt: 'Save the date' }
  it('writes an image to the empty post AND selects its key on the variant in one revision-protected transaction', async () => {
    expect(await handoffStudioAttachment('variant', 'conference', image)).toBe(
      'attached',
    )
    expect(h.commit).toHaveBeenCalledTimes(1)
    expect(h.patches.map((p) => [p.id, p.rev])).toEqual([
      ['post', 'p1'],
      ['variant', 'v1'],
    ])
    const attachments = h.patches[0].fields?.attachments as {
      _key: string
      alt: string
      image: unknown
    }[]
    expect(attachments).toEqual([
      {
        _key: expect.any(String),
        _type: 'socialPostAttachment',
        alt: 'Save the date',
        image: {
          _type: 'image',
          asset: { _type: 'reference', _ref: image.assetId },
        },
      },
    ])
    expect(h.patches[1].appended).toEqual({
      path: 'attachments',
      items: [
        {
          _key: expect.any(String),
          _type: 'socialPostVariantAttachment',
          source: attachments[0]._key,
        },
      ],
    })
    for (const call of h.fetch.mock.calls) {
      expect(call[0]).toContain('conference._ref == $conferenceId')
      expect(call[1].conferenceId).toBe('conference')
    }
  })
  it('evaluates the real attachment-count projection and leaves an occupied post unchanged', async () => {
    // Evaluate the production GROQ, so a hardcoded zero cannot bypass occupancy.
    const dataset = [
      {
        _id: 'variant',
        _type: 'socialPostVariant',
        _rev: 'v1',
        conference: { _ref: 'conference' },
        post: { _ref: 'post' },
        status: 'draft',
      },
      {
        _id: 'post',
        _type: 'socialPost',
        _rev: 'p1',
        conference: { _ref: 'conference' },
        attachments: [{ _key: 'existing-image' }],
      },
    ]
    h.fetch.mockReset().mockImplementation(async (query, params) => {
      return (await evaluate(parse(query), { dataset, params })).get()
    })
    expect(await handoffStudioAttachment('variant', 'conference', image)).toBe(
      'occupied',
    )
    expect(h.patches).toEqual([])
  })
  it.each(['publishing', 'published'])(
    'does not mutate a %s variant',
    async (status) => {
      h.fetch
        .mockReset()
        .mockResolvedValueOnce({
          _id: 'variant',
          _rev: 'v1',
          postId: 'post',
          status,
        })
        .mockResolvedValueOnce({ _id: 'post', _rev: 'p1', count: 0 })
      expect(
        await handoffStudioAttachment('variant', 'conference', image),
      ).toBe('unavailable')
      expect(h.patches).toEqual([])
    },
  )
  it('reports a missing variant', async () => {
    h.fetch.mockReset().mockResolvedValueOnce(null)
    expect(await handoffStudioAttachment('variant', 'conference', image)).toBe(
      'unavailable',
    )
  })
  it('reports a missing post', async () => {
    h.fetch
      .mockReset()
      .mockResolvedValueOnce({
        _id: 'variant',
        _rev: 'v1',
        postId: 'post',
        status: 'draft',
      })
      .mockResolvedValueOnce(null)
    expect(await handoffStudioAttachment('variant', 'conference', image)).toBe(
      'unavailable',
    )
  })
  it('preserves a concurrent append when the post changes after the empty read', async () => {
    const post = {
      _id: 'post',
      _type: 'socialPost',
      _rev: 'p1',
      conference: { _ref: 'conference' },
      attachments: [] as unknown[],
    }
    const variant = {
      _id: 'variant',
      _type: 'socialPostVariant',
      _rev: 'v1',
      conference: { _ref: 'conference' },
      post: { _ref: 'post' },
      status: 'draft',
      attachments: [] as unknown[],
    }
    const dataset = [post, variant]
    h.fetch.mockReset().mockImplementation(async (query, params) => {
      return (await evaluate(parse(query), { dataset, params })).get()
    })
    h.commit.mockImplementation(async () => {
      // Another organizer appends after our read, before our transaction commits.
      post.attachments.push({ _key: 'concurrent-image' })
      post._rev = 'p2'
      // Validate every recorded CAS before applying any writes, like a transaction.
      for (const patch of h.patches) {
        const document = dataset.find((doc) => doc._id === patch.id)!
        if (patch.rev && patch.rev !== document._rev) {
          throw Object.assign(new Error('revision mismatch'), {
            statusCode: 409,
          })
        }
      }
      for (const patch of h.patches) {
        const document = dataset.find((doc) => doc._id === patch.id)!
        Object.assign(document, patch.fields)
        if (patch.appended?.path === 'attachments') {
          document.attachments.push(...patch.appended.items)
        }
      }
    })
    const outcome = await handoffStudioAttachment(
      'variant',
      'conference',
      image,
    ).catch((error: { statusCode: number }) => error.statusCode)
    expect({
      outcome,
      post: post.attachments,
      variant: variant.attachments,
    }).toEqual({
      outcome: 409,
      post: [{ _key: 'concurrent-image' }],
      variant: [],
    })
  })
})

describe('studio scoped reads', () => {
  it('reads upload provenance, alt and same-campaign sibling prerequisites through scope helpers', async () => {
    h.fetch
      .mockReset()
      .mockResolvedValueOnce({
        _id: 'render',
        alt: 'alt',
        pendingAssetId: 'image-id',
        assetId: null,
      })
      .mockResolvedValueOnce([])
    expect(await getStudioTask('render', 'conf')).toMatchObject({
      _id: 'render',
      pendingAssetId: 'image-id',
      alt: 'alt',
    })
    expect(await getRenderSiblings('campaign', 'conf')).toEqual([])
    expect(h.fetch.mock.calls[0][0]).toContain('pendingStudioAsset.asset._ref')
    expect(h.fetch.mock.calls[1][0]).toContain('campaign._ref == $campaignId')
    for (const [query, params] of h.fetch.mock.calls) {
      expect(query).toContain('conference._ref == $conferenceId')
      expect(params.conferenceId).toBe('conf')
    }
  })
})
