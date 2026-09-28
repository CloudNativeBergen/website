/** @vitest-environment node */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TRPCError } from '@trpc/server'

const h = vi.hoisted(() => ({
  session: vi.fn(),
  organizer: vi.fn(),
  guard: vi.fn(),
  gif: vi.fn(),
  upstream: vi.fn(),
}))
vi.mock('@/lib/auth', () => ({ getAuthSession: h.session }))
vi.mock('@/lib/authz/organizer', () => ({
  isOrganizerForCurrentOrg: h.organizer,
}))
vi.mock('@/server/tenancy', () => ({ requireDocumentInCurrentOrg: h.guard }))
vi.mock('@/lib/marketing-asset/sanity', () => ({
  readMarketingAssetGif: h.gif,
}))

import { GET } from './route'

const GIF_URL = 'https://cdn.sanity.io/images/proj/production/abc-480x480.gif'
const BYTES = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 1, 2])

const get = (query: string) =>
  GET(
    new Request(
      `http://localhost/api/admin/marketing-assets/original?${query}`,
    ),
  )

async function expectTheOneRefusal(response: Response) {
  expect(response.status).toBe(404)
  expect(await response.json()).toEqual({ error: 'GIF not found' })
  expect(h.upstream).not.toHaveBeenCalled()
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('fetch', h.upstream)
  vi.stubEnv('NEXT_PUBLIC_SANITY_PROJECT_ID', 'proj')
  vi.stubEnv('NEXT_PUBLIC_SANITY_DATASET', 'production')
  h.session.mockResolvedValue({ speaker: { _id: 'organizer' } })
  h.organizer.mockResolvedValue(true)
  h.guard.mockImplementation(async (id: string) => {
    if (id === 'wave') return 'org-ours'
    throw new TRPCError({ code: 'NOT_FOUND', message: 'No such document' })
  })
  h.gif.mockResolvedValue({ title: 'Wave, hello!', url: GIF_URL })
  h.upstream.mockResolvedValue(
    new Response(BYTES, {
      status: 200,
      headers: { 'content-type': 'image/gif', 'content-length': '8' },
    }),
  )
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('the GIF original route (#1167)', () => {
  it('relays the unchanged bytes of the parameterless URL as an attachment', async () => {
    const response = await get('asset=wave')
    expect(response.status).toBe(200)
    // The original: the CDN URL exactly, no rendition parameter.
    expect(h.upstream).toHaveBeenCalledWith(
      GIF_URL,
      expect.objectContaining({ redirect: 'error' }),
    )
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(BYTES)
    expect(response.headers.get('content-disposition')).toBe(
      'attachment; filename="wave-hello.gif"',
    )
    expect(response.headers.get('content-type')).toBe('image/gif')
    expect(response.headers.get('content-security-policy')).toBe('sandbox')
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(h.gif).toHaveBeenCalledWith('org-ours', 'wave')
  })

  it('refuses a non-organizer before anything is read', async () => {
    h.organizer.mockResolvedValue(false)
    await expectTheOneRefusal(await get('asset=wave'))
    expect(h.guard).not.toHaveBeenCalled()
    expect(h.gif).not.toHaveBeenCalled()
  })

  it('answers another organization’s asset as a missing one, before reading it', async () => {
    await expectTheOneRefusal(await get('asset=theirs'))
    expect(h.gif).not.toHaveBeenCalled()
  })

  it.each([
    ['a draft id', 'asset=drafts.wave'],
    ['no id', ''],
    ['a second parameter', 'asset=wave&x=1'],
  ])('refuses %s before anything is read', async (_, query) => {
    await expectTheOneRefusal(await get(query))
    expect(h.guard).not.toHaveBeenCalled()
  })

  it('refuses our asset that is not a GIF', async () => {
    h.gif.mockResolvedValue(null)
    await expectTheOneRefusal(await get('asset=wave'))
  })

  it.each([
    ['a rendition', `${GIF_URL}?w=640`],
    ['another dataset', GIF_URL.replace('production', 'development')],
    ['another host', GIF_URL.replace('cdn.sanity.io', 'evil.example')],
    ['a still image', GIF_URL.replace('.gif', '.png')],
  ])('never fetches %s', async (_, url) => {
    h.gif.mockResolvedValue({ title: 'Wave', url })
    await expectTheOneRefusal(await get('asset=wave'))
  })
})
