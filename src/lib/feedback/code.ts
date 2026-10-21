/**
 * THE FEEDBACK CODE (speaker feedback spec §4.2, §5, §9.1).
 *
 * A confirmed talk gets its code the first time one of its speakers opens the
 * Session Feedback section, through the ensure-code mutation the section calls
 * on mount (a Server Component render cannot expire a cache tag).
 *
 * Every read of the talk goes through the doc endpoint (`getDocument`) on the
 * pinned client, never GROQ: a speaker confirms the talk on the same page, and
 * a GROQ read lagging that write by about a second would refuse the code or
 * hand the write a stale revision that fails every retry.
 */
import 'server-only'
import {
  createShortCodeMinter,
  normalizeShortCode,
} from '@/lib/marketing/short-code'
import { expireFeedbackCodeIndex } from './cache'
import {
  conferenceFeedbackCodes,
  getFeedbackSlots,
  versionsClient,
} from './sanity'
import {
  MAX_RETRIES,
  isRetryable,
  readTalkVersions,
  sweepTalkVersions,
  type TalkDoc,
  type VersionsClient,
} from './talk-versions'
import { feedbackWindow, mayMint, type FeedbackWindow } from './window'

export { mayMint }

export type EnsureFeedbackCodeResult =
  /** Missing, foreign, not the caller's, or not confirmed: one answer for all. */
  | { status: 'refused' }
  /**
   * `code` is null when none exists and §5 refuses to mint one. `minted`
   * says this call wrote it.
   */
  | {
      status: 'ok'
      code: string | null
      window: FeedbackWindow
      minted: boolean
    }

/** {@link readFeedbackCode}: refused as {@link EnsureFeedbackCodeResult}. */
export type ReadFeedbackCodeResult =
  | { status: 'refused' }
  | {
      status: 'ok'
      code: string | null
      window: FeedbackWindow
      /** §5 would mint a code now. */
      mayMint: boolean
      /** {@link rotateFeedbackCode} would rotate the code now (§10.4). */
      mayRotate: boolean
    }

/**
 * Several mints in one request (#1459), some at once. Every code the batch
 * draws or meets is kept here, and each draw avoids them: a GROQ read lags
 * those writes, and a parallel mint has not written yet. The code index is
 * left for the caller to expire once at the end.
 */
export interface MintBatch {
  codes: Set<string>
}

/** Ids per doc-endpoint read: the ids travel in the URL. */
const HELD_CODES_CHUNK = 50

/**
 * Reserve in the batch every code the talks hold now, read by id. GROQ may
 * not show a code minted a moment ago, and a talk late in the queue would
 * otherwise reserve its code only when its own turn comes, after other
 * talks have drawn.
 */
export async function reserveHeldCodes(
  talkIds: string[],
  batch: MintBatch,
): Promise<void> {
  const client = versionsClient()
  for (let i = 0; i < talkIds.length; i += HELD_CODES_CHUNK) {
    const talks = await client.getDocuments<TalkDoc>(
      talkIds.slice(i, i + HELD_CODES_CHUNK),
    )
    for (const talk of talks) {
      const code = normalizeShortCode(talk?.feedbackCode)
      if (code) batch.codes.add(code)
    }
  }
}

const isPublishedId = (id: string) =>
  !id.startsWith('drafts.') && !id.startsWith('versions.')

/**
 * Who asks for the code: one of the talk's speakers, or an organizer of the
 * conference serving the request, whom the caller has already checked.
 */
export type FeedbackCodeActor = { speakerId: string } | { organizer: true }

/**
 * The talk is a confirmed talk of the conference serving the request, and
 * the actor may hold its code: an organizer, or one of its speakers. Checked
 * on the PUBLISHED document only.
 */
function mayHoldCode(
  talk: TalkDoc | null | undefined,
  conferenceId: string,
  actor: FeedbackCodeActor,
): talk is TalkDoc {
  return (
    talk?._type === 'talk' &&
    talk.status === 'confirmed' &&
    talk.conference?._ref === conferenceId &&
    ('organizer' in actor ||
      (talk.speakers ?? []).some((s) => s._ref === actor.speakerId))
  )
}

/**
 * At least one of the talk's speakers exists and is not erased. Erasure
 * unsets the code of a talk it leaves without one (spec §12.3), and an
 * organizer must not bring it back (§10.4's rule for rotation); a speaker's
 * own mint needs no check, since an erased speaker cannot sign in.
 */
async function hasLiveSpeaker(
  client: VersionsClient,
  talk: TalkDoc,
): Promise<boolean> {
  const ids = (talk.speakers ?? [])
    .map((s) => s._ref)
    .filter((id): id is string => typeof id === 'string')
  if (ids.length === 0) return false
  const speakers = await client.getDocuments<{ erasedAt?: string }>(ids)
  return speakers.some((s) => s && !s.erasedAt)
}

/**
 * The talk as the code's rules see it: refused (`null`) unless it is a
 * confirmed talk of this conference the actor may hold, with its window and
 * any code it already has.
 */
async function readTalkForCode(
  client: VersionsClient,
  talkId: string,
  actor: FeedbackCodeActor,
  conference: { _id: string; endDate?: string | null },
  now: Date,
): Promise<{
  talk: TalkDoc
  window: FeedbackWindow
  existing: string | null
} | null> {
  if (!isPublishedId(talkId)) return null
  const talk = await client.getDocument<TalkDoc>(talkId)
  // The doc endpoint answers a comma list of ids with the first match, so
  // the document read must BE the id asked for. The router's id check stops
  // such ids first; this keeps the module safe on its own.
  if (talk?._id !== talkId || !mayHoldCode(talk, conference._id, actor)) {
    return null
  }
  if ('organizer' in actor && !(await hasLiveSpeaker(client, talk))) {
    return null
  }
  const window = feedbackWindow({
    slots: await getFeedbackSlots(conference._id, talk._id),
    conferenceEndDate: conference.endDate,
    now,
  })
  return { talk, window, existing: normalizeShortCode(talk.feedbackCode) }
}

/**
 * The organizer's view of a talk's code (#1459), without minting one:
 * `mayMint` says §5 would mint it now. A version waiting in a scheduled
 * release still refuses the mint itself.
 */
export async function readFeedbackCode({
  talkId,
  conference,
  now,
}: {
  talkId: string
  conference: { _id: string; endDate?: string | null }
  now: Date
}): Promise<ReadFeedbackCodeResult> {
  const read = await readTalkForCode(
    versionsClient(),
    talkId,
    { organizer: true },
    conference,
    now,
  )
  if (!read) return { status: 'refused' }
  return {
    status: 'ok',
    code: read.existing,
    window: read.window,
    mayMint: !read.existing && mayMint(read.window),
    mayRotate: !!read.existing && mayMint(read.window),
  }
}

export async function ensureFeedbackCode({
  talkId,
  actor,
  conference,
  now,
  batch,
}: {
  talkId: string
  actor: FeedbackCodeActor
  conference: { _id: string; endDate?: string | null }
  now: Date
  batch?: MintBatch
}): Promise<EnsureFeedbackCodeResult> {
  const client = versionsClient()
  const read = await readTalkForCode(client, talkId, actor, conference, now)
  if (!read) return { status: 'refused' }
  const { talk, window, existing } = read
  if (existing) {
    // GROQ may not show it yet: the batch's later draws must avoid it too.
    batch?.codes.add(existing)
    return { status: 'ok', code: existing, window, minted: false }
  }
  if (!mayMint(window))
    return { status: 'ok', code: null, window, minted: false }

  const outcome = await mint(client, talk, conference._id, actor, batch)
  if (!outcome) return { status: 'refused' }
  if (outcome.code === null)
    return { status: 'ok', code: null, window, minted: false }
  batch?.codes.add(outcome.code)
  if (outcome.minted) {
    await sweepTalkVersions(client, talk._id)
    if (!batch) expireFeedbackCodeIndex(conference._id)
  }
  return { status: 'ok', code: outcome.code, window, minted: outcome.minted }
}

/**
 * Write a fresh code to the published talk, guarded by the revision this
 * request read (not a bare `setIfMissing`), and to every other version with
 * `setIfMissing`, in one transaction. A request that lost the race fails its
 * guard, re-reads, and returns the code that won, so concurrent first views
 * converge on one code. `null` when the talk stopped qualifying meanwhile.
 *
 * No code (`code: null`) while a version of the talk waits in a release that
 * is not `active`: Sanity locks a scheduled release's versions, so it would
 * keep its copy without the code and, once published, erase the code the
 * speaker already printed. The next view after the release mints. Throws
 * when the release list does not load: which versions exist is then unknown.
 */
async function mint(
  client: VersionsClient,
  talk: TalkDoc,
  conferenceId: string,
  actor: FeedbackCodeActor,
  batch: MintBatch | undefined,
): Promise<{ code: string | null; minted: boolean } | null> {
  let current = talk
  for (let attempt = 0; ; attempt++) {
    const { versions, locked, releasesListed } = await readTalkVersions(
      client,
      current._id,
    )
    if (!releasesListed) {
      throw new Error(
        `[feedback] could not list releases; not minting a code for ${current._id}`,
      )
    }
    if (locked.length > 0) return { code: null, minted: false }
    const code = createShortCodeMinter([
      ...(await conferenceFeedbackCodes(conferenceId)),
      ...(batch?.codes ?? []),
    ])()
    batch?.codes.add(code)
    const tx = client
      .transaction()
      .patch(current._id, (p) =>
        p.ifRevisionId(current._rev).set({ feedbackCode: code }),
      )
    for (const v of versions) {
      tx.patch(v._id, (p) =>
        p.ifRevisionId(v._rev).setIfMissing({ feedbackCode: code }),
      )
    }
    try {
      await tx.commit()
      return { code, minted: true }
    } catch (error) {
      if (!isRetryable(error) || attempt >= MAX_RETRIES) throw error
    }
    const reread = await client.getDocument<TalkDoc>(current._id)
    if (!mayHoldCode(reread, conferenceId, actor)) return null
    if ('organizer' in actor && !(await hasLiveSpeaker(client, reread))) {
      return null
    }
    const won = normalizeShortCode(reread.feedbackCode)
    if (won) return { code: won, minted: false }
    current = reread
  }
}

export type RotateFeedbackCodeResult =
  /**
   * Missing, foreign, not confirmed, no speaker left, no code to rotate, or
   * §5 would not mint one now: one answer for all, nothing written.
   */
  | { status: 'refused' }
  /**
   * Not rotated: a version of the talk waits in a release that is not
   * `active`. Sanity locks its versions, and publishing it would bring the
   * old code back.
   */
  | { status: 'locked' }
  | { status: 'ok'; code: string; window: FeedbackWindow }

/**
 * ROTATE a talk's Feedback Code (spec §10.4): an organizer replaces the
 * code, so the old one stops resolving at once; responses are kept.
 *
 * Read like a mint, through the doc endpoint, and refused where the
 * organizer's mint is refused, and also when the talk has no code (never
 * minted, folded, or its only speaker erased) or §5 would not mint one (its
 * window has closed): rotating then would restart collection that erasure or
 * the window had ended. The new code is drawn against every code the
 * conference holds, drafts included, and written in ONE transaction to the
 * published talk, guarded by the revision this request read, and to every
 * other version, each under its own guard (§4.2). A failed guard re-reads
 * and tries again, up to {@link MAX_RETRIES}; then the sweep catches a
 * version created meanwhile, and the index expires at once.
 *
 * Two rotations at once converge: the one whose guard fails re-reads, finds
 * the code it read gone, and returns the code that replaced it.
 */
export async function rotateFeedbackCode({
  talkId,
  conference,
  now,
}: {
  talkId: string
  conference: { _id: string; endDate?: string | null }
  now: Date
}): Promise<RotateFeedbackCodeResult> {
  const client = versionsClient()
  const actor: FeedbackCodeActor = { organizer: true }
  const read = await readTalkForCode(client, talkId, actor, conference, now)
  if (!read?.existing || !mayMint(read.window)) return { status: 'refused' }
  const { window, existing } = read

  let current = read.talk
  for (let attempt = 0; ; attempt++) {
    const { versions, locked, releasesListed } = await readTalkVersions(
      client,
      current._id,
    )
    if (!releasesListed) {
      throw new Error(
        `[feedback] could not list releases; not rotating the code of ${current._id}`,
      )
    }
    if (locked.length > 0) return { status: 'locked' }
    const code = createShortCodeMinter(
      await conferenceFeedbackCodes(conference._id),
    )()
    const tx = client
      .transaction()
      .patch(current._id, (p) =>
        p.ifRevisionId(current._rev).set({ feedbackCode: code }),
      )
    for (const v of versions) {
      tx.patch(v._id, (p) => p.ifRevisionId(v._rev).set({ feedbackCode: code }))
    }
    try {
      await tx.commit()
      await sweepTalkVersions(client, current._id)
      expireFeedbackCodeIndex(conference._id)
      return { status: 'ok', code, window }
    } catch (error) {
      if (!isRetryable(error) || attempt >= MAX_RETRIES) throw error
    }
    const reread = await client.getDocument<TalkDoc>(current._id)
    if (!mayHoldCode(reread, conference._id, actor))
      return { status: 'refused' }
    if (!(await hasLiveSpeaker(client, reread))) return { status: 'refused' }
    const held = normalizeShortCode(reread.feedbackCode)
    if (!held) return { status: 'refused' }
    // Another rotation won: the code this organizer saw is already gone.
    if (held !== existing) return { status: 'ok', code: held, window }
    current = reread
  }
}
