import { describe, it, expect, afterEach, vi } from 'vitest'
import { isPlatformZoneHost, platformDomainSuffix } from './platform'

/**
 * The suffix matcher is the whole security surface of platform-owned
 * verification: everything downstream (routing, the redirect allowlist, the
 * sweep) is a one-line delegation to `isPlatformZoneHost`. If this file is
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

describe('isPlatformZoneHost', () => {
  it('accepts a subdomain we minted', () => {
    withSuffix('konf.run')
    expect(isPlatformZoneHost('kubeday.konf.run')).toBe(true)
    expect(isPlatformZoneHost('KubeDay.Konf.Run')).toBe(true)
    // Deeper labels are still inside our zone (wildcard cert covers one label,
    // but ownership of the zone is what this predicate is about).
    expect(isPlatformZoneHost('a.b.konf.run')).toBe(true)
  })

  it('FAILS CLOSED when the suffix is unset — not "everything matches"', () => {
    withSuffix(undefined)
    expect(isPlatformZoneHost('kubeday.konf.run')).toBe(false)
    expect(isPlatformZoneHost('anything.example.com')).toBe(false)
    expect(isPlatformZoneHost('')).toBe(false)
  })

  it('REFUSES a label-boundary near-miss (`evil-konf.run`)', () => {
    // The `endsWith` bug: `'evil-konf.run'.endsWith('konf.run')` is TRUE.
    withSuffix('konf.run')
    expect(isPlatformZoneHost('evil-konf.run')).toBe(false)
    expect(isPlatformZoneHost('sub.evil-konf.run')).toBe(false)
    expect(isPlatformZoneHost('xkonf.run')).toBe(false)
  })

  it('REFUSES our zone used as a PREFIX of someone else’s (`konf.run.attacker.com`)', () => {
    withSuffix('konf.run')
    expect(isPlatformZoneHost('konf.run.attacker.com')).toBe(false)
    expect(isPlatformZoneHost('attacker.com')).toBe(false)
  })

  it('REFUSES a different TLD with the same second level (`konf.runner`)', () => {
    withSuffix('konf.run')
    expect(isPlatformZoneHost('a.konf.runner')).toBe(false)
    expect(isPlatformZoneHost('a.konf.ru')).toBe(false)
  })

  it('REFUSES the suffix APEX itself', () => {
    // `konf.run` is the platform's own origin, not a subdomain minted for a
    // tenant. It can prove itself the normal way if it ever needs to route.
    withSuffix('konf.run')
    expect(isPlatformZoneHost('konf.run')).toBe(false)
  })

  it('REFUSES a WILDCARD claim over the platform zone', () => {
    // `*.konf.run` covers every tenant at once — auto-verifying it would let its
    // holder route every host in the zone.
    withSuffix('konf.run')
    expect(isPlatformZoneHost('*.konf.run')).toBe(false)
    expect(isPlatformZoneHost('*.tenant.konf.run')).toBe(false)
  })

  it('REFUSES entries carrying a port or a trailing dot', () => {
    withSuffix('konf.run')
    expect(isPlatformZoneHost('tenant.konf.run:3000')).toBe(false)
    expect(isPlatformZoneHost('tenant.konf.run.')).toBe(false)
  })

  it('follows the suffix when the platform is white-labelled', () => {
    withSuffix('events.example.org')
    expect(isPlatformZoneHost('kubeday.events.example.org')).toBe(true)
    expect(isPlatformZoneHost('kubeday.konf.run')).toBe(false)
  })
})
