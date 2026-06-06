import { describe, it, expect } from 'vitest'
import {
  clientMissingFields,
  mutationRejectionMessage,
} from '@/lib/trpc/errors'
import type { MissingField } from '@/lib/sponsor-crm/contract-readiness'

const missing: MissingField[] = [
  {
    field: 'tier',
    label: 'Sponsor tier',
    source: 'pipeline',
    severity: 'required',
    message: 'Set a tier.',
  },
]

describe('clientMissingFields', () => {
  it('reads the structured payload from error.data (where it lands on the client)', () => {
    expect(clientMissingFields({ data: { missingFields: missing } })).toEqual(
      missing,
    )
  })

  it('returns undefined when there is no structured payload', () => {
    expect(clientMissingFields({ data: { code: 'NOT_FOUND' } })).toBeUndefined()
    expect(clientMissingFields(null)).toBeUndefined()
    expect(clientMissingFields(undefined)).toBeUndefined()
  })
})

describe('mutationRejectionMessage', () => {
  const fallback = 'Something went wrong.'

  it('surfaces the server message for a guard rejection (PRECONDITION_FAILED)', () => {
    const err = Object.assign(new Error('Set a tier before marking as Won.'), {
      data: { code: 'PRECONDITION_FAILED' },
    })
    expect(mutationRejectionMessage(err, fallback)).toBe(
      'Set a tier before marking as Won.',
    )
  })

  it('uses the fallback for transient/internal errors', () => {
    const err = Object.assign(new Error('connection reset'), {
      data: { code: 'INTERNAL_SERVER_ERROR' },
    })
    expect(mutationRejectionMessage(err, fallback)).toBe(fallback)
  })

  it('uses the fallback when a PRECONDITION_FAILED carries no message', () => {
    const err = Object.assign(new Error(''), {
      data: { code: 'PRECONDITION_FAILED' },
    })
    expect(mutationRejectionMessage(err, fallback)).toBe(fallback)
  })

  it('uses the fallback for a non-Error value', () => {
    expect(mutationRejectionMessage(null, fallback)).toBe(fallback)
  })
})
