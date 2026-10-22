/**
 * The HTTP status of a failed Sanity request (`@sanity/client` puts it on
 * the error as `statusCode`), or undefined. The one reader for every
 * Session Feedback write that tells a lost revision (409) or a document
 * deleted since the read (404) from other failures.
 */
export function sanityStatus(error: unknown): unknown {
  return (error as { statusCode?: unknown } | null)?.statusCode
}
