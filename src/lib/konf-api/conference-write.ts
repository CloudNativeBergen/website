// Phase 2 of #1881: the admin's conference writes go to D1 through
// api.konf.app before Sanity, per tenant, behind the d1Write rollout flag.
import 'server-only'
import { cookies, headers } from 'next/headers'
import { requestDomain } from '@/lib/conference/request-domain'
import { IDENTITY_SESSION_COOKIE } from '@/lib/auth/identity-cookie'
import { rolloutFlags } from '@/lib/conference/konf-api'
import { konfApiHeaders, konfApiUrl } from './client'
import {
  LIFECYCLE_STATUS_VALUES,
  type LifecycleStatus,
} from '@/lib/homepage/lifecycle'

const TIMEOUT_MS = 5000

/** The `ConferencePatch` fields in services/conference/src/subgraph.ts. */
const MOVED = new Set([
  'title',
  'tagline',
  'city',
  'country',
  'venueName',
  'venueAddress',
  'startDate',
  'endDate',
  'backgroundPattern',
  'primaryColor',
  'accentColor',
  'registrationLink',
  'visibility',
  'socialLinks',
])

/** The host's `d1Write` rollout flag (#1925). */
export async function isD1WriteTenant(
  host: string | null,
  conferenceId: string,
): Promise<boolean> {
  return (await rolloutFlags(host, { _id: conferenceId })).d1Write
}

/**
 * The moved keys of a router input, in `ConferencePatch` shape. Sanity keeps
 * the brand colours under `theme`; `theme: null` unsets both. Undefined values
 * are dropped (left untouched); null is kept (unset).
 */
export function movedConferencePatch(
  input: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(input)) {
    if (v === undefined) continue
    if (k === 'theme') {
      const t = v as { primaryColor: string; accentColor: string } | null
      out.primaryColor = t?.primaryColor ?? null
      out.accentColor = t?.accentColor ?? null
    } else if (k === 'lifecycleStatus') {
      // D1 `published` follows the Sanity override, as the backfill derives it
      // (services/conference/scripts/backfill.ts). null clears it: public.
      out.published = !LIFECYCLE_STATUS_VALUES.includes(v as LifecycleStatus)
    } else if (MOVED.has(k)) {
      out[k] = v
    }
  }
  return out
}

/** The tenant's host: the same source resolveConferenceId uses. */
export async function requestHost(): Promise<string | null> {
  return (await requestDomain()) || null
}

/**
 * The signed-in organizer's identity JWT, minted from this browser's identity
 * session cookie (as /api/token does). Null without a session or on any
 * identity error. No NextAuth upgrade here: that stays a browser flow.
 */
export async function identityJwt(): Promise<string | null> {
  const session = (await cookies()).get(IDENTITY_SESSION_COOKIE)?.value
  if (!session || !process.env.IDENTITY_URL) return null
  try {
    const res = await fetch(
      new URL('/api/auth/token', process.env.IDENTITY_URL),
      {
        headers: { authorization: `Bearer ${session}` },
        cache: 'no-store',
        signal: AbortSignal.timeout(TIMEOUT_MS),
      },
    )
    if (!res.ok) return null
    return ((await res.json()) as { token?: string }).token ?? null
  } catch {
    return null
  }
}

const MUTATION = `mutation($input: ConferencePatch!) { updateConference(input: $input) { id } }`

/** Throws on any HTTP, GraphQL or tenant mismatch error. */
export async function updateConferenceViaApi(
  host: string,
  conferenceId: string,
  patch: Record<string, unknown>,
  userJwt: string,
): Promise<void> {
  const url = konfApiUrl()
  if (!url) throw new Error('KONF_API_URL is not set on this environment')
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      ...(await konfApiHeaders(host, await headers())),
      authorization: `Bearer ${userJwt}`,
    },
    body: JSON.stringify({ query: MUTATION, variables: { input: patch } }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const json = (await res.json()) as {
    data?: { updateConference?: { id?: string } | null }
    errors?: { message?: string }[]
  }
  if (json.errors?.length) {
    throw new Error(json.errors.map((e) => e.message).join('; '))
  }
  const id = json.data?.updateConference?.id
  if (id !== conferenceId) throw new Error(`conference id mismatch: ${id}`)
}
