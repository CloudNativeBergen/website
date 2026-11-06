import { createHmac } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { pushEvent, signPush } from './push'

const env = {
  PUSH_WEBHOOK_URL: 'https://kontroll.test/api/push/events',
  PUSH_WEBHOOK_SECRET: 'whsec-test',
}
const post = vi.fn()
beforeEach(() => {
  post.mockReset()
  post.mockResolvedValue(new Response(null, { status: 204 }))
  vi.stubGlobal('fetch', post)
})
afterEach(() => vi.unstubAllGlobals())

describe('pushEvent', () => {
  it('signs `${timestamp}.${body}` with HMAC-SHA256, as a reference HMAC does', async () => {
    await pushEvent(env, { type: 'membership.drift', organizationId: 'o1' })
    const [url, init] = post.mock.calls[0]
    const ts = init.headers['x-konf-timestamp']
    const body = init.body as string
    expect(url).toBe(env.PUSH_WEBHOOK_URL)
    expect(Math.abs(Number(ts) - Date.now() / 1000)).toBeLessThan(5)
    expect(init.headers['x-konf-signature']).toBe(
      createHmac('sha256', env.PUSH_WEBHOOK_SECRET)
        .update(`${ts}.${body}`)
        .digest('hex'),
    )
    expect(JSON.parse(body)).toEqual({
      type: 'membership.drift',
      organizationId: 'o1',
    })
  })

  it('signPush differs for another secret, timestamp or body', async () => {
    const base = await signPush('k', '1', 'b')
    expect(await signPush('k2', '1', 'b')).not.toBe(base)
    expect(await signPush('k', '2', 'b')).not.toBe(base)
    expect(await signPush('k', '1', 'c')).not.toBe(base)
  })

  it('never rejects on a network error or a non-2xx, and logs the type only', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    post.mockRejectedValueOnce(new Error('down'))
    await expect(
      pushEvent(env, { type: 'parity.drift', conferenceIds: ['c1'] }),
    ).resolves.toBeUndefined()
    post.mockResolvedValueOnce(new Response(null, { status: 500 }))
    await expect(
      pushEvent(env, { type: 'parity.drift', conferenceIds: ['c1'] }),
    ).resolves.toBeUndefined()
    expect(err).toHaveBeenCalledTimes(2)
    expect(err.mock.calls[0][0]).toContain('push.webhook_failed')
    err.mockRestore()
  })

  it('sends nothing without a URL or a secret', async () => {
    await pushEvent(
      { PUSH_WEBHOOK_URL: env.PUSH_WEBHOOK_URL },
      { type: 'membership.drift', organizationId: 'o1' },
    )
    await pushEvent(
      { PUSH_WEBHOOK_SECRET: 's' },
      { type: 'membership.drift', organizationId: 'o1' },
    )
    expect(post).not.toHaveBeenCalled()
  })
})
