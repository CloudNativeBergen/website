import 'server-only'
import type { Conference } from '@/lib/conference/types'
import type { EventDiscount } from '@/lib/discounts/types'
import { normalizeDiscountCode } from '@/lib/discounts/attribution'
import { clientReadUncached, clientWrite } from '@/lib/sanity/client'
import { generateKey } from '@/lib/sanity/helpers'
import {
  getTicketingProvider,
  resolveTicketingCredentials,
} from '@/lib/tickets/provider'
import { getCurrentDateTime } from '@/lib/time'
import type { LinkedDiscountCode } from './types'

/**
 * The sponsor↔discount-code link (#1262), server side: reading every
 * sponsor's stored codes for attribution, checking chosen codes against the
 * provider, and appending to the link.
 */

/** A sponsor of this conference as a code claimant (`sponsorOwningCode`). */
export interface SponsorCodeLink {
  sponsorForConferenceId: string
  /** `sponsor._ref` — the id `conference.sponsors[].sponsor._id` carries. */
  sponsorId: string
  name: string
  linkedCodes: string[]
}

type Reader = Pick<typeof clientReadUncached, 'fetch'>

/** A conference sponsor carrying its stored codes, ready for attribution. */
export interface SponsorClaimant {
  /** The sponsor document id. */
  id: string
  name: string
  linkedCodes: string[]
  /** Its CRM record, when it has one — the target of a send or an Assign. */
  sponsorForConferenceId?: string
}

/**
 * THE claimant set for every attribution (#1262): the CONFERENCE's sponsors,
 * joined by sponsor id to their stored codes. The sponsor list is the
 * conference's, never the CRM's — so a prospect never starts claiming codes
 * by name — and the links only add codes. The usage view, the create guard,
 * the Send picker and the ticket reports all build it here, so they agree.
 */
export function withLinkedCodes(
  sponsors: Conference['sponsors'],
  links: readonly SponsorCodeLink[],
): SponsorClaimant[] {
  return (sponsors ?? []).map(({ sponsor }) => {
    const link = links.find((l) => l.sponsorId === sponsor._id)
    return {
      id: sponsor._id,
      name: sponsor.name,
      linkedCodes: link?.linkedCodes ?? [],
      ...(link && { sponsorForConferenceId: link.sponsorForConferenceId }),
    }
  })
}

/**
 * {@link withLinkedCodes} for a conference's own sponsors, for REPORTING
 * surfaces (ticket summaries, budget). A failed links read degrades to the
 * name heuristic for every sponsor — the attribution these surfaces had
 * before #1262 — and says so in the log, rather than failing the page.
 */
export async function conferenceSponsorClaimants(
  conference: Pick<Conference, '_id' | 'sponsors'>,
  client?: Reader,
): Promise<SponsorClaimant[]> {
  if (!conference.sponsors?.length) return []
  let links: SponsorCodeLink[] = []
  try {
    links = await readSponsorCodeLinks(conference._id, client)
  } catch (error) {
    console.warn(
      '[discount-codes] stored sponsor code links unavailable; attributing by name:',
      error,
    )
  }
  return withLinkedCodes(conference.sponsors, links)
}

/**
 * Every sponsor of the conference with its stored codes. Uncached by default:
 * an Assign must show up on the next read. Callers that only report (the
 * ticket summaries) may pass the CDN client.
 */
export async function readSponsorCodeLinks(
  conferenceId: string,
  client: Reader = clientReadUncached,
): Promise<SponsorCodeLink[]> {
  const rows = await client.fetch<
    Array<{
      _id: string
      sponsorId?: string
      name?: string
      linkedCodes?: (string | null)[] | null
    }>
  >(
    `*[_type == "sponsorForConference" && conference._ref == $conferenceId]{
      _id, "sponsorId": sponsor._ref, "name": sponsor->name, "linkedCodes": discountCodes[].code
    }`,
    { conferenceId },
  )
  return (rows ?? []).map((row) => ({
    sponsorForConferenceId: row._id,
    sponsorId: row.sponsorId ?? '',
    name: row.name ?? '',
    linkedCodes: (row.linkedCodes ?? []).filter(
      (c): c is string => typeof c === 'string' && c.length > 0,
    ),
  }))
}

export type EventDiscountsResult =
  | { ok: true; discounts: EventDiscount[] }
  | { ok: false; reason: 'not-configured' }

/**
 * The conference's discount codes from ITS OWN provider event — the event id
 * is the conference's, never input, and credentials resolve through the
 * per-org seam exactly as `tickets.admin.*` does. Discount codes are a
 * Checkin-only API (Tito raises `ProviderUnsupportedError`), so a conference
 * without a Checkin event is `not-configured`. A provider failure throws.
 */
export async function listEventDiscounts(
  conference: Pick<Conference, 'checkinEventId' | 'organization'>,
): Promise<EventDiscountsResult> {
  const orgId = conference.organization?._ref
  const eventId = conference.checkinEventId
  if (!orgId || !eventId) return { ok: false, reason: 'not-configured' }
  const credentials = await resolveTicketingCredentials(orgId, 'checkin')
  if (!credentials) return { ok: false, reason: 'not-configured' }
  const { discounts } = await getTicketingProvider(
    'checkin',
    credentials,
  ).listDiscounts(eventId)
  return { ok: true, discounts }
}

export class DiscountCodeLinkError extends Error {
  constructor(
    message: string,
    readonly code: 'BAD_REQUEST' | 'CONFLICT',
  ) {
    super(message)
    this.name = 'DiscountCodeLinkError'
  }
}

/** A chosen code resolved against the provider: its canonical spelling. */
export interface ResolvedDiscountCode {
  code: string
  providerCodeId: string
}

/**
 * Resolve organizer-chosen codes against the event's real codes and the
 * other sponsors' stored links. Refuses (throws `DiscountCodeLinkError`) when
 * a code is not on the event, or is already STORED on another sponsor — a
 * code linked to two sponsors would make every attribution a coin toss.
 * Duplicates collapse; the provider's own spelling is kept.
 */
export function resolveChosenCodes(
  chosen: readonly string[],
  discounts: readonly EventDiscount[],
  links: readonly SponsorCodeLink[],
  sponsorForConferenceId: string,
): ResolvedDiscountCode[] {
  const byCode = new Map<string, EventDiscount>()
  for (const d of discounts) {
    if (d.triggerValue) byCode.set(normalizeDiscountCode(d.triggerValue), d)
  }
  const out = new Map<string, ResolvedDiscountCode>()
  for (const raw of chosen) {
    const wanted = normalizeDiscountCode(raw)
    const discount = byCode.get(wanted)
    if (!discount?.triggerValue) {
      throw new DiscountCodeLinkError(
        `Discount code "${raw}" does not exist on this event`,
        'BAD_REQUEST',
      )
    }
    const holder = links.find(
      (l) =>
        l.sponsorForConferenceId !== sponsorForConferenceId &&
        l.linkedCodes.some((c) => normalizeDiscountCode(c) === wanted),
    )
    if (holder) {
      throw new DiscountCodeLinkError(
        `Discount code "${discount.triggerValue}" is already linked to ${holder.name || 'another sponsor'}`,
        'CONFLICT',
      )
    }
    out.set(wanted, {
      code: discount.triggerValue,
      // Checkin has no discount id; the code string is what it keys on.
      providerCodeId: discount.id ?? discount.triggerValue,
    })
  }
  return [...out.values()]
}

/**
 * Append the codes this sponsor does not store yet — append-only, never a
 * rewrite of the array, in ONE insert (a chained `.append()` keeps only the
 * last). Returns the codes actually added; an empty result writes nothing.
 */
export async function appendLinkedCodes(
  sponsorForConferenceId: string,
  alreadyLinked: readonly string[],
  codes: readonly ResolvedDiscountCode[],
  via: 'send' | 'assign',
): Promise<ResolvedDiscountCode[]> {
  const have = new Set(alreadyLinked.map(normalizeDiscountCode))
  const fresh = codes.filter((c) => !have.has(normalizeDiscountCode(c.code)))
  if (fresh.length === 0) return []
  const linkedAt = getCurrentDateTime()
  const items: LinkedDiscountCode[] = fresh.map((c) => ({
    _key: generateKey('code'),
    code: c.code,
    providerCodeId: c.providerCodeId,
    linkedAt,
    linkedVia: via,
  }))
  await clientWrite
    .patch(sponsorForConferenceId)
    .setIfMissing({ discountCodes: [] })
    .insert('after', 'discountCodes[-1]', items)
    .commit()
  return fresh
}
