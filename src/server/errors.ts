import { TRPCError } from '@trpc/server'
import type { MissingField } from '@/lib/sponsor-crm/contract-readiness'

const FALLBACK_MESSAGE = 'This action is not allowed in the current state.'

const describe = (field: MissingField) =>
  field.message ?? `${field.label} is required.`

const summarize = (missing: MissingField[]) =>
  missing.map(describe).join(' ') || FALLBACK_MESSAGE

/**
 * Error carrying structured missing-field requirements. Attached as the `cause`
 * of a PRECONDITION_FAILED TRPCError so the structured payload survives to the
 * client via the tRPC error formatter, rather than being flattened to a string.
 */
export class MissingFieldsError extends Error {
  constructor(public readonly missingFields: MissingField[]) {
    super(summarize(missingFields))
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
    message: summarize(missing),
    cause: new MissingFieldsError(missing),
  })
}

/**
 * Returns the structured missing fields carried by an error, if any.
 * SERVER-ONLY: reads `error.cause`, which is a live `MissingFieldsError` only
 * in-process. On the client the payload is serialized to `error.data`; use
 * `clientMissingFields` from `@/lib/trpc/errors` there.
 */
export function extractMissingFields(error: {
  cause?: unknown
}): MissingField[] | undefined {
  return error.cause instanceof MissingFieldsError
    ? error.cause.missingFields
    : undefined
}

export interface StructuredErrorData {
  code: string
  missingFields?: MissingField[]
}

/**
 * The fields the tRPC error formatter merges into `shape.data`: always the
 * error `code`, plus the structured `missingFields` payload when the error
 * carries them. Kept separate from the formatter so it is trivially testable.
 */
export function structuredErrorData(error: {
  code: string
  cause?: unknown
}): StructuredErrorData {
  const missingFields = extractMissingFields(error)
  return {
    code: error.code,
    ...(missingFields ? { missingFields } : {}),
  }
}
