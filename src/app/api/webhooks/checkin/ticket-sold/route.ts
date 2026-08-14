import { NextRequest, NextResponse } from 'next/server'
import { sendWorkshopSignupInstructions } from '@/lib/email/workshop'
import {
  getConferenceByCheckinEventId,
  getConferenceTenantByCheckinEventId,
} from '@/lib/conference/sanity'
import { isWorkshopsEnabledForConference } from '@/lib/features/workshops'
import {
  conferenceProviderType,
  getTicketingProvider,
  parseCheckinOrderCreated,
  resolveTicketingCredentials,
  type CheckinWebhookPayload,
} from '@/lib/tickets/provider'

const WORKSHOP_ELIGIBLE_CATEGORIES = [
  'Workshop + Conference (2 days)',
  'Sponsor discount (workshop upgrade)',
  'Speaker ticket',
]

/**
 * Shape of a Checkin HMAC-SHA256 signature: 64 hex characters. Case-insensitive
 * on purpose — the verifier compares the string as sent, so accepting uppercase
 * here only ever hands a doomed signature to the verifier. A shape filter that
 * is STRICTER than the verifier would reject deliveries the verifier would have
 * accepted.
 */
const CHECKIN_SIGNATURE_SHAPE = /^[0-9a-f]{64}$/i

/**
 * THE ONE REJECTION.
 *
 * Every failure BEFORE the signature verifies returns this, byte for byte:
 * unknown event id, an ambiguous binding, a conference bound to another vendor,
 * a tenant with no credentials, an unconfigured platform secret, a malformed
 * signature header, and a genuinely bad signature. They are indistinguishable to
 * the caller in status, body and headers.
 *
 * WHY. Resolving the tenant BEFORE authenticating (see below) means an
 * unauthenticated caller can name any event id it likes. If "no such event"
 * looked different from "bad signature", that difference would enumerate exactly
 * which Checkin events this deployment serves — a customer list, one request per
 * guess. The operator's signal is the `console.error` above each call site; the
 * WIRE says nothing.
 *
 * WHAT THIS DOES NOT CLOSE: timing. A known event id costs a credential
 * resolution and an HMAC that an unknown one does not, so the oracle survives as
 * a timing side channel. Closing that would mean doing the work unconditionally
 * on a dummy secret; it is not done here, and it is a smaller signal than a
 * different status code.
 */
function rejected(): NextResponse {
  return NextResponse.json(
    { success: false, error: 'Invalid signature' },
    { status: 401 },
  )
}

/**
 * Checkin ticket-sold webhook.
 *
 * ORDER (#886): parse → shape pre-filter → RESOLVE THE TENANT → resolve THAT
 * tenant's credentials → verify → act.
 *
 * It used to verify against `platformCheckinCredentials()` first, which is
 * correct only while exactly one tenant exists. A tenant on its own Checkin
 * account signs with its own webhook secret, so every one of its deliveries
 * failed the platform HMAC and returned 401 — no error surface, no user-visible
 * symptom, just no workshop emails, forever.
 *
 * THE COST OF THE REORDER, stated plainly: one Sanity read now happens on an
 * UNAUTHENTICATED request, keyed on an attacker-controlled event id. (Parsing
 * untrusted input pre-authentication is not new — the body has always been
 * `JSON.parse`d before verification, because the HMAC covers `payload.data`.)
 * Three things bound it, and one thing does not:
 *
 *  1. SHAPE PRE-FILTER, no I/O: a payload that is not an order-created event, a
 *     missing or non-64-hex signature header, or a non-positive-integer event id
 *     is answered without touching Sanity at all. This costs an attacker a
 *     well-formed request but is otherwise trivial to satisfy.
 *  2. A THREE-FIELD PROJECTION. The unauthenticated read is
 *     `getConferenceTenantByCheckinEventId` — `_id`, `organization`,
 *     `ticketingProvider`. The full conference document (schedules, featured
 *     content, sponsor joins) is read only after the signature verifies. The
 *     amplification is one small read, not one large one.
 *  3. UNIFORM FAILURE, so the read's ANSWER is not observable ({@link rejected}).
 *
 *  NOT BOUNDED: the request RATE. A well-formed POST still costs exactly one
 *  small Sanity read whether or not it can ever authenticate, and nothing in
 *  this route caps that. The platform's rate limiter (`@/lib/rate-limit`) was
 *  considered and rejected: it is Sanity-backed, so it spends one read AND one
 *  write per request to protect one read — strictly more expensive than the
 *  thing it guards — and it denies on a write failure, which would drop real
 *  ticket sales during a Sanity blip. That is the same silent-loss failure this
 *  change exists to remove. A short-TTL cache was rejected too: enumeration uses
 *  DISTINCT event ids, so a cache bounds repeats it does not bound the attack,
 *  and it would 401 a freshly bound event for the length of its TTL. If this
 *  endpoint is ever seen taking abusive traffic, the bound belongs at the edge
 *  (a WAF/rate rule on the path), not in a Sanity round-trip.
 */
export async function POST(request: NextRequest) {
  let rawBody: string
  try {
    rawBody = await request.text()
  } catch (e) {
    console.error('Checkin webhook: Failed to read request body:', e)
    return NextResponse.json(
      { success: false, error: 'Invalid request body' },
      { status: 400 },
    )
  }

  let payload: CheckinWebhookPayload
  try {
    payload = JSON.parse(rawBody)
  } catch (e) {
    console.error('Checkin webhook: Failed to parse JSON:', e)
    return NextResponse.json(
      { success: false, error: 'Invalid JSON' },
      { status: 400 },
    )
  }

  // `"null"`, `"[]"` and `"7"` are all valid JSON. The old ordering absorbed
  // them because verification re-parsed the body inside its own try/catch; the
  // pre-filter below reads `payload.event` directly, so a non-object body would
  // otherwise throw and answer 500. This is decided entirely by the body's
  // shape, before any event id is looked at, so it discloses nothing.
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    console.error('Checkin webhook: payload is not an object')
    return NextResponse.json(
      { success: false, error: 'Invalid JSON' },
      { status: 400 },
    )
  }

  try {
    // ── PRE-FILTER ──────────────────────────────────────────────────────────
    // A PURE shape read — no provider is constructed here. Nothing on this side
    // of verification holds, or could hold, a credential. (Constructing one with
    // an empty bag would also warn about missing `CHECKIN_API_KEY` on the first
    // webhook of every instance AND consume the once-per-process flag that a
    // genuinely unconfigured deployment needs; see `parseCheckinOrderCreated`.)
    const claimed = parseCheckinOrderCreated(payload)

    if (!claimed) {
      // Not an order-created delivery: we take no action on it either way, so
      // ACK without verifying and without a read. (The ACK is what stops Checkin
      // retrying a delivery we intentionally ignore.) This tells an
      // unauthenticated caller which event NAME we act on — vendor-documented,
      // and the cheapest bound available on the read below.
      return NextResponse.json(
        { success: true, message: 'Event ignored' },
        { status: 200 },
      )
    }

    const eventId = claimed.eventId
    if (
      typeof eventId !== 'number' ||
      !Number.isSafeInteger(eventId) ||
      eventId <= 0
    ) {
      console.error('Checkin webhook: payload carries no usable eventId')
      return rejected()
    }

    const signature = request.headers.get('checkin-signature')
    if (!signature || !CHECKIN_SIGNATURE_SHAPE.test(signature)) {
      console.error('Checkin webhook: missing or malformed signature header')
      return rejected()
    }

    // ── TENANT RESOLUTION (the one unauthenticated read) ────────────────────
    const { tenant, error: tenantError } =
      await getConferenceTenantByCheckinEventId(eventId)

    if (tenantError || !tenant) {
      console.error(
        'Checkin webhook: no single conference owns checkin eventId',
        eventId,
        tenantError?.message,
      )
      return rejected()
    }

    // A conference that has MOVED to another vendor may still carry a stale
    // `checkinEventId`. Its `ticketing` secret is that vendor's, so verifying a
    // Checkin HMAC with it would compare an HMAC against a Tito token. Refuse.
    if (conferenceProviderType(tenant) !== 'checkin') {
      console.error(
        'Checkin webhook: conference',
        tenant._id,
        'is not bound to Checkin; refusing the delivery',
      )
      return rejected()
    }

    // ── THIS TENANT'S CREDENTIALS ───────────────────────────────────────────
    // The platform org still gets the platform env account — `resolveTicketing-
    // Credentials` layers it back on for `PLATFORM_ORG_ID` and nobody else — so
    // tenant #1 is unchanged. Any other tenant verifies against ITS OWN secret
    // or, having none, against nothing at all (fail closed: a delivery we cannot
    // authenticate is refused, never authenticated with somebody else's key).
    const credentials = await resolveTicketingCredentials(
      tenant.organization?._ref,
      'checkin',
    )
    if (!credentials) {
      console.error(
        'Checkin webhook: no ticketing credentials for the org owning conference',
        tenant._id,
        '— refusing the delivery',
      )
      return rejected()
    }

    const provider = getTicketingProvider('checkin', credentials)
    const verification = provider.verifyWebhook(rawBody, request.headers)
    if (!verification.verified) {
      // `not-configured` (the platform secret is unset) used to return 500 here.
      // It cannot any more: after the reorder it is only reachable for a KNOWN
      // event id, so a distinct status would be exactly the existence oracle
      // {@link rejected} closes. The operator signal moved to this log line, and
      // the delivery is refused rather than retried.
      console.error(
        'Checkin webhook: verification failed (',
        verification.reason,
        ') for conference',
        tenant._id,
      )
      return rejected()
    }

    // ══ AUTHENTICATED FROM HERE ═════════════════════════════════════════════

    const orderData = provider.parseOrderCreated(payload)

    if (!orderData) {
      return NextResponse.json(
        { success: true, message: 'Event ignored' },
        { status: 200 },
      )
    }

    if (!orderData.users || orderData.users.length === 0) {
      return NextResponse.json(
        { success: true, message: 'No tickets in order' },
        { status: 200 },
      )
    }

    const { conference, error } = await getConferenceByCheckinEventId(
      orderData.eventId,
    )

    if (error || !conference) {
      console.error(
        'Checkin webhook: Conference not found for eventId:',
        orderData.eventId,
      )
      return NextResponse.json(
        { success: false, error: 'Conference not found' },
        { status: 404 },
      )
    }

    // FEATURE GATE (#689) — THE SAFETY-CRITICAL ONE. These instructions link an
    // attendee into the workshop portal. For any tenant the portal is not
    // enabled for, that link cannot work (the AuthKit round-trip is sealed to
    // the platform host), so the attendee would be emailed an infinite sign-in
    // loop, automatically, on every workshop ticket sale. Emailing a link that
    // cannot work is worse than silence: send NOTHING. Fail-closed — an
    // unresolvable organization suppresses the email too.
    if (!(await isWorkshopsEnabledForConference(conference))) {
      console.warn(
        'Checkin webhook: workshops not enabled for conference',
        conference._id,
        '— suppressing workshop signup instructions for',
        orderData.users.length,
        'ticket(s)',
      )
      return NextResponse.json(
        {
          success: true,
          message: `Processed ${orderData.users.length} ticket(s), sent 0 email(s) (workshops not enabled for this organization)`,
          results: [],
        },
        { status: 200 },
      )
    }

    const emailResults: Array<{
      email: string
      success: boolean
      emailId?: string
    }> = []

    for (const user of orderData.users) {
      if (!WORKSHOP_ELIGIBLE_CATEGORIES.includes(user.ticket.name)) {
        continue
      }

      const userName = `${user.crm.firstName} ${user.crm.lastName}`.trim()

      const emailResult = await sendWorkshopSignupInstructions({
        userEmail: user.crm.email.email,
        userName,
        conference,
        ticketCategory: user.ticket.name,
      })

      if (emailResult.error) {
        console.error(
          'Checkin webhook: Failed to send email to',
          user.crm.email.email,
          emailResult.error,
        )
        emailResults.push({
          email: user.crm.email.email,
          success: false,
        })
      } else {
        emailResults.push({
          email: user.crm.email.email,
          success: true,
          emailId: emailResult.data?.emailId,
        })
      }
    }

    const successCount = emailResults.filter((r) => r.success).length

    return NextResponse.json(
      {
        success: true,
        message: `Processed ${orderData.users.length} ticket(s), sent ${successCount} email(s)`,
        results: emailResults,
      },
      { status: 200 },
    )
  } catch (error) {
    console.error('Checkin webhook error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    )
  }
}
