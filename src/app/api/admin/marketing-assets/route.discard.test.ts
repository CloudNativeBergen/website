/**
 * @vitest-environment node
 *
 * A request the route refuses on its DETAILS (#1167 review): the uploads it
 * names are deleted from Blob after the answer, through the REAL
 * `discardBlob` and its URL pin — only `@vercel/blob`'s `del` is replaced, at
 * the boundary. Asserted on the URLs `del` receives, never on a call to a
 * mocked discard.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  del: vi.fn(),
  guard: vi.fn(),
  afterTasks: [] as (() => unknown)[],
}))
vi.mock('server-only', () => ({}))
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: (task: () => unknown) => h.afterTasks.push(task),
}))
vi.mock('@vercel/blob', () => ({ del: h.del }))
vi.mock('@/lib/auth', () => ({
  getAuthSession: async () => ({ speaker: { _id: 'sp-1' } }),
}))
vi.mock('@/lib/authz/organizer', () => ({
  isOrganizerForCurrentOrg: async () => true,
  resolveCurrentOrgId: async () => 'org-A',
}))
// Never reached on a refusal: a call would be a move, which these must not do.
vi.mock('@/lib/marketing-asset/sanity-upload', () => ({
  uploadAssetStream: () => {
    throw new Error('nothing may be uploaded on a refusal')
  },
}))
vi.mock('@/lib/marketing-asset/sanity', () => ({
  createMarketingAsset: () => {
    throw new Error('nothing may be written on a refusal')
  },
}))
vi.mock('@/lib/marketing-asset/guard', () => ({
  resolveAssetDetailsForCurrentOrg: h.guard,
}))

import { POST } from './route'

const HOST = 'abcstore123.public.blob.vercel-storage.com'
const VIDEO = `https://${HOST}/marketing-asset/org-A/1790000000000-clip-X1.mp4`
const POSTER = `https://${HOST}/marketing-asset/org-A/1790000000001-clip-poster-X2.png`

async function post(body: unknown) {
  const response = await POST(
    new Request('http://localhost/api/admin/marketing-assets', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  )
  for (const task of h.afterTasks.splice(0)) await task()
  return response
}
const deleted = () => h.del.mock.calls.map(([url]) => url).sort()

beforeEach(() => {
  vi.clearAllMocks()
  h.afterTasks = []
  h.del.mockResolvedValue(undefined)
  h.guard.mockRejectedValue(new Error('the guard is after the details check'))
  vi.stubEnv('BLOB_READ_WRITE_TOKEN', 'vercel_blob_rw_abcstore123_secret')
})

describe('a refusal of the details deletes the uploads it names', () => {
  it.each([
    ['no title', { alt: 'A clip' }],
    ['a malformed tag list', { title: 'Clip', alt: 'A clip', tags: 'x' }],
  ])('%s: the video and its poster go', async (_, details) => {
    const response = await post({
      kind: 'video',
      url: VIDEO,
      posterUrl: POSTER,
      ...details,
    })
    expect(response.status).toBe(400)
    expect(deleted()).toEqual([VIDEO, POSTER].sort())
  })

  it('also when the kind itself is refused', async () => {
    const response = await post({
      kind: 'hologram',
      url: VIDEO,
      title: 'Clip',
      alt: 'A clip',
    })
    expect(response.status).toBe(400)
    expect(deleted()).toEqual([VIDEO])
  })

  it.each([
    [
      'another store',
      `https://otherstore9.public.blob.vercel-storage.com/marketing-asset/org-A/1790000000000-clip-X1.mp4`,
    ],
    [
      'another organization',
      `https://${HOST}/marketing-asset/org-B/1790000000000-clip-X1.mp4`,
    ],
    ['outside the gallery folder', `https://${HOST}/proposal-p1-1-slides.pdf`],
    [
      'plain http',
      `http://${HOST}/marketing-asset/org-A/1790000000000-clip-X1.mp4`,
    ],
    ['not a URL', 'marketing-asset/org-A/1790000000000-clip-X1.mp4'],
  ])('never touches a URL on %s', async (_, foreign) => {
    const response = await post({
      kind: 'video',
      url: foreign,
      posterUrl: POSTER,
      // No title: refused by the details schema, the branch under test.
      alt: 'A clip',
    })
    expect(response.status).toBe(400)
    // The pinned poster goes; the foreign URL is never handed to `del`.
    expect(deleted()).toEqual([POSTER])
  })
})

describe('a poster sent with a track is discarded, as with any kind but a video', () => {
  const TRACK = `https://${HOST}/marketing-asset/org-A/1790000000002-theme-X3.mp3`
  const TRACK_BODY = {
    kind: 'audio',
    url: TRACK,
    title: 'Theme',
    rightsConfirmed: true,
  }

  beforeEach(() => {
    // Past the guard, so the request reaches the move.
    h.guard.mockImplementation(async (details: object) => ({
      ...details,
      scope: 'organization',
    }))
    // The track's move reaches its fetch and is refused there; nothing is
    // uploaded. Its own blob goes by the move's claim either way.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 404 })),
    )
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('an own-organization poster goes', async () => {
    // The move's fetch refusal, not an earlier one: the branch under test.
    expect((await post({ ...TRACK_BODY, posterUrl: POSTER })).status).toBe(502)
    expect(deleted()).toEqual([TRACK, POSTER].sort())
  })

  it('a foreign poster is never touched', async () => {
    const foreign = `https://${HOST}/marketing-asset/org-B/1790000000001-clip-poster-X2.png`
    await post({ ...TRACK_BODY, posterUrl: foreign })
    expect(deleted()).toEqual([TRACK])
  })
})
