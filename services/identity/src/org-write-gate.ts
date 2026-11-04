// Better Auth's organization() plugin exposes write endpoints (invite-member,
// update-member-role, remove-member, accept-invitation, set-active, update, …)
// to any session. They bypass the audit log and the Sanity mirror, so they are
// refused over HTTP until #1923 replaces them with audited mutations and
// removes this gate. Reads (GET) pass. Server-side `auth.api.*` calls are not
// affected: they never go through the worker's fetch handler.

const PREFIX = '/api/auth/organization/'

/**
 * Non-GET organization endpoints still reachable over HTTP. Empty: neither
 * sign-in, the handoff, token issuance nor the site (src/lib/auth/identity-*.ts)
 * calls one. #1923 removes this gate.
 */
export const ORG_WRITE_ALLOWLIST: ReadonlySet<string> = new Set<string>([])

const forbidden = () => Response.json({ error: 'Forbidden' }, { status: 403 })

/** A 403 for a blocked organization write, or null to let it through. */
export function orgWriteGate(request: Request): Response | null {
  if (request.method === 'GET' || request.method === 'HEAD') return null
  // Fold encoding, case, repeated and trailing slashes so a router that
  // tolerates them cannot be reached around the gate.
  let path: string
  try {
    path = decodeURIComponent(new URL(request.url).pathname)
  } catch {
    return forbidden()
  }
  path = path.toLowerCase().replace(/\/+/g, '/').replace(/\/$/, '')
  if (!`${path}/`.startsWith(PREFIX)) return null
  if (ORG_WRITE_ALLOWLIST.has(path.slice(PREFIX.length))) return null
  return forbidden()
}
