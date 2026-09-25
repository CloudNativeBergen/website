/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  session: vi.fn(),
  organizer: vi.fn(),
  orgId: vi.fn(),
  handleUpload: vi.fn(),
}))
vi.mock('@/lib/auth', () => ({ getAuthSession: h.session }))
vi.mock('@/lib/authz/organizer', () => ({
  isOrganizerForCurrentOrg: h.organizer,
  resolveCurrentOrgId: h.orgId,
}))
// The boundary: Vercel's handler, reduced to "ask the route what the token
// may do for this pathname".
vi.mock('@vercel/blob/client', () => ({ handleUpload: h.handleUpload }))

import { POST } from './route'

const ORG = 'org-A'
const OURS = `marketing-asset-${ORG}-1790000000000-logo.png`

function request(pathname: string) {
  return new Request(
    'http://localhost/api/admin/marketing-assets/upload-token',
    {
      method: 'POST',
      body: JSON.stringify({
        type: 'blob.generate-client-token',
        payload: {
          pathname,
          callbackUrl: '',
          clientPayload: null,
          multipart: false,
        },
      }),
    },
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  h.session.mockResolvedValue({ speaker: { _id: 'sp-1' } })
  h.organizer.mockResolvedValue(true)
  h.orgId.mockResolvedValue(ORG)
  h.handleUpload.mockImplementation(
    async ({ body, onBeforeGenerateToken }) => ({
      type: 'blob.generate-client-token',
      options: await onBeforeGenerateToken(body.payload.pathname, null, false),
    }),
  )
})

describe('the marketing asset upload token', () => {
  it('refuses a non-organizer before the body is read', async () => {
    h.organizer.mockResolvedValue(false)
    const req = request(OURS)
    const json = vi.spyOn(req, 'json')
    expect((await POST(req)).status).toBe(401)
    expect(json).not.toHaveBeenCalled()
    expect(h.handleUpload).not.toHaveBeenCalled()
  })

  it('scopes the token to this organization’s prefix, image types, the size cap and a short life', async () => {
    const before = Date.now()
    const response = await POST(request(OURS))
    expect(response.status).toBe(200)
    const { options } = await response.json()
    expect(options).toMatchObject({
      allowedContentTypes: ['image/png', 'image/jpeg', 'image/webp'],
      maximumSizeInBytes: 20 * 1024 * 1024,
      addRandomSuffix: true,
    })
    expect(options.validUntil).toBeGreaterThan(before)
    expect(options.validUntil).toBeLessThanOrEqual(Date.now() + 10 * 60 * 1000)
  })

  it.each([
    ['another organization', OURS.replace(ORG, 'org-B')],
    [
      'an organization whose id extends ours',
      `marketing-asset-${ORG}-x-1790000000000-a.png`,
    ],
    ['a proposal pathname', 'proposal-abc-1790000000000-a.pdf'],
  ])('refuses a pathname under %s', async (_, pathname) => {
    expect((await POST(request(pathname))).status).toBe(400)
  })

  it('refuses when the organization cannot be resolved', async () => {
    h.orgId.mockResolvedValue(null)
    expect((await POST(request(OURS))).status).toBe(400)
  })
})
