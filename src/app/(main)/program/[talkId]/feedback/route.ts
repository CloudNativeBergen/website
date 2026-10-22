import { NextResponse, type NextRequest } from 'next/server'
import { isConferenceUnavailable, isUnknownHost } from '@/lib/conference/guard'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { feedbackCodeForTalk } from '@/lib/feedback/server'

/**
 * Where every refusal lands: the attendee page's generic Unknown state. Not
 * a code (seven characters, and `o` is outside the alphabet), so the page
 * answers it without a lookup, exactly as it answers a mistyped code.
 */
export const UNKNOWN_FEEDBACK_PATH = '/f/unknown'

/**
 * GET /program/<talkId>/feedback — the programme's "Give feedback" link
 * (#1472). It redirects to the talk's CURRENT `/f/<code>`, so the programme
 * never carries the code and a rotated code never strands anyone.
 *
 * A talk that is not confirmed, not public (§7.2), not this conference's, or
 * holds no code gets the same Unknown page as any other: the route says
 * nothing a scanned code would not. A failed read is a 503, never Unknown,
 * which would tell a valid code it is invalid.
 */
export async function GET(
  request: NextRequest,
  segmentData: { params: Promise<{ talkId: string }> },
): Promise<NextResponse> {
  const { talkId } = await segmentData.params

  // A failed read is not "no conference here" (`guard.ts`): check it first.
  const resolution = await getConferenceForCurrentDomain()
  if (isConferenceUnavailable(resolution)) return unavailable()
  if (isUnknownHost(resolution)) {
    return feedbackLinkResponse(NextResponse.json(null, { status: 404 }))
  }
  const { conference } = resolution

  let code: string | null
  try {
    code = await feedbackCodeForTalk(conference, talkId, new Date())
  } catch (error) {
    console.error('Could not resolve the programme feedback link', error)
    return unavailable()
  }

  const location = new URL(request.url)
  location.pathname = code ? `/f/${code}` : UNKNOWN_FEEDBACK_PATH
  location.search = ''
  location.hash = ''
  // 302, never permanent: the code behind a talk can rotate.
  return feedbackLinkResponse(NextResponse.redirect(location, 302))
}

function unavailable(): NextResponse {
  return feedbackLinkResponse(
    new NextResponse('Session feedback is unavailable. Try again shortly.', {
      status: 503,
      headers: { 'Retry-After': '30' },
    }),
  )
}

function feedbackLinkResponse(response: NextResponse): NextResponse {
  response.headers.set('Cache-Control', 'no-store')
  response.headers.set('X-Robots-Tag', 'noindex')
  return response
}
