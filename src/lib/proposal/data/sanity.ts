import { ProposalExisting, ProposalInput, Status } from '@/lib/proposal/types'
import {
  clientReadUncached as clientRead,
  clientWrite,
} from '@/lib/sanity/client'
import { groq } from 'next-sanity'
import { Reference } from 'sanity'
import { v4 as randomUUID } from 'uuid'
import { convertStringToPortableTextBlocks } from '../utils/validation'
import { Review } from '@/lib/review/types'
import { conversationLinkPath } from '@/lib/messaging/links'
import {
  prepareReferenceArray,
  createReference,
  createReferenceWithKey,
  EXCLUDE_PUSH_FIELDS,
} from '@/lib/sanity/helpers'

export async function getProposal({
  id,
  speakerId,
  isOrganizer = false,
  includeReviews = false,
  includeSubmittedTalks = false,
  includePreviousAcceptedTalks = false,
}: {
  id: string
  speakerId: string
  isOrganizer?: boolean
  includeReviews?: boolean
  includeSubmittedTalks?: boolean
  includePreviousAcceptedTalks?: boolean
}): Promise<{
  proposal: ProposalExisting
  reviews?: Review[]
  proposalError: Error | null
}> {
  let proposalError = null
  let proposal: ProposalExisting = {} as ProposalExisting

  const speakerFilter = isOrganizer
    ? ''
    : `&& "${speakerId}" in speakers[]._ref`

  try {
    const query = groq`*[_type == "talk" && _id==$id ${speakerFilter}]{
      ...,
      speakers[]-> {
        ...,
        ${EXCLUDE_PUSH_FIELDS},
        "image": coalesce(image.asset->url, imageURL),
        ${
          isOrganizer && includeSubmittedTalks
            ? `"submittedTalks": *[
            _type == "talk"
            && ^._id in speakers[]._ref
            && conference._ref == ^.^.conference._ref
            && _id != ^.^._id
            && status != "draft"
          ]{
            _id, title, status, _createdAt,
            topics[]-> { _id, title, color },
            "reviewCount": count(*[_type == "review" && proposal._ref == ^._id]),
            "reviewScores": *[_type == "review" && proposal._ref == ^._id]{"total": score.content + score.relevance + score.speaker}
          },`
            : ''
        }
        ${
          isOrganizer && includePreviousAcceptedTalks
            ? `"previousAcceptedTalks": *[
            _type == "talk"
            && ^._id in speakers[]._ref
            && conference._ref != ^.^.conference._ref
            && (status == "accepted" || status == "confirmed")
          ]{
            _id, title, status, _createdAt,
            conference-> { _id, title, startDate },
            topics[]-> { _id, title, color },
            "reviewCount": count(*[_type == "review" && proposal._ref == ^._id]),
            "reviewScores": *[_type == "review" && proposal._ref == ^._id]{"total": score.content + score.relevance + score.speaker}
          }`
            : ''
        }
      },
      conference-> {
        _id, title, startDate, endDate
      },
      topics[]-> {
        _id, title, color, slug, description
      },
      "coSpeakerInvitations": *[_type == "coSpeakerInvitation" && proposal._ref == ^._id]{
        _id,
        invitedEmail,
        invitedName,
        status,
        expiresAt,
        createdAt,
        respondedAt,
        declineReason
      },
      ${
        includeReviews && isOrganizer
          ? `"reviews": *[_type == "review" && proposal._ref == ^._id]{
        ...,
        reviewer-> {
          _id, name, email, "image": coalesce(image.asset->url, imageURL)
        }
      }`
          : ''
      }
    }[0]`

    proposal = await clientRead.fetch(
      query,
      { id, speakerId },
      { cache: 'no-store' },
    )
  } catch (error) {
    console.error('Error fetching proposal:', error)
    proposalError = error as Error
  }

  if (proposal?.description) {
    proposal.description = convertStringToPortableTextBlocks(
      proposal.description,
    )
  }

  // @TODO - Check if the proposal is not found and return an error
  return { proposal, proposalError }
}

export async function getProposals({
  speakerId,
  conferenceId,
  returnAll = false,
  includeReviews = false,
  includePreviousAcceptedTalks = false,
  formats,
  statuses,
  includeCapacity = false,
  includeSchedule = false,
}: {
  speakerId?: string
  conferenceId?: string
  returnAll?: boolean
  includeReviews?: boolean
  includePreviousAcceptedTalks?: boolean
  formats?: string[]
  statuses?: Status[]
  includeCapacity?: boolean
  includeSchedule?: boolean
}): Promise<{ proposals: ProposalExisting[]; proposalsError: Error | null }> {
  let proposalsError = null
  let proposals: ProposalExisting[] = []

  const filters = [
    `_type == "talk"`,
    returnAll
      ? `status != "${Status.draft}"`
      : speakerId
        ? `"${speakerId}" in speakers[]._ref`
        : null,
    conferenceId ? `conference._ref == $conferenceId` : null,
    formats && formats.length > 0
      ? `format in [${formats.map((f) => `"${f}"`).join(', ')}]`
      : null,
    statuses && statuses.length > 0
      ? `status in [${statuses.map((s) => `"${s}"`).join(', ')}]`
      : null,
  ]
    .filter(Boolean)
    .join(' && ')

  const query = groq`*[${filters}]{
    ...,
    speakers[]-> {
      _id, name, email, providers, "image": coalesce(image.asset->url, imageURL), flags, "slug": slug.current,
      ${
        includePreviousAcceptedTalks
          ? `"previousAcceptedTalks": *[
          _type == "talk"
          && ^._id in speakers[]._ref
          && conference._ref != ^.^.conference._ref
          && (status == "accepted" || status == "confirmed")
        ]{
          _id, title, status, _createdAt,
          conference-> { _id, title, startDate },
          topics[]-> { _id, title, color }
        }`
          : ''
      }
    },
    conference-> {
      _id, title, startDate, endDate
    },
    topics[]-> {
      _id, title, color, slug, description
    },
    "coSpeakerInvitations": *[_type == "coSpeakerInvitation" && proposal._ref == ^._id]{
      _id,
      invitedEmail,
      invitedName,
      status,
      expiresAt,
      createdAt,
      respondedAt,
      declineReason
    }${
      includeReviews
        ? `,"reviews": *[_type == "review" && proposal._ref == ^._id]{
      ...,
      reviewer-> {
        _id, name, email, "image": coalesce(image.asset->url, imageURL)
      }
    }`
        : ''
    }${
      includeCapacity
        ? `,"signups": count(*[_type == "workshopSignup" && workshop._ref == ^._id && status == "confirmed"]),
    "waitlistCount": count(*[_type == "workshopSignup" && workshop._ref == ^._id && status == "waitlist"]),
    "available": coalesce(capacity, 30) - count(*[_type == "workshopSignup" && workshop._ref == ^._id && status == "confirmed"])`
        : ''
    }${
      includeSchedule
        ? `,"scheduleInfo": select(
      (status == "accepted" || status == "confirmed") => {
        "talkId": _id,
        "schedule": *[_type == "schedule" && conference._ref == ^.conference._ref && ^._id in tracks[].talks[].talk._ref][0]
      } {
        "date": schedule.date,
        "trackTitle": schedule.tracks[count(talks[talk._ref == ^.talkId]) > 0][0].trackTitle,
        "timeSlot": schedule.tracks[count(talks[talk._ref == ^.talkId]) > 0][0].talks[talk._ref == ^.talkId][0]{
          startTime,
          endTime
        }
      }
    )`
        : ''
    }
  } | order(conference->startDate desc, _updatedAt desc)`

  try {
    proposals = await clientRead.fetch(
      query,
      {
        ...(speakerId && { speakerId }),
        ...(conferenceId && { conferenceId }),
      },
      { cache: 'no-store' },
    )
  } catch (error) {
    console.error('Error fetching proposals:', error)
    proposalsError = error as Error
  }

  proposals = proposals.map((proposal) => {
    if (proposal.description) {
      proposal.description = convertStringToPortableTextBlocks(
        proposal.description,
      )
    }
    return proposal
  })

  return { proposals, proposalsError }
}

export async function updateProposal(
  proposalId: string,
  proposal: Partial<ProposalInput>,
): Promise<{ proposal: ProposalExisting; err: Error | null }> {
  let err = null
  let updatedProposal: ProposalExisting = {} as ProposalExisting

  const speakers = proposal.speakers
    ? prepareReferenceArray(
        proposal.speakers as Array<Reference | { _id: string }>,
        'speaker',
      )
    : undefined

  try {
    updatedProposal = await clientWrite
      .patch(proposalId)
      .set({
        ...proposal,
        ...(speakers && { speakers }),
      })
      .commit()
  } catch (error) {
    err = error as Error
  }

  return { proposal: updatedProposal, err }
}

/**
 * Document types that only exist in service of a proposal and are safe to
 * cascade-delete together with it.
 */
const CASCADE_DELETE_TYPES = ['coSpeakerInvitation', 'review']

/**
 * Types that reference a proposal only WEAKLY and must neither block deletion
 * nor generally be deleted with it:
 * - `notification` — a hub notification's `relatedProposal` is weak and is NEVER
 *   dereferenced by any list projection, so a dangling ref renders harmlessly.
 *   (The proposal thread's `message_received` notifications ARE cleaned up
 *   separately below, since they'd otherwise 404 on their deep link.)
 * - `conversation` — the proposal thread; CASCADE-deleted below along with its
 *   messages.
 * Both are excluded from the blocking check so a proposal with an active message
 * thread and notifications stays deletable.
 */
const NON_BLOCKING_TYPES = ['notification', 'conversation']

/** Deletes per transaction when cascading a proposal's thread — keeps each
 * commit well under Sanity's mutation-per-transaction ceiling. */
const PROPOSAL_DELETE_CHUNK_SIZE = 100

/** Split `items` into consecutive chunks of at most `size`. */
function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size))
  }
  return chunks
}

/** Delete a set of document ids in ONE transaction. No-op for an empty set. */
async function commitDeletes(ids: string[]): Promise<void> {
  if (ids.length === 0) return
  const transaction = clientWrite.transaction()
  for (const id of ids) {
    transaction.delete(id)
  }
  await transaction.commit()
}

/**
 * Human readable descriptions for document types that block deletion of a
 * proposal. Any other unexpected referencing type falls back to its raw
 * `_type` name.
 */
const BLOCKING_TYPE_DESCRIPTIONS: Record<string, string> = {
  schedule: 'a published schedule',
  conference: 'a conference (featured talks)',
  workshopSignup: 'workshop signups',
}

/**
 * Returned by deleteProposal when the proposal cannot be deleted because
 * other documents (schedules, featured talks, workshop signups, ...) still
 * reference it. Callers can distinguish this precondition failure from
 * unexpected internal errors.
 */
export class ProposalDeletionBlockedError extends Error {}

export async function deleteProposal(
  proposalId: string,
): Promise<{ err: Error | null }> {
  let err = null
  try {
    // Find every document that references this proposal. Sanity refuses to
    // delete a document with inbound strong references, so we must handle
    // them up front instead of surfacing a raw 409 to the user.
    const referencingDocs = await clientRead.fetch<
      Array<{ _id: string; _type: string }>
    >(
      groq`*[references($proposalId) && _id != $proposalId]{ _id, _type }`,
      { proposalId },
      // Mutation-path read: bypass the Next data cache so a stale entry can't
      // hide a document that references the proposal (mirrors every other
      // read in this file, which all pass `cache: 'no-store'`).
      { cache: 'no-store' },
    )

    const docs = referencingDocs ?? []

    // A GROQ `references()` match includes WEAK refs, so notifications
    // (weak `relatedProposal`) and the proposal conversation (weak `proposal`)
    // show up here too. Only STRONG-ref holders that aren't cascade-safe (a
    // published schedule, a featured-talk conference ref, workshop signups, …)
    // genuinely block deletion.
    const blocking = docs.filter(
      (doc) =>
        !CASCADE_DELETE_TYPES.includes(doc._type) &&
        !NON_BLOCKING_TYPES.includes(doc._type),
    )

    if (blocking.length > 0) {
      const descriptions = Array.from(
        new Set(
          blocking.map(
            (doc) => BLOCKING_TYPE_DESCRIPTIONS[doc._type] ?? doc._type,
          ),
        ),
      )
      return {
        err: new ProposalDeletionBlockedError(
          `Cannot delete proposal: it is referenced by ${descriptions.join(' and ')}. Remove those references first.`,
        ),
      }
    }

    // Cascade-safe dependents that reference the proposal (co-speaker
    // invitations + reviews). Notifications are intentionally KEPT (their weak
    // ref dangles harmlessly); the message thread is handled just below.
    const cascadeIds = docs
      .filter((doc) => CASCADE_DELETE_TYPES.includes(doc._type))
      .map((doc) => doc._id)

    // Cascade the proposal's message thread: the conversation(s), their
    // messages, and every participant's collapsed message notification. Fetched
    // fresh (not filtered from `docs`) because message documents don't reference
    // the proposal, and message notifications are matched by the proposal-thread
    // deep link (both audience variants) rather than a stored proposal ref.
    const conversationIds =
      (await clientRead.fetch<string[]>(
        groq`*[_type == "conversation" && proposal._ref == $proposalId]._id`,
        { proposalId },
        // A just-created conversation must not be missed by a stale cache read,
        // or its messages/notifications would orphan on delete.
        { cache: 'no-store' },
      )) ?? []

    let messageIds: string[] = []
    if (conversationIds.length > 0) {
      messageIds =
        (await clientRead.fetch<string[]>(
          groq`*[_type == "message" && conversation._ref in $conversationIds]._id`,
          { conversationIds },
          // A just-sent message must not be missed by a stale cache read.
          { cache: 'no-store' },
        )) ?? []
    }

    const threadLinkConv = {
      _id: '',
      conversationType: 'proposal' as const,
      proposalId,
    }
    const messageLinks = [
      conversationLinkPath(threadLinkConv, true),
      conversationLinkPath(threadLinkConv, false),
    ]
    const messageNotificationIds =
      (await clientRead.fetch<string[]>(
        groq`*[_type == "notification" && notificationType == "message_received" && link in $messageLinks]._id`,
        { messageLinks },
        // A just-fanned-out message notification must not be missed by a stale
        // cache read.
        { cache: 'no-store' },
      )) ?? []

    // Per-conversation preference docs STRONGLY reference their conversation
    // (like messages do), so they must also be deleted before the conversations
    // or the conversation delete 409s for any thread a participant ever muted.
    // (Found by the messaging retention job, which orders the same way.)
    let preferenceIds: string[] = []
    if (conversationIds.length > 0) {
      preferenceIds =
        (await clientRead.fetch<string[]>(
          groq`*[_type == "conversationPreference" && conversation._ref in $conversationIds]._id`,
          { conversationIds },
          { cache: 'no-store' },
        )) ?? []
    }

    // Deletion ORDER matters for strong references: messages AND preference
    // docs strongly ref their conversation, so both go before conversations;
    // the proposal is
    // deleted LAST, together with the co-speaker invitations / reviews that
    // strongly ref it (Sanity resolves intra-transaction constraints, so those
    // may share the final transaction). Everything else is weak-ref or
    // unreferenced and can be chunked freely. Chunking trades the previous
    // single-transaction atomicity for staying under the mutation ceiling on a
    // large thread — a mid-way failure surfaces an error and leaves a partially
    // cascaded thread, which a retry finishes.
    for (const chunk of chunkArray(messageIds, PROPOSAL_DELETE_CHUNK_SIZE)) {
      await commitDeletes(chunk)
    }
    for (const chunk of chunkArray(preferenceIds, PROPOSAL_DELETE_CHUNK_SIZE)) {
      await commitDeletes(chunk)
    }
    for (const chunk of chunkArray(
      conversationIds,
      PROPOSAL_DELETE_CHUNK_SIZE,
    )) {
      await commitDeletes(chunk)
    }
    for (const chunk of chunkArray(
      messageNotificationIds,
      PROPOSAL_DELETE_CHUNK_SIZE,
    )) {
      await commitDeletes(chunk)
    }
    // Final transaction: the cascade dependents (strong refs to the proposal)
    // and the proposal itself, atomically.
    await commitDeletes([...cascadeIds, proposalId])
  } catch (error) {
    console.error('Error deleting proposal:', error)
    err = error as Error
  }
  return { err }
}

export async function updateProposalStatus(
  proposalId: string,
  status: Status,
  withdrawnReason?: string,
): Promise<{ proposal: ProposalExisting; err: Error | null }> {
  let err = null
  let updatedProposal: ProposalExisting = {} as ProposalExisting

  const fields: { status: Status; withdrawnReason?: string } = { status }
  // Persist the mandatory withdrawal reason (#212) alongside the status change
  // so organizers can see why a proposal was withdrawn.
  const trimmedReason = withdrawnReason?.trim()
  if (trimmedReason) {
    fields.withdrawnReason = trimmedReason
  }

  try {
    const patch = clientWrite.patch(proposalId).set(fields)
    // Any status change that isn't a withdrawal-with-reason must clear a
    // previous reason so it can't misrepresent a now-active proposal if a
    // transition out of `withdrawn` is ever added.
    if (!trimmedReason) {
      patch.unset(['withdrawnReason'])
    }
    updatedProposal = await patch.commit()
  } catch (error) {
    err = error as Error
  }

  return { proposal: updatedProposal, err }
}

export async function createProposal(
  proposal: ProposalInput,
  speakerId: string,
  conferenceId: string,
  initialStatus: Status = Status.submitted,
): Promise<{ proposal: ProposalExisting; err: Error | null }> {
  let err = null
  let createdProposal: ProposalExisting = {} as ProposalExisting

  const _type = 'talk'
  const _id = randomUUID().toString()
  const status = initialStatus

  const speakers = proposal.speakers
    ? prepareReferenceArray(
        proposal.speakers as Array<Reference | { _id: string }>,
        'speaker',
      )
    : [createReferenceWithKey(speakerId, 'speaker')]

  const conference = createReference(conferenceId)

  try {
    createdProposal = (await clientWrite.create({
      ...proposal,
      _type,
      _id,
      status,
      speakers,
      conference,
    })) as ProposalExisting
  } catch (error) {
    console.error('Error creating proposal:', error)
    err = error as Error
  }

  return { proposal: createdProposal, err }
}

export async function fetchNextUnreviewedProposal({
  conferenceId,
  reviewerId,
  currentProposalId,
}: {
  conferenceId: string
  reviewerId: string
  currentProposalId?: string
}): Promise<{
  nextProposal: {
    _id: string
    title: string
    status: string
    speakers?: Array<{ _id: string; name: string }>
  } | null
  error: Error | null
}> {
  try {
    const query = groq`
      *[
        _type == "talk" &&
        conference._ref == $conferenceId &&
        status == "${Status.submitted}" &&
        !(_id in *[_type == "review" && reviewer._ref == $reviewerId && conference._ref == $conferenceId].proposal._ref)
      ] {
        _id,
        title,
        status,
        speakers[]->{ _id, name },
        _createdAt
      } | order(_createdAt asc)
    `

    const unreviewedProposals = await clientRead.fetch(
      query,
      { conferenceId, reviewerId },
      { cache: 'no-store' },
    )

    if (!unreviewedProposals || unreviewedProposals.length === 0) {
      return { nextProposal: null, error: null }
    }

    if (!currentProposalId) {
      return { nextProposal: unreviewedProposals[0], error: null }
    }

    const currentIndex = unreviewedProposals.findIndex(
      (p: { _id: string }) => p._id === currentProposalId,
    )

    if (currentIndex === -1) {
      return { nextProposal: unreviewedProposals[0], error: null }
    }

    const nextIndex = (currentIndex + 1) % unreviewedProposals.length
    return { nextProposal: unreviewedProposals[nextIndex], error: null }
  } catch (err) {
    console.error('Error finding next unreviewed proposal:', err)
    return { nextProposal: null, error: err as Error }
  }
}

export async function searchProposals({
  query,
  conferenceId,
  includeReviews = false,
  includePreviousAcceptedTalks = false,
}: {
  query: string
  conferenceId?: string
  includeReviews?: boolean
  includePreviousAcceptedTalks?: boolean
}): Promise<{ proposals: ProposalExisting[]; proposalsError: Error | null }> {
  let proposalsError = null
  let proposals: ProposalExisting[] = []

  if (!query.trim()) {
    return { proposals: [], proposalsError: null }
  }

  const filters = [
    `_type == "talk"`,
    `status != "${Status.draft}"`,
    conferenceId ? `conference._ref == $conferenceId` : null,
  ]
    .filter(Boolean)
    .join(' && ')

  const searchQuery = groq`
    *[${filters} &&

      (pt::text(description) match $searchTerm
      || title match $searchTerm
      || outline match $searchTerm
      || language match $searchTerm
      || format match $searchTerm
      || level match $searchTerm
      || audiences[] match $searchTerm
      || speakers[]->name match $searchTerm
      || speakers[]->bio match $searchTerm
      || speakers[]->title match $searchTerm
      || topics[]->title match $searchTerm
      || topics[]->description match $searchTerm)]
    {
      ...,
      speakers[]-> {
        _id,
        name,
        title,
        email,
        providers,
        bio,
        "image": coalesce(image.asset->url, imageURL),
        flags,
        "slug": slug.current
        ${
          includePreviousAcceptedTalks
            ? `,
        "previousAcceptedTalks": *[
          _type == "talk"
          && ^._id in speakers[]._ref
          && conference._ref != ^.^.conference._ref
          && (status == "accepted" || status == "confirmed")
        ]{
          _id, title, status, _createdAt,
          conference-> { _id, title, startDate },
          topics[]-> { _id, title, color }
        }`
            : ''
        }
      },
      conference-> {
        _id, title, startDate, endDate
      },
      topics[]-> {
        _id, title, color, slug, description
      },
      "coSpeakerInvitations": *[_type == "coSpeakerInvitation" && proposal._ref == ^._id]{
        _id,
        invitedEmail,
        invitedName,
        status,
        expiresAt,
        createdAt,
        respondedAt,
        declineReason
      }
      ${
        includeReviews
          ? `,
      "reviews": *[_type == "review" && proposal._ref == ^._id]{
        ...,
        reviewer-> {
          _id, name, email, "image": coalesce(image.asset->url, imageURL)
        }
      }`
          : ''
      }
    } | order(_updatedAt desc)
  `

  try {
    proposals = await clientRead.fetch(
      searchQuery,
      {
        searchTerm: `*${query.trim()}*`,
        ...(conferenceId && { conferenceId }),
      },
      { cache: 'no-store' },
    )
  } catch (error) {
    console.error('Error searching proposals:', error)
    proposalsError = error as Error
  }

  proposals = proposals.map((proposal) => {
    if (proposal.description) {
      proposal.description = convertStringToPortableTextBlocks(
        proposal.description,
      )
    }
    return proposal
  })

  return { proposals, proposalsError }
}

/**
 * Get workshops (proposals with workshop formats) with capacity and signup data
 * This is a convenience wrapper around getProposals specifically for workshops
 */
export async function getWorkshops({
  conferenceId,
  statuses = [Status.confirmed],
  includeScheduleInfo = false,
}: {
  conferenceId: string
  statuses?: Status[]
  includeScheduleInfo?: boolean
}): Promise<{
  workshops: ProposalExisting[] // ProposalWithWorkshopData types will be added at runtime
  workshopsError: Error | null
}> {
  const { proposals, proposalsError } = await getProposals({
    conferenceId,
    formats: ['workshop_120', 'workshop_240'],
    statuses,
    includeCapacity: true,
    returnAll: true,
  })

  let workshops = proposals

  // If schedule info is requested, fetch and attach schedule data
  if (includeScheduleInfo && !proposalsError) {
    // Fetch schedules scoped to the current conference
    const scheduleQuery = groq`*[_type == "schedule" && conference._ref == $conferenceId]{
      date,
      tracks[]{
        trackTitle,
        talks[]{
          startTime,
          endTime,
          "talkRef": talk._ref
        }
      }
    }`

    try {
      const schedules = await clientRead.fetch(
        scheduleQuery,
        { conferenceId },
        { cache: 'no-store' },
      )

      workshops = proposals.map((workshop) => {
        let date, startTime, endTime, room

        for (const schedule of schedules || []) {
          let found = false
          if (schedule.tracks) {
            for (const track of schedule.tracks) {
              if (track.talks) {
                const workshopTalk = track.talks.find(
                  (talk: { talkRef: string }) => talk.talkRef === workshop._id,
                )
                if (workshopTalk) {
                  date = schedule.date
                  startTime = workshopTalk.startTime
                  endTime = workshopTalk.endTime
                  room = track.trackTitle
                  found = true
                  break
                }
              }
            }
          }
          if (found) break
        }

        return {
          ...workshop,
          date,
          startTime,
          endTime,
          room,
          ...(date &&
            startTime &&
            endTime && {
              scheduleInfo: {
                date,
                timeSlot: { startTime, endTime },
                room,
              },
            }),
        }
      })
    } catch (error) {
      console.error('Error fetching schedule info for workshops:', error)
    }
  }

  return { workshops, workshopsError: proposalsError }
}
