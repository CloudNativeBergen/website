/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  session: vi.fn(),
  organizer: vi.fn(),
  orgId: vi.fn(),
  move: vi.fn(),
  create: vi.fn(),
  orphan: vi.fn(),
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
vi.mock('@/lib/sanity/orphaned-asset', () => ({
  deleteImageAssetIfOrphaned: h.orphan,
}))

import { POST, maxDuration } from './route'

const URL_OK =
  'https://abc.public.blob.vercel-storage.com/marketing-asset/org-A/1790000000000-logo-X1.png'

function request(body: unknown) {
  return new Request('http://localhost/api/admin/marketing-assets', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}
const VALID = { url: URL_OK, title: 'Logo', alt: 'The Cloud Native Days logo' }

beforeEach(() => {
  vi.clearAllMocks()
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
    },
  })
  h.create.mockResolvedValue({ _id: 'asset-1' })
  h.orphan.mockResolvedValue({ deleted: true })
})

describe('the marketing asset move route', () => {
  it('declares an explicit maxDuration for the streamed move', () => {
    expect(maxDuration).toBe(60)
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
    ['no url', { title: 'x', alt: 'y' }],
  ])('refuses %s without moving anything', async (_, body) => {
    expect((await POST(request(body))).status).toBe(400)
    expect(h.move).not.toHaveBeenCalled()
  })

  it('moves for the SERVER-resolved organization, ignoring any the client sends', async () => {
    const response = await POST(
      request({ ...VALID, orgId: 'org-B', organization: 'org-B' }),
    )
    expect(response.status).toBe(200)
    expect(h.move).toHaveBeenCalledWith(URL_OK, 'org-A')
    expect(h.create).toHaveBeenCalledWith({
      orgId: 'org-A',
      title: 'Logo',
      alt: 'The Cloud Native Days logo',
      imageAssetId: 'image-a-800x600-png',
    })
    expect(await response.json()).toEqual({
      _id: 'asset-1',
      softOnSocial: true,
    })
  })

  it.each([
    ['host', 400],
    ['prefix', 400],
    ['type', 400],
    ['size', 400],
    ['fetch', 502],
    ['upload', 502],
  ] as const)(
    'a %s refusal from the move saves nothing',
    async (reason, status) => {
      h.move.mockResolvedValue({ ok: false, reason })
      const response = await POST(request(VALID))
      expect(response.status).toBe(status)
      expect((await response.json()).error).toEqual(expect.any(String))
      expect(h.create).not.toHaveBeenCalled()
    },
  )

  it('removes the fresh image when the gallery entry cannot be written', async () => {
    h.create.mockRejectedValue(new Error('sanity down'))
    expect((await POST(request(VALID))).status).toBe(500)
    expect(h.orphan).toHaveBeenCalledWith('image-a-800x600-png')
  })
})
