/** @vitest-environment node */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TRPCError } from '@trpc/server'

const h = vi.hoisted(() => ({
  session: vi.fn(),
  organizer: vi.fn(),
  guard: vi.fn(),
  assetTrack: vi.fn(),
  projectTrack: vi.fn(),
  upstream: vi.fn(),
}))
vi.mock('@/lib/auth', () => ({ getAuthSession: h.session }))
vi.mock('@/lib/authz/organizer', () => ({
  isOrganizerForCurrentOrg: h.organizer,
}))
vi.mock('@/server/tenancy', () => ({ requireDocumentInCurrentOrg: h.guard }))
vi.mock('@/lib/marketing-asset/sanity', () => ({
  readMarketingAssetTrack: h.assetTrack,
}))
vi.mock('@/lib/video-project/sanity', () => ({
  readVideoProjectTrack: h.projectTrack,
}))

import { GET } from './route'

const TRACK_URL = 'https://cdn.sanity.io/files/proj/production/abc123.mp3'
const OUR_ASSET = 'asset-ours'
const OUR_PROJECT = 'project-ours'

const get = (query: string) =>
  GET(new Request(`http://localhost/api/admin/studio-track?${query}`))

const notFound = () =>
  new TRPCError({ code: 'NOT_FOUND', message: 'No such document' })

/** The one refusal every unauthorized, foreign or missing track gets. */
async function expectTheOneRefusal(response: Response) {
  expect(response.status).toBe(404)
  expect(await response.json()).toEqual({ error: 'Track not found' })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('fetch', h.upstream)
  vi.stubEnv('NEXT_PUBLIC_SANITY_PROJECT_ID', 'proj')
  vi.stubEnv('NEXT_PUBLIC_SANITY_DATASET', 'production')
  h.session.mockResolvedValue({ speaker: { _id: 'organizer' } })
  h.organizer.mockResolvedValue(true)
  h.guard.mockImplementation(async (id: string) => {
    // A draft of ours carries our organization too: only the route's own
    // id check keeps it out.
    if (id.endsWith(OUR_ASSET) || id.endsWith(OUR_PROJECT)) return 'org-ours'
    throw notFound()
  })
  h.assetTrack.mockResolvedValue({ url: TRACK_URL, fileId: 'file-gallery' })
  h.projectTrack.mockResolvedValue({ url: TRACK_URL, fileId: 'file-held' })
  h.upstream.mockResolvedValue(
    new Response(new Uint8Array([1, 2, 3, 4]), {
      status: 200,
      headers: { 'content-type': 'audio/mpeg', 'content-length': '4' },
    }),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('streaming a gallery track', () => {
  it('streams the file for an organizer of the owning organization', async () => {
    const response = await get(`asset=${OUR_ASSET}`)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('audio/mpeg')
    expect(response.headers.get('cache-control')).toContain('private')
    expect(response.body).toBeInstanceOf(ReadableStream)
    expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([
      1, 2, 3, 4,
    ])
    expect(h.guard).toHaveBeenCalledWith(OUR_ASSET, 'marketingAsset')
    expect(h.assetTrack).toHaveBeenCalledWith('org-ours', OUR_ASSET)
    expect(h.upstream).toHaveBeenCalledWith(TRACK_URL, expect.anything())
  })

  it('streams a saved project’s track by the project', async () => {
    const response = await get(`project=${OUR_PROJECT}&file=file-held`)
    expect(response.status).toBe(200)
    expect(h.guard).toHaveBeenCalledWith(OUR_PROJECT, 'videoProject')
    expect(h.projectTrack).toHaveBeenCalledWith('org-ours', OUR_PROJECT)
    expect(h.upstream).toHaveBeenCalledWith(TRACK_URL, expect.anything())
  })
})

describe('refusals, before anything is fetched', () => {
  it('refuses a signed-out request', async () => {
    h.session.mockResolvedValue(null)
    h.organizer.mockImplementation(async (speaker: unknown) => !!speaker)
    await expectTheOneRefusal(await get(`asset=${OUR_ASSET}`))
    expect(h.guard).not.toHaveBeenCalled()
    expect(h.upstream).not.toHaveBeenCalled()
  })

  it('refuses a non-organizer, exactly as a missing track', async () => {
    h.organizer.mockResolvedValue(false)
    await expectTheOneRefusal(await get(`asset=${OUR_ASSET}`))
    expect(h.guard).not.toHaveBeenCalled()
    expect(h.assetTrack).not.toHaveBeenCalled()
    expect(h.upstream).not.toHaveBeenCalled()
  })

  it('refuses another organization’s track, exactly as a missing one', async () => {
    await expectTheOneRefusal(await get('asset=asset-theirs'))
    await expectTheOneRefusal(
      await get('project=project-theirs&file=file-held'),
    )
    expect(h.assetTrack).not.toHaveBeenCalled()
    expect(h.projectTrack).not.toHaveBeenCalled()
    expect(h.upstream).not.toHaveBeenCalled()
  })

  it('refuses an asset that holds no track (an image), exactly as a missing one', async () => {
    h.assetTrack.mockResolvedValue(null)
    await expectTheOneRefusal(await get(`asset=${OUR_ASSET}`))
    h.projectTrack.mockResolvedValue({ url: null, fileId: null })
    await expectTheOneRefusal(
      await get(`project=${OUR_PROJECT}&file=file-held`),
    )
    expect(h.upstream).not.toHaveBeenCalled()
  })

  it('refuses a draft or release id, and a request naming nothing or both', async () => {
    for (const query of [
      `asset=drafts.${OUR_ASSET}`,
      '',
      `asset=${OUR_ASSET}&project=${OUR_PROJECT}`,
      `asset=${OUR_ASSET}&project=${OUR_PROJECT}&file=file-held`,
      `asset=${OUR_ASSET}&file=file-held`,
    ])
      await expectTheOneRefusal(await get(query))
    expect(h.guard).not.toHaveBeenCalled()
    expect(h.upstream).not.toHaveBeenCalled()
  })

  it('never fetches a stored URL off the pinned Sanity files path', async () => {
    for (const url of [
      'https://evil.example/files/proj/production/abc.mp3',
      'https://cdn.sanity.io/files/other/production/abc.mp3',
      'https://cdn.sanity.io/images/proj/production/abc.png',
      'http://cdn.sanity.io/files/proj/production/abc.mp3',
      'https://cdn.sanity.io:8443/files/proj/production/abc.mp3',
    ]) {
      h.assetTrack.mockResolvedValue({ url })
      await expectTheOneRefusal(await get(`asset=${OUR_ASSET}`))
    }
    expect(h.upstream).not.toHaveBeenCalled()
  })
})

describe('a project’s track', () => {
  it('is refused once the project holds another file than the one named, and without a file named', async () => {
    await expectTheOneRefusal(
      await get(`project=${OUR_PROJECT}&file=file-replaced`),
    )
    await expectTheOneRefusal(await get(`project=${OUR_PROJECT}`))
    expect(h.upstream).not.toHaveBeenCalled()
  })
})

describe('what is sent back', () => {
  it('passes the request’s abort signal to the upstream fetch', async () => {
    const request = new Request(
      `http://localhost/api/admin/studio-track?asset=${OUR_ASSET}`,
    )
    await GET(request)
    expect(h.upstream).toHaveBeenCalledWith(
      TRACK_URL,
      expect.objectContaining({ signal: request.signal }),
    )
  })

  it('is sandboxed, and only ever labelled as audio or as bytes', async () => {
    h.upstream.mockResolvedValue(
      new Response('<script>alert(1)</script>', {
        headers: { 'content-type': 'text/html' },
      }),
    )
    const response = await get(`asset=${OUR_ASSET}`)
    expect(response.headers.get('content-type')).toBe(
      'application/octet-stream',
    )
    expect(response.headers.get('content-security-policy')).toBe('sandbox')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
  })

  it('keeps an audio type as it is', async () => {
    h.upstream.mockResolvedValue(
      new Response('x', { headers: { 'content-type': 'audio/wav' } }),
    )
    const response = await get(`asset=${OUR_ASSET}`)
    expect(response.headers.get('content-type')).toBe('audio/wav')
  })

  it('never claims the upstream’s length for a body it decoded', async () => {
    const encoded = new Response('abc', {
      headers: {
        'content-type': 'audio/mpeg',
        'content-encoding': 'gzip',
        'content-length': '3',
      },
    })
    h.upstream.mockResolvedValue(encoded)
    const response = await get(`asset=${OUR_ASSET}`)
    expect(response.headers.get('content-length')).toBeNull()
  })

  it('carries the length of a body sent as it is', async () => {
    const response = await get(`asset=${OUR_ASSET}`)
    expect(response.headers.get('content-length')).toBe('4')
  })
})

describe('which file was sent', () => {
  it('names the file it streamed, for a gallery track and a project’s alike', async () => {
    const asset = await get(`asset=${OUR_ASSET}`)
    expect(asset.headers.get('x-track-file')).toBe('file-gallery')
    const project = await get(`project=${OUR_PROJECT}&file=file-held`)
    expect(project.headers.get('x-track-file')).toBe('file-held')
  })
})

describe('an upstream failure', () => {
  it('is a 502, not the file', async () => {
    h.upstream.mockResolvedValue(new Response('nope', { status: 500 }))
    const response = await get(`asset=${OUR_ASSET}`)
    expect(response.status).toBe(502)
  })
})
