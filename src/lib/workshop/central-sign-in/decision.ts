import 'server-only'
import { NextResponse } from 'next/server'
import { isValidDomainEntry, normalizeDomain } from '@/lib/conference/domains'
import {
  resolveProvenDestination,
  type ProvenDestination,
} from '@/lib/domain-verification/destination'
import { isWorkshopsEnabledForConference } from '@/lib/features/workshops'
import { WORKSHOP_PORTAL_PATH } from '../sign-in-paths'

/** A host that may sign in, and the auth host it signs in through. */
export interface SignInHost {
  /** `scheme://host[:port]` of the auth host: where WorkOS calls back. */
  authOrigin: string
  destination: ProvenDestination
}

/** `destination` with its auth host: itself when the variable is unset. */
function signInHost(
  configured: URL | 'unset',
  destination: ProvenDestination,
): SignInHost {
  return {
    authOrigin: configured === 'unset' ? destination.origin : configured.origin,
    destination,
  }
}

/** A refusal that shows nothing: a 404, whatever the reason. */
export function notFound(): NextResponse {
  return new NextResponse('Not Found', { status: 404 })
}

/**
 * Say in the log why a step of a sign-in refused. The attendee is never told
 * (a 404, or one neutral line), so this is the only place the reason exists.
 * The reason is one of a fixed set of words, never a value from the request.
 */
export function logRefusal(
  ...[step, reason]:
    | [step: 'callback', reason: CallbackRefusal]
    | [step: 'redeem', reason: RedeemRefusal]
): void {
  console.warn(`[workshop] ${step} refused: ${reason}`)
}

/** Why the callback refuses: the words `logRefusal` writes. */
export type CallbackRefusal =
  'no-state' | 'no-code' | 'no-cookie' | 'host-refused' | 'conference-changed'

/** Why redeem refuses. */
export type RedeemRefusal =
  | 'no-hand-off'
  | 'no-cookie'
  | 'other-host'
  | 'host-refused'
  | 'conference-changed'
  | 'no-workshops'

/**
 * To the portal page, by a path nothing in the request chooses. `suffix` is a
 * fixed query of ours, never the request's.
 */
export function toPortal(suffix = ''): NextResponse {
  return new NextResponse(null, {
    status: 307,
    headers: {
      Location: `${WORKSHOP_PORTAL_PATH}${suffix}`,
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
    },
  })
}

/**
 * `WORKSHOP_AUTH_ORIGIN` as an origin. `'unset'`: a host is its own auth host.
 * `'invalid'`: the value cannot be used (not a bare origin of a hostname, or
 * plain HTTP outside development).
 */
function authOrigin(): URL | 'unset' | 'invalid' {
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
  return usable ? url : 'invalid'
}

/** {@link authOrigin} for a decision: an unusable value refuses every sign-in, and says so. */
function configuredAuthOrigin(): URL | 'unset' | 'invalid' {
  const configured = authOrigin()
  if (configured === 'invalid') {
    console.error(
      '[workshop] WORKSHOP_AUTH_ORIGIN is not a bare https origin of a hostname; workshop sign-in is refused on every host.',
    )
  }
  return configured
}

/**
 * With `WORKSHOP_AUTH_ORIGIN` set: is this request on the host it names? That
 * host serves no conference, so the tenant-host routes answer 404 there.
 * Decided from the request alone.
 */
export function isAuthHost(headers: {
  get(name: string): string | null
}): boolean {
  const configured = authOrigin()
  return (
    typeof configured === 'object' &&
    normalizeDomain(headers.get('host') ?? '') === configured.host
  )
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
): Promise<SignInHost | null> {
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
  return signInHost(configured, destination)
}

/**
 * MAY THIS REQUEST'S HOST CARRY THE WORKSHOP PORTAL'S SIGN-IN? (#1311, spec §2
 * and §4.) Asked on the tenant host by the routes that begin and redeem a
 * sign-in and by every read of the session. `null` refuses:
 *
 *  - `WORKSHOP_AUTH_ORIGIN` cannot be used, or names this very host (it serves
 *    no conference). Both decided before anything is read;
 *  - the host may not receive a hand-off (`resolveProvenDestination`).
 *
 * Otherwise the host as proven, with the conference that claims it, and the
 * auth host it signs in through (itself when the variable is unset).
 *
 * ONE LIVE RECORD READ. It does not ask whether the conference has workshops:
 * the caller does, from `destination.conference`.
 */
export async function resolveTenantHost(headers: {
  get(name: string): string | null
}): Promise<SignInHost | null> {
  const configured = configuredAuthOrigin()
  if (configured === 'invalid') return null
  const requestHost = normalizeDomain(headers.get('host') ?? '')
  if (configured !== 'unset' && requestHost === configured.host) return null

  const destination = await resolveProvenDestination(requestHost)
  return destination && signInHost(configured, destination)
}
