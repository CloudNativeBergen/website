import 'server-only'
import { clientReadUncached, clientWrite } from '@/lib/sanity/client'
import { getOrganizerSpeakerIdsForOrg } from '@/lib/notification/sanity'
import { runAfterResponse } from '@/server/runAfterResponse'
import { judgeForOrganization } from './client'
import { buildConversationRequest } from './questions'
import { judgementDocument } from './store'

/** A snapshot used with a revision precondition in the message transaction. */
export interface ConversationOpening {
  _id: string
  _rev: string
  conferenceId: string
  conversationType: 'proposal' | 'general'
  subject: string
  hasMessages: boolean
}

/**
 * Read the parent via the document endpoint: GROQ can lag a just-created thread.
 * The marker and first message commit together under this revision. Only legacy
 * unmarked threads need a count of their (already indexed) stored messages.
 */
export async function readConversationOpening(
  conversationId: string,
): Promise<ConversationOpening | null> {
  try {
    const doc = await clientReadUncached.getDocument<{
      conference?: { _ref?: string }
      conversationType?: string
      subject?: string
      openedAt?: string
    }>(conversationId)
    if (
      !doc ||
      // getDocument('a,b') reads a list; validate the returned identity too.
      doc._id !== conversationId ||
      doc._type !== 'conversation' ||
      typeof doc._rev !== 'string' ||
      typeof doc.conference?._ref !== 'string' ||
      typeof doc.subject !== 'string' ||
      (doc.conversationType !== 'proposal' &&
        doc.conversationType !== 'general')
    )
      return null

    const hasMessages =
      doc.openedAt != null ||
      (await clientReadUncached.fetch<boolean>(
        // groq-global-scoped: messages of the exact conversation already authorized
        // by the caller; no parent query whose indexing could lag creation.
        `count(*[_type == "message" && conversation._ref == $conversationId]) > 0`,
        { conversationId },
        { cache: 'no-store' },
      ))
    return {
      _id: doc._id,
      _rev: doc._rev,
      conferenceId: doc.conference._ref,
      conversationType: doc.conversationType,
      subject: doc.subject,
      hasMessages,
    }
  } catch {
    // Do not log the error: transport errors can include message content.
    console.error('[content-judgement] conversation opening read failed')
    return null
  }
}

/** Scheduling and the task itself both obey the messaging never-fail contract. */
export function judgeConversationOpening(
  opening: ConversationOpening,
  organizationId: string | null,
  authorId: string,
  message: string,
): void {
  try {
    runAfterResponse(async () => {
      try {
        const judge = await judgeForOrganization(organizationId)
        if (!judge) return
        const organizers = await getOrganizerSpeakerIdsForOrg(organizationId)
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
