import { describe, it, expect } from 'vitest'
import { checkDomainChallenge } from './dns'
import { expectedTxtValue } from './challenge'

const TOKEN = 'tok-abc123'

function resolving(records: string[][]) {
  return async () => records
}

function rejecting(code: string) {
  return async () => {
    throw Object.assign(new Error(code), { code })
  }
}

describe('checkDomainChallenge', () => {
  it('verifies when the expected TXT value is present', async () => {
    const outcome = await checkDomainChallenge(
      'example.com',
      TOKEN,
      resolving([[expectedTxtValue(TOKEN)]]),
    )
    expect(outcome).toEqual({ kind: 'verified' })
  })

  it('ignores unrelated TXT records at the same name', async () => {
    const outcome = await checkDomainChallenge(
      'example.com',
      TOKEN,
      resolving([
        ['v=spf1 include:_spf.google.com ~all'],
        ['some-other-vendor-verification=zzz'],
        [expectedTxtValue(TOKEN)],
      ]),
    )
    expect(outcome).toEqual({ kind: 'verified' })
  })

  it('joins the chunks of a long TXT record before comparing', async () => {
    // A >255-char TXT string arrives as several character-strings (RFC 1035).
    const value = expectedTxtValue(TOKEN)
    const outcome = await checkDomainChallenge(
      'example.com',
      TOKEN,
      resolving([[value.slice(0, 10), value.slice(10)]]),
    )
    expect(outcome).toEqual({ kind: 'verified' })
  })

  it('HARD-fails when the record exists but carries a different token', async () => {
    const outcome = await checkDomainChallenge(
      'example.com',
      TOKEN,
      resolving([[expectedTxtValue('a-different-token')]]),
    )
    expect(outcome.kind).toBe('hard-failure')
  })

  it('HARD-fails on NXDOMAIN / NODATA — the dangling-DNS signal', async () => {
    for (const code of ['ENOTFOUND', 'ENODATA']) {
      const outcome = await checkDomainChallenge(
        'example.com',
        TOKEN,
        rejecting(code),
      )
      expect(outcome.kind, code).toBe('hard-failure')
    }
  })

  it('SOFT-fails on resolver problems — our outage, not the tenant’s', async () => {
    for (const code of ['ETIMEOUT', 'ESERVFAIL', 'ECONNREFUSED', 'EREFUSED']) {
      const outcome = await checkDomainChallenge(
        'example.com',
        TOKEN,
        rejecting(code),
      )
      expect(outcome.kind, code).toBe('soft-failure')
    }
  })

  it('reports dev-only entries as unverifiable rather than failing them', async () => {
    const outcome = await checkDomainChallenge('localhost:3000', TOKEN, () => {
      throw new Error('DNS must not be queried for a dev entry')
    })
    expect(outcome.kind).toBe('unverifiable')
  })

  it('resolves the WILDCARD claim against its base zone', async () => {
    let queried = ''
    const outcome = await checkDomainChallenge(
      '*.example.com',
      TOKEN,
      async (name) => {
        queried = name
        return [[expectedTxtValue(TOKEN)]]
      },
    )
    expect(queried).toBe('_konf-challenge.example.com')
    expect(outcome).toEqual({ kind: 'verified' })
  })
})
