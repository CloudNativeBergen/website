import 'server-only'
import { NextResponse } from 'next/server'
import { isValidDomainEntry, normalizeDomain } from '@/lib/conference/domains'
import {
  resolveProvenDestination,
  type ProvenDestination,
} from '@/lib/domain-verification/destination'
import { isWorkshopsEnabledForConference } from '@/lib/features/workshops'

export interface CentralSignIn {
  /** `scheme://host[:port]` of the auth host: where WorkOS calls back. */
  authOrigin: string
  destination: ProvenDestination
}

/** A refusal on the auth host is a 404, whatever the reason. */
export function notFound(): NextResponse {
  return new NextResponse('Not Found', { status: 404 })
}

/**
 * `WORKSHOP_AUTH_ORIGIN` as an origin. `'unset'`: a host is its own auth host.
 * `'invalid'`: the value cannot be used (not a bare origin of a hostname, or
 * plain HTTP outside development), and every sign-in is refused.
 */
function configuredAuthOrigin(): URL | 'unset' | 'invalid' {
  const raw = process.env.WORKSHOP_AUTH_ORIGIN?.trim()
  if (!raw) return 'unset'
  const url = URL.parse(raw)
  const usable =
    url !== null &&
    `${url.origin}/` === url.href &&
    // The shape a `Host` header is compared in: no trailing dot, no IPv6.
    isValidDomainEntry(url.host) &&
    (url.protocol === 'https:' ||
      (url.protocol === 'http:' && process.env.NODE_ENV === 'development'))
  if (!usable) {
    console.error(
      '[workshop] WORKSHOP_AUTH_ORIGIN is not a bare https origin of a hostname; workshop sign-in is refused on every host.',
    )
    return 'invalid'
  }
  return url
}

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
export async function resolveCentralSignIn(
  headers: { get(name: string): string | null },
  host: string | null | undefined,
): Promise<CentralSignIn | null> {
  const configured = configuredAuthOrigin()
  if (configured === 'invalid') return null
  const authHost =
    configured === 'unset' ? normalizeDomain(host ?? '') : configured.host
  const requestHost = normalizeDomain(headers.get('host') ?? '')
  if (!requestHost || requestHost !== authHost) return null

  const destination = await resolveProvenDestination(host)
  if (!destination) return null
  if (!(await isWorkshopsEnabledForConference(destination.conference))) {
    return null
  }
  return {
    authOrigin: configured === 'unset' ? destination.origin : configured.origin,
    destination,
  }
}
