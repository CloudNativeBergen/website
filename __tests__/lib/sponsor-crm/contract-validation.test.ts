import { describe, it, expect } from 'vitest'
import { contractSentWarning } from '@/lib/sponsor-crm/contract-validation'

describe('contractSentWarning', () => {
  it('passes for statuses before the contract is sent', () => {
    expect(contractSentWarning('none', undefined, undefined)).toBe(true)
    expect(contractSentWarning('verbal-agreement', undefined, 0)).toBe(true)
    expect(contractSentWarning('registration-sent', undefined, undefined)).toBe(
      true,
    )
  })

  it('warns when a sent contract has no tier', () => {
    const result = contractSentWarning('contract-sent', undefined, 50000)
    expect(result).toMatch(/tier/i)
  })

  it('warns when a sent contract has no positive value', () => {
    expect(contractSentWarning('contract-sent', 'tier-x', 0)).toMatch(/value/i)
    expect(contractSentWarning('contract-sent', 'tier-x', undefined)).toMatch(
      /value/i,
    )
  })

  it('warns about both a missing tier and value at once', () => {
    const result = contractSentWarning('contract-sent', undefined, 0)
    expect(result).toMatch(/tier/i)
    expect(result).toMatch(/value/i)
  })

  it('passes when a sent contract has a tier and a positive value', () => {
    expect(contractSentWarning('contract-sent', 'tier-x', 50000)).toBe(true)
  })

  it('applies the same invariant to a signed contract', () => {
    expect(contractSentWarning('contract-signed', undefined, 0)).toMatch(
      /tier/i,
    )
    expect(contractSentWarning('contract-signed', 'tier-x', 50000)).toBe(true)
  })
})
