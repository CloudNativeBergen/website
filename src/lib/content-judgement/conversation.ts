import 'server-only'
import { clientReadUncached, clientWrite } from '@/lib/sanity/client'
import { getOrganizerSpeakerIdsForOrg } from '@/lib/notification/sanity'
import { runAfterResponse } from '@/server/runAfterResponse'
import { judgeForOrganization } from './client'
import { buildConversationRequest } from './questions'
import { judgementDocument } from './store'

const HAS_OPENING_MESSAGE =
  // groq-global-scoped: correlated to the exact authorized conversation in
  // the outer projection; messages have no conference field of their own.
  'count(*[_type == "message" && conversation._ref == ^._id]) > 0'

/** A snapshot used with a revision precondition in the message transaction. */
export interface ConversationOpening {
  _id: string
  _rev: string
  conferenceId: string
  organizationId: string | null
  conversationType: 'proposal' | 'general' | 'sponsor'
  subject: string
  hasMessages: boolean
}

/**
 * Existing threads have no opening marker to migrate. Count their stored
 * messages and compare-and-set the parent's revision when appending the first:
 * every message writer bumps that revision in its transaction, so concurrent
 * starters cannot both claim the opening, including ensureProposalConversation.
 */
export async function readConversationOpening(
  conversationId: string,
): Promise<ConversationOpening | null> {
  try {
    const opening = await clientReadUncached.fetch<ConversationOpening | null>(
      // groq-global-scoped: id-keyed point read of the conversation already
      // authorized by the caller; the message subquery is correlated to that
      // exact parent, and conference/organization derive from its reference.
      `*[_type == "conversation" && _id == $conversationId][0]{
        _id, _rev, conversationType, subject,
        "conferenceId": conference._ref,
        "organizationId": conference->organization._ref,
        "hasMessages": ${HAS_OPENING_MESSAGE}
      }`,
      { conversationId },
      { cache: 'no-store' },
    )
    return opening ?? null
  } catch {
    // Do not log the error: transport errors can include message content.
    console.error('[content-judgement] conversation opening read failed')
    return null
  }
}

/** Scheduling and the task itself both obey the messaging never-fail contract. */
export function judgeConversationOpening(
  opening: ConversationOpening,
  authorId: string,
  message: string,
): void {
  try {
    runAfterResponse(async () => {
      try {
        const judge = await judgeForOrganization(opening.organizationId)
        if (!judge) return
        const organizers = await getOrganizerSpeakerIdsForOrg(
          opening.organizationId,
        )
        const request = buildConversationRequest({
          subject: opening.subject,
          message,
          openedBy: organizers.includes(authorId) ? 'organizer' : 'speaker',
        })
        const outcome = await judge.judge(request)
        if (!outcome.ok) return
        const answer = outcome.answers.category
        if (answer.type !== 'choice') return
        const setAt = new Date().toISOString()
        await clientWrite
          .transaction()
          .createIfNotExists(
            judgementDocument({
              conferenceId: opening.conferenceId,
              surface: 'conversation',
              contentId: opening._id,
              request,
              outcome,
              parts: [{ part: 'opening', answers: outcome.answers }],
              judgedAt: setAt,
            }),
          )
          .patch(opening._id, (patch) =>
            // Whole-object setIfMissing is evaluated by Sanity at write time.
            // An organizer/system/earlier Jev category always wins the race.
            patch.setIfMissing({
              messageCategory: {
                value: answer.choice,
                source: 'jev',
                confidence: answer.confidence,
                setAt,
              },
            }),
          )
          .commit()
      } catch {
        console.error('[content-judgement] conversation judging failed')
      }
    })
  } catch {
    console.error('[content-judgement] conversation judging schedule failed')
  }
}
