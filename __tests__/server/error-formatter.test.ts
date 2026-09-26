import { describe, it, expect } from 'vitest'
import { formatTRPCError } from '@/server/trpc'
import { preconditionFailed, tagIssuesError } from '@/server/errors'
import { clientTagIssues } from '@/lib/trpc/errors'

/**
 * Pins the wiring between the structured-error helpers and the tRPC error
 * formatter, i.e. that `missingFields` actually reaches `shape.data` (and so the
 * client). The pure helpers are unit-tested separately; this guards the seam.
 */
describe('formatTRPCError', () => {
  it('merges structured missingFields and code into shape.data', () => {
    const error = preconditionFailed([
      {
        field: 'tier',
        label: 'Sponsor tier',
        source: 'pipeline',
        severity: 'required',
        message: 'Set a tier.',
      },
    ])
    const shape = {
      message: error.message,
      code: -32000,
      data: { code: 'PRECONDITION_FAILED', httpStatus: 412, path: 'x' },
    }

    const result = formatTRPCError({ shape, error })

    expect(result.data.missingFields?.[0].field).toBe('tier')
    expect(result.data.code).toBe('PRECONDITION_FAILED')
    // Pre-existing data fields are preserved, not clobbered.
    expect(result.data.httpStatus).toBe(412)
    expect(result.data.path).toBe('x')
  })

  it('passes ordinary errors through without adding missingFields', () => {
    const shape = { data: { code: 'NOT_FOUND', httpStatus: 404 } }
    const result = formatTRPCError({ shape, error: { code: 'NOT_FOUND' } })

    expect(result.data.missingFields).toBeUndefined()
    expect(result.data.code).toBe('NOT_FOUND')
  })

  it('carries structured tag issues to the client (tagging spec §4.4)', () => {
    const issue = {
      code: 'opted-out' as const,
      mentionKey: 'spk-olga',
      handle: 'olga.dev',
      name: 'Olga',
      message: 'Olga has asked not to be tagged.',
    }
    const error = tagIssuesError([issue])
    const result = formatTRPCError({
      shape: { data: { code: 'BAD_REQUEST' } },
      error,
    })
    expect(error.message).toBe('Olga has asked not to be tagged.')
    expect(result.data.tagIssues).toEqual([issue])
    // What the client reads off the serialized error.
    expect(clientTagIssues({ data: JSON.parse(JSON.stringify(result.data)) }))
      .toEqual([issue])
  })
})
