import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  addressDomain,
  applySenderPolicy,
  describeSenderPolicy,
  formatAddress,
  isPlatformSendableAddress,
  parseAddress,
  platformSendingDomains,
  resetSenderPolicyWarnings,
} from './sender-policy'
import { resolveConferenceFrom, resolveConferenceContact } from './from'

/**
 * The bug this file exists for (platform#20): a newly provisioned tenant's
 * `From:` is on its OWN domain, which is not verified for the PLATFORM Resend
 * account, so Resend refuses the send — and the sign-in flow's deliberate
 * opacity hides it. The policy must therefore send from a platform-verified
 * address while keeping the tenant's identity and reply routing.
 */

const PLATFORM_FROM = 'Konf <noreply@platform.example>'

beforeEach(() => {
  resetSenderPolicyWarnings()
  vi.stubEnv('EMAIL_FALLBACK_FROM', PLATFORM_FROM)
  vi.stubEnv('EMAIL_SENDING_DOMAINS', '')
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('address helpers', () => {
  it('parses and re-formats "Name <address>" and bare addresses', () => {
    expect(parseAddress('KCD Bergen <hi@kcd.dev>')).toEqual({
      name: 'KCD Bergen',
      address: 'hi@kcd.dev',
    })
    expect(parseAddress('hi@kcd.dev')).toEqual({ address: 'hi@kcd.dev' })
    expect(parseAddress('"KCD Bergen" <hi@kcd.dev>').name).toBe('KCD Bergen')
    expect(formatAddress({ name: 'KCD', address: 'hi@kcd.dev' })).toBe(
      'KCD <hi@kcd.dev>',
    )
    expect(formatAddress({ address: 'hi@kcd.dev' })).toBe('hi@kcd.dev')
    expect(addressDomain('hi@KCD.dev')).toBe('kcd.dev')
  })

  /**
   * The ADDRESS is the part that looks safe and is not. `From:` headers are
   * built from tenant-editable conference fields, several send sites
   * interpolate them raw, and `.address` is what this module derives `Reply-To`
   * from — so an organizer storing CR/LF would smuggle a second header.
   *
   * Assert STRUCTURALLY: no CR, no LF, and the value is a single header line.
   * A substring check for the payload text would pass on output that is still
   * broken (and fail on output that is safely inert).
   */
  it('sanitizes the ADDRESS in the bracketed branch', () => {
    const parsed = parseAddress(
      'KCD Bergen <hello@kcd.dev\r\nBcc: attacker@evil.example>',
    )
    expect(parsed.address).not.toMatch(/[\r\n]/)
    expect(parsed.address.split(/\r\n|\r|\n/)).toHaveLength(1)
  })

  it('sanitizes the ADDRESS in the bare branch', () => {
    const parsed = parseAddress('hello@kcd.dev\r\nBcc: attacker@evil.example')
    expect(parsed.address).not.toMatch(/[\r\n]/)
    expect(parsed.address.split(/\r\n|\r|\n/)).toHaveLength(1)
    // …and brackets cannot be smuggled in to nest a new address either.
    expect(parseAddress('a@b.dev<c@d.dev>x').address).not.toMatch(/[<>]/)
  })

  it('truncates a display name at the first break so it cannot smuggle a header', () => {
    const from = formatAddress({
      name: 'Evil\r\nBcc: victim@example.com <x@y.z>',
      address: 'hi@kcd.dev',
    })
    expect(from).not.toMatch(/[\r\n]/)
    // TRUNCATED, not stripped: deleting the breaks would splice the payload
    // into the value instead of discarding it.
    expect(from).toBe('Evil <hi@kcd.dev>')
  })

  it('truncation denies the attacker the resulting DOMAIN', () => {
    // With break-DELETION this collapses to one address ending in
    // `@verified.test`, so an unverified sender would classify as verified.
    // Truncation keeps only the legitimate prefix.
    const parsed = parseAddress('a@evil.example\r\nb@verified.test')
    expect(parsed.address).toBe('a@evil.example')
    expect(addressDomain(parsed.address)).toBe('evil.example')
  })
})

describe('platform sending domains', () => {
  it('always includes the platform sender own domain', () => {
    expect([...platformSendingDomains()]).toEqual(['platform.example'])
  })

  it('adds every domain listed in EMAIL_SENDING_DOMAINS, case-insensitively', () => {
    vi.stubEnv('EMAIL_SENDING_DOMAINS', ' KCD.dev , cloudnativedays.no ,')
    expect([...platformSendingDomains()].sort()).toEqual([
      'cloudnativedays.no',
      'kcd.dev',
      'platform.example',
    ])
    expect(isPlatformSendableAddress('hi@kcd.dev')).toBe(true)
    expect(isPlatformSendableAddress('hi@other.dev')).toBe(false)
    expect(isPlatformSendableAddress('not-an-address')).toBe(false)
  })
})

describe('applySenderPolicy', () => {
  it('REWRITES an unverified tenant From to the platform sender, keeping the tenant name and putting its address in Reply-To', () => {
    const result = applySenderPolicy({
      from: 'KCD Bergen <hi@kcd.dev>',
    })
    expect(result.decision).toBe('platform-rewritten')
    expect(result.from).toBe('KCD Bergen <noreply@platform.example>')
    expect(result.replyTo).toBe('hi@kcd.dev')
    // The tenant's own domain must NOT survive in the envelope sender — that is
    // precisely what Resend rejects.
    expect(parseAddress(result.from).address).not.toContain('kcd.dev')
  })

  it('borrows the platform display name when the tenant supplied none', () => {
    const result = applySenderPolicy({ from: 'contact@kcd.dev' })
    expect(result.from).toBe('Konf <noreply@platform.example>')
    expect(result.replyTo).toBe('contact@kcd.dev')
  })

  it('leaves a VERIFIED tenant domain completely alone (the Pro/verified seam)', () => {
    vi.stubEnv('EMAIL_SENDING_DOMAINS', 'kcd.dev')
    const result = applySenderPolicy({ from: 'KCD Bergen <hi@kcd.dev>' })
    expect(result.decision).toBe('tenant-verified')
    expect(result.from).toBe('KCD Bergen <hi@kcd.dev>')
    expect(result.replyTo).toBeUndefined()
  })

  it('never overwrites a Reply-To the caller set deliberately', () => {
    const result = applySenderPolicy({
      from: 'KCD Bergen <hi@kcd.dev>',
      replyTo: 'thread+42@kcd.dev',
    })
    expect(result.from).toBe('KCD Bergen <noreply@platform.example>')
    expect(result.replyTo).toBe('thread+42@kcd.dev')
  })

  it('passes through and logs LOUDLY when no platform sender is configured', () => {
    vi.stubEnv('EMAIL_FALLBACK_FROM', '')
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = applySenderPolicy({ from: 'KCD Bergen <hi@kcd.dev>' })

    // Nothing deliverable exists to rewrite TO, so the message is unchanged —
    // but the misconfiguration is on the record.
    expect(result.decision).toBe('unconfigured')
    expect(result.from).toBe('KCD Bergen <hi@kcd.dev>')
    expect(error).toHaveBeenCalledTimes(1)
    expect(String(error.mock.calls[0][0])).toContain('EMAIL_FALLBACK_FROM')
  })

  it('warns once per domain, so a bulk send cannot bury the log', () => {
    vi.stubEnv('EMAIL_FALLBACK_FROM', '')
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})

    applySenderPolicy({ from: 'a@kcd.dev' })
    applySenderPolicy({ from: 'b@kcd.dev' })
    expect(error).toHaveBeenCalledTimes(1)

    applySenderPolicy({ from: 'c@other.dev' })
    expect(error).toHaveBeenCalledTimes(2)
  })
})

/**
 * Header injection through the sender policy. The attacker is an authenticated
 * ORGANIZER of one tenant on a multi-tenant platform, so "organizers are
 * trusted" is not a defence: the blast radius is other tenants' recipients.
 */
describe('CR/LF in a stored address cannot become a second header', () => {
  const PAYLOAD = 'hello@kcd.dev\r\nBcc: attacker@evil.example'

  /** No CR, no LF, exactly one header line — the structural property. */
  function expectSingleHeaderLine(value: string | string[] | undefined) {
    const values = value === undefined ? [] : [value].flat()
    expect(values.length).toBeGreaterThan(0)
    for (const v of values) {
      expect(v).not.toMatch(/[\r\n]/)
      expect(v.split(/\r\n|\r|\n/)).toHaveLength(1)
    }
  }

  it('neutralizes it in the derived Reply-To (the rewrite branch)', () => {
    const result = applySenderPolicy({ from: `KCD Bergen <${PAYLOAD}>` })
    expect(result.decision).toBe('platform-rewritten')
    expectSingleHeaderLine(result.replyTo)
    expectSingleHeaderLine(result.from)
  })

  it('neutralizes it in the pass-through From (verified branch)', () => {
    // A raw header built by a send site that interpolates the field directly —
    // this branch returns the CALLER's header, so it must be stripped too.
    vi.stubEnv('EMAIL_SENDING_DOMAINS', 'kcd.dev')
    const result = applySenderPolicy({ from: `KCD Bergen <${PAYLOAD}>` })
    expect(result.decision).toBe('tenant-verified')
    expectSingleHeaderLine(result.from)
  })

  it('neutralizes it in the pass-through From (unconfigured branch)', () => {
    vi.stubEnv('EMAIL_FALLBACK_FROM', '')
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = applySenderPolicy({ from: `KCD Bergen <${PAYLOAD}>` })
    expect(result.decision).toBe('unconfigured')
    expectSingleHeaderLine(result.from)
  })

  it('neutralizes it in a caller-supplied Reply-To, string or array', () => {
    expectSingleHeaderLine(
      applySenderPolicy({ from: 'a@kcd.dev', replyTo: PAYLOAD }).replyTo,
    )
    expectSingleHeaderLine(
      applySenderPolicy({ from: 'a@kcd.dev', replyTo: [PAYLOAD, 'b@kcd.dev'] })
        .replyTo,
    )
  })

  it('neutralizes it through resolveConferenceFrom and resolveConferenceContact', () => {
    const tenant = { organizer: 'KCD Bergen', contactEmail: PAYLOAD }
    expectSingleHeaderLine(resolveConferenceFrom(tenant))
    expectSingleHeaderLine(resolveConferenceContact(tenant))
    expectSingleHeaderLine(
      applySenderPolicy({ from: resolveConferenceFrom(tenant) }).replyTo,
    )
  })
})

describe('a freshly provisioned tenant, end to end through resolveConferenceFrom', () => {
  const tenant = {
    title: 'KCD Bergen 2026',
    organizer: 'KCD Bergen',
    contactEmail: 'hello@kcd.dev',
    domains: ['2026.kcd.dev'],
  }

  it('sends from the platform-verified domain with the tenant in Reply-To', () => {
    const wanted = resolveConferenceFrom(tenant)
    // What the tenant WANTS is still its own identity …
    expect(wanted).toBe('KCD Bergen <hello@kcd.dev>')

    // … and what actually goes out is deliverable.
    const sent = applySenderPolicy({ from: wanted })
    expect(addressDomain(parseAddress(sent.from).address)).toBe(
      'platform.example',
    )
    expect(platformSendingDomains().has('kcd.dev')).toBe(false)
    expect(sent.replyTo).toBe('hello@kcd.dev')
    expect(sent.from).toContain('KCD Bergen')
  })

  it('describeSenderPolicy reports the rewrite for the admin status page without consuming the warning', () => {
    vi.stubEnv('EMAIL_FALLBACK_FROM', '')
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})

    const described = describeSenderPolicy(resolveConferenceFrom(tenant))
    expect(described.decision).toBe('unconfigured')
    expect(described.requested).toBe('hello@kcd.dev')
    expect(described.sendingDomains).toEqual([])
    // Rendering a status page must not silence the log a real send needs.
    expect(error).not.toHaveBeenCalled()
  })
})
