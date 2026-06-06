import { describe, it, expect } from 'vitest'
import { TRPCError } from '@trpc/server'
import {
  preconditionFailed,
  extractMissingFields,
  structuredErrorData,
} from '@/server/errors'
import type { MissingField } from '@/lib/sponsor-crm/contract-readiness'

const missing: MissingField[] = [
  {
    field: 'tier',
    label: 'Sponsor tier',
    source: 'pipeline',
    severity: 'required',
    message: 'Set a sponsor tier first.',
  },
]

describe('preconditionFailed', () => {
  it('builds a PRECONDITION_FAILED TRPCError carrying structured missing fields', () => {
    const err = preconditionFailed(missing)
    expect(err).toBeInstanceOf(TRPCError)
    expect(err.code).toBe('PRECONDITION_FAILED')
    expect(err.message).toMatch(/tier/i)
    expect(extractMissingFields(err)).toEqual(missing)
  })

  it('never produces an empty message, even for an empty field list', () => {
    const err = preconditionFailed([])
    expect(err.message.trim().length).toBeGreaterThan(0)
  })

  it('falls back to a sentence when a field carries no explicit message', () => {
    const err = preconditionFailed([
      {
        field: 'tier',
        label: 'Sponsor tier',
        source: 'pipeline',
        severity: 'required',
      },
    ])
    // Not just the bare label — a readable sentence.
    expect(err.message).toMatch(/Sponsor tier/)
    expect(err.message).toMatch(/required/i)
  })
})

describe('extractMissingFields', () => {
  it('returns undefined for an error without a structured cause', () => {
    const err = new TRPCError({ code: 'NOT_FOUND', message: 'nope' })
    expect(extractMissingFields(err)).toBeUndefined()
  })
})

describe('structuredErrorData', () => {
  it('exposes code and missingFields when the cause carries them', () => {
    const data = structuredErrorData(preconditionFailed(missing))
    expect(data).toEqual({
      code: 'PRECONDITION_FAILED',
      missingFields: missing,
    })
  })

  it('exposes only the code for ordinary errors', () => {
    const data = structuredErrorData(
      new TRPCError({ code: 'BAD_REQUEST', message: 'bad' }),
    )
    expect(data).toEqual({ code: 'BAD_REQUEST' })
  })
})
