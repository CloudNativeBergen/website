/**
 * The speaker briefing (#1592): one pure shape that `/info`, the speaker
 * dashboard and the briefing email all render from. Shared sections come from
 * the conference; talks and to-dos only when the speaker's proposals are
 * passed. A blank field is OMITTED — never replaced by default prose, which is
 * how the old hardcoded Bergen text ended up on other tenants' pages.
 */
import type { TypedObject } from 'sanity'
import type { Conference, SpeakerInfoRoute } from '@/lib/conference/types'
import {
  Status,
  isWorkshopFormat,
  type Format,
  type ProposalExisting,
} from '@/lib/proposal/types'
import type { SpeakerTicketState } from '@/lib/tickets/speakerStatus'
import { TravelSupportStatus } from '@/lib/travel-support/types'
import {
  isRichTextContentEmpty,
  type RichTextContentBlock,
} from '@/lib/homepage/richText'

export interface SpeakerBriefingTalk {
  proposalId: string
  title: string
  format: Format
  /** Workshops say "your workshop" and link to the participant list. */
  isWorkshop: boolean
  date?: string
  startTime?: string
  endTime?: string
  /** There is no room field; the track is the room. */
  trackTitle?: string
}

export interface SpeakerBriefingTodo {
  kind:
    | 'confirm-talk'
    | 'upload-slides'
    | 'claim-ticket'
    | 'co-speaker-invite-pending'
    | 'travel-support'
  /** The glossary label, the same on the email and the dashboard. */
  label: string
  /** Absent only for `travel-support`, which belongs to the speaker. */
  proposalId?: string
  /** The talk's title; absent for `travel-support` (no suffix). */
  title?: string
}

const TODO_LABELS: Record<SpeakerBriefingTodo['kind'], string> = {
  'confirm-talk': 'Confirm your talk',
  'upload-slides': 'Upload your slides',
  'claim-ticket': 'Claim your free speaker ticket',
  'co-speaker-invite-pending':
    'Your co-speaker has not accepted the invite yet',
  'travel-support': 'Submit your travel support request',
}

export interface SpeakerBriefing {
  dinner?: {
    startsAt?: string
    venueName?: string
    address?: string
    mapUrl?: string
    rsvpNote?: string
    description?: TypedObject[]
    routes?: SpeakerInfoRoute[]
    /** Plain `speakerDinnerInfo`, only when the structured dinner is empty. */
    text?: string
  }
  checkIn?: TypedObject[]
  equipment?: TypedObject[]
  onsiteContact?: { name?: string; phone?: string; email?: string }
  accommodation?: TypedObject[]
  extra?: TypedObject[]
  venueName?: string
  venueAddress?: string
  venueTravelInfo?: string
  talks?: SpeakerBriefingTalk[]
  todos?: SpeakerBriefingTodo[]
}

/**
 * The one order every surface renders the briefing in (email, dashboard).
 * `venue` covers `venueName`, `venueAddress` and `venueTravelInfo`.
 */
export const SPEAKER_BRIEFING_SECTIONS = [
  'todos',
  'talks',
  'dinner',
  'checkIn',
  'equipment',
  'onsiteContact',
  'accommodation',
  'extra',
  'venue',
] as const

export type SpeakerBriefingSection = (typeof SPEAKER_BRIEFING_SECTIONS)[number]

type Briefable = Pick<
  Conference,
  | 'speakerInfo'
  | 'speakerDinnerInfo'
  | 'venueName'
  | 'venueAddress'
  | 'venueTravelInfo'
>

const text = (s?: string) => s?.trim() || undefined
// A lone blank paragraph (an emptied editor) counts as empty.
const blocks = (b?: TypedObject[]) =>
  b && !isRichTextContentEmpty(b as unknown as RichTextContentBlock[])
    ? b
    : undefined

/** Drop undefined keys; an object with none left becomes undefined. */
function compact<T extends object>(o: T): T | undefined {
  const entries = Object.entries(o).filter(([, v]) => v !== undefined)
  return entries.length > 0 ? (Object.fromEntries(entries) as T) : undefined
}

export interface SpeakerBriefingData {
  proposals: ProposalExisting[]
  /**
   * The speaker the briefing is for. Without it `confirm-talk` is not limited
   * to the talk's speakers and `claim-ticket` is never emitted.
   */
  speakerId?: string
  /**
   * The speaker's ticket state from `joinSpeakerTicketStatus`. Redemption is
   * only known to the ticket provider, so the caller fetches it; without it
   * (or when `unknown`) `claim-ticket` is not emitted.
   */
  ticketState?: SpeakerTicketState
  /** The speaker's travel support request, if any. */
  travelSupport?: { status: TravelSupportStatus }
  /** For tests; defaults to the current time. */
  now?: Date
}

export function getSpeakerBriefing(
  conference: Briefable,
  speakerData?: SpeakerBriefingData,
): SpeakerBriefing {
  const info = conference.speakerInfo
  const d = info?.dinner
  const routes = d?.routes
    ?.map((r) =>
      compact<SpeakerInfoRoute>({
        _key: r._key,
        label: text(r.label),
        meetingPoint: text(r.meetingPoint),
        meetingPointMapUrl: text(r.meetingPointMapUrl),
        departsNote: text(r.departsNote),
        departsAt: text(r.departsAt),
        details: blocks(r.details),
      }),
    )
    // A row with only a `_key` is an empty route.
    .filter(
      (r): r is SpeakerInfoRoute =>
        !!r && Object.keys(r).some((k) => k !== '_key'),
    )
  const dinner =
    compact<NonNullable<SpeakerBriefing['dinner']>>({
      startsAt: text(d?.startsAt),
      venueName: text(d?.venueName),
      address: text(d?.address),
      mapUrl: text(d?.mapUrl),
      rsvpNote: text(d?.rsvpNote),
      description: blocks(d?.description),
      routes: routes && routes.length > 0 ? routes : undefined,
    }) ?? compact({ text: text(conference.speakerDinnerInfo) })

  let talks: SpeakerBriefingTalk[] | undefined
  let todos: Omit<SpeakerBriefingTodo, 'label'>[] | undefined
  if (speakerData) {
    talks = []
    todos = []
    const { speakerId, ticketState } = speakerData
    const now = (speakerData.now ?? new Date()).toISOString()
    let ticketTodo = false
    for (const p of speakerData.proposals) {
      // The server lets any speaker on the talk confirm it
      // (`proposal.action`: `$speakerId in speakers[]._ref`).
      const onTalk =
        !speakerId ||
        !!p.speakers?.some((s) => ('_ref' in s ? s._ref : s._id) === speakerId)
      if (p.status === Status.accepted && onTalk) {
        todos.push({ kind: 'confirm-talk', proposalId: p._id, title: p.title })
      }
      if (
        p.coSpeakerInvitations?.some(
          (i) => i.status === 'pending' && i.expiresAt > now,
        )
      ) {
        todos.push({
          kind: 'co-speaker-invite-pending',
          proposalId: p._id,
          title: p.title,
        })
      }
      if (p.status !== Status.confirmed) continue
      // One ticket per speaker, so one to-do even with several talks.
      if (
        !ticketTodo &&
        speakerId &&
        ticketState === 'invited' &&
        p.issuedSpeakerTickets?.some((t) => t.speakerId === speakerId)
      ) {
        ticketTodo = true
        todos.push({ kind: 'claim-ticket', proposalId: p._id, title: p.title })
      }
      talks.push({
        proposalId: p._id,
        title: p.title,
        format: p.format,
        isWorkshop: isWorkshopFormat(p.format),
        ...compact({
          date: p.scheduleInfo?.date,
          startTime: p.scheduleInfo?.timeSlot?.startTime,
          endTime: p.scheduleInfo?.timeSlot?.endTime,
          trackTitle: p.scheduleInfo?.trackTitle,
        }),
      })
      if (!p.attachments?.some((a) => a.attachmentType === 'slides')) {
        todos.push({ kind: 'upload-slides', proposalId: p._id, title: p.title })
      }
    }
    if (speakerData.travelSupport?.status === TravelSupportStatus.DRAFT) {
      todos.push({ kind: 'travel-support' })
    }
  }

  return (
    compact<SpeakerBriefing>({
      dinner,
      checkIn: blocks(info?.checkIn),
      equipment: blocks(info?.equipment),
      onsiteContact: compact({
        name: text(info?.onsiteContact?.name),
        phone: text(info?.onsiteContact?.phone),
        email: text(info?.onsiteContact?.email),
      }),
      accommodation: blocks(info?.accommodation),
      extra: blocks(info?.extra),
      venueName: text(conference.venueName),
      venueAddress: text(conference.venueAddress),
      venueTravelInfo: text(conference.venueTravelInfo),
      talks: talks?.length ? talks : undefined,
      todos: todos?.length
        ? todos.map((t) => ({ label: TODO_LABELS[t.kind], ...t }))
        : undefined,
    }) ?? {}
  )
}
