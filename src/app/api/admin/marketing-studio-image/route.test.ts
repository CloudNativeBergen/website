/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TRPCError } from '@trpc/server'
const h = vi.hoisted(() => ({
  binding: {} as { taskId?: string; rev?: string; fields?: unknown },
  organizer: vi.fn(),
  guard: vi.fn(),
  read: vi.fn(),
  upload: vi.fn(),
  commit: vi.fn(),
  revision: vi.fn(),
  set: vi.fn(),
  deleteOrphan: vi.fn(),
  recorded: [] as string[],
}))
// Recording and retiring are proven on real patches in
// `src/lib/marketing/replaced-renders.test.ts`; here, what the route records
// in its binding patch and what it offers for retiring afterwards.
vi.mock('@/lib/marketing/replaced-renders', () => ({
  retireReplacedRenders: h.deleteOrphan,
  recordReplacedRender: (patch: unknown, id: string) => {
    h.recorded.push(id)
    return patch
  },
}))
vi.mock('@/lib/auth', () => ({
  getAuthSession: vi.fn(async () => ({ speaker: { _id: 'organizer' } })),
}))
vi.mock('@/lib/authz/organizer', () => ({
  isOrganizerForCurrentOrg: h.organizer,
}))
vi.mock('@/server/tenancy', () => ({
  requireDocumentInCurrentConference: h.guard,
}))
vi.mock('@/lib/marketing/render-sanity', () => ({ getStudioTask: h.read }))
vi.mock('@/lib/sanity/client', () => ({
  clientWrite: {
    assets: { upload: h.upload },
    patch: (taskId: string) => {
      h.binding.taskId = taskId
      return { ifRevisionId: h.revision, set: h.set }
    },
  },
}))
import { POST } from './route'

function request(taskId = 'render', type = 'image/png', withFile = true) {
  const form = new FormData()
  form.set('taskId', taskId)
  if (withFile) form.set('file', new File(['raster'], 'render.png', { type }))
  return new Request('http://localhost/api/admin/marketing-studio-image', {
    method: 'POST',
    body: form,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  h.organizer.mockResolvedValue(true)
  h.guard.mockResolvedValue('conference')
  h.read.mockResolvedValue({ _id: 'render', _rev: 'r1', kind: 'studioRender' })
  h.upload.mockResolvedValue({
    _id: 'image-render-1200x630-png',
    url: 'https://example.com/render.png',
  })
  h.binding = {}
  h.revision.mockImplementation((rev: string) => {
    h.binding.rev = rev
    return { set: h.set }
  })
  h.set.mockImplementation((fields: unknown) => {
    h.binding.fields = fields
    return { commit: h.commit }
  })
  h.commit.mockResolvedValue({ _rev: 'r2' })
  h.recorded = []
  h.deleteOrphan.mockResolvedValue({
    id: null,
    deleted: false,
    remainingReferences: 0,
  })
})

describe('a replaced pending upload (#1162)', () => {
  const OLD = 'image-oldpending-1200x630-png'
  it('offers the upload it replaces to the orphan check, after the binding commits', async () => {
    h.read.mockResolvedValue({
      _id: 'render',
      _rev: 'r1',
      kind: 'studioRender',
      pendingAssetId: OLD,
      assetId: 'image-saved-png',
    })
    h.commit.mockImplementation(async () => {
      // Recorded in the binding patch itself, before anything is retired.
      expect(h.recorded).toEqual([OLD])
      expect(h.deleteOrphan).not.toHaveBeenCalled()
      return { _rev: 'r2' }
    })
    expect((await POST(request())).status).toBe(200)
    expect(h.deleteOrphan).toHaveBeenCalledExactlyOnceWith('render', [OLD])
  })
  it('retries what earlier replacements recorded', async () => {
    h.read.mockResolvedValue({
      _id: 'render',
      _rev: 'r1',
      kind: 'studioRender',
      pendingAssetId: OLD,
      replacedRenders: ['image-earlier-png'],
    })
    expect((await POST(request())).status).toBe(200)
    expect(h.deleteOrphan).toHaveBeenCalledExactlyOnceWith('render', [
      'image-earlier-png',
      OLD,
    ])
  })
  it('leaves it when the same bytes came back, or it is the saved render', async () => {
    for (const pendingAssetId of [
      'image-render-1200x630-png',
      'image-saved-png',
    ]) {
      h.read.mockResolvedValue({
        _id: 'render',
        _rev: 'r1',
        kind: 'studioRender',
        pendingAssetId,
        assetId: 'image-saved-png',
      })
      expect((await POST(request())).status).toBe(200)
    }
    // Nothing new is recorded or offered.
    expect(h.recorded).toEqual([])
    expect(h.deleteOrphan.mock.calls).toEqual([
      ['render', []],
      ['render', []],
    ])
  })
  it('keeps it when the binding loses a race', async () => {
    h.read.mockResolvedValue({
      _id: 'render',
      _rev: 'r1',
      kind: 'studioRender',
      pendingAssetId: OLD,
    })
    h.commit.mockRejectedValueOnce(
      Object.assign(new Error('revision mismatch'), { statusCode: 409 }),
    )
    expect((await POST(request())).status).toBe(409)
    expect(h.deleteOrphan).not.toHaveBeenCalled()
  })
})

describe('studio upload provenance', () => {
  it('refuses callers outside the current organization', async () => {
    h.organizer.mockResolvedValue(false)
    expect((await POST(request())).status).toBe(401)
    expect(h.read).not.toHaveBeenCalled()
  })
  it('refuses a foreign Task before its content read or upload', async () => {
    h.guard.mockRejectedValue(new TRPCError({ code: 'NOT_FOUND' }))
    expect((await POST(request('foreign'))).status).toBe(404)
    expect(h.read).not.toHaveBeenCalled()
    expect(h.upload).not.toHaveBeenCalled()
  })
  it('rejects missing Tasks', async () => {
    h.read.mockResolvedValue(null)
    expect((await POST(request())).status).toBe(404)
  })
  it('rejects other Task kinds', async () => {
    h.read.mockResolvedValue({ _id: 'render', _rev: 'r1', kind: 'checklist' })
    expect((await POST(request())).status).toBe(400)
  })
  it('binds the uploaded raster to this Task with its revision and returns the new revision', async () => {
    const response = await POST(request())
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      assetId: 'image-render-1200x630-png',
      url: 'https://example.com/render.png',
      taskRev: 'r2',
    })
    expect(h.guard).toHaveBeenCalledWith('render', 'marketingTask')
    expect(h.read).toHaveBeenCalledWith('render', 'conference')
    expect(h.binding).toEqual({
      taskId: 'render',
      rev: 'r1',
      fields: {
        pendingStudioAsset: {
          _type: 'image',
          asset: { _type: 'reference', _ref: 'image-render-1200x630-png' },
        },
      },
    })
    expect(h.set).toHaveBeenCalledWith({
      pendingStudioAsset: {
        _type: 'image',
        asset: { _type: 'reference', _ref: 'image-render-1200x630-png' },
      },
    })
    expect(h.upload).toHaveBeenCalledWith('image', Buffer.from('raster'), {
      filename: 'render.png',
    })
  })
  it('returns CONFLICT if the Task changes before upload binding commits', async () => {
    h.commit.mockRejectedValueOnce(
      Object.assign(new Error('revision mismatch'), { statusCode: 409 }),
    )
    expect((await POST(request())).status).toBe(409)
  })
  it('refuses oversized rasters', async () => {
    const form = new FormData()
    form.set('taskId', 'render')
    form.set(
      'file',
      new File([new Uint8Array(20 * 1024 * 1024 + 1)], 'large.png', {
        type: 'image/png',
      }),
    )
    expect(
      (
        await POST(
          new Request('http://localhost/upload', {
            method: 'POST',
            body: form,
          }),
        )
      ).status,
    ).toBe(400)
  })
  it.each([
    ['', 'image/png', true],
    ['render', 'text/plain', true],
    ['render', 'image/png', false],
  ] as const)(
    'refuses malformed upload (%s, %s, %s)',
    async (taskId, type, withFile) => {
      expect((await POST(request(taskId, type, withFile))).status).toBe(400)
    },
  )
})

/**
 * The first bytes of a PNG of `width` × `height`: the signature and the
 * IHDR chunk, which is where a PNG says its size. Enough for the route,
 * which reads nothing past the header before it uploads.
 */
function pngOf(width: number, height: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(33)
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const view = new DataView(bytes.buffer)
  view.setUint32(8, 13)
  bytes.set([0x49, 0x48, 0x44, 0x52], 12)
  view.setUint32(16, width)
  view.setUint32(20, height)
  bytes.set([8, 6, 0, 0, 0], 24)
  return bytes
}

function formatRequest(
  format: string,
  bytes: Uint8Array<ArrayBuffer>,
  type = 'image/png',
) {
  const form = new FormData()
  form.set('taskId', 'render')
  form.set('format', format)
  form.set('file', new File([bytes], 'render.png', { type }))
  return new Request('http://localhost/api/admin/marketing-studio-image', {
    method: 'POST',
    body: form,
  })
}

describe('the Format of a render Task (Formats spec §4)', () => {
  beforeEach(() => {
    h.read.mockResolvedValue({
      _id: 'render',
      _rev: 'r1',
      kind: 'studioRender',
      format: 'landscape',
    })
  })

  it('takes a capture in the Task’s Format at exactly its pixels', async () => {
    expect(
      (await POST(formatRequest('landscape', pngOf(1200, 628)))).status,
    ).toBe(200)
    expect(h.upload).toHaveBeenCalledOnce()
  })

  it('refuses a capture in another Format, naming both, before anything is uploaded', async () => {
    const response = await POST(formatRequest('square', pngOf(1080, 1080)))
    expect(response.status).toBe(400)
    expect((await response.json()).error).toBe(
      'This Task asks for Landscape (1200×628), and the studio is showing Square (1080×1080). Switch the studio to Landscape, or change the Format on the Task.',
    )
    expect(h.upload).not.toHaveBeenCalled()
  })

  it('refuses a capture that says the Task’s Format but is not its pixels', async () => {
    for (const bytes of [pngOf(1080, 1080), pngOf(1200, 629), pngOf(0, 0)]) {
      const response = await POST(formatRequest('landscape', bytes))
      expect(response.status).toBe(400)
      expect((await response.json()).error).toBe(
        'The image is not Landscape (1200×628). Make it again in the studio.',
      )
    }
    // A JPEG cannot be measured here (the studio captures PNG): refused too.
    const jpeg = new Uint8Array(33)
    jpeg.set([0xff, 0xd8, 0xff, 0xe0])
    expect(
      (await POST(formatRequest('landscape', jpeg, 'image/jpeg'))).status,
    ).toBe(400)
    expect(h.upload).not.toHaveBeenCalled()
  })

  it('reads a render Task without a Format as square', async () => {
    h.read.mockResolvedValue({
      _id: 'render',
      _rev: 'r1',
      kind: 'studioRender',
      format: null,
    })
    expect(
      (await POST(formatRequest('square', pngOf(1080, 1080)))).status,
    ).toBe(200)
    expect(
      (await POST(formatRequest('landscape', pngOf(1200, 628)))).status,
    ).toBe(400)
  })

  it('refuses a value that is no Format', async () => {
    expect((await POST(formatRequest('banner', pngOf(1200, 628)))).status).toBe(
      400,
    )
    expect(h.upload).not.toHaveBeenCalled()
  })

  it('takes a capture from a tab without a Format switch as it is', async () => {
    // The meme generator, collage and promo (Formats spec §1): no `format`.
    expect((await POST(request())).status).toBe(200)
  })
})
