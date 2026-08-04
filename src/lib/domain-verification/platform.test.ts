import { describe, it, expect, afterEach, vi } from 'vitest'
import { isPlatformOwnedHost, platformDomainSuffix } from './platform'

/**
 * The suffix matcher is the whole security surface of platform-owned
 * verification: everything downstream (routing, the redirect allowlist, the
 * sweep) is a one-line delegation to `isPlatformOwnedHost`. If this file is
 * wrong, a permanent unprovable grant leaks to a host we do not control.
 */

afterEach(() => {
  vi.unstubAllEnvs()
})

function withSuffix(value: string | undefined) {
  if (value === undefined) vi.stubEnv('PLATFORM_DOMAIN_SUFFIX', undefined)
  else vi.stubEnv('PLATFORM_DOMAIN_SUFFIX', value)
}

describe('platformDomainSuffix', () => {
  it('reads the configured zone', () => {
    withSuffix('konf.run')
    expect(platformDomainSuffix()).toBe('konf.run')
  })

  it('normalizes case, whitespace and the `.`/`*.` shorthands', () => {
    for (const raw of ['  KONF.run ', '.konf.run', '*.konf.run']) {
      withSuffix(raw)
      expect(platformDomainSuffix()).toBe('konf.run')
    }
  })

  it('is null when UNSET or blank — no host is platform-owned by default', () => {
    withSuffix(undefined)
    expect(platformDomainSuffix()).toBeNull()
    withSuffix('')
    expect(platformDomainSuffix()).toBeNull()
    withSuffix('   ')
    expect(platformDomainSuffix()).toBeNull()
  })

  it('REFUSES a single bare label — `run` would own every .run domain', () => {
    withSuffix('run')
    expect(platformDomainSuffix()).toBeNull()
  })

  it('REFUSES anything that is not a plain zone', () => {
    for (const raw of [
      'https://konf.run',
      'konf.run/path',
      'konf.run:3000',
      'konf run',
      '*',
      '.',
    ]) {
      withSuffix(raw)
      expect(platformDomainSuffix()).toBeNull()
    }
  })
})

describe('isPlatformOwnedHost', () => {
  it('accepts a subdomain we minted', () => {
    withSuffix('konf.run')
    expect(isPlatformOwnedHost('kubeday.konf.run')).toBe(true)
    expect(isPlatformOwnedHost('KubeDay.Konf.Run')).toBe(true)
    // Deeper labels are still inside our zone (wildcard cert covers one label,
    // but ownership of the zone is what this predicate is about).
    expect(isPlatformOwnedHost('a.b.konf.run')).toBe(true)
  })

  it('FAILS CLOSED when the suffix is unset — not "everything matches"', () => {
    withSuffix(undefined)
    expect(isPlatformOwnedHost('kubeday.konf.run')).toBe(false)
    expect(isPlatformOwnedHost('anything.example.com')).toBe(false)
    expect(isPlatformOwnedHost('')).toBe(false)
  })

  it('REFUSES a label-boundary near-miss (`evil-konf.run`)', () => {
    // The `endsWith` bug: `'evil-konf.run'.endsWith('konf.run')` is TRUE.
    withSuffix('konf.run')
    expect(isPlatformOwnedHost('evil-konf.run')).toBe(false)
    expect(isPlatformOwnedHost('sub.evil-konf.run')).toBe(false)
    expect(isPlatformOwnedHost('xkonf.run')).toBe(false)
  })

  it('REFUSES our zone used as a PREFIX of someone else’s (`konf.run.attacker.com`)', () => {
    withSuffix('konf.run')
    expect(isPlatformOwnedHost('konf.run.attacker.com')).toBe(false)
    expect(isPlatformOwnedHost('attacker.com')).toBe(false)
  })

  it('REFUSES a different TLD with the same second level (`konf.runner`)', () => {
    withSuffix('konf.run')
    expect(isPlatformOwnedHost('a.konf.runner')).toBe(false)
    expect(isPlatformOwnedHost('a.konf.ru')).toBe(false)
  })

  it('REFUSES the suffix APEX itself', () => {
    // `konf.run` is the platform's own origin, not a subdomain minted for a
    // tenant. It can prove itself the normal way if it ever needs to route.
    withSuffix('konf.run')
    expect(isPlatformOwnedHost('konf.run')).toBe(false)
  })

  it('REFUSES a WILDCARD claim over the platform zone', () => {
    // `*.konf.run` covers every tenant at once — auto-verifying it would let its
    // holder route every host in the zone.
    withSuffix('konf.run')
    expect(isPlatformOwnedHost('*.konf.run')).toBe(false)
    expect(isPlatformOwnedHost('*.tenant.konf.run')).toBe(false)
  })

  it('REFUSES entries carrying a port or a trailing dot', () => {
    withSuffix('konf.run')
    expect(isPlatformOwnedHost('tenant.konf.run:3000')).toBe(false)
    expect(isPlatformOwnedHost('tenant.konf.run.')).toBe(false)
  })

  it('follows the suffix when the platform is white-labelled', () => {
    withSuffix('events.example.org')
    expect(isPlatformOwnedHost('kubeday.events.example.org')).toBe(true)
    expect(isPlatformOwnedHost('kubeday.konf.run')).toBe(false)
  })
})
