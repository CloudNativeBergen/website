/**
 * Checks if a domain string represents a localhost environment.
 * Handles domains with or without port numbers.
 */
export function isLocalhostDomain(domain: string): boolean {
  const hostname = domain.split(':')[0]
  return hostname === 'localhost' || hostname === '127.0.0.1'
}

/**
 * Checks if the current browser window is running on localhost.
 * Safe to call during SSR (returns false).
 */
export function isLocalhostClient(): boolean {
  return (
    typeof window !== 'undefined' && isLocalhostDomain(window.location.host)
  )
}

/**
 * Checks if the server environment is configured for localhost/development.
 * Uses NEXT_PUBLIC_BASE_URL and NODE_ENV to determine the environment.
 */
export function isLocalhostEnvironment(): boolean {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || ''
  return (
    isLocalhostDomain(baseUrl.replace(/^https?:\/\//, '')) ||
    process.env.NODE_ENV === 'development'
  )
}

/**
 * Returns the appropriate protocol for a domain (http for localhost, https otherwise).
 */
export function protocolForDomain(domain: string): 'http' | 'https' {
  return isLocalhostDomain(domain) ? 'http' : 'https'
}
