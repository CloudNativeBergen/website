/**
 * A COMMENT JUDGED AFTER SUBMIT (Content judgement spec §6, §7.1, §7.2).
 *
 * Submit stores the comment, answers the attendee, and hands the judging to
 * `runAfterResponse`: a slow or failing Jev never delays or fails a submit.
 * The task NEVER THROWS: every failure is logged and leaves the comment stored
 * and, where it got that far, marked not judged (§15 never-fail).
 *
 * What runs, for a new or changed non-empty comment:
 *
 * 1. `judgeForOrganization` reads the organization's setting LIVE; off, or no
 *    organization, means nothing is sent (only a stale Judgement or Keep
 *    mark about old text is forgotten, below).
 * 2. One doc-endpoint read of the response and its Judgement. A response that
 *    already holds a NEWER comment (two quick edits: the later Submit's task
 *    will judge it) or none is left alone; a Judgement whose `contentHash`
 *    is this comment's means the comment is UNCHANGED and is not judged again.
 * 3. The Jev call.
 * 4. THE GUARD, at write time: the response is read again through the doc
 *    endpoint (past GROQ's lag), and the answer is written only while the
 *    stored comment is still the one that was judged, under `ifRevisionId`
 *    of that read. A newer comment drops the answer; an unrelated change in
 *    between (an organizer's Hide, a speaker's flag: a 409) re-reads and tries
 *    again, a few times. The record and the summary go in ONE transaction, and
 *    a new Judgement always clears the Keep mark (§8.2): it was about the old
 *    wording.
 *
 * An EMPTIED comment deletes the Judgement, the summary and the Keep mark,
 * with no call and whatever the setting says: the content is gone (§12). So
 * does a reworded comment while the setting is OFF: nothing is sent, but a
 * Judgement about text that is no longer stored must not outlive it (§7.1)
 * and come back as advice about the new text when the setting is turned on
 * again. Both forgets are guarded like the write: only while the stored
 * comment is still the one the task was started for.
 */
import 'server-only'
import {
  buildCommentRequest,
  judgeForOrganization,
  type JudgeOutcome,
} from '@/lib/content-judgement'
import {
  contentHash,
  judgementDocument,
  judgementId,
} from '@/lib/content-judgement/store'
import {
  judgedSummary,
  notJudgedSummary,
  type JudgementSummary,
} from '@/lib/content-judgement/summary'
import { clientWrite } from '@/lib/sanity/client'
import { sanityStatus } from '@/lib/sanity/status'
import { runAfterResponse } from '@/server/runAfterResponse'

export interface CommentJudgingInput {
  responseId: string
  conferenceId: string
  /** The conference's organization; none means nothing is judged. */
  orgId: string | null | undefined
  /** The comment as stored (trimmed), or `null` for an emptied one. */
  comment: string | null
}

/** Submit's hook: judge (or forget) after the response has been sent. */
export function scheduleCommentJudgement(input: CommentJudgingInput): void {
  runAfterResponse(() => judgeComment(input))
}

/** How often a write that lost its revision guard is tried again. */
const WRITE_ATTEMPTS = 3

interface ResponseDoc {
  _id: string
  _rev?: string
  comment?: unknown
  keptAt?: unknown
}

/** The whole task; never throws. */
export async function judgeComment(input: CommentJudgingInput): Promise<void> {
  try {
    if (input.comment === null) await forgetJudgement(input.responseId, null)
    else await judgeStoredComment(input, input.comment)
  } catch (error) {
    // Never the comment: the error may quote the request.
    console.error(
      `[content-judgement] judging a comment on ${input.responseId} failed`,
      error instanceof Error ? error.message : error,
    )
  }
}

async function judgeStoredComment(
  input: CommentJudgingInput,
  comment: string,
): Promise<void> {
  // No organization, no setting, nothing ever judged: not a read's worth.
  if (!input.orgId) return
  const judge = await judgeForOrganization(input.orgId)
  const request = buildCommentRequest(comment)
  const hash = contentHash(request)
  const recordId = judgementId(input.responseId)
  const [response, existing] = await clientWrite.getDocuments<
    ResponseDoc & { contentHash?: unknown; judgement?: unknown }
  >([input.responseId, recordId])
  // A newer comment (or none) is stored: not this task's to judge.
  if (!response || response.comment !== comment) return
  // Unchanged since it was judged: nothing to do.
  if (existing?.contentHash === hash) return
  if (!judge) {
    // Off: nothing is sent, but a Judgement or summary about the old
    // wording is forgotten (§7.1).
    if (
      existing ||
      response.judgement !== undefined ||
      response.keptAt !== undefined
    )
      await forgetJudgement(input.responseId, comment)
    return
  }

  const outcome = await judge.judge(request)
  await writeJudgement(input, comment, request, outcome)
}

async function writeJudgement(
  input: CommentJudgingInput,
  comment: string,
  request: ReturnType<typeof buildCommentRequest>,
  outcome: JudgeOutcome,
): Promise<void> {
  const recordId = judgementId(input.responseId)
  for (let attempt = 1; attempt <= WRITE_ATTEMPTS; attempt++) {
    const current = await clientWrite.getDocument<ResponseDoc>(input.responseId)
    // Reworded or deleted while Jev answered: the answer is about old text.
    if (!current?._rev || current.comment !== comment) return
    const judgedAt = new Date().toISOString()
    const tx = clientWrite.transaction()
    let summary: JudgementSummary
    if (outcome.ok) {
      const parts = [{ part: 'comment' as const, answers: outcome.answers }]
      tx.createOrReplace(
        judgementDocument({
          conferenceId: input.conferenceId,
          surface: 'feedbackComment',
          contentId: input.responseId,
          request,
          outcome,
          parts,
          judgedAt,
        }),
      )
      summary = judgedSummary({
        surface: 'feedbackComment',
        model: outcome.model,
        parts,
        judgedAt,
      })
    } else {
      // Only the latest Judgement per content is kept (§7.1): a record of
      // the old wording must not outlive the text it was about.
      tx.delete(recordId)
      summary = notJudgedSummary(outcome.why, judgedAt)
    }
    tx.patch(input.responseId, (p) =>
      p
        .ifRevisionId(current._rev!)
        .set({ judgement: summary })
        .unset(['keptAt', 'keptBy']),
    )
    try {
      await tx.commit()
      return
    } catch (error) {
      if (sanityStatus(error) !== 409 || attempt === WRITE_ATTEMPTS) throw error
    }
  }
}

/**
 * Forget a Judgement: no record, summary or Keep mark. Only while the stored
 * comment is still `expected` (`null`: emptied), under `ifRevisionId`, so a
 * delayed task never wipes what a later comment's task wrote. A response
 * that is gone (its device's Delete my answer) is left alone: its record is
 * an orphan for the daily sweep (§12, J2).
 */
async function forgetJudgement(
  responseId: string,
  expected: string | null,
): Promise<void> {
  const recordId = judgementId(responseId)
  for (let attempt = 1; attempt <= WRITE_ATTEMPTS; attempt++) {
    const current = await clientWrite.getDocument<ResponseDoc>(responseId)
    if (!current?._rev || (current.comment ?? null) !== expected) return
    try {
      await clientWrite
        .transaction()
        .delete(recordId)
        .patch(responseId, (p) =>
          p
            .ifRevisionId(current._rev!)
            .unset(['judgement', 'keptAt', 'keptBy']),
        )
        .commit()
      return
    } catch (error) {
      if (sanityStatus(error) !== 409 || attempt === WRITE_ATTEMPTS) throw error
    }
  }
}
