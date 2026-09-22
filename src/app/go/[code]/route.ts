import { NextResponse, type NextRequest } from 'next/server'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { resolveShortLink } from '@/lib/marketing/short-link'
import { normalizeShortCode } from '@/lib/marketing/short-code'

/**
 * GET /go/<code> — the marketing short link (spec
 * `docs/MARKETING_SHORT_LINKS_SPEC.md` §2.4).
 *
 * Answered on EVERY domain of the conference. The redirect goes to the PATH
 * AND QUERY of the stored tagged link, on the host that was asked, so it can
 * never be an open redirect and it survives a demoted primary domain.
 *
 * The wrapper pattern: THIS function reads the request (the Host, via
 * `getConferenceForCurrentDomain`), and the cached
 * `resolveShortLink(conferenceId, code)` does the Sanity work. Nothing
 * request-scoped crosses into the cached scope, so no tenant's entry can ever
 * be served to another.
 *
 * No `dynamic`/`revalidate` segment config: this repo builds with Next's
 * cacheComponents mode, which forbids them. Reading the Host already opts the
 * route out of any route-level caching, which is what `no-store` states to
 * every cache in front of us as well.
 */
export async function GET(
  request: NextRequest,
  segmentData: { params: Promise<{ code: string }> },
): Promise<NextResponse> {
  const { code: raw } = await segmentData.params

  // GUARD BEFORE FETCH. A malformed code is a 404 and Sanity is never touched
  // — not for the code, and not for the conference either. `/go/` is a public,
  // unauthenticated path; a scanner walking it must cost nothing.
  const code = normalizeShortCode(raw)
  if (!code) return shortLinkResponse(NextResponse.json(null, { status: 404 }))

  const { conference, status } = await getConferenceForCurrentDomain()
  if (status !== 'resolved' || !conference?._id) {
    return shortLinkResponse(NextResponse.json(null, { status: 404 }))
  }

  // `null` — an unknown code, a code belonging to another conference, a stored
  // link that does not parse, an outreach target that no longer derives — is
  // the conference home page with no UTMs. A person who clicked a real post
  // always reaches the conference.
  const target = await resolveShortLink(conference._id, code)

  // 302, never 301 or 308: a permanent redirect is pinned by browsers and
  // would survive a repaired link (§2.6).
  return shortLinkResponse(
    NextResponse.redirect(new URL(target ?? '/', request.url), 302),
  )
}

/** `no-store` and `noindex` on every answer, the 404 included (§2.4). */
function shortLinkResponse(response: NextResponse): NextResponse {
  response.headers.set('Cache-Control', 'no-store')
  response.headers.set('X-Robots-Tag', 'noindex')
  return response
}
