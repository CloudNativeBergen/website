import { describe, it, expect } from 'vitest'
import { contractSentError } from '@/lib/sponsor-crm/contract-validation'

describe('contractSentError', () => {
  it('passes for statuses before the contract is sent', () => {
    expect(contractSentError('none', undefined, undefined)).toBe(true)
    expect(contractSentError('verbal-agreement', undefined, 0)).toBe(true)
    expect(contractSentError('registration-sent', undefined, undefined)).toBe(
      true,
    )
  })

  it('warns when a sent contract has no tier', () => {
    const result = contractSentError('contract-sent', undefined, 50000)
    expect(result).toMatch(/tier/i)
  })

  it('warns when a sent contract has no positive value', () => {
    expect(contractSentError('contract-sent', 'tier-x', 0)).toMatch(/value/i)
    expect(contractSentError('contract-sent', 'tier-x', undefined)).toMatch(
      /value/i,
    )
  })

  it('warns about both a missing tier and value at once', () => {
    const result = contractSentError('contract-sent', undefined, 0)
    expect(result).toMatch(/tier/i)
    expect(result).toMatch(/value/i)
  })

  it('passes when a sent contract has a tier and a positive value', () => {
    expect(contractSentError('contract-sent', 'tier-x', 50000)).toBe(true)
  })

  it('applies the same invariant to a signed contract', () => {
    expect(contractSentError('contract-signed', undefined, 0)).toMatch(/tier/i)
    expect(contractSentError('contract-signed', 'tier-x', 50000)).toBe(true)
  })
})
