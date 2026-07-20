/**
 * Shared, dependency-free helpers for the conference `domains[]` field (SE-1b).
 *
 * `domains` drives domain→conference routing: a request's `Host` header is
 * matched against this list (exact, or via a single-label wildcard) to decide
 * which conference document serves the site. Because a wrong edit here can take
 * the site down, these helpers are used verbatim on BOTH sides of the safeguard
 * — the server mutation guard AND the client editor's row-lock — so the two can
 * never disagree about which entry is "the domain you are currently using".
 *
 * Keep this module pure and client-safe (no server-only imports): the admin
 * editor bundles it.
 */

/** BAD_REQUEST message thrown when a payload removes the current request host. */
export const CANNOT_REMOVE_CURRENT_DOMAIN =
  'You cannot remove the domain you are currently using'

// A bare hostname, lowercase, optionally with a `:port` (dev entries such as
// `localhost:3000`) or a leading `*.` wildcard label (the routing matches a
// request's `*.<rest>` subdomain form against such entries). No scheme, no path,
// no whitespace, no leading/trailing dot or hyphen per label. Mirrors what the
// routing GROQ can actually match.
const HOSTNAME_RE =
  /^(?=.{1,253}$)(\*\.)?[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*(:\d{1,5})?$/

/** Trim + lowercase an entry to its canonical stored form. */
export function normalizeDomain(entry: string): string {
  return entry.trim().toLowerCase()
}

/**
 * True when `entry` is a bare hostname (optionally with a dev `:port`). Assumes
 * the caller passes an already-{@link normalizeDomain}d value. Rejects anything
 * carrying a scheme (`https://…`) or a path (`example.com/foo`).
 */
export function isValidDomainEntry(entry: string): boolean {
  return HOSTNAME_RE.test(entry)
}

/**
 * The single-label wildcard form of a host, or `null` when the host has ≤2
 * labels (nothing to wildcard). e.g. `foo.example.com` → `*.example.com`.
 * Mirrors `getConferenceForDomain`'s `wildcardSubdomain` derivation so the
 * guard matches exactly what the router uses to resolve the conference.
 */
export function wildcardFormForHost(host: string): string | null {
  return host.split('.').length > 2 ? host.replace(/^[^.]+/, '*') : null
}

/**
 * True when a `domains[]` entry would serve `host` — an exact match, or the
 * wildcard entry (`*.example.com`) that covers the host's subdomain. This is the
 * predicate the site's routing uses (`host in domains || wildcard in domains`),
 * reused so the safeguard locks/keeps exactly the entries that keep the site up.
 */
export function domainServesHost(entry: string, host: string): boolean {
  if (!entry || !host) return false
  const e = normalizeDomain(entry)
  const h = normalizeDomain(host)
  if (e === h) return true
  const wild = wildcardFormForHost(h)
  return wild !== null && e === wild
}

/**
 * True when NONE of the entries would serve `host` — i.e. saving this list would
 * strand the current request. The server guard rejects such a payload and the
 * client disables removing the last serving row.
 */
export function domainsWouldStrandHost(
  domains: readonly string[],
  host: string,
): boolean {
  if (!host) return false
  return !domains.some((d) => domainServesHost(d, host))
}
