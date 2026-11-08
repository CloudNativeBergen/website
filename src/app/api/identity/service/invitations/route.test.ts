/**
 * @vitest-environment node
 *
 * #2130: the site end of identity invitation delivery. Only a tenant-directory
 * assertion for the invitations audience, over the exact body, sends mail.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

// vitest.config.ts stubs `jose`; load the real one so signatures are checked.
vi.mock('jose', async () => {
  const { createRequire } = await import('node:module')
  const { pathToFileURL } = await import('node:url')
  const require = createRequire(import.meta.url)
  return import(pathToFileURL(require.resolve('jose')).href)
})
vi.mock('next/cache', () => ({ unstable_noStore: () => {} }))
const sendEmail = vi.fn()
vi.mock('@/lib/cospeaker/server', () => ({
  sendEmail: (...a: unknown[]) => sendEmail(...a),
}))

const { SignJWT, exportSPKI, generateKeyPair } = await import('jose')
const { POST } = await import('./route')
const { bodyHash } = await import('@/lib/provisioning/service')

const BODY = JSON.stringify({
  invitationId: 'inv_abc123',
  email: 'new@nova.org',
  orgId: 'organization.nova',
  orgName: 'Nova',
  inviterName: 'Ada',
})
let key: CryptoKey

beforeAll(async () => {
  const pair = await generateKeyPair('EdDSA')
  key = pair.privateKey
  process.env.TENANT_DIRECTORY_PUBLIC_KEYS = JSON.stringify({
    td1: await exportSPKI(pair.publicKey),
  })
})
beforeEach(() => {
  sendEmail.mockResolvedValue({ success: true })
})

const sign = (over: { body?: string; aud?: string } = {}) => {
  const now = Math.floor(Date.now() / 1000)
  return new SignJWT({ bh: bodyHash(over.body ?? BODY) })
    .setProtectedHeader({ alg: 'EdDSA', kid: 'td1' })
    .setIssuer('konf-tenant-directory')
    .setAudience(over.aud ?? 'konf-site-invitations')
    .setSubject('user_inviter')
    .setIssuedAt(now)
    .setExpirationTime(now + 60)
    .sign(key)
}
const post = (assertion?: string, body = BODY) =>
  POST(
    new NextRequest('https://site.test/api/identity/service/invitations', {
      method: 'POST',
      headers: assertion ? { 'x-konf-service': assertion } : {},
      body,
    }),
  )

describe('POST /api/identity/service/invitations', () => {
  it('sends exactly one email with the org, the inviter and an id.konf.app link', async () => {
    const res = await post(await sign())
    expect(res.status).toBe(200)
    expect(sendEmail).toHaveBeenCalledTimes(1)
    const arg = sendEmail.mock.calls[0][0]
    expect(arg.to).toBe('new@nova.org')
    expect(arg.orgId).toBe('organization.nova')
    expect(arg.props).toEqual({
      orgName: 'Nova',
      inviterName: 'Ada',
      invitationUrl: 'https://id.konf.app/invite/inv_abc123',
    })
  })

  it('refuses a provisioning-audience assertion', async () => {
    const res = await post(await sign({ aud: 'konf-site-provisioning' }))
    expect(res.status).toBe(401)
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('refuses an assertion over another body', async () => {
    const other = BODY.replace('new@nova.org', 'evil@x.org')
    const res = await post(await sign(), other)
    expect(res.status).toBe(401)
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('refuses a missing assertion', async () => {
    expect((await post()).status).toBe(401)
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('refuses an id that could change the link path', async () => {
    const body = BODY.replace('inv_abc123', '../evil')
    const res = await post(await sign({ body }), body)
    expect(res.status).toBe(400)
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('reports a failed send', async () => {
    sendEmail.mockResolvedValue({ success: false })
    expect((await post(await sign())).status).toBe(502)
  })
})
