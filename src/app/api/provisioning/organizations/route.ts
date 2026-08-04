import { NextRequest, NextResponse } from 'next/server'
import { unstable_noStore as noStore } from 'next/cache'
import { clientIpFromHeaders } from '@/lib/rate-limit'
import {
  authenticateProvisioningRequest,
  chargeProvisioningAttempt,
  chargeProvisioningCreate,
  MAX_IDEMPOTENCY_KEY_LENGTH,
  MIN_IDEMPOTENCY_KEY_LENGTH,
} from '@/lib/provisioning'
import { provisionOrganization } from '@/lib/onboarding/provision'
import { CreateOrganizationSchema } from '@/server/schemas/onboarding'

/**
 * MACHINE PROVISIONING API (#753) — `POST /api/provisioning/organizations`.
 *
 * The control panel (`RunKonf/kontroll`, my.konf.app) is a separate app with no
 * Konf session, so it cannot use the operator wizard's tRPC surface. It
 * presents a shared bearer secret instead and reaches the SAME tenant-creation
 * transaction (`@/lib/onboarding/provision`) that the wizard does. This file is
 * an AUTHENTICATION path, not a second implementation: it contains no
 * provisioning logic and must never grow any.
 *
 * WHAT THIS ENDPOINT CAN DO IF IT IS WRONG: mint organizations, claim domains
 * globally (which is also an OAuth redirect grant, see #683/#688) and attach an
 * arbitrary person as an organizer. So:
 *
 *  - The attempt limiter is charged BEFORE authentication, so guessing the
 *    secret is metered rather than free.
 *  - Every authentication failure — unset secret, absent header, wrong token —
 *    produces the IDENTICAL opaque 401. An unset `PROVISIONING_API_TOKEN`
 *    refuses everybody (fail CLOSED); it never means "no auth required".
 *  - The token is never echoed into a response, an error or a log line.
 *  - UNAUTHENTICATED callers learn NOTHING about the content lake. Slug and
 *    domain conflicts are only described once the caller has proven it holds
 *    the secret — the control panel legitimately needs to render "that slug is
 *    taken", and by that point the caller is trusted platform infrastructure,
 *    not an anonymous prober.
 *  - Replay is refused ATOMICALLY, not by a read-then-write check: see the
 *    `Idempotency-Key` contract below.
 *
 * ── REQUEST ────────────────────────────────────────────────────────────────
 *   POST /api/provisioning/organizations
 *   Authorization: Bearer <PROVISIONING_API_TOKEN>
 *   Idempotency-Key: <opaque, 16-200 printable ASCII chars>   (REQUIRED)
 *   Content-Type: application/json
 *
 *   {
 *     "organization": { "name", "slug", "contactEmail", "billingEmail"? },
 *     "conference":   { "title", "city", "country", "startDate"?, "endDate"? },
 *     "organizer":    { "name", "email" },
 *     "domains":      ["oslo.example.com"]      (OPTIONAL, usually omitted)
 *   }
 *
 * ── THE TENANT'S ADDRESS ───────────────────────────────────────────────────
 * `domains` is normally omitted by this caller: provisioning MINTS the
 * edition's host — `<org-slug>-<year>.<PLATFORM_DOMAIN_SUFFIX>`, one label, or
 * the bare slug when no `startDate` was given — and claims it in the
 * transaction, so the response's first challenge is a live, `platform-owned`
 * host the organizer can sign in on immediately. Any `domains` sent are claimed
 * IN ADDITION and still have to prove themselves by DNS. See
 * `@/lib/onboarding/provision`.
 *
 * ── RESPONSES ──────────────────────────────────────────────────────────────
 *   201 { organizationId, conferenceId, speakerId, speakerCreated,
 *         replayed: false, challenges: DomainVerificationView[] }
 *   200 same shape with `replayed: true` — this key already provisioned; the
 *       ORIGINAL ids are returned and nothing was written.
 *   400 { error: "invalid_request", code, issues? }
 *   401 { error: "unauthorized" }                       (uniform, always)
 *   409 { error: "conflict", code, slug? | domains? | host? }
 *   429 { error: "rate_limited" }                       (+ Retry-After)
 *   500 { error: "internal_error", code? }
 */

const RETRY_AFTER_SECONDS = 60

/** Printable ASCII only — the key is hashed, never rendered, but a control
 * character in a header value is a sign of a mangled client, not a real key. */
const IDEMPOTENCY_KEY_RE = /^[\x20-\x7e]+$/

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
    // 1. METER FIRST, AUTHENTICATE SECOND. Charging the attempt bucket before
    //    the token is compared is what turns "guess the shared secret" from a
    //    free operation into a rate-limited one.
    if (
      !(await chargeProvisioningAttempt(clientIpFromHeaders(request.headers)))
    ) {
      return rateLimited()
    }

    // 2. AUTHENTICATE. Only `ok` is branched on; the reason is logged for the
    //    operator and never leaves the server.
    const auth = authenticateProvisioningRequest(request.headers)
    if (!auth.ok) {
      console.warn(`[provisioning] request refused (${auth.reason})`)
      return unauthorized()
    }

    // 3. IDEMPOTENCY KEY. Required, because a machine caller that retries a
    //    timed-out request without one would create a second tenant, and the
    //    duplicate would already own the domain claim.
    const idempotencyKey = request.headers.get('idempotency-key')?.trim()
    if (
      !idempotencyKey ||
      idempotencyKey.length < MIN_IDEMPOTENCY_KEY_LENGTH ||
      idempotencyKey.length > MAX_IDEMPOTENCY_KEY_LENGTH ||
      !IDEMPOTENCY_KEY_RE.test(idempotencyKey)
    ) {
      return invalidRequest('idempotency_key_required')
    }

    // 4. VALIDATE THE PAYLOAD BEFORE ANY WRITE PATH IS ENTERED, with the SAME
    //    Zod schema the operator wizard posts through — a looser copy here
    //    would be a second, weaker door into the same transaction.
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return invalidRequest('invalid_json')
    }

    const parsed = CreateOrganizationSchema.safeParse(body)
    if (!parsed.success) {
      return invalidRequest(
        'schema_validation_failed',
        parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      )
    }

    // 5. Charge the global creation bucket only now — a malformed payload
    //    should not consume the platform's tenant-creation budget, and it is
    //    already metered by the attempt bucket above.
    if (!(await chargeProvisioningCreate())) {
      return rateLimited()
    }

    const outcome = await provisionOrganization(parsed.data, { idempotencyKey })

    if (!outcome.ok) {
      const { rejection } = outcome
      switch (rejection.code) {
        case 'slug_taken':
          return NextResponse.json(
            { error: 'conflict', code: 'slug_taken', slug: rejection.slug },
            { status: 409 },
          )
        case 'domain_claimed':
          return NextResponse.json(
            {
              error: 'conflict',
              code: 'domain_claimed',
              domains: rejection.domains,
            },
            { status: 409 },
          )
        case 'platform_host_taken':
          // A CONFLICT, not a bad request: the payload is fine and the slug is
          // free, but the address it mints is taken. The control panel's remedy
          // is the same as for `slug_taken` — ask for a different slug — so it
          // is reported the same way, with the offending host named.
          return NextResponse.json(
            {
              error: 'conflict',
              code: 'platform_host_taken',
              slug: rejection.slug,
              host: rejection.host,
            },
            { status: 409 },
          )
        case 'reserved_slug':
          // Same shape and remedy as `slug_taken` — the slug is unusable and
          // the control panel has to ask for another one.
          return NextResponse.json(
            {
              error: 'conflict',
              code: 'reserved_slug',
              slug: rejection.slug,
            },
            { status: 409 },
          )
        case 'no_host_available':
          // NOT the caller's fault and NOT fixable by it: this caller does not
          // name domains, so the missing `PLATFORM_DOMAIN_SUFFIX` is a platform
          // misconfiguration. A named 500 tells the operator where to look and
          // keeps the control panel from retrying a request that cannot succeed
          // until the deployment changes.
          console.error(
            '[provisioning] refused: no host could be minted for the tenant — is PLATFORM_DOMAIN_SUFFIX set?',
          )
          return NextResponse.json(
            { error: 'internal_error', code: 'platform_domain_unconfigured' },
            { status: 500 },
          )
        case 'ambiguous_organizer':
          return NextResponse.json(
            { error: 'conflict', code: 'ambiguous_organizer' },
            { status: 409 },
          )
        case 'commit_failed':
          console.error(
            '[provisioning] tenant transaction failed',
            rejection.cause,
          )
          return NextResponse.json({ error: 'internal_error' }, { status: 500 })
      }
    }

    return NextResponse.json(
      {
        organizationId: outcome.organizationId,
        conferenceId: outcome.conferenceId,
        speakerId: outcome.speakerId,
        speakerCreated: outcome.speakerCreated,
        replayed: outcome.replayed,
        challenges: outcome.challenges,
      },
      { status: outcome.replayed ? 200 : 201 },
    )
  } catch (error) {
    // Deliberately detail-free: this endpoint is reachable by anyone who can
    // reach the network, and a stack-shaped message is reconnaissance.
    console.error('[provisioning] unhandled error', error)
    return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }
}
