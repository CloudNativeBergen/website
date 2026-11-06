// The friendly OAuth error page (#1889).
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { errorPage } from './error-page'

// Fake tenant-directory: only conf.example is verified.
const directory = vi.fn(async (_url: string, init: RequestInit) => {
  const { variables } = JSON.parse(String(init.body))
  return Response.json({
    data: {
      tenantByHost:
        variables.host === 'conf.example' ? { hostname: 'conf.example' } : null,
    },
  })
})
const env = {
  DIRECTORY: { fetch: directory },
  HANDOFF_IP_LIMIT: { limit: vi.fn(async () => ({ success: true })) },
} as unknown as Parameters<typeof errorPage>[1]
beforeEach(() => {
  env.HANDOFF_IP_LIMIT.limit = vi.fn(async () => ({ success: true }))
  directory.mockClear()
})

const get = async (query: string) => {
  const res = await errorPage(new Request(`http://id.test/error?${query}`), env)
  return { res, html: await res.text() }
}

describe('error page', () => {
  it('explains a known code', async () => {
    const { html } = await get('error=state_mismatch')
    expect(html).toContain('Prøv igjen i samme nettleser.')
  })

  it('points an unlinked provider to the account page (#2021)', async () => {
    const { html } = await get('error=account_not_linked')
    expect(html).toContain('ikke koblet til kontoen din')
    expect(html).toContain('<a href="/account">Koblede kontoer</a>')
  })

  it.each(['nope', '<script>alert(1)</script>', 'toString', ''])(
    'shows the generic text for %j and never echoes it',
    async (code) => {
      const { html } = await get(`error=${encodeURIComponent(code)}`)
      expect(html).toContain('Noe gikk galt under innloggingen.')
      if (code) expect(html).not.toContain(code)
    },
  )

  it('links back to a verified origin', async () => {
    const { html } = await get('error=invalid_code&origin=https://conf.example')
    expect(html).toContain('<a class="btn" href="https://conf.example/">')
  })

  it('links back to an operator origin without a directory call (#1948)', async () => {
    env.OPERATOR_ORIGINS = 'https://my.konf.app'
    try {
      const { html } = await get(
        'error=invalid_code&origin=https://my.konf.app',
      )
      expect(html).toContain('<a class="btn" href="https://my.konf.app/">')
      expect(directory).not.toHaveBeenCalled()
    } finally {
      delete env.OPERATOR_ORIGINS
    }
  })

  it.each([
    'https://evil.example',
    'http://conf.example',
    'https://conf.example/path',
    'javascript:alert(1)',
    '',
  ])('never links to %j', async (origin) => {
    const { html } = await get(
      `error=state_mismatch&origin=${encodeURIComponent(origin)}`,
    )
    expect(html).not.toContain('<a ')
    expect(html).toContain('logg inn på nytt')
  })

  it('rate-limits the lookup per IP before calling the directory', async () => {
    env.HANDOFF_IP_LIMIT.limit = vi.fn(async () => ({ success: false }))
    const { res, html } = await get('error=x&origin=https://conf.example')
    expect(res.status).toBe(400)
    expect(html).not.toContain('<a ')
    expect(directory).not.toHaveBeenCalled()
  })

  it('renders without a link when the directory fails', async () => {
    directory.mockRejectedValueOnce(new Error('down'))
    const { res, html } = await get('error=x&origin=https://conf.example')
    expect(res.status).toBe(400)
    expect(html).not.toContain('<a ')
    expect(html).toContain('logg inn på nytt')
  })

  it('sends a strict CSP and no-store', async () => {
    const { res, html } = await get('error=state_mismatch')
    const csp = res.headers.get('content-security-policy')!
    expect(csp).toContain("default-src 'none'")
    expect(csp).toContain("frame-ancestors 'none'")
    const nonce = /style-src 'nonce-([^']+)'/.exec(csp)![1]
    expect(html).toContain(`<style nonce="${nonce}">`)
    expect(res.headers.get('cache-control')).toBe('no-store')
  })
})
