import { describe, it, expect, afterEach, vi } from 'vitest'
import {
  derivePlatformHosts,
  isPlatformZoneHost,
  platformDomainSuffix,
  shouldTakeLatestHost,
} from './platform'

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

/**
 * MINTING. The derivation is what turns a new tenant into a REACHABLE one, so
 * its shape is a contract, not a detail: two SINGLE labels (a wildcard
 * certificate covers no more), a permanent dated host per edition, a short
 * host for the latest one, and no invented year when none is known.
 */
describe('derivePlatformHosts', () => {
  it('mints the permanent dated host and the short bare host', () => {
    withSuffix('konf.run')
    expect(derivePlatformHosts('acme', '2026-05-04')).toEqual({
      ok: true,
      hosts: { bare: 'acme.konf.run', dated: 'acme-2026.konf.run' },
    })
  })

  it('produces SINGLE labels only — never a nested form', () => {
    withSuffix('konf.run')
    const derived = derivePlatformHosts('acme', '2026-05-04')
    expect(derived.ok).toBe(true)
    if (!derived.ok) return
    // `*.konf.run` secures `acme-2026.konf.run` and NOT `2026.acme.konf.run`:
    // the nested form additionally needs a per-org wildcard AND a deployment
    // aliased to it, or a visitor gets the CDN's own error page.
    for (const host of [derived.hosts.bare, derived.hosts.dated]) {
      expect(host.split('.')).toHaveLength(3)
      expect(host.slice(0, -'.konf.run'.length)).not.toContain('.')
    }
  })

  it('collapses onto ONE host, asserting no year, when there are no dates yet', () => {
    withSuffix('konf.run')
    for (const missing of [null, undefined, '', 'not-a-date']) {
      expect(derivePlatformHosts('acme', missing)).toEqual({
        ok: true,
        hosts: { bare: 'acme.konf.run', dated: 'acme.konf.run' },
      })
    }
  })

  it('keeps every dated host distinct from the bare one and from each other', () => {
    withSuffix('konf.run')
    const y2026 = derivePlatformHosts('acme', '2026-05-04')
    const y2027 = derivePlatformHosts('acme', '2027-05-04')
    expect(y2026.ok && y2027.ok).toBe(true)
    if (!y2026.ok || !y2027.ok) return
    const hosts = [y2026.hosts.bare, y2026.hosts.dated, y2027.hosts.dated]
    expect(new Set(hosts).size).toBe(3)
  })

  it('is stable — the same inputs always mint the same hosts', () => {
    withSuffix('konf.run')
    expect(derivePlatformHosts('acme', '2026-05-04')).toEqual(
      derivePlatformHosts('acme', '2026-05-04'),
    )
  })

  it('REFUSES when the platform operates no zone', () => {
    withSuffix(undefined)
    expect(derivePlatformHosts('acme', '2026-05-04')).toEqual({
      ok: false,
      reason: 'no-zone',
    })
  })

  it('REFUSES a label DNS cannot carry (over 63 octets)', () => {
    withSuffix('konf.run')
    expect(derivePlatformHosts('a'.repeat(63), null).ok).toBe(true)
    expect(derivePlatformHosts('a'.repeat(64), null)).toEqual({
      ok: false,
      reason: 'unusable-label',
    })
    // The DATED label is the longer of the pair, and it refuses the whole set:
    // half a pair would leave an edition without its permanent address.
    expect(derivePlatformHosts('a'.repeat(60), '2026-05-04')).toEqual({
      ok: false,
      reason: 'unusable-label',
    })
  })

  it('REFUSES anything that would smuggle extra labels into the host', () => {
    withSuffix('konf.run')
    for (const slug of ['acme.evil', 'a.b', '*', 'acme:3000', '', '-acme']) {
      expect(derivePlatformHosts(slug, null)).toEqual({
        ok: false,
        reason: 'unusable-label',
      })
    }
  })

  it('REFUSES slugs whose bare host the platform keeps for itself', () => {
    withSuffix('konf.run')
    for (const slug of [
      'www',
      'api',
      'admin',
      'auth',
      'my',
      'status',
      'konf',
    ]) {
      // Checked on the ORG SLUG: `admin-2026` would be harmless, but the pair
      // is all-or-nothing and `admin.konf.run` is not the tenant's to take.
      expect(derivePlatformHosts(slug, '2026-05-04')).toEqual({
        ok: false,
        reason: 'reserved',
      })
    }
  })

  it('mints inside the WHITE-LABELLED zone, and only there', () => {
    withSuffix('events.example.org')
    expect(derivePlatformHosts('acme', '2026-05-04')).toEqual({
      ok: true,
      hosts: {
        bare: 'acme.events.example.org',
        dated: 'acme-2026.events.example.org',
      },
    })
  })

  it('mints only hosts its own allocation gate would accept', () => {
    // Self-consistency: everything returned must be in the zone, or a caller
    // would claim a host that can never be allocated to it.
    withSuffix('konf.run')
    for (const [slug, date] of [
      ['acme', '2026-05-04'],
      ['acme', null],
      ['x', '2099-12-31'],
    ] as const) {
      const derived = derivePlatformHosts(slug, date)
      expect(derived.ok).toBe(true)
      if (!derived.ok) continue
      expect(isPlatformZoneHost(derived.hosts.bare)).toBe(true)
      expect(isPlatformZoneHost(derived.hosts.dated)).toBe(true)
    }
  })
})

/**
 * WHERE THE SHORT ADDRESS POINTS. The bare host moves between editions, so the
 * rule that decides when has to be a function, not an inline comparison.
 */
describe('shouldTakeLatestHost', () => {
  it('moves to an edition that starts LATER', () => {
    expect(shouldTakeLatestHost('2026-05-04', '2027-05-04')).toBe(true)
  })

  it('does NOT move to an edition that starts EARLIER', () => {
    // Back-filling a 2024 edition after 2026 exists must not drag the org's
    // short address backwards in time.
    expect(shouldTakeLatestHost('2026-05-04', '2024-05-04')).toBe(false)
  })

  it('orders two editions in the SAME calendar year by their actual dates', () => {
    // Spring loses to autumn; autumn does not lose to spring.
    expect(shouldTakeLatestHost('2026-03-01', '2026-09-01')).toBe(true)
    expect(shouldTakeLatestHost('2026-09-01', '2026-03-01')).toBe(false)
  })

  it('keeps the incumbent on an exact tie — a live address does not churn', () => {
    expect(shouldTakeLatestHost('2026-05-04', '2026-05-04')).toBe(false)
  })

  it('never lets an UNDATED edition take it from a dated one', () => {
    expect(shouldTakeLatestHost('2026-05-04', null)).toBe(false)
    expect(shouldTakeLatestHost('2026-05-04', undefined)).toBe(false)
    expect(shouldTakeLatestHost('2026-05-04', '  ')).toBe(false)
  })

  it('lets a DATED edition take it from an undated incumbent', () => {
    expect(shouldTakeLatestHost(null, '2026-05-04')).toBe(true)
  })

  it('keeps the incumbent when NEITHER has dates', () => {
    expect(shouldTakeLatestHost(null, null)).toBe(false)
  })
})
