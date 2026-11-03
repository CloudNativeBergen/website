// The friendly OAuth error page (#1889).
import { describe, expect, it } from 'vitest'
import type { DataEnv } from './data'
import { errorPage } from './error-page'

// Fake tenant-directory: only conf.example is verified.
const env = {
  DIRECTORY: {
    fetch: async (_url: string, init: RequestInit) => {
      const { variables } = JSON.parse(String(init.body))
      return Response.json({
        data: {
          tenantByHost:
            variables.host === 'conf.example'
              ? { hostname: 'conf.example' }
              : null,
        },
      })
    },
  },
} as unknown as DataEnv

const get = async (query: string) => {
  const res = await errorPage(new Request(`http://id.test/error?${query}`), env)
  return { res, html: await res.text() }
}

describe('error page', () => {
  it('explains a known code', async () => {
    const { html } = await get('error=state_mismatch')
    expect(html).toContain('Prøv igjen i samme nettleser.')
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
