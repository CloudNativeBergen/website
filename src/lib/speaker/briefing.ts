/**
 * The speaker briefing (#1592): one pure shape that `/info`, the speaker
 * dashboard and the briefing email all render from. Shared sections come from
 * the conference; talks and to-dos only when the speaker's proposals are
 * passed. A blank field is OMITTED — never replaced by default prose, which is
 * how the old hardcoded Bergen text ended up on other tenants' pages.
 */
import type { TypedObject } from 'sanity'
import type { Conference, SpeakerInfoRoute } from '@/lib/conference/types'
import { Status, type ProposalExisting } from '@/lib/proposal/types'

export interface SpeakerBriefingTalk {
  proposalId: string
  title: string
  date?: string
  startTime?: string
  endTime?: string
  /** There is no room field; the track is the room. */
  trackTitle?: string
}

export interface SpeakerBriefingTodo {
  kind: 'confirm-talk' | 'upload-slides'
  proposalId: string
  title: string
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

type Briefable = Pick<
  Conference,
  | 'speakerInfo'
  | 'speakerDinnerInfo'
  | 'venueName'
  | 'venueAddress'
  | 'venueTravelInfo'
>

const text = (s?: string) => s?.trim() || undefined
const blocks = (b?: TypedObject[]) => (b && b.length > 0 ? b : undefined)

/** Drop undefined keys; an object with none left becomes undefined. */
function compact<T extends object>(o: T): T | undefined {
  const entries = Object.entries(o).filter(([, v]) => v !== undefined)
  return entries.length > 0 ? (Object.fromEntries(entries) as T) : undefined
}

export function getSpeakerBriefing(
  conference: Briefable,
  speakerData?: { proposals: ProposalExisting[] },
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
    .filter((r): r is SpeakerInfoRoute => !!r && Object.keys(r).length > 1)
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
  let todos: SpeakerBriefingTodo[] | undefined
  if (speakerData) {
    talks = []
    todos = []
    for (const p of speakerData.proposals) {
      if (p.status === Status.accepted) {
        todos.push({ kind: 'confirm-talk', proposalId: p._id, title: p.title })
      }
      if (p.status !== Status.confirmed) continue
      talks.push({
        proposalId: p._id,
        title: p.title,
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
      todos: todos?.length ? todos : undefined,
    }) ?? {}
  )
}
