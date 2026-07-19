import { defineMigration, createIfNotExists } from 'sanity/migrate'

/**
 * One-shot backfill of the ORGANIZER side of the notification hub.
 *
 * WHY (the #559 root cause): from the hub launch until #559, every code path
 * that fanned notifications out to organizers resolved the organizer set with a
 * query that tested `isOrganizer == true` — a field that DOES NOT EXIST on the
 * speaker schema. It matched NOTHING, so EVERY organizer-recipient notification
 * was silently never created. Two families of organizer notification were lost:
 *
 *   PART A — collapsed `message_received` notifications: when a speaker sent a
 *   message, `upsertMessageNotifications` (src/lib/notification/sanity.ts) was
 *   supposed to keep ONE collapsed notification per (organizer, conversation).
 *   The organizer set was empty, so organizers got nothing.
 *
 *   PART B — the events-rail organizer notifications emitted by
 *   `handlePersistNotification` (src/lib/events/handlers/persistNotification.ts):
 *     - `proposal_submitted`     "New proposal: \"<title>\""        (Action.submit)
 *     - `proposal_status_changed` "Speaker confirmed: \"<title>\""  (Action.confirm)
 *     - `proposal_status_changed` "Proposal withdrawn: \"<title>\"" (Action.withdraw)
 *   all targeting `getOrganizerSpeakerIds()`, all lost for the same reason.
 *
 * #559 fixed the pipe going FORWARD (organizers are now resolved by conference
 * `organizers[]` membership). This migration reconstructs the missing HISTORY
 * from the CURRENT dataset state so the maintainer's hub is not empty.
 *
 * READ-STATE RULE: every backfilled notification arrives ALREADY READ
 * (`readAt == createdAt`). Reconstructed history should populate the panel
 * chronologically WITHOUT lighting up the unread badge — a flood of historical
 * unread items would be noise, not signal. (Contrast 040, which left `accepted`
 * proposals unread because they are still-actionable speaker call-to-actions;
 * nothing backfilled here is a fresh call-to-action.)
 *
 * PART A COLLAPSE TRICK: the message notifications are written with the LIVE
 * deterministic id `notification.message.<conversationId>.<organizerId>` (the
 * exact id `messageNotificationId` computes). The live upsert PATCHES this same
 * id on every new message, so a future message collapses INTO the backfilled
 * doc instead of creating a second one — no duplicates, ever. `createIfNotExists`
 * also means that if a post-#559 message already re-created the live doc, this
 * migration no-ops on it and never clobbers the fresher (possibly unread) state.
 *
 * IDEMPOTENCY: every write is `createIfNotExists` with a deterministic id (no
 * patches, no deletes). PART B additionally runs a pre-pass that builds a dedup
 * set keyed like 040 — (recipient, notificationType, relatedProposal) — from the
 * existing `notification` docs, so a live-emitted post-#559 organizer notification
 * (which carries a RANDOM id) is never duplicated by the backfill.
 */

/** Optional operator override to pin the target conference explicitly. */
const CONFERENCE_OVERRIDE = process.env.BACKFILL_CONFERENCE_ID

/** Deterministic id prefix for PART B (events-rail) notifications. */
const PART_B_ID_PREFIX = 'notification.backfill-042'

// ---------------------------------------------------------------------------
// Pure helpers — MIRRORED VERBATIM from the live source so the backfilled docs
// are byte-for-byte the shape the live emitters produce. Migrations do not
// resolve the `@/` path alias / `server-only` guards, so the pure bits are
// duplicated here rather than imported. Keep in sync with the cited sources.
// ---------------------------------------------------------------------------

/**
 * Live deterministic id for the single collapsed message notification a
 * recipient holds per conversation. Mirrors `messageNotificationId` in
 * src/lib/notification/sanity.ts EXACTLY — this is what makes the live upsert
 * collapse future messages into the backfilled doc (see PART A COLLAPSE TRICK).
 */
function messageNotificationId(
  conversationId: string,
  recipientId: string,
): string {
  return `notification.message.${conversationId}.${recipientId}`
}

/** Schema cap on `notification.title` (Rule.max(200)). Mirrors the live const. */
const NOTIFICATION_TITLE_MAX = 200

/** How many characters of the message body ride into the notification. */
const EXCERPT_LENGTH = 140

/**
 * The longest prefix of `text` that is at most `max` UTF-16 code units long AND
 * ends on a grapheme-cluster boundary. Mirrors `truncateToGraphemeBoundary` in
 * src/lib/messaging/links.ts VERBATIM so a truncated emoji never leaves a lone
 * surrogate (�).
 */
function truncateToGraphemeBoundary(text: string, max: number): string {
  if (max <= 0) return ''
  if (text.length <= max) return text

  const SegmenterCtor = (
    Intl as unknown as { Segmenter?: typeof Intl.Segmenter }
  ).Segmenter
  if (SegmenterCtor) {
    const segmenter = new SegmenterCtor(undefined, { granularity: 'grapheme' })
    let out = ''
    for (const { segment } of segmenter.segment(text)) {
      if (out.length + segment.length > max) break
      out += segment
    }
    return out
  }

  let end = max
  const code = text.charCodeAt(end - 1)
  if (code >= 0xd800 && code <= 0xdbff) end -= 1
  return text.slice(0, end)
}

/**
 * A single-line excerpt of a message body, capped and ellipsised. Mirrors
 * `messageExcerpt` in src/lib/messaging/notify.ts VERBATIM.
 */
function messageExcerpt(body: string, max = EXCERPT_LENGTH): string {
  const flat = body.replace(/\s+/g, ' ').trim()
  return flat.length > max
    ? `${truncateToGraphemeBoundary(flat, max).trimEnd()}…`
    : flat
}

/**
 * Title copy for the SINGLE-message form of a collapsed message notification
 * (backfilled docs always start at count 1). Mirrors the `count === 1` branches
 * of `messageNotificationTitle` in src/lib/notification/sanity.ts: the DIRECT
 * variant when the recipient IS the conversation's subject speaker (S10c), the
 * standard variant otherwise, both grapheme-capped at 200.
 */
function singleMessageTitle(
  authorName: string,
  subject: string,
  isDirect: boolean,
): string {
  const title = isDirect
    ? `Direct message from ${authorName} — ${subject}`
    : `New message from ${authorName} — ${subject}`
  return truncateToGraphemeBoundary(title, NOTIFICATION_TITLE_MAX)
}

/**
 * The ORGANIZER-audience deep link to a conversation. Mirrors
 * `conversationLinkPath(conversation, true)` in src/lib/messaging/links.ts —
 * organizers always get the /admin variant.
 */
function organizerConversationLink(conv: {
  _id: string
  conversationType?: string
  proposalId?: string | null
}): string {
  if (conv.conversationType === 'proposal' && conv.proposalId) {
    return `/admin/proposals/${conv.proposalId}#messages`
  }
  return `/admin/messages/${conv._id}`
}

// ---------------------------------------------------------------------------
// PART B — events-rail organizer notification catalogue.
// Mirrors the three organizer-facing emits in
// src/lib/events/handlers/persistNotification.ts (titles / types / links).
// ---------------------------------------------------------------------------

const PROPOSAL_ADMIN_LINK = (talkId: string): string =>
  `/admin/proposals/${talkId}`

/**
 * A talk's `status` (src/lib/proposal/types.ts `Status`) is post-submit for
 * every value except `draft` and `deleted`. Any such talk was submitted at
 * least once, so the live `Action.submit` handler would have emitted one
 * `proposal_submitted` per organizer. Reconstruct from that current-state fact.
 */
const SUBMITTED_STATUSES = new Set([
  'submitted',
  'accepted',
  'waitlisted',
  'confirmed',
  'rejected',
  'withdrawn',
])

interface ConferenceRow {
  _id: string
  title?: string
  startDate?: string
}

interface ExistingEventsNotificationRow {
  recipientRef?: string
  notificationType?: string
  relatedProposalRef?: string
}

interface ConversationRow {
  _id: string
  conversationType?: string
  subject?: string
  proposalId?: string | null
  subjectSpeakerId?: string | null
  lastMessageAt?: string
  lastMessage?: {
    authorId?: string | null
    authorName?: string | null
    body?: string | null
    createdAt?: string | null
  } | null
}

interface TalkRow {
  _id: string
  title?: string
  status?: string
  withdrawnReason?: string | null
  _createdAt?: string
  _updatedAt?: string
  speakerIds?: Array<string | null>
}

/** Dedup key mirroring 040's shape: (recipient, notificationType, relatedProposal). */
function eventsKey(
  recipientRef: string,
  notificationType: string,
  relatedProposalRef: string,
): string {
  return `${recipientRef}::${notificationType}::${relatedProposalRef}`
}

export default defineMigration({
  title: 'Backfill organizer notifications (messages + events rail)',
  description:
    'Reconstructs the organizer-side notification history that was silently ' +
    'never created before #559 (the organizer set was resolved via a ' +
    'non-existent isOrganizer field). PART A: collapsed message_received ' +
    'notifications (LIVE deterministic id so future messages collapse in). ' +
    'PART B: proposal_submitted / speaker-confirmed / proposal-withdrawn ' +
    'events-rail notifications. All arrive READ. Idempotent via deterministic ' +
    'ids + a 040-style dedup set; createIfNotExists only, no patches/deletes.',
  // These are the source document types; the migration drives off explicit
  // GROQ fetches (it needs joins the streamed docs can't provide), so the
  // streamed `documents()` iterator is intentionally not consumed.
  documentTypes: ['conversation', 'talk'],

  async *migrate(_documents, context) {
    // --- Pre-pass 1: resolve the target conference (copied from 040) ---------
    // The app scopes the conference by request domain
    // (getConferenceForCurrentDomain), which is unavailable in a migration. So
    // we pick the latest edition by startDate — the current conference —
    // logging every candidate (the production dataset contains test/dummy
    // conference docs with far-future startDates that break the heuristic). An
    // operator pins a specific edition via BACKFILL_CONFERENCE_ID.
    const conferences = await context.client.fetch<ConferenceRow[]>(
      `*[_type == "conference" && !(_id in path("drafts.**"))]{ _id, title, startDate } | order(startDate desc)`,
    )

    if (!conferences || conferences.length === 0) {
      console.warn('  ⚠ No conference documents found — nothing to backfill.')
      return
    }

    console.log('  Conference candidates:')
    for (const c of conferences) {
      console.log(
        `    - ${c._id}  startDate=${c.startDate ?? '—'}  ${c.title ?? '—'}`,
      )
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

    // --- Pre-pass 2: the CANONICAL organizer set -----------------------------
    // Membership in ANY conference's organizers[] array — the SAME rule #559
    // now uses (getOrganizerSpeakerIds). NEVER a stored `isOrganizer` field
    // (which does not exist — that was the whole bug).
    const organizerIds = await context.client.fetch<string[]>(
      `*[_type == "speaker" && _id in *[_type == "conference"].organizers[]._ref][0...200]._id`,
    )
    const organizers = (organizerIds ?? []).filter(Boolean)
    console.log(`  → ${organizers.length} organizer(s) resolved.`)
    if (organizers.length === 0) {
      console.warn('  ⚠ No organizers found — nothing to backfill.')
      return
    }

    // =====================================================================
    // PART A — collapsed message_received notifications
    // =====================================================================
    // Every conversation in the conference that HAS at least one message, with
    // its LAST message (author + body) joined in. Every organizer is a
    // participant of every conversation (resolveParticipantIds always seeds the
    // set with the full organizer list), so each organizer should hold one
    // collapsed notification per such conversation.
    const conversations = await context.client.fetch<ConversationRow[]>(
      `*[_type == "conversation" && conference._ref == $conferenceId
          && !(_id in path("drafts.**"))
          && count(*[_type == "message" && conversation._ref == ^._id]) > 0]{
        _id,
        conversationType,
        subject,
        "proposalId": proposal._ref,
        "subjectSpeakerId": subjectSpeaker._ref,
        lastMessageAt,
        "lastMessage": *[_type == "message" && conversation._ref == ^._id]
          | order(createdAt desc)[0]{
            "authorId": author._ref,
            "authorName": author->name,
            body,
            createdAt
          }
      }`,
      { conferenceId },
    )

    const convCount = conversations?.length ?? 0
    console.log(
      `\n  PART A — ${convCount} conversation(s) with ≥1 message × ${organizers.length} organizer(s) = ${convCount * organizers.length} candidate(s) (before actor-exclusion).`,
    )

    let messageCreated = 0
    let messageSelfSkipped = 0

    for (const conv of conversations ?? []) {
      // The collapsed doc mirrors the LAST message. Fall back to the
      // conversation's own lastMessageAt for createdAt/readAt (they should
      // agree; the conversation field is authoritative for inbox ordering).
      const createdAt = conv.lastMessageAt ?? conv.lastMessage?.createdAt
      if (!createdAt) {
        console.warn(
          `  ⚠ conversation ${conv._id} has no lastMessageAt — skipping.`,
        )
        continue
      }
      const authorName = conv.lastMessage?.authorName || 'Someone'
      const lastAuthorId = conv.lastMessage?.authorId ?? undefined
      const body = conv.lastMessage?.body ?? ''
      const excerpt = body ? messageExcerpt(body) : ''
      const link = organizerConversationLink(conv)
      const subject = conv.subject ?? ''

      for (const organizerId of organizers) {
        // ACTOR EXCLUSION: an author is never notified about their OWN message
        // (mirrors the live upsert, which excludes the actor). Because the
        // backfilled doc reflects the LAST message, an organizer who authored
        // it would otherwise get a nonsensical "New message from <themselves>";
        // skip them. (We cannot faithfully reconstruct a notification they may
        // have earned from an EARLIER message — this is an honest current-state
        // limitation, documented in the README.)
        if (lastAuthorId && organizerId === lastAuthorId) {
          messageSelfSkipped++
          continue
        }

        // DIRECT variant when this organizer IS the thread's subject speaker
        // (mirrors the live isDirect comparison exactly).
        const isDirect =
          conv.subjectSpeakerId != null && conv.subjectSpeakerId === organizerId

        const _id = messageNotificationId(conv._id, organizerId)
        const doc: { _type: string; [key: string]: unknown } = {
          _id,
          _type: 'notification',
          // Weak refs (per 041 — a later GDPR erasure must not orphan-block).
          recipient: { _type: 'reference', _ref: organizerId, _weak: true },
          conference: { _type: 'reference', _ref: conferenceId },
          notificationType: 'message_received',
          title: singleMessageTitle(authorName, subject, isDirect),
          link,
          count: 1,
          createdAt,
          // Backfilled history arrives READ — no badge flood.
          readAt: createdAt,
        }
        if (excerpt) doc.message = excerpt
        if (lastAuthorId) {
          doc.actor = { _type: 'reference', _ref: lastAuthorId, _weak: true }
        }

        yield [createIfNotExists(doc)]
        messageCreated++
      }
    }

    // =====================================================================
    // PART B — events-rail organizer notifications
    // =====================================================================
    // Dedup pre-pass (belt-and-braces, like 040): existing organizer-facing
    // events-rail notifications for the conference, keyed
    // (recipient, notificationType, relatedProposal) — so a live-emitted
    // post-#559 doc (random id) is never duplicated.
    const existingRows = await context.client.fetch<
      ExistingEventsNotificationRow[]
    >(
      `*[_type == "notification" && conference._ref == $conferenceId
          && notificationType in ["proposal_submitted", "proposal_status_changed"]]{
        "recipientRef": recipient._ref,
        notificationType,
        "relatedProposalRef": relatedProposal._ref
      }`,
      { conferenceId },
    )
    const existingKeys = new Set<string>()
    for (const row of existingRows ?? []) {
      if (!row.recipientRef || !row.notificationType || !row.relatedProposalRef)
        continue
      existingKeys.add(
        eventsKey(
          row.recipientRef,
          row.notificationType,
          row.relatedProposalRef,
        ),
      )
    }
    console.log(
      `  → ${existingKeys.size} existing events-rail organizer key(s) will be skipped if re-encountered.`,
    )

    const talks = await context.client.fetch<TalkRow[]>(
      `*[_type == "talk" && conference._ref == $conferenceId && !(_id in path("drafts.**"))]{
        _id, title, status, withdrawnReason, _createdAt, _updatedAt,
        "speakerIds": speakers[]._ref
      }`,
      { conferenceId },
    )

    // Count PART B source docs by kind for a dry-run-friendly summary.
    let submittedTalks = 0
    let confirmedTalks = 0
    let withdrawnTalks = 0
    for (const t of talks ?? []) {
      if (t.status && SUBMITTED_STATUSES.has(t.status)) submittedTalks++
      if (t.status === 'confirmed') confirmedTalks++
      if (t.status === 'withdrawn') withdrawnTalks++
    }
    console.log(
      `\n  PART B — ${talks?.length ?? 0} talk(s): ${submittedTalks} submitted, ${confirmedTalks} confirmed, ${withdrawnTalks} withdrawn × ${organizers.length} organizer(s).`,
    )

    let eventsCreated = 0
    let eventsSkipped = 0

    // Emit one events-rail notification (createIfNotExists) per organizer for a
    // given (source talk, kind). `actorId` is the talk's first speaker (the live
    // handler excludes the actor from organizer recipients — an organizer who is
    // also that speaker is skipped, mirroring `id !== actorId`).
    function* emitForTalk(
      talk: TalkRow,
      notificationType: 'proposal_submitted' | 'proposal_status_changed',
      title: string,
      createdAt: string,
      message?: string,
    ) {
      const actorId =
        (talk.speakerIds ?? []).find((id): id is string => Boolean(id)) ??
        undefined
      const emissions: ReturnType<typeof createIfNotExists>[][] = []
      for (const organizerId of organizers) {
        if (actorId && organizerId === actorId) continue // actor exclusion
        const key = eventsKey(organizerId, notificationType, talk._id)
        if (existingKeys.has(key)) {
          eventsSkipped++
          continue
        }
        existingKeys.add(key)

        const _id = `${PART_B_ID_PREFIX}.${notificationType}.${talk._id}.${organizerId}`
        const doc: { _type: string; [key: string]: unknown } = {
          _id,
          _type: 'notification',
          recipient: { _type: 'reference', _ref: organizerId, _weak: true },
          conference: { _type: 'reference', _ref: conferenceId },
          notificationType,
          title,
          link: PROPOSAL_ADMIN_LINK(talk._id),
          // Weak (per 040) — a later proposal deletion must not orphan-block.
          relatedProposal: { _type: 'reference', _ref: talk._id, _weak: true },
          createdAt,
          // Events-rail history arrives READ.
          readAt: createdAt,
        }
        if (message) doc.message = message
        if (actorId) {
          doc.actor = { _type: 'reference', _ref: actorId, _weak: true }
        }
        emissions.push([createIfNotExists(doc)])
        eventsCreated++
      }
      yield* emissions
    }

    for (const talk of talks ?? []) {
      const talkTitle = talk.title ?? 'Untitled proposal'

      // proposal_submitted — for every talk that has left draft (was submitted).
      // Timestamp: the talk's _createdAt (submission time).
      if (talk.status && SUBMITTED_STATUSES.has(talk.status)) {
        const createdAt = talk._createdAt
        if (createdAt) {
          yield* emitForTalk(
            talk,
            'proposal_submitted',
            `New proposal: "${talkTitle}"`,
            createdAt,
          )
        }
      }

      // Speaker confirmed — current status == confirmed. No dedicated status
      // timestamp exists on the talk, so _updatedAt is the honest best proxy
      // for when the confirm happened (documented in the README).
      if (talk.status === 'confirmed' && talk._updatedAt) {
        yield* emitForTalk(
          talk,
          'proposal_status_changed',
          `Speaker confirmed: "${talkTitle}"`,
          talk._updatedAt,
        )
      }

      // Proposal withdrawn — current status == withdrawn. Mirror the live
      // handler: the withdrawal reason becomes the message when present.
      if (talk.status === 'withdrawn' && talk._updatedAt) {
        yield* emitForTalk(
          talk,
          'proposal_status_changed',
          `Proposal withdrawn: "${talkTitle}"`,
          talk._updatedAt,
          talk.withdrawnReason || undefined,
        )
      }
    }

    console.log('\n=== Backfill summary ===')
    console.log(
      `  PART A (messages):    ${messageCreated} created, ${messageSelfSkipped} skipped (organizer authored the last message)`,
    )
    console.log(
      `  PART B (events rail): ${eventsCreated} created, ${eventsSkipped} skipped (already present)`,
    )
  },
})
