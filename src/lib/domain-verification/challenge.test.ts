import { describe, it, expect } from 'vitest'
import {
  challengeRecordName,
  domainVerificationId,
  expectedTxtValue,
  generateVerificationToken,
  isDevOnlyHost,
  isWildcardEntry,
  verificationBaseHost,
} from './challenge'

describe('challengeRecordName', () => {
  it('publishes under a `_konf-challenge` label on the claimed host', () => {
    expect(challengeRecordName('example.com')).toBe(
      '_konf-challenge.example.com',
    )
    expect(challengeRecordName('cfp.example.com')).toBe(
      '_konf-challenge.cfp.example.com',
    )
  })

  it('proves a wildcard claim on its BASE zone', () => {
    // Controlling `example.com`'s zone is exactly what authorises every label
    // under it — there is no `*.example.com` name to publish a TXT at.
    expect(challengeRecordName('*.example.com')).toBe(
      '_konf-challenge.example.com',
    )
    expect(verificationBaseHost('*.example.com')).toBe('example.com')
  })

  it('normalises case before deriving the name', () => {
    expect(challengeRecordName('EXAMPLE.com')).toBe(
      '_konf-challenge.example.com',
    )
  })

  it('returns null for entries that cannot carry a public proof', () => {
    for (const entry of [
      'localhost',
      'localhost:3000',
      'example.com:8080',
      '127.0.0.1',
      'dev.local',
      'thing.test',
      'internal',
    ]) {
      expect(challengeRecordName(entry), entry).toBeNull()
      expect(verificationBaseHost(entry), entry).toBeNull()
    }
  })
})

describe('isDevOnlyHost / isWildcardEntry', () => {
  it('classifies real public hosts as verifiable', () => {
    expect(isDevOnlyHost('cloudnativebergen.dev')).toBe(false)
    expect(isDevOnlyHost('*.cloudnativedays.no')).toBe(false)
  })

  it('classifies loopback, IP literals and ported dev entries as dev-only', () => {
    expect(isDevOnlyHost('localhost:3000')).toBe(true)
    expect(isDevOnlyHost('app.localhost')).toBe(true)
    expect(isDevOnlyHost('192.168.0.10')).toBe(true)
  })

  it('detects wildcard claims', () => {
    expect(isWildcardEntry('*.example.com')).toBe(true)
    expect(isWildcardEntry('sub.example.com')).toBe(false)
  })
})

describe('tokens', () => {
  it('mints unguessable, distinct tokens', () => {
    const a = generateVerificationToken()
    const b = generateVerificationToken()
    expect(a).not.toBe(b)
    // 32 bytes base64url — long enough that guessing is not a strategy.
    expect(a.length).toBeGreaterThanOrEqual(43)
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it('prefixes the TXT value so unrelated records at the name are ignored', () => {
    expect(expectedTxtValue('abc')).toBe('konf-domain-verification=abc')
  })
})

describe('domainVerificationId', () => {
  it('is deterministic and Sanity-id safe', () => {
    expect(domainVerificationId('example.com')).toBe(
      'domainVerification.example.com',
    )
    expect(domainVerificationId('*.example.com')).toBe(
      'domainVerification._.example.com',
    )
    expect(domainVerificationId('localhost:3000')).toBe(
      'domainVerification.localhost_3000',
    )
    expect(domainVerificationId('example.com')).toMatch(
      /^domainVerification\.[a-zA-Z0-9._-]+$/,
    )
  })

  it('gives a wildcard claim a DIFFERENT id than its base host', () => {
    // Otherwise proving `example.com` would silently satisfy `*.example.com`.
    expect(domainVerificationId('*.example.com')).not.toBe(
      domainVerificationId('example.com'),
    )
  })
})
