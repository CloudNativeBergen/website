import 'server-only'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { isWorkshopsEnabledForConference } from '@/lib/features/workshops'
import {
  resolveWorkshopSignInHost,
  workshopRequestHost,
  type WorkshopSignInHost,
} from './sign-in'

/**
 * MAY THIS REQUEST START OR FINISH A WORKOS SIGN-IN? Two questions, both asked
 * before the SDK is touched, by the routes that send a signed-out visitor to
 * WorkOS (`/workshop/sign-in`, `/workshop/sign-up`) and the one that trades the
 * code they come back with (`/api/auth/callback`):
 *
 *  1. THE HOST — `resolveWorkshopSignInHost`: ownership-verified, read live.
 *  2. THE FEATURE — `isWorkshopsEnabledForConference`, for the conference this
 *     host serves. A verified host says where a sign-in MAY return to; it does
 *     not say the tenant has a workshop portal to sign in to.
 *
 * WHY THE SECOND ONE LIVES HERE. `/privacy` and `/terms` list WorkOS only for a
 * tenant with workshops, so no visitor of a tenant without them may be sent
 * there. The proxy cannot ask: it decides from the host alone, with no
 * conference in hand and no cache to read one through. So the proxy no longer
 * sends anyone to WorkOS at all; a signed-out visitor reaches the page, the
 * layout answers 404 for a tenant without workshops, and only these routes —
 * behind this check — start a round-trip.
 *
 * NOT ASKED OF A SESSION THAT ALREADY EXISTS. The proxy and the `workshop.*`
 * tRPC identity still read — and, when the token has expired, refresh with
 * WorkOS — a session cookie the browser already holds, and Sign Out ends that
 * session at WorkOS. All three are decided on the host alone. They only ever
 * concern someone who signed in while the tenant had workshops.
 *
 * `null` refuses: the caller answers 404 and stops. Fail closed on an
 * unresolvable conference.
 */
export async function resolveWorkshopSignInForRequest(headers: {
  get(name: string): string | null
}): Promise<WorkshopSignInHost | null> {
  const signIn = await resolveWorkshopSignInHost(workshopRequestHost(headers))
  if (!signIn) return null

  const { conference, error } = await getConferenceForCurrentDomain()
  if (error || !conference) return null
  return (await isWorkshopsEnabledForConference(conference)) ? signIn : null
}
