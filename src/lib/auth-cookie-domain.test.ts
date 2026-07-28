import { describe, it, expect } from 'vitest'
import {
  deriveSessionCookieDomain,
  SHARED_PARENT_DOMAIN_DENYLIST,
} from './auth-cookie-domain'

describe('deriveSessionCookieDomain — registrable-domain (eTLD+1) derivation', () => {
  it('widens a subdomain host to its registrable domain', () => {
    expect(deriveSessionCookieDomain('admin.cloudnativedays.no')).toBe(
      '.cloudnativedays.no',
    )
    expect(deriveSessionCookieDomain('2026.cloudnativebergen.dev')).toBe(
      '.cloudnativebergen.dev',
    )
    // Deeper nesting still resolves to eTLD+1.
    expect(deriveSessionCookieDomain('a.b.cloudnativedays.no')).toBe(
      '.cloudnativedays.no',
    )
  })

  it('returns the registrable domain for the apex host itself', () => {
    // Domain=.cloudnativedays.no on the apex is valid and shares with subdomains.
    expect(deriveSessionCookieDomain('cloudnativedays.no')).toBe(
      '.cloudnativedays.no',
    )
  })

  it('handles multi-part public suffixes via the PSL, not label counting', () => {
    // A naive "last two labels" heuristic would derive the PUBLIC suffix
    // `.co.uk` here — which browsers reject, dropping the whole cookie.
    expect(deriveSessionCookieDomain('conf.example.co.uk')).toBe(
      '.example.co.uk',
    )
    expect(deriveSessionCookieDomain('www.tickets.example.com.au')).toBe(
      '.example.com.au',
    )
  })

  it('normalizes case, ports, whitespace, and x-forwarded-host chains', () => {
    expect(deriveSessionCookieDomain('Admin.CloudNativeDays.NO')).toBe(
      '.cloudnativedays.no',
    )
    expect(deriveSessionCookieDomain('admin.cloudnativedays.no:8443')).toBe(
      '.cloudnativedays.no',
    )
    expect(
      deriveSessionCookieDomain(' admin.cloudnativedays.no , proxy.internal '),
    ).toBe('.cloudnativedays.no')
  })

  it('NEVER widens on denylisted platform-shared parents (tenant isolation)', () => {
    // konf.run: every subdomain is a DIFFERENT tenant — widening would put one
    // tenant's session cookie in every other tenant's XSS blast radius.
    expect(deriveSessionCookieDomain('tenant-a.konf.run')).toBeUndefined()
    expect(deriveSessionCookieDomain('konf.run')).toBeUndefined()
    expect(
      deriveSessionCookieDomain('deep.sub.tenant.konf.run'),
    ).toBeUndefined()
    // konf.app (#682): the central auth origin + platform subdomains share this
    // parent, and a tenant on their own apex must never receive `.konf.app`.
    expect(deriveSessionCookieDomain('konf.app')).toBeUndefined()
    expect(deriveSessionCookieDomain('www.konf.app')).toBeUndefined()
    expect(deriveSessionCookieDomain('auth.konf.app')).toBeUndefined()
    expect(deriveSessionCookieDomain('a.b.tenant.konf.app')).toBeUndefined()
    // vercel.app previews: subdomains are unrelated projects.
    expect(deriveSessionCookieDomain('my-app.vercel.app')).toBeUndefined()
    expect(
      deriveSessionCookieDomain('website-git-branch-team.vercel.app'),
    ).toBeUndefined()
    expect(deriveSessionCookieDomain('vercel.app')).toBeUndefined()
    // localhost, with and without port.
    expect(deriveSessionCookieDomain('localhost')).toBeUndefined()
    expect(deriveSessionCookieDomain('localhost:3000')).toBeUndefined()
    expect(deriveSessionCookieDomain('app.localhost')).toBeUndefined()
  })

  it('exports the denylist with the expected shared parents', () => {
    // Pin the security-critical entries so an accidental removal fails a test.
    for (const parent of ['konf.run', 'konf.app', 'vercel.app', 'localhost']) {
      expect(SHARED_PARENT_DOMAIN_DENYLIST).toContain(parent)
    }
  })

  it('falls back to host-only (undefined) for garbage and non-domains', () => {
    expect(deriveSessionCookieDomain(undefined)).toBeUndefined()
    expect(deriveSessionCookieDomain(null)).toBeUndefined()
    expect(deriveSessionCookieDomain('')).toBeUndefined()
    expect(deriveSessionCookieDomain('   ')).toBeUndefined()
    expect(deriveSessionCookieDomain(',')).toBeUndefined()
    expect(deriveSessionCookieDomain('not a host name')).toBeUndefined()
    expect(deriveSessionCookieDomain('exa mple.com')).toBeUndefined()
    // Single-label and bare-suffix hosts have no registrable domain.
    expect(deriveSessionCookieDomain('intranet')).toBeUndefined()
    expect(deriveSessionCookieDomain('no')).toBeUndefined()
    expect(deriveSessionCookieDomain('.no')).toBeUndefined()
    expect(deriveSessionCookieDomain('co.uk')).toBeUndefined()
    // IP literals never get a Domain attribute.
    expect(deriveSessionCookieDomain('127.0.0.1')).toBeUndefined()
    expect(deriveSessionCookieDomain('127.0.0.1:3000')).toBeUndefined()
    expect(deriveSessionCookieDomain('[::1]')).toBeUndefined()
    expect(deriveSessionCookieDomain('[::1]:3000')).toBeUndefined()
  })
})
