import type { MissingField } from '@/lib/sponsor-crm/contract-readiness'
import type { TagIssue } from '@/lib/marketing/tagging/checks'

/**
 * Client-side accessors for the structured error payload the tRPC error
 * formatter attaches to `shape.data`. On the CLIENT the structured data lives at
 * `error.data` (a plain object) — the server-side `extractMissingFields` reads
 * `error.cause` and does NOT work here, because the cause is not serialized as a
 * live `MissingFieldsError` instance over the wire.
 */
interface ClientError {
  message?: string
  data?: {
    code?: string
    missingFields?: MissingField[]
    tagIssues?: TagIssue[]
  } | null
}

/** The structured tag issues a refused save or approval carries (tagging spec §4.4). */
export function clientTagIssues(
  error: ClientError | null | undefined,
): TagIssue[] {
  return error?.data?.tagIssues ?? []
}

/** The structured missing fields a guard rejection carries, as seen on the client. */
export function clientMissingFields(
  error: ClientError | null | undefined,
): MissingField[] | undefined {
  return error?.data?.missingFields ?? undefined
}

/**
 * Picks a user-facing message for a failed mutation. A guard rejection
 * (PRECONDITION_FAILED) carries an actionable, user-safe message from the
 * server, so surface it; for transient/internal errors (or an empty message)
 * use the caller's generic fallback rather than leaking a raw error string.
 */
export function mutationRejectionMessage(
  error: unknown,
  fallback: string,
): string {
  const code = (error as ClientError | null)?.data?.code
  if (
    code === 'PRECONDITION_FAILED' &&
    error instanceof Error &&
    error.message
  ) {
    return error.message
  }
  return fallback
}
