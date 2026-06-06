import { TRPCError } from '@trpc/server'
import type { MissingField } from '@/lib/sponsor-crm/contract-readiness'

const describe = (field: MissingField) => field.message ?? field.label

/**
 * Error carrying structured missing-field requirements. Attached as the `cause`
 * of a PRECONDITION_FAILED TRPCError so the structured payload survives to the
 * client via the tRPC error formatter, rather than being flattened to a string.
 */
export class MissingFieldsError extends Error {
  constructor(public readonly missingFields: MissingField[]) {
    super(missingFields.map(describe).join(' '))
    this.name = 'MissingFieldsError'
  }
}

/**
 * Builds a PRECONDITION_FAILED error from a list of missing fields. The
 * human-readable `message` is preserved for callers that only read it, while
 * the structured `missingFields` ride along on the cause.
 */
export function preconditionFailed(missing: MissingField[]): TRPCError {
  return new TRPCError({
    code: 'PRECONDITION_FAILED',
    message: missing.map(describe).join(' '),
    cause: new MissingFieldsError(missing),
  })
}

/** Returns the structured missing fields carried by an error, if any. */
export function extractMissingFields(error: {
  cause?: unknown
}): MissingField[] | undefined {
  return error.cause instanceof MissingFieldsError
    ? error.cause.missingFields
    : undefined
}

/**
 * The fields the tRPC error formatter merges into `shape.data`: always the
 * error `code`, plus the structured `missingFields` payload when the error
 * carries them. Kept separate from the formatter so it is trivially testable.
 */
export function structuredErrorData(error: {
  code: string
  cause?: unknown
}): Record<string, unknown> {
  const missingFields = extractMissingFields(error)
  return {
    code: error.code,
    ...(missingFields ? { missingFields } : {}),
  }
}
