/**
 * The HTTP status of a failed Sanity request (`@sanity/client` puts it on
 * the error as `statusCode`), or undefined. The one reader for every write
 * that tells a lost revision (409), a document deleted since the read (404)
 * or a missing permission (403) from other failures.
 */
export function sanityStatus(error: unknown): unknown {
  return (error as { statusCode?: unknown } | null)?.statusCode
}
