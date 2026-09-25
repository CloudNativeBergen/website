/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  session: vi.fn(),
  organizer: vi.fn(),
  orgId: vi.fn(),
  move: vi.fn(),
  create: vi.fn(),
  orphan: vi.fn(),
  guard: vi.fn(),
  afterTasks: [] as (() => unknown)[],
}))
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: (task: () => unknown) => h.afterTasks.push(task),
}))
vi.mock('@/lib/auth', () => ({ getAuthSession: h.session }))
vi.mock('@/lib/authz/organizer', () => ({
  isOrganizerForCurrentOrg: h.organizer,
  resolveCurrentOrgId: h.orgId,
}))
vi.mock('@/lib/marketing-asset/move', () => ({ moveBlobToSanity: h.move }))
vi.mock('@/lib/marketing-asset/sanity', () => ({
  createMarketingAsset: h.create,
}))
// The guard itself is proven against the tenancy reads in
// `src/server/routers/marketingAsset.test.ts`; here, that the route asks it
// first and obeys its answer.
vi.mock('@/lib/marketing-asset/guard', () => ({
  requireAssetDetailsInCurrentOrg: h.guard,
}))
vi.mock('@/lib/sanity/orphaned-asset', () => ({
  deleteImageAssetIfOrphaned: h.orphan,
}))

import { POST, maxDuration } from './route'
import { SANITY_UPLOAD_DEADLINE_MS } from '@/lib/marketing-asset/image-type'

const URL_OK =
  'https://abc.public.blob.vercel-storage.com/marketing-asset/org-A/1790000000000-logo-X1.png'

function request(body: unknown) {
  return new Request('http://localhost/api/admin/marketing-assets', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}
const VALID = {
  url: URL_OK,
  title: 'Logo',
  alt: 'The Cloud Native Days logo',
  scope: 'organization',
}
const PARSED = {
  title: 'Logo',
  alt: 'The Cloud Native Days logo',
  scope: 'organization',
  tags: [],
}

beforeEach(() => {
  vi.clearAllMocks()
  h.afterTasks = []
  h.session.mockResolvedValue({ speaker: { _id: 'sp-1' } })
  h.organizer.mockResolvedValue(true)
  h.orgId.mockResolvedValue('org-A')
  h.move.mockResolvedValue({
    ok: true,
    asset: {
      _id: 'image-a-800x600-png',
      url: 'https://cdn/x.png',
      width: 800,
      height: 600,
      created: true,
    },
  })
  h.create.mockResolvedValue({ _id: 'asset-1' })
  h.orphan.mockResolvedValue({ deleted: true })
  h.guard.mockResolvedValue(undefined)
})

describe('the marketing asset move route', () => {
  it('declares an explicit maxDuration the Sanity upload deadline fits inside', () => {
    expect(maxDuration).toBe(60)
    // Room left after the upload gives up, for the blob delete and the answer.
    expect(
      maxDuration * 1000 - SANITY_UPLOAD_DEADLINE_MS,
    ).toBeGreaterThanOrEqual(10_000)
  })

  it('refuses a non-organizer before the body is read', async () => {
    h.organizer.mockResolvedValue(false)
    const req = request(VALID)
    const json = vi.spyOn(req, 'json')
    expect((await POST(req)).status).toBe(401)
    expect(json).not.toHaveBeenCalled()
    expect(h.move).not.toHaveBeenCalled()
  })

  it('refuses when the organization cannot be resolved', async () => {
    h.orgId.mockResolvedValue(null)
    expect((await POST(request(VALID))).status).toBe(401)
    expect(h.move).not.toHaveBeenCalled()
  })

  it.each([
    ['no alt text', { ...VALID, alt: '   ' }],
    ['no title', { ...VALID, title: '' }],
    ['no url', { title: 'x', alt: 'y', scope: 'organization' }],
    ['no scope', { url: URL_OK, title: 'x', alt: 'y' }],
    ['an edition asset with no edition', { ...VALID, scope: 'edition' }],
    [
      'too many tags',
      { ...VALID, tags: Array.from({ length: 21 }, (_, i) => `t${i}`) },
    ],
  ])('refuses %s without moving anything', async (_, body) => {
    expect((await POST(request(body))).status).toBe(400)
    expect(h.guard).not.toHaveBeenCalled()
    expect(h.move).not.toHaveBeenCalled()
  })

  it('checks the edition and subject BEFORE moving the image, and saves them', async () => {
    const body = {
      ...VALID,
      scope: 'edition',
      conferenceId: 'conf-A',
      subject: { type: 'speaker', id: 'sp-ada' },
      tags: ['Speaker Card'],
      credit: 'Jane',
    }
    expect((await POST(request(body))).status).toBe(200)
    const details = {
      ...PARSED,
      scope: 'edition',
      conferenceId: 'conf-A',
      subject: { type: 'speaker', id: 'sp-ada' },
      tags: ['speaker card'],
      credit: 'Jane',
    }
    expect(h.guard).toHaveBeenCalledWith(details)
    expect(h.guard.mock.invocationCallOrder[0]).toBeLessThan(
      h.move.mock.invocationCallOrder[0],
    )
    expect(h.create.mock.calls[0][0].details).toEqual(details)
  })

  it('refuses an edition or subject the guard refuses, and moves nothing', async () => {
    h.guard.mockRejectedValue(
      Object.assign(new Error('No speaker with that id for this request'), {
        code: 'NOT_FOUND',
      }),
    )
    const response = await POST(
      request({ ...VALID, subject: { type: 'speaker', id: 'sp-theirs' } }),
    )
    expect(response.status).toBe(400)
    expect((await response.json()).error).toMatch(
      /not one of this organization/,
    )
    expect(h.move).not.toHaveBeenCalled()
    expect(h.create).not.toHaveBeenCalled()
  })

  it('moves for the SERVER-resolved organization, ignoring any the client sends', async () => {
    const response = await POST(
      request({ ...VALID, orgId: 'org-B', organization: 'org-B' }),
    )
    expect(response.status).toBe(200)
    expect(h.move).toHaveBeenCalledWith(URL_OK, 'org-A')
    expect(h.create).toHaveBeenCalledWith(
      {
        orgId: 'org-A',
        details: PARSED,
        imageAssetId: 'image-a-800x600-png',
        createdImageAssetId: 'image-a-800x600-png',
      },
      { signal: expect.any(AbortSignal) },
    )
    expect(await response.json()).toEqual({
      _id: 'asset-1',
      softOnSocial: true,
    })
  })

  it.each([
    ['host', 400, 'That upload is not one of ours.'],
    ['prefix', 400, 'That upload is not one of ours.'],
    ['type', 400, 'Only PNG, JPEG and WebP images can be added.'],
    ['size', 400, 'The image is larger than 20 MB.'],
    ['fetch', 502, 'The upload could not be read. Try again.'],
    ['upload', 502, 'The image could not be stored. Try again.'],
  ] as const)(
    'a %s refusal from the move saves nothing',
    async (reason, status, message) => {
      h.move.mockResolvedValue({ ok: false, reason })
      const response = await POST(request(VALID))
      expect(response.status).toBe(status)
      expect((await response.json()).error).toBe(message)
      expect(h.create).not.toHaveBeenCalled()
    },
  )

  it('records no created image when Sanity handed back one it already held', async () => {
    h.move.mockResolvedValue({
      ok: true,
      asset: {
        _id: 'image-shared-800x600-png',
        url: 'https://cdn/x.png',
        width: 800,
        height: 600,
        created: false,
      },
    })
    await POST(request(VALID))
    expect(h.create.mock.calls[0][0]).not.toHaveProperty('createdImageAssetId')
    expect(h.create.mock.calls[0][0].imageAssetId).toBe(
      'image-shared-800x600-png',
    )
  })

  it('keeps an image Sanity already held (another tenant may need it) when the entry cannot be written', async () => {
    h.move.mockResolvedValue({
      ok: true,
      asset: {
        _id: 'image-shared-800x600-png',
        url: 'https://cdn/x.png',
        width: 800,
        height: 600,
        created: false,
      },
    })
    h.create.mockRejectedValue(new Error('sanity down'))
    expect((await POST(request(VALID))).status).toBe(500)
    for (const task of h.afterTasks) await task()
    expect(h.orphan).not.toHaveBeenCalled()
  })

  it('removes the fresh image when the gallery entry cannot be written', async () => {
    h.create.mockRejectedValue(new Error('sanity down'))
    expect((await POST(request(VALID))).status).toBe(500)
    for (const task of h.afterTasks) await task()
    expect(h.orphan).toHaveBeenCalledWith('image-a-800x600-png')
  })

  it('gives up on a gallery write that stalls, answering inside maxDuration', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    try {
      let signal: AbortSignal | undefined
      h.create.mockImplementation(
        (_input: unknown, options: { signal: AbortSignal }) => {
          signal = options.signal
          return new Promise((_, reject) =>
            options.signal.addEventListener('abort', () =>
              reject(new Error('aborted')),
            ),
          )
        },
      )
      const answered = POST(request(VALID))
      await vi.advanceTimersByTimeAsync(maxDuration * 1000 - 3_001)
      expect(signal?.aborted).toBe(false)
      await vi.advanceTimersByTimeAsync(1)
      expect(signal?.aborted).toBe(true)
      expect((await answered).status).toBe(500)
    } finally {
      vi.useRealTimers()
    }
  })

  it('answers a failed write without waiting on the image cleanup, which runs after', async () => {
    h.create.mockRejectedValue(new Error('sanity down'))
    h.orphan.mockImplementation(() => new Promise(() => {}))
    expect((await POST(request(VALID))).status).toBe(500)
    expect(h.orphan).not.toHaveBeenCalled()
    expect(h.afterTasks).toHaveLength(1)
    void h.afterTasks[0]()
    expect(h.orphan).toHaveBeenCalledWith('image-a-800x600-png')
  })
})
