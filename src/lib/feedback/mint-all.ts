/**
 * Mint every Feedback Code of a conference at once (#1459), so each room has
 * a code to print whether or not its speakers ever opened their page. Talk by
 * talk through the speaker's own minting path (§5), with one batch: no code
 * repeats within it, and the code index is expired once at the end.
 */
import 'server-only'
import { normalizeShortCode } from '@/lib/marketing/short-code'
import { expireFeedbackCodeIndex } from './cache'
import { ensureFeedbackCode, type MintBatch } from './code'
import { getConfirmedTalks } from './sanity'

interface TalkRef {
  talkId: string
  title: string
}

export interface MintAllReport {
  minted: (TalkRef & { code: string })[]
  /** Talks that held a code already. */
  alreadyHad: number
  /**
   * `closed`: the window closed, or the conference ended for an unscheduled
   * talk. `release`: a version waits in a scheduled release. `noSpeaker`:
   * every speaker is erased or gone, and erasure's unset code stays unset
   * (spec §12.3). `changed`: refused when read again by id, after GROQ
   * listed it (no longer confirmed, or its last speaker just erased).
   */
  skipped: (TalkRef & {
    reason: 'closed' | 'release' | 'noSpeaker' | 'changed'
  })[]
  /** The write threw; the rest of the batch still ran. */
  failed: TalkRef[]
}

const hasCode = (talk: { feedbackCode: string | null }) =>
  normalizeShortCode(talk.feedbackCode) !== null

/**
 * How many confirmed talks have no code yet and a speaker left, for the
 * confirmation. An upper bound: a talk whose window has closed is only
 * found out when minting it.
 */
export async function countTalksWithoutCode(conferenceId: string) {
  const talks = await getConfirmedTalks(conferenceId)
  return {
    confirmed: talks.length,
    withoutCode: talks.filter((t) => t.hasLiveSpeaker && !hasCode(t)).length,
  }
}

export async function mintConferenceFeedbackCodes({
  conference,
  now,
}: {
  conference: { _id: string; endDate?: string | null }
  now: Date
}): Promise<MintAllReport> {
  const report: MintAllReport = {
    minted: [],
    alreadyHad: 0,
    skipped: [],
    failed: [],
  }
  const batch: MintBatch = { codes: new Set() }
  for (const talk of await getConfirmedTalks(conference._id)) {
    const ref = { talkId: talk._id, title: talk.title ?? 'Untitled talk' }
    if (hasCode(talk)) {
      report.alreadyHad++
      continue
    }
    if (!talk.hasLiveSpeaker) {
      report.skipped.push({ ...ref, reason: 'noSpeaker' })
      continue
    }
    try {
      const result = await ensureFeedbackCode({
        talkId: talk._id,
        actor: { organizer: true },
        conference,
        now,
        batch,
      })
      if (result.status === 'refused') {
        report.skipped.push({ ...ref, reason: 'changed' })
      } else if (result.minted && result.code) {
        report.minted.push({ ...ref, code: result.code })
      } else if (result.code) {
        report.alreadyHad++
      } else {
        const closed =
          result.window.state === 'closed' ||
          (result.window.state === 'unscheduled' &&
            result.window.feedbackVisible)
        report.skipped.push({ ...ref, reason: closed ? 'closed' : 'release' })
      }
    } catch (error) {
      console.error(`[feedback] minting a code for ${talk._id} failed`, error)
      report.failed.push(ref)
    }
  }
  if (batch.codes.size > 0) expireFeedbackCodeIndex(conference._id)
  return report
}
