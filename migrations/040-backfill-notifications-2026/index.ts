import { defineMigration, createIfNotExists } from 'sanity/migrate'
import type { SanityDocument } from '@sanity/types'

/**
 * One-shot backfill of the in-app notification hub with the CURRENT 2026 state,
 * so speaker inboxes are not empty when the hub launches.
 *
 * WHY: the live emitters (`src/lib/events/handlers/persistNotification.ts` and
 * `src/server/routers/travelSupport.ts`) only fan out notifications going
 * FORWARD, from the moment they shipped. Every proposal decision and travel
 * support decision made BEFORE the hub existed produced no notification, so a
 * speaker opening the new inbox at launch would see nothing about the very
 * decisions that matter most to them. This migration reconstructs those
 * notifications from the current dataset state.
 *
 * SCOPE (source documents this migration reads):
 *  1. `talk` documents for the target conference whose status is a
 *     speaker-facing decision (accepted / confirmed / rejected / waitlisted).
 *     One `proposal_status_changed` notification per referenced speaker.
 *  2. `travelSupport` documents for the target conference whose status is a
 *     decision (approved / paid / rejected). One `travel_support_update`
 *     notification to the requesting speaker.
 *  NO organizer backfill — see README ("No organizer backfill").
 *
 * READ-STATE RULE: backfilled notifications arrive already READ
 * (`readAt == createdAt`) EXCEPT `accepted` proposals, which arrive UNREAD.
 * An accepted proposal is awaiting the speaker's confirmation, so its
 * notification is a genuine, still-actionable call-to-action; every other
 * state is informational history, so it should not light up the unread badge.
 *
 * IDEMPOTENCY (see README): every created document has a deterministic `_id`
 * (`notification.backfill-2026.<...>`) applied via `createIfNotExists`, and a
 * pre-pass builds a dedup set keyed by
 * (recipient, notificationType, relatedProposal|link) from the existing
 * `notification` documents. A candidate is skipped when either its `_id` or its
 * key already exists — so a re-run, OR a live emitter that already fired for the
 * same (speaker, decision), can never produce a duplicate.
 */

/** Conference id prefix for every backfilled notification's deterministic id. */
const ID_PREFIX = 'notification.backfill-2026'

/** Optional operator override to pin the target conference explicitly. */
const CONFERENCE_OVERRIDE = process.env.BACKFILL_CONFERENCE_ID

/**
 * Proposal statuses that warrant a speaker-facing status notification. Values
 * mirror the `Status` enum in `src/lib/proposal/types.ts` (note the spelling
 * `waitlisted`). `confirmed` is included even though the live handler never
 * emits for it (confirm is speaker-initiated) — see `proposalTitle`.
 */
const PROPOSAL_NOTIFY_STATUSES = [
  'accepted',
  'confirmed',
  'rejected',
  'waitlisted',
] as const
type ProposalNotifyStatus = (typeof PROPOSAL_NOTIFY_STATUSES)[number]

/**
 * Travel support statuses that warrant notifying the requesting speaker. Values
 * mirror the `TravelSupportStatus` enum in `src/lib/travel-support/types.ts`.
 */
const TRAVEL_NOTIFY_STATUSES = ['approved', 'paid', 'rejected'] as const
type TravelNotifyStatus = (typeof TRAVEL_NOTIFY_STATUSES)[number]

/**
 * Travel support notification titles. Mirrors `TRAVEL_STATUS_NOTIFY_TITLES` in
 * `src/server/routers/travelSupport.ts` verbatim.
 */
const TRAVEL_TITLES: Record<TravelNotifyStatus, string> = {
  approved: 'Travel support approved',
  rejected: 'Travel support rejected',
  paid: 'Travel support marked paid',
}

const TRAVEL_LINK = '/cfp/expense'

/**
 * Proposal notification title for a status.
 *
 * accept / reject / waitlist mirror the live handler
 * (`handlePersistNotification`) wording: `Your proposal "<title>" is now
 * <status>`. `confirmed` has no live speaker-facing title — confirm is
 * speaker-initiated, so the live system never emits one — so we mint an
 * explicit `Proposal confirmed: "<title>"`.
 */
function proposalTitle(
  status: ProposalNotifyStatus,
  talkTitle: string,
): string {
  if (status === 'confirmed') {
    return `Proposal confirmed: "${talkTitle}"`
  }
  return `Your proposal "${talkTitle}" is now ${status}`
}

interface ConferenceRow {
  _id: string
  title?: string
  startDate?: string
}

interface ExistingNotificationRow {
  recipientRef?: string
  notificationType?: string
  relatedProposalRef?: string
  link?: string
}

interface TalkDoc extends SanityDocument {
  title?: string
  status?: string
  conference?: { _ref?: string }
  speakers?: Array<{ _ref?: string } | null>
}

interface TravelSupportDoc extends SanityDocument {
  status?: string
  conference?: { _ref?: string }
  speaker?: { _ref?: string }
}

const isDraft = (id: string): boolean => id.startsWith('drafts.')

/** Dedup key: matches on (recipient, notificationType, relatedProposal|link). */
function proposalKey(recipientRef: string, proposalRef: string): string {
  return `${recipientRef}::proposal_status_changed::${proposalRef}`
}
function travelKey(recipientRef: string): string {
  return `${recipientRef}::travel_support_update::${TRAVEL_LINK}`
}

export default defineMigration({
  title: 'Backfill notification hub with current 2026 speaker inbox state',
  description:
    'Creates in-app notification documents reconstructing the current ' +
    'proposal-decision and travel-support-decision state for the latest ' +
    'conference, so speaker inboxes are not empty at hub launch. Accepted ' +
    'proposals arrive unread (call-to-action); everything else arrives read. ' +
    'No organizer backfill. Idempotent via deterministic ids + a dedup set.',
  documentTypes: ['talk', 'travelSupport'],

  async *migrate(documents, context) {
    // Single backfill timestamp for createdAt (and readAt where read-on-arrival).
    const now = new Date().toISOString()

    // --- Pre-pass 1: resolve the target conference ---------------------------
    // The app scopes the conference by request domain (getConferenceForCurrentDomain),
    // which is unavailable in a migration. So we pick the latest edition by
    // startDate — the CURRENT 2026 conference — logging the choice. An operator
    // can pin a specific edition via BACKFILL_CONFERENCE_ID.
    const conferences = await context.client.fetch<ConferenceRow[]>(
      `*[_type == "conference" && !(_id in path("drafts.**"))]{ _id, title, startDate } | order(startDate desc)`,
    )

    if (!conferences || conferences.length === 0) {
      console.warn('  ⚠ No conference documents found — nothing to backfill.')
      return
    }

    let conference: ConferenceRow | undefined
    if (CONFERENCE_OVERRIDE) {
      conference = conferences.find((c) => c._id === CONFERENCE_OVERRIDE)
      if (!conference) {
        console.warn(
          `  ⚠ BACKFILL_CONFERENCE_ID=${CONFERENCE_OVERRIDE} not found — aborting.`,
        )
        return
      }
      console.log(
        `  → Target conference (pinned): ${conference.title ?? '—'} (${conference._id}, startDate ${conference.startDate ?? '—'})`,
      )
    } else {
      conference = conferences[0]
      console.log(
        `  → Target conference (latest startDate): ${conference.title ?? '—'} (${conference._id}, startDate ${conference.startDate ?? '—'})`,
      )
      if (conferences.length > 1) {
        console.log(
          `    (${conferences.length} conferences total; chose the one with the latest startDate. Set BACKFILL_CONFERENCE_ID to override.)`,
        )
      }
    }
    const conferenceId = conference._id

    // --- Pre-pass 2: build the dedup set from existing notifications ----------
    // Catches BOTH prior runs of this migration AND live emitters that already
    // fired for the same (recipient, type, relatedProposal|link).
    const existingRows = await context.client.fetch<ExistingNotificationRow[]>(
      `*[_type == "notification" && conference._ref == $conferenceId
          && notificationType in ["proposal_status_changed", "travel_support_update"]]{
        "recipientRef": recipient._ref,
        notificationType,
        "relatedProposalRef": relatedProposal._ref,
        link
      }`,
      { conferenceId },
    )

    const existingKeys = new Set<string>()
    for (const row of existingRows ?? []) {
      if (!row.recipientRef) continue
      if (row.notificationType === 'proposal_status_changed') {
        existingKeys.add(
          proposalKey(row.recipientRef, row.relatedProposalRef ?? ''),
        )
      } else if (row.notificationType === 'travel_support_update') {
        // Travel notifications carry no relatedProposal; dedup on the link.
        if (row.link === TRAVEL_LINK)
          existingKeys.add(travelKey(row.recipientRef))
      }
    }
    console.log(
      `  → ${existingKeys.size} existing notification key(s) for this conference will be skipped if re-encountered.`,
    )

    // --- Stream the source documents and yield creates -----------------------
    let proposalCreated = 0
    let proposalSkipped = 0
    let travelCreated = 0
    let travelSkipped = 0

    for await (const rawDoc of documents()) {
      const doc = rawDoc as TalkDoc | TravelSupportDoc

      // Drafts inherit the published document's fields on publish; the
      // published document is the source of truth for the backfill.
      if (isDraft(doc._id)) continue
      if (doc.conference?._ref !== conferenceId) continue

      // ---------------- Proposal decisions (talk) ----------------
      if (doc._type === 'talk') {
        const talk = doc as TalkDoc
        const status = talk.status
        if (
          !status ||
          !(PROPOSAL_NOTIFY_STATUSES as readonly string[]).includes(status)
        ) {
          continue
        }
        const notifyStatus = status as ProposalNotifyStatus
        const talkTitle = talk.title ?? 'your proposal'

        // De-dup speakers within the talk (mirrors the live handler).
        const seen = new Set<string>()
        for (const speaker of talk.speakers ?? []) {
          const recipientRef = speaker?._ref
          if (!recipientRef || seen.has(recipientRef)) continue
          seen.add(recipientRef)

          const key = proposalKey(recipientRef, talk._id)
          if (existingKeys.has(key)) {
            proposalSkipped++
            continue
          }
          existingKeys.add(key)

          // Read-state rule: accepted arrives UNREAD; all others arrive read.
          const readAt = notifyStatus === 'accepted' ? undefined : now

          const _id = `${ID_PREFIX}.${talk._id}.${recipientRef}`
          console.log(
            `  ✓ proposal ${notifyStatus} → ${recipientRef} (talk ${talk._id})${readAt ? '' : ' [unread]'}`,
          )
          yield [
            createIfNotExists({
              _id,
              _type: 'notification',
              recipient: { _type: 'reference', _ref: recipientRef },
              conference: { _type: 'reference', _ref: conferenceId },
              notificationType: 'proposal_status_changed',
              title: proposalTitle(notifyStatus, talkTitle),
              link: `/cfp/proposal/${talk._id}`,
              // Weak: a later proposal deletion must not orphan-block the note.
              relatedProposal: {
                _type: 'reference',
                _ref: talk._id,
                _weak: true,
              },
              createdAt: now,
              ...(readAt ? { readAt } : {}),
            }),
          ]
          proposalCreated++
        }
        continue
      }

      // ---------------- Travel support decisions ----------------
      if (doc._type === 'travelSupport') {
        const travel = doc as TravelSupportDoc
        const status = travel.status
        if (
          !status ||
          !(TRAVEL_NOTIFY_STATUSES as readonly string[]).includes(status)
        ) {
          continue
        }
        const travelStatus = status as TravelNotifyStatus
        const recipientRef = travel.speaker?._ref
        if (!recipientRef) {
          console.warn(
            `  ⚠ travelSupport ${travel._id} has no speaker ref — skipping.`,
          )
          continue
        }

        const key = travelKey(recipientRef)
        if (existingKeys.has(key)) {
          travelSkipped++
          continue
        }
        existingKeys.add(key)

        const _id = `${ID_PREFIX}.travel.${travel._id}`
        console.log(
          `  ✓ travel ${travelStatus} → ${recipientRef} (travelSupport ${travel._id})`,
        )
        yield [
          createIfNotExists({
            _id,
            _type: 'notification',
            recipient: { _type: 'reference', _ref: recipientRef },
            conference: { _type: 'reference', _ref: conferenceId },
            notificationType: 'travel_support_update',
            title: TRAVEL_TITLES[travelStatus],
            link: TRAVEL_LINK,
            // Decisions are informational — arrive already read.
            createdAt: now,
            readAt: now,
          }),
        ]
        travelCreated++
      }
    }

    console.log('\n=== Backfill summary ===')
    console.log(
      `  Proposal notifications: ${proposalCreated} created, ${proposalSkipped} skipped (already present)`,
    )
    console.log(
      `  Travel notifications:   ${travelCreated} created, ${travelSkipped} skipped (already present)`,
    )
  },
})
