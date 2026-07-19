/**
 * Client-safe helper for reading the tRPC error code (`error.data.code`) off an
 * unknown client-side error. Shared by the messaging components (thread + new
 * conversation form) so NOT_FOUND special-casing stays consistent.
 */
export function errorCode(error: unknown): string | undefined {
  return (error as { data?: { code?: string } } | null)?.data?.code
}
