import { TRPCError } from '@trpc/server'
import type { MissingField } from '@/lib/sponsor-crm/contract-readiness'
import type { TagIssue } from '@/lib/marketing/tagging/checks'

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

/**
 * A refused save or approval of a Bluesky body's tags (tagging spec §4.4):
 * the issues ride on the cause so the editor gets each one's code and
 * mention key and can offer the one-click fix, not just a joined string.
 */
export class TagIssuesError extends Error {
  constructor(public readonly tagIssues: TagIssue[]) {
    super(tagIssues.map((i) => i.message).join(' '))
    this.name = 'TagIssuesError'
  }
}

export function tagIssuesError(issues: TagIssue[]): TRPCError {
  return new TRPCError({
    code: 'BAD_REQUEST',
    message: issues.map((i) => i.message).join(' '),
    cause: new TagIssuesError(issues),
  })
}

export interface StructuredErrorData {
  code: string
  missingFields?: MissingField[]
  tagIssues?: TagIssue[]
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
  const tagIssues =
    error.cause instanceof TagIssuesError ? error.cause.tagIssues : undefined
  return {
    code: error.code,
    ...(missingFields ? { missingFields } : {}),
    ...(tagIssues ? { tagIssues } : {}),
  }
}
