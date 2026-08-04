import { NextRequest, NextResponse } from 'next/server'
import { revalidateTag, unstable_noStore as noStore } from 'next/cache'
import { clientIpFromHeaders } from '@/lib/rate-limit'
import {
  authenticateProvisioningRequest,
  chargeInvalidation,
  chargeInvalidationAttempt,
} from '@/lib/provisioning'
import {
  InvalidationRequestSchema,
  tagsForTargets,
} from '@/lib/cache/invalidation'

/**
 * EXTERNAL CACHE INVALIDATION (RunKonf/platform#36) —
 * `POST /api/provisioning/cache/invalidate`.
 *
 * `RunKonf/kontroll` (the control panel at my.konf.app) writes `organization`
 * documents into the shared Sanity dataset with its OWN token. It never runs
 * this app's code, so nothing it did could reach `revalidateTag` — and
 * `getOrganizationById` caches `name`, `slug` and `contactEmail` for an hour and
 * holds them for a day. An organizer renaming their organization in kontroll
 * saw a success message and a conference site that kept serving the old name.
 * This endpoint is the missing half: kontroll writes, then says what it wrote.
 *
 * IT SHARES `PROVISIONING_API_TOKEN` with the tenant-creation endpoint, on
 * purpose. Same caller, same trust boundary, same rotation. More to the point,
 * this endpoint is STRICTLY LESS POWERFUL than what that secret already grants:
 * a holder can mint organizations, claim domains (an OAuth redirect grant) and
 * attach organizers — busting a cache entry is a subset of that blast radius,
 * so a second secret would protect nothing an attacker could not already do,
 * while adding a rotation surface and one more env var to forget in a new
 * environment. If a caller ever legitimately needs invalidation WITHOUT
 * provisioning, split it then: `authenticateProvisioningRequest` is a pure
 * function of the headers and takes an env name in one edit.
 *
 * WHAT KEEPS IT FROM BEING A CACHE-STAMPEDE PRIMITIVE:
 *
 *  - The caller names DOCUMENTS, never tags. The broad `content:*` tags (which
 *    bust every tenant at once) are not in the vocabulary and cannot be
 *    reached; see `@/lib/cache/invalidation`.
 *  - At most `MAX_INVALIDATION_TARGETS` targets per call, and the global
 *    post-auth bucket caps calls. The two together bound total revalidation
 *    work no matter what is sent.
 *  - The attempt limiter is charged BEFORE authentication, so guessing the
 *    secret is metered rather than free.
 *
 * WHAT IT DELIBERATELY DOES NOT DO: look anything up. A tag is computed from
 * the caller's own input, so invalidating an organization that does not exist
 * revalidates a tag nothing is stored under — a real no-op, answered with the
 * same 200 as a real hit. There is no existence check to leak, and therefore
 * this endpoint is not an oracle for what is in the content lake.
 *
 * ── REQUEST ────────────────────────────────────────────────────────────────
 *   POST /api/provisioning/cache/invalidate
 *   Authorization: Bearer <PROVISIONING_API_TOKEN>
 *   Content-Type: application/json
 *
 *   { "targets": [
 *       { "type": "organization", "id": "<organization _id>" },
 *       { "type": "conference",   "id": "<conference _id>"   },
 *       { "type": "domain",       "domain": "oslo.example.com" }
 *   ] }
 *
 * ── RESPONSES ──────────────────────────────────────────────────────────────
 *   200 { invalidated: number, tags: string[] }   tags echo the caller's own
 *       input; they reveal nothing the caller did not already send.
 *   400 { error: "invalid_request", code, issues? }
 *   401 { error: "unauthorized" }                 (uniform, always)
 *   429 { error: "rate_limited" }                 (+ Retry-After)
 *   500 { error: "internal_error" }
 *
 * NOT IDEMPOTENCY-KEYED, unlike provisioning: invalidation is naturally
 * idempotent (revalidating a tag twice is indistinguishable from once), so a
 * key would add a required header and a stored receipt to protect nothing.
 */

const RETRY_AFTER_SECONDS = 60

/** The ONE unauthenticated response. Every auth failure mode shares it byte for
 * byte, so a prober cannot distinguish "not configured" from "wrong token". */
function unauthorized(): NextResponse {
  return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
}

function invalidRequest(
  code: string,
  issues?: Array<{ path: string; message: string }>,
): NextResponse {
  return NextResponse.json(
    { error: 'invalid_request', code, ...(issues ? { issues } : {}) },
    { status: 400 },
  )
}

function rateLimited(): NextResponse {
  return NextResponse.json(
    { error: 'rate_limited' },
    { status: 429, headers: { 'Retry-After': String(RETRY_AFTER_SECONDS) } },
  )
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  noStore()
  try {
    // 1. METER FIRST, AUTHENTICATE SECOND — guessing the shared secret is
    //    rate-limited rather than free.
    if (
      !(await chargeInvalidationAttempt(clientIpFromHeaders(request.headers)))
    ) {
      return rateLimited()
    }

    // 2. AUTHENTICATE. Only `ok` is branched on; the reason is logged for the
    //    operator and never leaves the server.
    const auth = authenticateProvisioningRequest(request.headers)
    if (!auth.ok) {
      console.warn(`[cache-invalidation] request refused (${auth.reason})`)
      return unauthorized()
    }

    // 3. VALIDATE. The schema is the ONLY thing that decides what may be
    //    invalidated — including the per-call target cap.
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return invalidRequest('invalid_json')
    }

    const parsed = InvalidationRequestSchema.safeParse(body)
    if (!parsed.success) {
      return invalidRequest(
        'schema_validation_failed',
        parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      )
    }

    // 4. Charge the global bucket only now, so a malformed payload cannot
    //    consume the platform's invalidation budget — it is already metered by
    //    the attempt bucket above.
    if (!(await chargeInvalidation())) {
      return rateLimited()
    }

    const tags = tagsForTargets(parsed.data.targets)
    for (const tag of tags) {
      revalidateTag(tag, 'default')
    }

    return NextResponse.json(
      { invalidated: tags.length, tags },
      { status: 200 },
    )
  } catch (error) {
    // Deliberately detail-free: this endpoint is reachable by anyone who can
    // reach the network, and a stack-shaped message is reconnaissance.
    console.error('[cache-invalidation] unhandled error', error)
    return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }
}
