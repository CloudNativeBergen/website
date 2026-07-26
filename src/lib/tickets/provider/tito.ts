import { createHmac, timingSafeEqual } from 'node:crypto'
import type { EventTicket, CheckinPayOrder } from '@/lib/tickets/types'
import type {
  EventDiscount,
  TicketType,
  CreateEventDiscountInput,
} from '@/lib/discounts/types'
import {
  ProviderUnsupportedError,
  type EventRef,
  type TitoEventRef,
  type PublicEventInfo,
  type PublicTicketType,
  type TicketingProvider,
  type TicketingProviderCredentials,
  type WebhookVerifyResult,
  type CheckinWebhookPayload,
  type CheckinOrderCreatedData,
} from './types'

/** Default Tito Admin API v3 base URL. Overridable via injected credentials. */
export const TITO_API_URL = 'https://api.tito.io/v3'

const PROVIDER_NAME = 'Tito'

// ── Tito wire shapes (only the fields we map) ────────────────────────────────
//
// Tito v3 wraps collections under a plural root key with a `meta` block, e.g.
// `{ releases: [...], meta: { next_page } }`.

interface TitoRelease {
  id: number
  slug?: string
  title?: string
  description?: string | null
  /** Decimal string, INCLUSIVE of tax (see the VAT note in fetchPublicTicketTypes). */
  price?: string | number | null
  /** Allocation cap; null/absent ⇒ unlimited. */
  quantity?: number | null
  /** Tickets already issued against this release (when the API surfaces it). */
  tickets_count?: number | null
  /** A secret release is reachable only by a direct link/access code. */
  secret?: boolean
  state?: string
  position?: number
  start_at?: string | null
  end_at?: string | null
}

interface TitoTicket {
  id: number
  registration_id?: number | null
  first_name?: string | null
  last_name?: string | null
  name?: string | null
  email?: string | null
  release_id?: number | null
  release_title?: string | null
  release?: { title?: string | null } | null
  state?: string | null
  price?: string | number | null
  discount_code?: string | null
  created_at?: string | null
}

interface TitoEvent {
  id?: number
  title?: string
  slug?: string
  currency?: string | null
  start_date?: string | null
  end_date?: string | null
}

interface TitoMeta {
  next_page?: number | null
}

/**
 * Narrow a (possibly Checkin-shaped) {@link EventRef} to Tito's account+event
 * slug pair. A Checkin ref reaching this provider is a wiring bug (the resolver
 * picks the provider from the same `ticketingProvider` field).
 */
function titoRef(ref: EventRef): TitoEventRef {
  if (ref.provider !== 'tito') {
    throw new Error(
      'TitoProvider received a non-Tito event reference — check the resolver wiring',
    )
  }
  return ref
}

/**
 * Tito.io implementation of {@link TicketingProvider} (Admin API v3).
 *
 * The SECOND provider — its purpose is to prove the adapter generalizes past
 * Checkin. Credentials are injected (constructor only, never `process.env`);
 * `apiKey` is the Tito API token, `webhookSecret` is the endpoint's security
 * token. Where a Checkin-shaped interface member has no faithful Tito analogue
 * (the numeric-`eventId` discount/order methods), the provider throws a typed
 * {@link ProviderUnsupportedError} rather than a bare Error.
 */
export class TitoProvider implements TicketingProvider {
  readonly name = PROVIDER_NAME

  private readonly apiUrl: string
  private readonly apiKey: string | undefined
  private readonly webhookSecret: string | undefined

  constructor(credentials: TicketingProviderCredentials) {
    this.apiUrl = (credentials.apiUrl ?? TITO_API_URL).replace(/\/+$/, '')
    this.apiKey = credentials.apiKey
    this.webhookSecret = credentials.webhookSecret
  }

  isConfigured(): boolean {
    return !!this.apiKey
  }

  // ── Transport ─────────────────────────────────────────────────────

  private headers(): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    }
    // Tito v3 auth: `Authorization: Token token=<secret API token>`.
    if (this.apiKey) {
      headers.Authorization = `Token token=${this.apiKey}`
    }
    return headers
  }

  private async get<T>(path: string): Promise<T> {
    if (!this.isConfigured()) {
      throw new Error(
        'Tito API is not configured. Please check the TITO_API_KEY environment variable (or the per-org ticketing secret).',
      )
    }

    let response: Response
    try {
      response = await fetch(`${this.apiUrl}${path}`, {
        method: 'GET',
        headers: this.headers(),
        // A stalled upstream must never hang server rendering indefinitely;
        // callers handle the rejection via their existing error paths.
        signal: AbortSignal.timeout(10_000),
      })
    } catch (error) {
      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new Error(
          `Network error connecting to Tito API: ${error.message}`,
        )
      }
      throw error
    }

    if (!response.ok) {
      // 401/403 are the auth-failure signal (bad/absent token or no access to
      // this account/event) — surfaced explicitly so callers can distinguish it.
      let body = ''
      try {
        body = await response.text()
      } catch {}
      if (response.status === 401 || response.status === 403) {
        throw new Error(
          `Tito API access denied (${response.status}): verify the API token has access to this account/event.${body ? ` - ${body}` : ''}`,
        )
      }
      throw new Error(
        `Tito API request failed: ${response.status} ${response.statusText}${body ? ` - ${body}` : ''}`,
      )
    }

    return (await response.json()) as T
  }

  // ── Tickets & orders ──────────────────────────────────────────────

  async fetchEventTickets(eventRef: EventRef): Promise<EventTicket[]> {
    const { accountSlug, eventSlug } = titoRef(eventRef)
    if (!accountSlug || !eventSlug) {
      throw new Error('Valid Tito account and event slugs are required')
    }

    const tickets: EventTicket[] = []
    let page: number | undefined = 1
    // Follow Tito's cursor (`meta.next_page`) with a hard page cap so a
    // pathological response can never loop forever.
    const PAGE_CAP = 100
    for (let guard = 0; page; guard++) {
      if (guard >= PAGE_CAP) {
        // Never silently return a truncated attendee list: partial data would
        // corrupt eligibility checks and order groupings downstream. A real
        // event needing >100 pages should raise the cap deliberately.
        throw new Error(
          `Tito ticket pagination exceeded ${PAGE_CAP} pages for ${accountSlug}/${eventSlug} — refusing to return partial data`,
        )
      }
      const data: { tickets?: TitoTicket[]; meta?: TitoMeta } = await this.get(
        `/${accountSlug}/${eventSlug}/tickets?page[number]=${page}`,
      )
      for (const t of data.tickets ?? []) {
        tickets.push(this.mapTicket(t))
      }
      page = data.meta?.next_page ?? undefined
    }
    return tickets
  }

  private mapTicket(t: TitoTicket): EventTicket {
    const category = t.release_title ?? t.release?.title ?? ''
    const first = t.first_name ?? ''
    const last = t.last_name ?? ''
    const name = t.name ?? `${first} ${last}`.trim()
    const paid = t.state === 'complete'
    return {
      id: t.id,
      // Tito groups tickets under a "registration" (the order equivalent).
      // A missing registration id must NOT collapse to a shared sentinel (0)
      // or unrelated tickets would merge into one synthetic order — negate the
      // ticket id so each orphan stays its own group and can never collide
      // with a real (positive) registration id.
      order_id: t.registration_id ?? -t.id,
      category,
      customer_name: name || null,
      sum: String(t.price ?? '0'),
      // Checkin semantics: `sum_left` is the outstanding balance. A completed
      // Tito registration is settled (0); anything else still owes its price
      // so downstream paid/unpaid logic doesn't treat it as paid.
      sum_left: paid ? '0' : String(t.price ?? '0'),
      coupon: t.discount_code ?? undefined,
      fields: [],
      crm: {
        first_name: first,
        last_name: last,
        email: t.email ?? '',
      },
      order: {
        createdAt: t.created_at ?? '',
        paymentStatus: t.state ?? 'unknown',
        paid,
      },
      order_date: t.created_at ?? '',
    }
  }

  /**
   * UNSUPPORTED: Tito has no Checkin-shaped per-order payment document, and this
   * method receives only a numeric Checkin order id — it cannot address a Tito
   * registration. Typed so callers can distinguish "not implemented for this
   * vendor" from a transport error.
   */
  async fetchOrderPaymentDetails(orderId: number): Promise<CheckinPayOrder> {
    throw new ProviderUnsupportedError(
      PROVIDER_NAME,
      'fetchOrderPaymentDetails',
      `Tito has no Checkin-shaped order payment document; the numeric order id (${orderId}) cannot address a Tito registration`,
    )
  }

  // ── Public ticket types ───────────────────────────────────────────

  async fetchPublicTicketTypes(
    event: EventRef | number,
  ): Promise<{ event: PublicEventInfo; tickets: PublicTicketType[] }> {
    if (typeof event === 'number') {
      // A bare numeric event id is a Checkin concept and cannot address a Tito
      // event (which needs account + event slugs).
      throw new ProviderUnsupportedError(
        PROVIDER_NAME,
        'fetchPublicTicketTypes',
        'Tito requires an account/event-slug EventRef, not a bare numeric event id',
      )
    }
    const { accountSlug, eventSlug } = titoRef(event)

    const [eventData, releaseData] = await Promise.all([
      this.get<{ event?: TitoEvent } & TitoEvent>(
        `/${accountSlug}/${eventSlug}`,
      ),
      this.get<{ releases?: TitoRelease[] }>(
        `/${accountSlug}/${eventSlug}/releases`,
      ),
    ])

    const ev: TitoEvent = eventData.event ?? eventData
    const info: PublicEventInfo = {
      // Tito event ids are numeric but not part of the slug-based ref; fall back
      // to 0 when the event endpoint doesn't surface one.
      id: ev.id ?? 0,
      name: ev.title ?? eventSlug,
      // Tito has no separate registration-window fields on the event resource;
      // per-release start/end windows carry that instead (see below).
      registrationOpensAt: null,
      registrationClosesAt: null,
      currencies: ev.currency ? [ev.currency] : [],
    }

    const tickets = (releaseData.releases ?? []).map((r, i) =>
      this.mapRelease(r, i),
    )
    return { event: info, tickets }
  }

  private mapRelease(r: TitoRelease, index: number): PublicTicketType {
    return {
      id: r.id,
      name: r.title ?? r.slug ?? `Release ${r.id}`,
      // Tito has no ticket "type" taxonomy; reuse the slug as a stable key.
      type: r.slug ?? 'release',
      description: r.description ?? null,
      // VAT SEMANTICS (deliberate bridge): Tito prices are TAX-INCLUSIVE (the
      // gross a buyer pays), whereas Checkin's TicketPrice.price is NET (excl.
      // VAT) with a separate `vat` percent that downstream `formatTicketPrice`
      // adds back when `includeVat` is set. To avoid double-counting we surface
      // the Tito gross as `price` with `vat: '0'`, so the excl/incl display math
      // is a no-op and the shown number always equals what the buyer pays. A
      // future generalization would carry a tax-inclusive flag on TicketPrice.
      price: [
        {
          price: String(r.price ?? '0'),
          vat: '0',
          description: null,
          key: null,
        },
      ],
      // `available` is surfaced as a LIVE remaining count by the UI (low-stock
      // messaging), and Tito's `quantity` is only the allocation CAP — so
      // compute remaining (cap minus issued) when the API surfaces both, and
      // report null (unknown/unlimited) otherwise rather than a misleading cap.
      available:
        typeof r.quantity === 'number' && typeof r.tickets_count === 'number'
          ? Math.max(0, r.quantity - r.tickets_count)
          : null,
      // A secret/hidden release is effectively invite-only on the public page.
      requiresInvitation: Boolean(r.secret),
      visibleStartsAt: r.start_at ?? null,
      visibleEndsAt: r.end_at ?? null,
      position: typeof r.position === 'number' ? r.position : index,
    }
  }

  // ── Discounts ─────────────────────────────────────────────────────
  //
  // UNSUPPORTED for Tito: the interface's discount methods carry a Checkin-shaped
  // numeric `eventId` (or `CreateEventDiscountInput.eventId: number`) that cannot
  // address a Tito event (which needs account + event slugs). Tito DOES expose
  // `POST /:account/:event/discount_codes`, so wiring these up is a matter of
  // generalizing the discount input to carry an EventRef — tracked as debt in
  // docs/INTEGRATION_ADAPTERS.md. Until then they fail with a typed error.

  async listDiscounts(
    eventId: number,
  ): Promise<{ discounts: EventDiscount[]; ticketTypes: TicketType[] }> {
    throw new ProviderUnsupportedError(
      PROVIDER_NAME,
      'listDiscounts',
      `the numeric eventId (${eventId}) cannot address a Tito event (needs account/event slugs)`,
    )
  }

  async createDiscount(
    input: CreateEventDiscountInput,
  ): Promise<EventDiscount> {
    throw new ProviderUnsupportedError(
      PROVIDER_NAME,
      'createDiscount',
      `CreateEventDiscountInput.eventId (${input.eventId}) is a Checkin-shaped number; a Tito discount needs account/event slugs`,
    )
  }

  async deleteDiscount(
    eventId: number,
    discountCode: string,
  ): Promise<boolean> {
    throw new ProviderUnsupportedError(
      PROVIDER_NAME,
      'deleteDiscount',
      `the numeric eventId (${eventId}) cannot address a Tito event to delete code "${discountCode}" (needs account/event slugs)`,
    )
  }

  // ── Webhooks ──────────────────────────────────────────────────────

  /**
   * Verify a Tito webhook. Tito signs the raw request body with HMAC-SHA256
   * keyed by the endpoint's security token and sends the digest BASE64-encoded
   * in the `Tito-Signature` header (cf. Checkin's hex `checkin-signature` over
   * only the `data` field). The injected `webhookSecret` is that security token.
   */
  verifyWebhook(rawBody: string, headers: Headers): WebhookVerifyResult {
    if (!this.webhookSecret) {
      return { verified: false, reason: 'not-configured' }
    }
    const signature = headers.get('tito-signature')
    if (!signature) {
      return { verified: false, reason: 'invalid-signature' }
    }
    try {
      const expected = createHmac('sha256', this.webhookSecret)
        .update(rawBody, 'utf8')
        .digest('base64')
      const provided = signature.trim()
      // Length guard before timingSafeEqual (it throws on unequal-length bufs).
      if (provided.length !== expected.length) {
        return { verified: false, reason: 'invalid-signature' }
      }
      const ok = timingSafeEqual(Buffer.from(provided), Buffer.from(expected))
      return ok
        ? { verified: true }
        : { verified: false, reason: 'invalid-signature' }
    } catch (error) {
      console.error('Tito webhook signature verification failed:', error)
      return { verified: false, reason: 'invalid-signature' }
    }
  }

  /**
   * UNSUPPORTED SHAPE: `parseOrderCreated` is typed against the Checkin webhook
   * envelope ({@link CheckinWebhookPayload} → {@link CheckinOrderCreatedData}).
   * Tito's envelope (e.g. `ticket.completed`, identified by the `X-Webhook-Name`
   * header) is different, so there is nothing faithful to extract from a
   * Checkin-shaped payload — it always returns `null` ("not an order-created
   * event"). Generalizing this requires a neutral order-created shape + a
   * per-provider mapping layer, flagged as debt in docs/INTEGRATION_ADAPTERS.md.
   * (The live webhook route is Checkin-namespaced, so this is never invoked in
   * today's wiring.)
   */
  parseOrderCreated(
    payload: CheckinWebhookPayload,
  ): CheckinOrderCreatedData | null {
    // Intentionally ignores the Checkin-shaped payload — see the doc above.
    void payload
    return null
  }
}
