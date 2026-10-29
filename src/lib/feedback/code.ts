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
import { expireFeedbackCodeIndex, expireProgrammeFeedbackLinks } from './cache'
import {
  conferenceFeedbackCodes,
  getFeedbackSlots,
  versionsClient,
} from './sanity'
import {
  MAX_RETRIES,
  isRetryable,
  readTalkVersions,
  requestCap,
  sweepTalkVersions,
  type TalkDoc,
  type VersionsClient,
} from './talk-versions'
import { feedbackWindow, mayMint, type FeedbackWindow } from './window'
import { MINT_COMMIT_BUDGET_MS, MINT_REQUEST_TIMEOUT_MS } from './bounds'

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
/**
 * A mint whose reads ran past its commit budget (§12.3) and wrote nothing.
 * Transient: asking again is fine; not a refusal of the talk.
 */
export class MintTooSlowError extends Error {
  constructor(readonly talkId: string) {
    super(`minting a code for ${talkId} took too long; try again`)
    this.name = 'MintTooSlowError'
  }
}

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
 * organizer must not bring it back (§10.4's rule for rotation).
 */
async function hasLiveSpeaker(
  client: VersionsClient,
  talk: TalkDoc,
): Promise<boolean> {
  const ids = (talk.speakers ?? [])
    .map((s) => s._ref)
    .filter((id): id is string => typeof id === 'string')
  if (ids.length === 0) return false
  const speakers = await client.getDocuments<{ erasedAt?: string }>(
    ids,
    requestCap(MINT_REQUEST_TIMEOUT_MS),
  )
  return speakers.some((s) => s && !s.erasedAt)
}

/**
 * An organizer needs a live speaker on the talk (above). A speaker must not
 * be erased themselves: a signed-in session outlives the erasure (a JWT,
 * never re-checked), and its dashboard would mint the code the erasure
 * unset (§12.3). A mint that checked before an erasure and commits after it
 * is caught by the erasure instead: it waits out `MINT_WRITE_BOUND_MS`, then
 * unsets any code back on the talk.
 */
async function actorStillLive(
  client: VersionsClient,
  talk: TalkDoc,
  actor: FeedbackCodeActor,
): Promise<boolean> {
  if ('organizer' in actor) return hasLiveSpeaker(client, talk)
  const self = await client.getDocument<{ _type?: string; erasedAt?: string }>(
    actor.speakerId,
    requestCap(MINT_REQUEST_TIMEOUT_MS),
  )
  return self?._type === 'speaker' && !self.erasedAt
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
  const talk = await client.getDocument<TalkDoc>(
    talkId,
    requestCap(MINT_REQUEST_TIMEOUT_MS),
  )
  // The doc endpoint answers a comma list of ids with the first match, so
  // the document read must BE the id asked for. The router's id check stops
  // such ids first; this keeps the module safe on its own.
  if (talk?._id !== talkId || !mayHoldCode(talk, conference._id, actor)) {
    return null
  }
  if (!(await actorStillLive(client, talk, actor))) return null
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
  const checkedAt = Date.now()
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

  const outcome = await mint(
    client,
    talk,
    conference._id,
    actor,
    batch,
    checkedAt,
  )
  if (!outcome) return { status: 'refused' }
  if (outcome.code === null)
    return { status: 'ok', code: null, window, minted: false }
  batch?.codes.add(outcome.code)
  if (outcome.minted) {
    await sweepTalkVersions(client, talk._id, 'feedbackCode', {
      requestTimeoutMs: MINT_REQUEST_TIMEOUT_MS,
    })
    if (!batch) {
      expireFeedbackCodeIndex(conference._id)
      expireProgrammeFeedbackLinks(conference._id)
    }
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
  /** When the liveness check began: the commit's budget runs from it. */
  checkedSince: number,
): Promise<{ code: string | null; minted: boolean } | null> {
  const out = await writeNewCode(client, talk, conferenceId, actor, {
    what: 'minting a code for',
    versionPatch: 'setIfMissing',
    avoid: batch?.codes,
    // A code another request minted meanwhile wins.
    settled: (held) => held !== null,
    checkedSince,
  })
  switch (out.status) {
    case 'written':
      return { code: out.code, minted: true }
    case 'locked':
      return { code: null, minted: false }
    case 'refused':
      return null
    case 'settled':
      return { code: out.code, minted: false }
  }
}

type WriteOutcome =
  | { status: 'written'; code: string }
  /** A version waits in a release that is not `active`: nothing written. */
  | { status: 'locked' }
  /** The talk stopped qualifying while the write ran: nothing written. */
  | { status: 'refused' }
  /** A lost guard's re-read settled it (`settled`): the code held then. */
  | { status: 'settled'; code: string | null }

/**
 * THE CODE WRITE shared by mint and rotation (spec §4.2, §5, §10.4): draw a
 * code against every code the conference holds (drafts included) and any
 * `avoid`ed, then in ONE transaction `set` it on the published talk under
 * the revision this request read, and patch every other version under its
 * own guard (`set`, or `setIfMissing` for a mint). A failed guard re-reads
 * the talk by id, re-checks it still qualifies, and asks `settled` whether
 * the code it holds now ends the write; otherwise it tries again, up to
 * {@link MAX_RETRIES}. Throws when the release list does not load (which
 * versions exist is then unknown) and on a commit error that is not a lost
 * guard. The caller sweeps and expires.
 */
async function writeNewCode(
  client: VersionsClient,
  talk: TalkDoc,
  conferenceId: string,
  actor: FeedbackCodeActor,
  {
    what,
    versionPatch,
    avoid,
    settled,
    checkedSince,
  }: {
    /** For the log, e.g. "minting a code for". */
    what: string
    versionPatch: 'set' | 'setIfMissing'
    /** Codes to avoid besides the conference's; each draw joins them. */
    avoid?: Set<string>
    settled: (held: string | null) => boolean
    /** When the liveness check began: the commit's budget runs from it. */
    checkedSince: number
  },
): Promise<WriteOutcome> {
  let current = talk
  let checkedAt = checkedSince
  for (let attempt = 0; ; attempt++) {
    const { versions, locked, releasesListed } = await readTalkVersions(
      client,
      current._id,
      { requestTimeoutMs: MINT_REQUEST_TIMEOUT_MS },
    )
    if (!releasesListed) {
      throw new Error(
        `[feedback] could not list releases; not ${what} ${current._id}`,
      )
    }
    if (locked.length > 0) return { status: 'locked' }
    const code = createShortCodeMinter([
      ...(await conferenceFeedbackCodes(conferenceId)),
      ...(avoid ?? []),
    ])()
    avoid?.add(code)
    const tx = client
      .transaction()
      .patch(current._id, (p) =>
        p.ifRevisionId(current._rev).set({ feedbackCode: code }),
      )
    for (const v of versions) {
      tx.patch(v._id, (p) =>
        p.ifRevisionId(v._rev)[versionPatch]({ feedbackCode: code }),
      )
    }
    try {
      // Too late: the speaker may have been erased since the check (§12.3).
      if (Date.now() - checkedAt > MINT_COMMIT_BUDGET_MS) {
        throw new MintTooSlowError(current._id)
      }
      await tx.commit(requestCap(MINT_REQUEST_TIMEOUT_MS))
      return { status: 'written', code }
    } catch (error) {
      if (!isRetryable(error) || attempt >= MAX_RETRIES) throw error
    }
    const reread = await client.getDocument<TalkDoc>(
      current._id,
      requestCap(MINT_REQUEST_TIMEOUT_MS),
    )
    if (!mayHoldCode(reread, conferenceId, actor)) return { status: 'refused' }
    checkedAt = Date.now()
    if (!(await actorStillLive(client, reread, actor))) {
      return { status: 'refused' }
    }
    const held = normalizeShortCode(reread.feedbackCode)
    if (settled(held)) return { status: 'settled', code: held }
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
  /**
   * Not rotated: the talk holds another code than the one the organizer
   * saw (another organizer rotated it since), which may already be printed.
   */
  | { status: 'changed'; code: string }
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
 * Only the code the organizer saw (`expected`) is rotated: a code another
 * organizer put there since may already be printed. Two rotations of the
 * same code at once converge: the one whose guard fails re-reads, finds that
 * code gone, and returns the code that replaced it.
 */
export async function rotateFeedbackCode({
  talkId,
  expected,
  conference,
  now,
}: {
  talkId: string
  /** The code the organizer confirmed would stop working. */
  expected: string
  conference: { _id: string; endDate?: string | null }
  now: Date
}): Promise<RotateFeedbackCodeResult> {
  const client = versionsClient()
  const actor: FeedbackCodeActor = { organizer: true }
  const checkedSince = Date.now()
  const read = await readTalkForCode(client, talkId, actor, conference, now)
  if (!read?.existing || !mayMint(read.window)) return { status: 'refused' }
  const { window, existing } = read
  if (existing !== normalizeShortCode(expected))
    return { status: 'changed', code: existing }

  let out: WriteOutcome
  try {
    out = await writeNewCode(client, read.talk, conference._id, actor, {
      what: 'rotating the code of',
      versionPatch: 'set',
      // Another rotation of the same code won: the code this organizer saw
      // is already gone. Erasure unsetting it ends the write too.
      settled: (held) => held !== existing,
      checkedSince,
    })
  } catch (error) {
    // A commit whose reply was lost may have applied: the old code must not
    // go on resolving for the index's whole `cacheLife`. Expiring an index
    // that did not change only costs one refill. A lost guard (409, 404)
    // applied nothing.
    if (!isRetryable(error)) expireFeedbackCodeIndex(conference._id)
    throw error
  }
  switch (out.status) {
    case 'written':
      // The old code stops resolving now, not after the sweep's round trips.
      expireFeedbackCodeIndex(conference._id)
      await sweepTalkVersions(client, read.talk._id, 'feedbackCode', {
        requestTimeoutMs: MINT_REQUEST_TIMEOUT_MS,
      })
      // And again: a refill during the sweep goes through GROQ, which can
      // lag the commit and cache the old mapping for the index's lifetime.
      expireFeedbackCodeIndex(conference._id)
      return { status: 'ok', code: out.code, window }
    case 'locked':
      return { status: 'locked' }
    case 'refused':
      return { status: 'refused' }
    case 'settled':
      return out.code
        ? { status: 'ok', code: out.code, window }
        : { status: 'refused' }
  }
}
