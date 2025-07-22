/**
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals'
import { Status, doesProposalCountTowardsLimit } from './types'

describe('doesProposalCountTowardsLimit', () => {
  it('should return false for draft status', () => {
    expect(doesProposalCountTowardsLimit(Status.draft)).toBe(false)
  })

  it('should return false for deleted status', () => {
    expect(doesProposalCountTowardsLimit(Status.deleted)).toBe(false)
  })

  it('should return false for withdrawn status', () => {
    expect(doesProposalCountTowardsLimit(Status.withdrawn)).toBe(false)
  })

  it('should return true for submitted status', () => {
    expect(doesProposalCountTowardsLimit(Status.submitted)).toBe(true)
  })

  it('should return true for accepted status', () => {
    expect(doesProposalCountTowardsLimit(Status.accepted)).toBe(true)
  })

  it('should return true for confirmed status', () => {
    expect(doesProposalCountTowardsLimit(Status.confirmed)).toBe(true)
  })

  it('should return true for rejected status', () => {
    expect(doesProposalCountTowardsLimit(Status.rejected)).toBe(true)
  })

  it('should match the statuses excluded in the Sanity query', () => {
    // These are the statuses that should NOT count towards the limit
    const excludedStatuses = [Status.draft, Status.deleted, Status.withdrawn]
    
    // These are the statuses that SHOULD count towards the limit
    const includedStatuses = [Status.submitted, Status.accepted, Status.confirmed, Status.rejected]
    
    excludedStatuses.forEach(status => {
      expect(doesProposalCountTowardsLimit(status)).toBe(false)
    })
    
    includedStatuses.forEach(status => {
      expect(doesProposalCountTowardsLimit(status)).toBe(true)
    })
  })
})
