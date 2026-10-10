import 'server-only'
import { normalizeDomain } from '@/lib/conference/domains'
import {
  resolveProvenDestination,
  type ProvenDestination,
} from '@/lib/domain-verification/destination'
import { isWorkshopsEnabledForConference } from '@/lib/features/workshops'

/**
 * MAY THIS REQUEST, ON THE AUTH HOST, RUN A SIGN-IN FOR `host`? (#1311, spec
 * §2 and §3.) Asked by the start route and again by the callback, before
 * either touches WorkOS:
 *
 *  1. THE REQUEST IS ON THE AUTH HOST. `WORKSHOP_AUTH_ORIGIN` names it. Unset,
 *     a host is its own auth host: the request must then be on `host` itself.
 *  2. `host` MAY RECEIVE A HAND-OFF (`resolveProvenDestination`).
 *  3. THE CONFERENCE THAT CLAIMS IT HAS WORKSHOPS, so a tenant without them is
 *     never sent to WorkOS.
 *
 * The first is decided from the request alone, before anything is read.
 * `null` refuses; the caller answers 404.
 */
export interface CentralSignIn {
  /** `scheme://host[:port]` of the auth host: where WorkOS calls back. */
  authOrigin: string
  destination: ProvenDestination
}

/**
 * The configured auth origin; `undefined` when unset, `null` when the value
 * cannot be used: not an origin, or plain HTTP outside development.
 */
function configuredAuthOrigin(): URL | null | undefined {
  const raw = process.env.WORKSHOP_AUTH_ORIGIN?.trim()
  if (!raw) return undefined
  const url = URL.parse(raw)
  const usable =
    url !== null &&
    `${url.origin}/` === url.href &&
    (url.protocol === 'https:' ||
      (url.protocol === 'http:' && process.env.NODE_ENV === 'development'))
  if (!usable) {
    console.error(
      '[workshop] WORKSHOP_AUTH_ORIGIN is not an https origin; workshop sign-in is refused on every host.',
    )
    return null
  }
  return url
}

export async function resolveCentralSignIn(
  headers: { get(name: string): string | null },
  host: string | null | undefined,
): Promise<CentralSignIn | null> {
  const requestHost = normalizeDomain(headers.get('host') ?? '')
  const configured = configuredAuthOrigin()
  if (configured === null) return null
  const authHost = configured ? configured.host : normalizeDomain(host ?? '')
  if (!requestHost || requestHost !== authHost) return null

  const destination = await resolveProvenDestination(host)
  if (!destination) return null
  if (!(await isWorkshopsEnabledForConference(destination.conference))) {
    return null
  }
  return { authOrigin: configured?.origin ?? destination.origin, destination }
}
