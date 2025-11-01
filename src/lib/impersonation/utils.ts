/**
 * Utility functions for handling impersonation URL parameters
 */

/**
 * Adds impersonate parameter to a URL if needed
 * @param baseUrl - The base URL (can include existing query params)
 * @param speakerId - The speaker ID to impersonate (optional)
 * @returns URL string with impersonate parameter if speakerId is provided
 */
export function addImpersonateParam(
  baseUrl: string,
  speakerId?: string | null,
): string {
  if (!speakerId) return baseUrl

  const url = new URL(baseUrl, 'http://localhost')
  url.searchParams.set('impersonate', speakerId)

  return `${url.pathname}${url.search}`
}

/**
 * Gets the impersonate query string from search params
 * @param searchParams - URLSearchParams or null
 * @returns Query string like "?impersonate=xxx" or empty string
 */
export function getImpersonateQueryString(
  searchParams:
    | URLSearchParams
    | { get: (key: string) => string | null }
    | null,
): string {
  if (!searchParams) return ''
  const impersonateId = searchParams.get('impersonate')
  return impersonateId ? `?impersonate=${impersonateId}` : ''
}

/**
 * Type-safe interface for session with impersonation info
 */
export interface SessionWithImpersonation {
  isImpersonating?: boolean
  speaker?: {
    _id: string
  }
}

/**
 * Builds a URL with impersonate parameter if session is impersonating
 * @param baseUrl - The base URL
 * @param session - Session object with impersonation info
 * @returns URL with impersonate param if impersonating, otherwise base URL
 */
export function buildUrlWithImpersonation(
  baseUrl: string,
  session?: SessionWithImpersonation | null,
): string {
  if (!session?.isImpersonating || !session.speaker?._id) {
    return baseUrl
  }
  return addImpersonateParam(baseUrl, session.speaker._id)
}
