/**
 * Protocol normalization utilities for badge endpoints
 */

/**
 * Normalize domain to include correct protocol
 * - localhost → http://localhost
 * - production domains → https://domain
 * - domains with protocol already → unchanged
 *
 * @param domain - Domain name (may include protocol)
 * @returns Full URL with normalized protocol
 */
export function normalizeProtocolForDomain(domain: string): string {
  if (domain.startsWith('http://') || domain.startsWith('https://')) {
    return domain
  }

  const protocol = domain.includes('localhost') ? 'http' : 'https'
  return `${protocol}://${domain}`
}
