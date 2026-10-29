/**
 * Whether a host (with or without a port) is the machine it is opened on: a
 * development server, never a deployed site.
 *
 * `localhost` and every name under `.localhost` (RFC 6761), the IPv4 loopback
 * block `127.0.0.0/8`, the IPv6 loopback `::1` (bare, or bracketed as a host
 * header carries it: `[::1]:3000`), and `0.0.0.0`, the address a server that
 * listens on every interface is opened at.
 *
 * EVERY SEND THAT MUST NOT LEAVE A DEV SERVER ASKS THIS, and so does the
 * composer's Send button. Any of these hosts can be an entry of a
 * conference's `domains[]`, and a host with a port is served without a DNS
 * proof: a host this misses is one a dev server mails real contacts from.
 */
export function isLocalhostDomain(domain: string): boolean {
  const host = domain.trim().toLowerCase()
  // An IPv6 literal has colons of its own, so the port cannot be cut at the
  // first one: brackets end the address, and more than one colon without
  // brackets is a bare address with no port.
  const hostname = host.startsWith('[')
    ? host.slice(1).split(']')[0]
    : host.split(':').length > 2
      ? host
      : host.split(':')[0]
  return (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname === '::1' ||
    hostname === '0.0.0.0' ||
    /^127(\.\d{1,3}){3}$/.test(hostname)
  )
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
