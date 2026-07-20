import { groq } from 'next-sanity'
import { clientWrite } from '@/lib/sanity/client'
import type { Conference } from '@/lib/conference/types'
import { sendWorkshopAnnouncementEmail } from '@/lib/email/workshop'

/** Talk formats that qualify as a workshop (mirrors workshopSignup validation). */
export const WORKSHOP_FORMATS = ['workshop_120', 'workshop_240'] as const

export function isWorkshopFormat(format: string | undefined): boolean {
  return !!format && (WORKSHOP_FORMATS as readonly string[]).includes(format)
}

/** Minimal projection of a workshop talk used to authorize + label a broadcast. */
export interface WorkshopForAnnouncement {
  _id: string
  title: string
  format: string
  conferenceId: string | null
  /** `_id`s of the talk's speakers — the workshop OWNERS. */
  speakerIds: string[]
}

/** A confirmed participant's email target (the only fields the fan-out needs). */
export interface AnnouncementRecipient {
  userEmail: string
  userName: string
}

/** Announcement as rendered to participants / returned by the public query. */
export interface WorkshopAnnouncementView {
  _id: string
  body: string
  createdAt: string
  /** Author display name, or null if the author speaker was erased (GDPR). */
  authorName: string | null
}

/**
 * Fetch the workshop talk that a broadcast targets, projected down to what the
 * `workshop.announce` mutation needs to authorize (speaker owners), validate
 * (format + conference), and label (title) the announcement.
 */
export async function getWorkshopForAnnouncement(
  workshopId: string,
): Promise<WorkshopForAnnouncement | null> {
  const query = groq`*[_type == "talk" && _id == $workshopId][0]{
    _id,
    title,
    format,
    "conferenceId": conference._ref,
    "speakerIds": speakers[]._ref
  }`

  const result = await clientWrite.fetch<{
    _id: string
    title: string
    format: string
    conferenceId: string | null
    speakerIds: string[] | null
  } | null>(query, { workshopId })

  if (!result) return null

  return {
    _id: result._id,
    title: result.title,
    format: result.format,
    conferenceId: result.conferenceId ?? null,
    speakerIds: result.speakerIds ?? [],
  }
}

/** Emails + names of every CONFIRMED signup for a workshop (waitlist excluded). */
export async function getConfirmedAnnouncementRecipients(
  workshopId: string,
): Promise<AnnouncementRecipient[]> {
  const query = groq`*[_type == "workshopSignup" && workshop._ref == $workshopId && status == "confirmed"]{
    userEmail,
    userName
  }`

  const recipients = await clientWrite.fetch<AnnouncementRecipient[]>(query, {
    workshopId,
  })
  return recipients ?? []
}

/** Persist an announcement document. Author is a WEAK speaker ref (GDPR). */
export async function createWorkshopAnnouncement(input: {
  workshopId: string
  conferenceId: string
  authorId: string
  body: string
}): Promise<WorkshopAnnouncementView & { conferenceId: string }> {
  const createdAt = new Date().toISOString()
  const doc = await clientWrite.create({
    _type: 'workshopAnnouncement',
    workshop: { _type: 'reference', _ref: input.workshopId },
    conference: { _type: 'reference', _ref: input.conferenceId },
    author: { _type: 'reference', _ref: input.authorId, _weak: true },
    body: input.body,
    createdAt,
  })

  return {
    _id: doc._id,
    body: input.body,
    createdAt,
    authorName: null,
    conferenceId: input.conferenceId,
  }
}

/** The workshop + author an announcement belongs to — used to authorize edits. */
export interface AnnouncementForAuthz {
  _id: string
  workshopId: string | null
  authorId: string | null
  conferenceId: string | null
}

/**
 * Fetch the ownership context of a single announcement so the `updateAnnouncement`
 * / `deleteAnnouncement` mutations can authorize the caller (owner ∨ organizer)
 * and re-check multi-tenant isolation. Returns null when the id does not exist.
 */
export async function getWorkshopAnnouncementForAuthz(
  announcementId: string,
): Promise<AnnouncementForAuthz | null> {
  const query = groq`*[_type == "workshopAnnouncement" && _id == $announcementId][0]{
    _id,
    "workshopId": workshop._ref,
    "authorId": author._ref,
    "conferenceId": conference._ref
  }`

  const result = await clientWrite.fetch<AnnouncementForAuthz | null>(query, {
    announcementId,
  })
  return result ?? null
}

/**
 * Patch ONLY the body of an announcement. Author + createdAt are immutable and
 * are never touched here. Editing does NOT re-email participants (see the
 * mutation JSDoc) — the persisted body just changes, so the workshop page shows
 * the corrected copy on its next render.
 */
export async function updateWorkshopAnnouncementBody(
  announcementId: string,
  body: string,
): Promise<void> {
  await clientWrite.patch(announcementId).set({ body }).commit()
}

/** Hard-delete an announcement document. */
export async function deleteWorkshopAnnouncement(
  announcementId: string,
): Promise<void> {
  await clientWrite.delete(announcementId)
}

/** Read announcements for a workshop, newest first, bounded to `limit`. */
export async function getWorkshopAnnouncements(
  workshopId: string,
  limit: number,
): Promise<WorkshopAnnouncementView[]> {
  const query = groq`*[_type == "workshopAnnouncement" && workshop._ref == $workshopId] | order(createdAt desc)[0...$limit]{
    _id,
    body,
    createdAt,
    "authorName": author->name
  }`

  const announcements = await clientWrite.fetch<WorkshopAnnouncementView[]>(
    query,
    { workshopId, limit },
  )
  return announcements ?? []
}

/** Upper bound on simultaneous announcement emails in flight. */
const EMAIL_CONCURRENCY = 3

export interface FanOutResult {
  sent: number
  failed: number
}

/**
 * Fan out ONE announcement email per confirmed participant with bounded
 * concurrency ({@link EMAIL_CONCURRENCY}). Never-fail per recipient: each send
 * is wrapped so a single bad address or transient Resend error cannot abort the
 * batch (Promise.allSettled + the sender's own try/catch). Returns delivery
 * counts for the caller's response — it never throws.
 */
export async function sendAnnouncementToConfirmedParticipants(input: {
  conference?: Conference
  workshopTitle: string
  authorName: string
  body: string
  recipients: AnnouncementRecipient[]
}): Promise<FanOutResult> {
  const { conference, workshopTitle, authorName, body, recipients } = input
  let sent = 0
  let failed = 0

  for (let i = 0; i < recipients.length; i += EMAIL_CONCURRENCY) {
    const chunk = recipients.slice(i, i + EMAIL_CONCURRENCY)
    const results = await Promise.allSettled(
      chunk.map((recipient) =>
        sendWorkshopAnnouncementEmail({
          userEmail: recipient.userEmail,
          userName: recipient.userName,
          conference,
          workshopTitle,
          authorName,
          body,
        }),
      ),
    )

    for (const result of results) {
      if (result.status === 'fulfilled' && !result.value.error) {
        sent += 1
      } else {
        failed += 1
      }
    }
  }

  return { sent, failed }
}
