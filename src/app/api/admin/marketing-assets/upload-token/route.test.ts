/**
 * @vitest-environment node
 *
 * The REAL `@vercel/blob` `handleUpload` signs the token here (it runs
 * offline), and the test decodes what Vercel would enforce from the token
 * itself, rather than what the route handed a mock.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  session: vi.fn(),
  organizer: vi.fn(),
  orgId: vi.fn(),
}))
vi.mock('@/lib/auth', () => ({ getAuthSession: h.session }))
vi.mock('@/lib/authz/organizer', () => ({
  isOrganizerForCurrentOrg: h.organizer,
  resolveCurrentOrgId: h.orgId,
}))

import { POST } from './route'

const ORG = 'org-A'
const OURS = `marketing-asset/${ORG}/1790000000000-logo.png`

function request(pathname: string) {
  return new Request(
    'http://localhost/api/admin/marketing-assets/upload-token',
    {
      method: 'POST',
      body: JSON.stringify({
        type: 'blob.generate-client-token',
        payload: { pathname, clientPayload: null, multipart: false },
      }),
    },
  )
}

/** `vercel_blob_client_<store>_<base64("<hmac>.<base64(json)>")>` → json. */
function signedPayload(clientToken: string): Record<string, unknown> {
  const [, , , store, encoded] = clientToken.split('_')
  expect(store).toBe('AbC123')
  const inner = Buffer.from(encoded, 'base64').toString()
  const payload = inner.slice(inner.indexOf('.') + 1)
  return JSON.parse(Buffer.from(payload, 'base64').toString())
}

let errors: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('BLOB_READ_WRITE_TOKEN', 'vercel_blob_rw_AbC123_secretpart')
  h.session.mockResolvedValue({ speaker: { _id: 'sp-1' } })
  h.organizer.mockResolvedValue(true)
  h.orgId.mockResolvedValue(ORG)
  errors = vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => vi.unstubAllEnvs())

describe('the marketing asset upload token', () => {
  it('refuses a non-organizer before the body is read', async () => {
    h.organizer.mockResolvedValue(false)
    const req = request(OURS)
    const json = vi.spyOn(req, 'json')
    expect((await POST(req)).status).toBe(401)
    expect(json).not.toHaveBeenCalled()
  })

  it('signs a token for exactly this pathname, image types, the size cap and a short life', async () => {
    const before = Date.now()
    const response = await POST(request(OURS))
    expect(response.status).toBe(200)
    const { clientToken } = await response.json()
    const signed = signedPayload(clientToken)
    expect(signed).toMatchObject({
      pathname: OURS,
      allowedContentTypes: [
        'image/png',
        'image/jpeg',
        'image/webp',
        'audio/mpeg',
        'audio/mp4',
        'audio/wav',
      ],
      maximumSizeInBytes: 20 * 1024 * 1024,
      addRandomSuffix: true,
    })
    // No completion callback: the move is the only way in.
    expect(signed.onUploadCompleted).toBeUndefined()
    expect(signed.allowOverwrite).toBeUndefined()
    expect(signed.validUntil).toBeGreaterThan(before)
    expect(signed.validUntil).toBeLessThanOrEqual(Date.now() + 10 * 60 * 1000)
  })

  it.each([
    ['another organization', OURS.replace(ORG, 'org-B')],
    [
      'an organization whose id extends ours',
      `marketing-asset/${ORG}-x/1790000000000-a.png`,
    ],
    ['a proposal pathname', 'proposal-abc-1790000000000-a.pdf'],
  ])(
    'refuses a pathname under %s, by the pathname check',
    async (_, pathname) => {
      expect((await POST(request(pathname))).status).toBe(400)
      expect(String(errors.mock.calls[0]?.[1])).toContain(
        'Invalid pathname for a marketing asset',
      )
    },
  )

  it('refuses when the organization cannot be resolved', async () => {
    h.orgId.mockResolvedValue(null)
    expect((await POST(request(OURS))).status).toBe(400)
    expect(String(errors.mock.calls[0]?.[1])).toContain(
      'Invalid pathname for a marketing asset',
    )
  })
})
