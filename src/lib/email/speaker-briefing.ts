/**
 * The pre-conference speaker briefing email (#1592). Sent by hand from
 * /admin/speakers/info, one email per confirmed speaker. A Sanity marker per
 * speaker and `speakerInfo` version keeps a retry or a second click from
 * sending the same version twice.
 */
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
import { formatConferenceDateLong } from '@/lib/time'
import {
  EMAIL_CONFIG,
  delay,
  isTransientError,
  retryWithBackoff,
} from './config'
import { resolveFeedbackSummarySender } from './feedback-summary'

export type BriefingConference = Pick<
  Conference,
  | '_id'
  | 'title'
  | 'organizer'
  | 'cfpEmail'
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
}

/** The marker key, on the shared `scheduledReminderLog` type. */
export const BRIEFING_LOG_KEY = 'speaker-briefing'

/** The version a send is for: when the speaker info was last saved. */
export const briefingVersion = (conference: BriefingConference) =>
  conference.speakerInfo?.updatedAt ?? 'unversioned'

/** Deterministic marker id; Sanity ids take no `:`, so the ISO is folded. */
export function briefingLogId(
  conferenceId: string,
  speakerId: string,
  version: string,
): string {
  return `briefing.${conferenceId}.${speakerId}.${version.replace(/[^a-zA-Z0-9_-]/g, '-')}`
}

/**
 * The conference's confirmed speakers with an address, each with their
 * accepted and confirmed proposals of THIS conference (to-dos need both).
 */
export async function loadBriefingSpeakers(
  conferenceId: string,
): Promise<BriefingSpeaker[]> {
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
  return [...bySpeaker.values()]
    .filter(
      (s) => s.email && s.proposals.some((p) => p.status === Status.confirmed),
    )
    .sort((a, b) => a.name.localeCompare(b.name))
}

export const briefingSubject = (conference: BriefingConference) =>
  `Your speaker briefing for ${conference.title}`

export async function renderSpeakerBriefing(
  conference: BriefingConference,
  speaker: Pick<BriefingSpeaker, 'name' | 'proposals'>,
): Promise<string> {
  return render(
    React.createElement(SpeakerBriefingTemplate, {
      speakerName: speaker.name,
      briefing: getSpeakerBriefing(conference, {
        proposals: speaker.proposals,
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
  to: string,
  html: string,
  idempotencyKey?: string,
): Promise<void> {
  const sender = await resolveFeedbackSummarySender(conference)
  await retryWithBackoff(
    async () => {
      const { error } = await sender.client.emails.send(
        { from: sender.from, to, subject: briefingSubject(conference), html },
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
  speaker: Pick<BriefingSpeaker, 'name' | 'proposals'>,
): Promise<void> {
  await sendOne(
    conference,
    to,
    await renderSpeakerBriefing(conference, speaker),
  )
}

export interface BriefingSendResult {
  sent: number
  skipped: number
  failed: { speakerId: string; name: string; error: string }[]
}

/**
 * Send the current version to every speaker without its marker. The marker
 * is written right after each send, so a run cut short resumes where it
 * stopped. A failed speaker gets no marker and is retried next time.
 */
export async function sendSpeakerBriefings(
  conference: BriefingConference,
  speakers: BriefingSpeaker[],
  now: Date = new Date(),
): Promise<BriefingSendResult> {
  const version = briefingVersion(conference)
  const ids = speakers.map((s) => briefingLogId(conference._id, s._id, version))
  const done = new Set(
    ids.length
      ? await clientReadUncached.fetch<string[]>(
          `*[_type == "scheduledReminderLog" && _id in $ids]._id`,
          { ids },
          { cache: 'no-store' },
        )
      : [],
  )
  const result: BriefingSendResult = { sent: 0, skipped: 0, failed: [] }
  for (const [i, speaker] of speakers.entries()) {
    const id = ids[i]
    if (done.has(id)) {
      result.skipped++
      continue
    }
    try {
      if (result.sent > 0) await delay(EMAIL_CONFIG.RATE_LIMIT_DELAY)
      const html = await renderSpeakerBriefing(conference, speaker)
      // The marker id doubles as Resend's key: a lost reply then is not
      // delivered twice within Resend's 24 hours.
      await sendOne(conference, speaker.email, html, id)
      await clientWrite.createIfNotExists({
        _id: id,
        _type: 'scheduledReminderLog',
        key: BRIEFING_LOG_KEY,
        version,
        conference: { ...createReference(conference._id), _weak: true },
        speaker: { ...createReference(speaker._id), _weak: true },
        count: 1,
        lastSentAt: now.toISOString(),
      })
      result.sent++
    } catch (error) {
      result.failed.push({
        speakerId: speaker._id,
        name: speaker.name,
        error: error instanceof Error ? error.message : String(error),
      })
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
