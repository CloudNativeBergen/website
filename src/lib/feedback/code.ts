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
import { feedbackWindow, mayMint, type FeedbackWindow } from './window'

export { mayMint }

interface TalkDoc {
  _id: string
  _rev: string
  _type: string
  status?: string
  conference?: { _ref?: string }
  speakers?: { _ref?: string }[]
  feedbackCode?: string
}

type VersionsClient = ReturnType<typeof versionsClient>

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

/** How often a write that lost a revision guard re-reads and tries again. */
const MAX_RETRIES = 3
/** How often the post-commit sweep may re-patch a stale version. */
const MAX_SWEEP_PATCHES = 3

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
 * A write that lost to a concurrent edit and should re-read and try again: a
 * failed `ifRevisionId` (409), or a version deleted since the read (Sanity
 * answers a patch of a missing document with 404 and rolls the whole
 * transaction back).
 */
function isRetryable(error: unknown): boolean {
  const status = (error as { statusCode?: unknown } | null)?.statusCode
  if (status === 409 || status === 404) return true
  const message = error instanceof Error ? error.message.toLowerCase() : ''
  return message.includes('revision')
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

/**
 * §4.2's post-commit sweep. A revision guard cannot catch a version created
 * between the version lookup and the commit, because it is not in the
 * transaction, and the GROQ lookup can lag a write by about a second. So
 * re-read the published talk, `drafts.<id>` and every release's
 * `versions.<release>.<id>` BY ID through the doc endpoint, and re-patch any
 * version whose code differs from the PUBLISHED talk's as it is now (not the
 * value this request wrote: a later write may have replaced it). At most
 * {@link MAX_SWEEP_PATCHES} times; logged at the cap.
 *
 * Never throws: the write it follows has committed.
 */
export async function sweepTalkVersions(
  client: VersionsClient,
  talkId: string,
): Promise<void> {
  try {
    for (let patches = 0; ; patches++) {
      const { published, versions, locked } = await readTalkVersions(
        client,
        talkId,
      )
      const code = published?.feedbackCode
      if (!code) return
      if (patches === 0 && locked.some((d) => d.feedbackCode !== code)) {
        // Locked while this write ran; publishing it would erase the code.
        console.error(
          `[feedback] a locked release holds a stale version of ${talkId}`,
        )
      }
      const stale = versions.filter((d) => d.feedbackCode !== code)
      if (stale.length === 0) return
      if (patches >= MAX_SWEEP_PATCHES) {
        console.error(
          `[feedback] gave up sweeping stale versions of ${talkId} after ${MAX_SWEEP_PATCHES} patches`,
        )
        return
      }
      const tx = client.transaction()
      for (const d of stale) {
        tx.patch(d._id, (p) =>
          p.ifRevisionId(d._rev).set({ feedbackCode: code }),
        )
      }
      try {
        await tx.commit()
      } catch (error) {
        if (!isRetryable(error)) throw error
      }
    }
  } catch (error) {
    console.error(`[feedback] sweeping versions of ${talkId} failed`, error)
  }
}

/**
 * The published talk and every other version of it, each as the doc endpoint
 * has it NOW. GROQ finds versions (`sanity::versionOf`) but can lag a write by
 * about a second, so it only contributes ids: `drafts.<id>` and each release's
 * `versions.<release>.<id>` are always asked for by id too, and every revision
 * a guard uses comes from the doc endpoint. A stale revision from GROQ would
 * fail every retry of a write after one finished draft edit.
 *
 * `versions` holds the draft and the versions in an `active` release, which
 * a write patches. `locked` holds the versions in any other release: Sanity
 * locks a scheduled release's versions, and patching one would fail the whole
 * transaction on every attempt. `releasesListed` is false when the release
 * list did not load; release versions are then left out of both.
 */
async function readTalkVersions(
  client: VersionsClient,
  talkId: string,
): Promise<{
  published: TalkDoc | null
  versions: TalkDoc[]
  locked: TalkDoc[]
  releasesListed: boolean
}> {
  const raw = { cache: 'no-store', perspective: 'raw' } as const
  const [found, releases] = await Promise.all([
    client.fetch<unknown>(
      // groq-global-scoped: the versions of ONE talk, whose conference was checked on its published document
      `*[sanity::versionOf($id) && _id != $id]._id`,
      { id: talkId },
      raw,
    ),
    client
      // `[]` projects each release: without it Sanity answers null when
      // the dataset has no releases (measured), which read as a failed list.
      .fetch<unknown>('releases::all()[]{ _id, state }', {}, raw)
      .catch(() => null),
  ])
  const releasesListed = Array.isArray(releases)
  const releaseOf = (id: string) => /^versions\.([^.]+)\./.exec(id)?.[1]
  const stateOf = new Map(
    (releasesListed ? releases : [])
      .filter(
        (r): r is { _id: string; state: string } =>
          typeof r?._id === 'string' && typeof r.state === 'string',
      )
      .map((r) => [r._id.replace(/^_\.releases\./, ''), r.state]),
  )
  if (!releasesListed && Array.isArray(found) && found.some(isReleaseId)) {
    console.error(
      `[feedback] could not list releases; skipping release versions of ${talkId}`,
    )
  }
  const ids = new Set([
    `drafts.${talkId}`,
    // Asked for by id too, since GROQ can lag; a release that ended holds
    // no versions.
    ...[...stateOf]
      .filter(([, state]) => !ENDED_RELEASE_STATES.has(state))
      .map(([name]) => `versions.${name}.${talkId}`),
    ...(Array.isArray(found) ? found : []).filter(
      (id): id is string =>
        typeof id === 'string' && (releasesListed || !isReleaseId(id)),
    ),
  ])
  const [published, ...rest] = await client.getDocuments<TalkDoc>([
    talkId,
    ...ids,
  ])
  const docs = rest.filter((d): d is NonNullable<typeof d> => !!d)
  const writable = (d: TalkDoc) => {
    const release = releaseOf(d._id)
    return !release || stateOf.get(release) === 'active'
  }
  return {
    published: published ?? null,
    versions: docs.filter(writable),
    locked: docs.filter((d) => !writable(d)),
    releasesListed,
  }
}

const isReleaseId = (id: unknown) =>
  typeof id === 'string' && id.startsWith('versions.')

/** Releases whose versions are gone: published or archived. */
const ENDED_RELEASE_STATES = new Set(['published', 'archived'])
