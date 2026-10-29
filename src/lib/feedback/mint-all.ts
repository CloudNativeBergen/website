/**
 * Mint every Feedback Code of a conference at once (#1459), so each room has
 * a code to print whether or not its speakers ever opened their page. Talk by
 * talk through the speaker's own minting path (§5), with one batch: no code
 * repeats within it, and the code index is expired once at the end.
 */
import 'server-only'
import { normalizeShortCode } from '@/lib/marketing/short-code'
import { expireFeedbackCodeIndex, expireProgrammeFeedbackLinks } from './cache'
import {
  ensureFeedbackCode,
  mayMint,
  reserveHeldCodes,
  type MintBatch,
} from './code'
import { getConferenceFeedbackSlots, getConfirmedTalks } from './sanity'
import { feedbackWindow } from './window'

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
   * `notReached`: not started within the run's time budget; run it again.
   */
  skipped: (TalkRef & {
    reason: 'closed' | 'release' | 'noSpeaker' | 'changed' | 'notReached'
  })[]
  /** The write threw; the rest of the batch still ran. */
  failed: TalkRef[]
}

const hasCode = (talk: { feedbackCode: string | null }) =>
  normalizeShortCode(talk.feedbackCode) !== null

/**
 * For the confirmation: how many confirmed talks have no code, and how many
 * of those can get one now (a speaker left, the window not closed). A
 * version waiting in a scheduled release is only found out when minting.
 */
export async function countTalksWithoutCode({
  conference,
  now,
}: {
  conference: { _id: string; endDate?: string | null }
  now: Date
}) {
  const [talks, slots] = await Promise.all([
    getConfirmedTalks(conference._id),
    getConferenceFeedbackSlots(conference._id),
  ])
  const withoutCode = talks.filter((t) => !hasCode(t))
  return {
    confirmed: talks.length,
    withoutCode: withoutCode.length,
    mintable: withoutCode.filter(
      (t) =>
        t.hasLiveSpeaker &&
        mayMint(
          feedbackWindow({
            slots: slots.get(t._id) ?? [],
            conferenceEndDate: conference.endDate,
            now,
          }),
        ),
    ).length,
  }
}

/**
 * Talks minted at once. Each mint is several Sanity round trips in a row, and
 * the tRPC route has 60 seconds (`maxDuration`).
 */
const CONCURRENCY = 4

/**
 * No talk is started after this, so the run reports before the route's limit.
 * A talk not reached is left for the next run, which mints nothing twice.
 * Bounds starts only: a talk already started runs on, retries and sweep
 * included, so this leaves the slowest such talk 30 s.
 */
const BUDGET_MS = 30_000

/**
 * Each talk is judged at the moment it is started, not when the run began:
 * a window may close while the run goes on.
 */
export async function mintConferenceFeedbackCodes({
  conference,
}: {
  conference: { _id: string; endDate?: string | null }
}): Promise<MintAllReport> {
  const report: MintAllReport = {
    minted: [],
    alreadyHad: 0,
    skipped: [],
    failed: [],
  }
  const batch: MintBatch = { codes: new Set() }
  const startedAt = Date.now()
  const queue = await getConfirmedTalks(conference._id)
  await reserveHeldCodes(
    queue.map((t) => t._id),
    batch,
  )

  const mintOne = async (talk: (typeof queue)[number]) => {
    const ref = { talkId: talk._id, title: talk.title ?? 'Untitled talk' }
    if (hasCode(talk)) {
      report.alreadyHad++
      return
    }
    if (!talk.hasLiveSpeaker) {
      report.skipped.push({ ...ref, reason: 'noSpeaker' })
      return
    }
    if (Date.now() - startedAt > BUDGET_MS) {
      report.skipped.push({ ...ref, reason: 'notReached' })
      return
    }
    try {
      const result = await ensureFeedbackCode({
        talkId: talk._id,
        actor: { organizer: true },
        conference,
        now: new Date(),
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

  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      for (let talk = queue.shift(); talk; talk = queue.shift()) {
        await mintOne(talk)
      }
    }),
  )
  // Once per run, whenever a code exists: a run cut off by the route's limit
  // after committing never got here, and the next run finds its codes as
  // already held.
  if (report.minted.length > 0 || report.alreadyHad > 0) {
    expireFeedbackCodeIndex(conference._id)
    expireProgrammeFeedbackLinks(conference._id)
  }
  const byTitle = (a: TalkRef, b: TalkRef) =>
    a.title.localeCompare(b.title) || a.talkId.localeCompare(b.talkId)
  report.minted.sort(byTitle)
  report.skipped.sort(byTitle)
  report.failed.sort(byTitle)
  return report
}
