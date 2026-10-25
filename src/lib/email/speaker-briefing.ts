/**
 * The pre-conference speaker briefing email (#1592). Sent by hand from
 * /admin/speakers/info, one email per confirmed speaker. A Sanity marker per
 * speaker and `speakerInfo` version keeps a retry or a second click from
 * sending the same version twice.
 */
import { createHash } from 'node:crypto'
import React from 'react'
import { render } from '@react-email/render'
import { SpeakerBriefingTemplate } from '@/components/email/SpeakerBriefingTemplate'
import { emailBrandColor } from '@/lib/branding/theme'
import { conferenceBaseUrl } from '@/lib/conference/baseUrl'
import type { Conference } from '@/lib/conference/types'
import { getProposals } from '@/lib/proposal/data/sanity'
import { Status, type ProposalExisting } from '@/lib/proposal/types'
import { clientReadUncached, clientWrite } from '@/lib/sanity/client'
import { createReference } from '@/lib/sanity/helpers'
import { getSpeakerBriefing } from '@/lib/speaker/briefing'
import { fetchSpeakerTicketInputs } from '@/lib/speaker/ticketInputs'
import {
  fetchRedeemedSpeakerEmails,
  joinSpeakerTicketStatus,
  type SpeakerTicketState,
} from '@/lib/tickets/speakerStatus'
import type { TravelSupportStatus } from '@/lib/travel-support/types'
import { createNotifications } from '@/lib/notification/sanity'
import { formatConferenceDateLong } from '@/lib/time'
import {
  EMAIL_CONFIG,
  delay,
  isTransientError,
  retryWithBackoff,
} from './config'
import {
  resolveFeedbackSummarySender,
  type FeedbackSummarySender,
} from './feedback-summary'

export type BriefingConference = Pick<
  Conference,
  | '_id'
  | 'title'
  | 'organizer'
  | 'cfpEmail'
  | 'contactEmail'
  | 'domains'
  | 'theme'
  | 'organization'
  | 'city'
  | 'country'
  | 'startDate'
  | 'socialLinks'
  | 'speakerInfo'
  | 'speakerDinnerInfo'
  | 'venueName'
  | 'venueAddress'
  | 'venueTravelInfo'
>

export interface BriefingSpeaker {
  _id: string
  name: string
  email: string
  /** THIS conference's proposals only. */
  proposals: ProposalExisting[]
  ticketState?: SpeakerTicketState
  travelSupport?: { status: TravelSupportStatus }
}

/** The marker key, on the shared `scheduledReminderLog` type. */
export const BRIEFING_LOG_KEY = 'speaker-briefing'

/** JSON with sorted keys, so the same content always hashes the same. */
function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_k, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, v[k]]),
        )
      : v,
  )
}

/**
 * The version a send is for: a hash of the SHARED briefing content, not
 * `speakerInfo.updatedAt`, so a save that changes nothing a speaker reads
 * does not mark everyone out of date.
 */
export const briefingVersion = (conference: BriefingConference) =>
  createHash('sha256')
    .update(stableStringify(getSpeakerBriefing(conference)))
    .digest('hex')
    .slice(0, 16)

/** Deterministic marker id: one per conference, speaker and version. */
export function briefingLogId(
  conferenceId: string,
  speakerId: string,
  version: string,
): string {
  return `briefing.${conferenceId}.${speakerId}.${version}`
}

/**
 * Ticket states for the whole programme: one provider fetch for the batch.
 * Any failure leaves them unknown, so no `claim-ticket` to-do is shown.
 */
async function loadTicketStates(
  conference: Conference,
): Promise<Map<string, SpeakerTicketState>> {
  try {
    const inputs = await fetchSpeakerTicketInputs(conference._id)
    if (!inputs) return new Map()
    const redeemed = await fetchRedeemedSpeakerEmails(conference)
    return new Map(
      joinSpeakerTicketStatus(inputs, redeemed, conference).map((s) => [
        s.speakerId,
        s.state,
      ]),
    )
  } catch (error) {
    console.error('Speaker briefing: ticket states unavailable', error)
    return new Map()
  }
}

/**
 * The conference's confirmed speakers with an address, each with their
 * accepted and confirmed proposals of THIS conference (to-dos need both),
 * ticket state and travel support request.
 */
export async function loadBriefingSpeakers(
  conference: Conference,
): Promise<BriefingSpeaker[]> {
  const conferenceId = conference._id
  const { proposals, proposalsError } = await getProposals({
    conferenceId,
    returnAll: true,
    statuses: [Status.accepted, Status.confirmed],
    includeSchedule: true,
  })
  if (proposalsError) throw proposalsError
  const bySpeaker = new Map<string, BriefingSpeaker>()
  for (const p of proposals) {
    for (const s of (p.speakers ?? []) as unknown as {
      _id?: string
      name?: string
      email?: string
    }[]) {
      if (!s?._id) continue
      const entry = bySpeaker.get(s._id) ?? {
        _id: s._id,
        name: s.name ?? '',
        email: s.email?.trim() ?? '',
        proposals: [],
      }
      entry.proposals.push(p)
      bySpeaker.set(s._id, entry)
    }
  }
  const [tickets, travel] = await Promise.all([
    loadTicketStates(conference),
    clientReadUncached.fetch<
      { speakerId?: string; status: TravelSupportStatus }[]
    >(
      `*[_type == "travelSupport" && conference._ref == $conferenceId]{ "speakerId": speaker._ref, status }`,
      { conferenceId },
      { cache: 'no-store' },
    ),
  ])
  for (const t of travel ?? []) {
    const s = t.speakerId && bySpeaker.get(t.speakerId)
    if (s) s.travelSupport = { status: t.status }
  }
  for (const s of bySpeaker.values()) s.ticketState = tickets.get(s._id)
  // An erased speaker (GDPR) keeps its talks but must not be mailed.
  const erased = new Set(
    bySpeaker.size
      ? await clientReadUncached.fetch<string[]>(
          // groq-global-scoped: by-id read of speakers already scoped to this
          // conference through its talks above.
          `*[_type == "speaker" && _id in $ids && defined(erasedAt)]._id`,
          { ids: [...bySpeaker.keys()] },
          { cache: 'no-store' },
        )
      : [],
  )
  return [...bySpeaker.values()]
    .filter(
      (s) =>
        s.email &&
        !erased.has(s._id) &&
        s.proposals.some((p) => p.status === Status.confirmed),
    )
    .sort((a, b) => a.name.localeCompare(b.name))
}

export const briefingSubject = (
  conference: BriefingConference,
  isUpdate = false,
) => `Speaker info for ${conference.title}${isUpdate ? ' (updated)' : ''}`

export async function renderSpeakerBriefing(
  conference: BriefingConference,
  speaker: Pick<BriefingSpeaker, 'name' | 'proposals'> &
    Partial<Pick<BriefingSpeaker, '_id' | 'ticketState' | 'travelSupport'>>,
  isUpdate = false,
): Promise<string> {
  return render(
    React.createElement(SpeakerBriefingTemplate, {
      speakerName: speaker.name,
      isUpdate,
      briefing: getSpeakerBriefing(conference, {
        proposals: speaker.proposals,
        speakerId: speaker._id,
        ticketState: speaker.ticketState,
        travelSupport: speaker.travelSupport,
      }),
      eventName: conference.title,
      eventLocation: [conference.city, conference.country]
        .filter(Boolean)
        .join(', '),
      eventDate: conference.startDate
        ? formatConferenceDateLong(conference.startDate)
        : '',
      eventUrl: conferenceBaseUrl(conference),
      socialLinks: conference.socialLinks ?? [],
      brandColor: emailBrandColor(conference.theme),
    }),
  )
}

/** One email, retried on a transient failure; throws when it is not sent. */
async function sendOne(
  conference: BriefingConference,
  sender: FeedbackSummarySender,
  to: string,
  subject: string,
  html: string,
  idempotencyKey?: string,
): Promise<void> {
  await retryWithBackoff(
    async () => {
      const { error } = await sender.client.emails.send(
        {
          from: sender.from,
          to,
          // "Changed your plans? Reply to this email." lands with the team.
          replyTo: conference.cfpEmail || conference.contactEmail || undefined,
          subject,
          html,
        },
        idempotencyKey ? { idempotencyKey } : undefined,
      )
      if (error) {
        const wrapped = new Error(
          `Resend refused the email: ${error.message}`,
        ) as Error & { status?: number }
        const status = (error as { statusCode?: unknown }).statusCode
        if (typeof status === 'number') wrapped.status = status
        throw wrapped
      }
    },
    undefined,
    isTransientError,
  )
}

/** A test send to the organizer: no marker, no idempotency key. */
export async function sendSpeakerBriefingTest(
  conference: BriefingConference,
  to: string,
  speaker: Parameters<typeof renderSpeakerBriefing>[1],
): Promise<void> {
  await sendOne(
    conference,
    await resolveFeedbackSummarySender(conference),
    to,
    briefingSubject(conference),
    await renderSpeakerBriefing(conference, speaker),
  )
}

export interface BriefingSendResult {
  sent: number
  skipped: number
  failed: { speakerId: string; name: string; error: string }[]
  /** Sent, but the marker write failed twice: they may get it again. */
  logFailed: { speakerId: string; name: string }[]
  /** Not tried: the time budget ran out. Calling again continues. */
  remaining: number
}

/**
 * No new send starts after this much time since the call began, so a call
 * ends well inside the tRPC route's 60 s `maxDuration` (a send that starts
 * just inside it can still run on through its retries).
 */
export const BRIEFING_TIME_BUDGET_MS = 40_000

async function writeMarker(
  doc: { _id: string; _type: string } & Record<string, unknown>,
) {
  try {
    await clientWrite.createIfNotExists(doc)
  } catch {
    await clientWrite.createIfNotExists(doc)
  }
}

/**
 * Send the current version to every speaker without its marker, within
 * {@link BRIEFING_TIME_BUDGET_MS}. The marker (and, on an update, the hub
 * notice) is written right after each send, so a run cut short resumes
 * where it stopped. A failed speaker gets no marker and is retried next time.
 */
export async function sendSpeakerBriefings(
  conference: BriefingConference,
  speakers: BriefingSpeaker[],
  now: Date = new Date(),
): Promise<BriefingSendResult> {
  const started = Date.now()
  const version = briefingVersion(conference)
  const ids = speakers.map((s) => briefingLogId(conference._id, s._id, version))
  const markers = await clientReadUncached.fetch<
    { _id: string; speakerId?: string }[]
  >(
    `*[_type == "scheduledReminderLog" && key == $key && conference._ref == $conferenceId]{ _id, "speakerId": speaker._ref }`,
    { key: BRIEFING_LOG_KEY, conferenceId: conference._id },
    { cache: 'no-store' },
  )
  const done = new Set((markers ?? []).map((m) => m._id))
  // A speaker with any marker not for this version had an older one.
  const hadEarlier = new Set((markers ?? []).map((m) => m.speakerId))
  const result: BriefingSendResult = {
    sent: 0,
    skipped: 0,
    failed: [],
    logFailed: [],
    remaining: 0,
  }
  const due = speakers.filter((_, i) => !done.has(ids[i]))
  result.skipped = speakers.length - due.length
  if (due.length === 0) return result
  const sender = await resolveFeedbackSummarySender(conference)
  for (const [n, speaker] of due.entries()) {
    if (Date.now() - started >= BRIEFING_TIME_BUDGET_MS) {
      result.remaining = due.length - n
      break
    }
    const id = briefingLogId(conference._id, speaker._id, version)
    const isUpdate = hadEarlier.has(speaker._id)
    try {
      if (n > 0) await delay(EMAIL_CONFIG.RATE_LIMIT_DELAY)
      const html = await renderSpeakerBriefing(conference, speaker, isUpdate)
      // The marker id doubles as Resend's key: a lost reply then is not
      // delivered twice within Resend's 24 hours.
      await sendOne(
        conference,
        sender,
        speaker.email,
        briefingSubject(conference, isUpdate),
        html,
        id,
      )
    } catch (error) {
      result.failed.push({
        speakerId: speaker._id,
        name: speaker.name,
        error: error instanceof Error ? error.message : String(error),
      })
      continue
    }
    result.sent++
    try {
      await writeMarker({
        _id: id,
        _type: 'scheduledReminderLog',
        key: BRIEFING_LOG_KEY,
        version,
        conference: { ...createReference(conference._id), _weak: true },
        speaker: { ...createReference(speaker._id), _weak: true },
        count: 1,
        lastSentAt: now.toISOString(),
      })
    } catch {
      result.logFailed.push({ speakerId: speaker._id, name: speaker.name })
    }
    // Only on an update: a first send needs no "updated" nudge in the hub.
    // `createNotifications` never throws.
    if (isUpdate) {
      await createNotifications([
        {
          recipientId: speaker._id,
          conferenceId: conference._id,
          notificationType: 'system',
          title: 'Speaker info updated',
          message: `The speaker info for ${conference.title} has changed.`,
          link: '/cfp/list#briefing',
        },
      ])
    }
  }
  return result
}

export interface BriefingSendHistoryEntry {
  version: string
  count: number
  lastSentAt: string
}

/** Sends grouped by version, newest first. Failures leave no marker. */
export async function getBriefingSendHistory(
  conferenceId: string,
  speakerIds: string[],
  currentVersion: string,
): Promise<{
  entries: BriefingSendHistoryEntry[]
  /** Of `speakerIds`, how many have the current version. */
  currentCount: number
}> {
  const rows = await clientReadUncached.fetch<
    { _id: string; version?: string; lastSentAt?: string }[]
  >(
    `*[_type == "scheduledReminderLog" && key == $key && conference._ref == $conferenceId]{ _id, version, lastSentAt }`,
    { key: BRIEFING_LOG_KEY, conferenceId },
    { cache: 'no-store' },
  )
  const byVersion = new Map<string, BriefingSendHistoryEntry>()
  for (const r of rows ?? []) {
    const version = r.version ?? 'unversioned'
    const e = byVersion.get(version) ?? { version, count: 0, lastSentAt: '' }
    e.count++
    if ((r.lastSentAt ?? '') > e.lastSentAt) e.lastSentAt = r.lastSentAt ?? ''
    byVersion.set(version, e)
  }
  const currentIds = new Set(
    speakerIds.map((id) => briefingLogId(conferenceId, id, currentVersion)),
  )
  return {
    entries: [...byVersion.values()].sort((a, b) =>
      b.lastSentAt.localeCompare(a.lastSentAt),
    ),
    currentCount: (rows ?? []).filter((r) => currentIds.has(r._id)).length,
  }
}
