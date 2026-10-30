/**
 * @vitest-environment node
 */
const upload = vi.fn()
vi.mock('@/lib/auth', () => ({ getAuthSession: async () => ({ speaker: {} }) }))
vi.mock('@/lib/authz/organizer', () => ({
  isOrganizerForCurrentOrg: async () => true,
}))
vi.mock('@/lib/sanity/client', () => ({
  clientWrite: { assets: { upload: (...a: unknown[]) => upload(...a) } },
}))

import { POST } from './route'

function post(file: File) {
  const body = new FormData()
  body.set('file', file)
  return POST(
    new Request('http://x/api/admin/speaker-image', { method: 'POST', body }),
  )
}

describe('POST /api/admin/speaker-image', () => {
  beforeEach(() => upload.mockReset().mockResolvedValue({ _id: 'a', url: 'u' }))

  it('rejects a non-image file', async () => {
    const res = await post(new File(['x'], 'x.html', { type: 'text/html' }))
    expect(res.status).toBe(400)
    expect(upload).not.toHaveBeenCalled()
  })

  it('rejects a file over 10MB', async () => {
    const big = new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'a.png', {
      type: 'image/png',
    })
    expect((await post(big)).status).toBe(400)
    expect(upload).not.toHaveBeenCalled()
  })

  it('uploads an image', async () => {
    const res = await post(new File(['x'], 'a.png', { type: 'image/png' }))
    expect(res.status).toBe(200)
    expect(upload).toHaveBeenCalledOnce()
  })
})
