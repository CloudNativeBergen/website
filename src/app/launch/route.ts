import { NextResponse } from 'next/server'
import { getAuthSession } from '@/lib/auth'

/**
 * PWA launcher — role-aware start page (`start_url` in `src/app/manifest.ts`).
 *
 * The installed app opens here on every fresh launch. This handler renders NO
 * UI: it resolves the signed-in speaker server-side (the SAME source the
 * `/admin` layout trusts — `getAuthSession()` → `session.speaker.isOrganizer`)
 * and issues a per-request 307 redirect to the right home:
 *
 *   - organizer (`session.speaker.isOrganizer === true`)  → `/admin`
 *   - signed-in speaker (has session, not organizer)      → `/cfp/list`
 *   - no session (attendee / logged out)                  → `/program`
 *
 * The logged-out branch MUST land on the PUBLIC program page — never a login
 * wall. `/program` is the attendee home.
 *
 * Impersonation (dev only): `getAuthSession()` already swaps `session.speaker`
 * to the impersonated (always non-organizer) speaker and sets
 * `isImpersonating`, so the checks below transparently follow the impersonated
 * role — an organizer impersonating a speaker is sent to `/cfp/list`, exactly
 * what they're trying to preview. No special-casing needed here.
 *
 * Caching: this must be evaluated fresh on every request. The route is forced
 * dynamic and the redirect carries `Cache-Control: no-store`. The service
 * worker treats this as a document navigation (network-first, never cached),
 * so `/launch` always reaches the server. It is purely a redirect dispatcher —
 * no data is read or rendered, so an unauthenticated hit leaks nothing.
 */

// Never statically optimize or cache: the redirect target is per-user.
export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET(request: Request): Promise<NextResponse> {
  // Pass the request so Bearer-token auth (Authorization header) and dev-mode
  // `?impersonate=` resolution work exactly as they do elsewhere.
  const session = await getAuthSession({
    url: request.url,
    headers: request.headers,
  })

  let target: string
  if (session?.speaker?.isOrganizer) {
    target = '/admin'
  } else if (session?.speaker) {
    target = '/cfp/list'
  } else {
    target = '/program'
  }

  const response = NextResponse.redirect(new URL(target, request.url), {
    status: 307,
  })
  response.headers.set('Cache-Control', 'no-store, must-revalidate')
  return response
}
