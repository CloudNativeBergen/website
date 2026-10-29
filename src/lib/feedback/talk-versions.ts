/**
 * EVERY VERSION OF A TALK (speaker feedback spec §4.2).
 *
 * A server write to one of the talk fields this feature owns
 * (`feedbackCode`, `feedbackSummarySentAt`, `feedbackFolded`) also
 * patches `drafts.<id>` and every `versions.<release>.<id>`, each guarded by
 * its own `ifRevisionId`, in the same transaction as the published talk; then
 * the post-commit sweep below re-patches any version that still differs. A
 * draft or a release version is a full copy, so publishing one that predates
 * the write would put the old value back.
 *
 * Every read and write here runs through {@link versionsClient}, pinned to
 * the API version whose `raw` perspective returns `versions.**`.
 */
import 'server-only'
import type { Patch } from '@sanity/client'
import { versionsClient } from './sanity'
import { sanityStatus } from '@/lib/sanity/status'
import type { StoredCounts } from './totals'

/** The talk as these writes read it, through the doc endpoint. */
export interface TalkDoc {
  _id: string
  _rev: string
  _type: string
  status?: string
  title?: string
  conference?: { _ref?: string }
  speakers?: { _ref?: string }[]
  feedbackCode?: string
  feedbackSummarySentAt?: string
  feedbackFolded?: FoldedCounts
}

/** `talk.feedbackFolded` (§4.2): the totals a fold kept, and when. */
export type FoldedCounts = StoredCounts & { foldedAt?: string }

/** A talk field a server write keeps equal on every version of the talk. */
export type VersionedTalkField = 'feedbackCode' | 'feedbackSummarySentAt'

export type VersionsClient = ReturnType<typeof versionsClient>

/**
 * A patch that only checks a document's revision. Sanity's docs do not say
 * that a patch with no operation is accepted, nor that its `ifRevisionID` is
 * then checked; Sanity Studio's own publish pairs `ifRevisionID` with an
 * unset of this field, which no document has ("Hack until other mutations
 * support revision locking", in `sanity`'s datastores). Every guard-only
 * patch here does the same, so it is a real, if empty, mutation.
 */
export const REVISION_LOCK_FIELD = '_revision_lock_pseudo_field_'

/** `p` guarded by `rev`, changing nothing: see {@link REVISION_LOCK_FIELD}. */
export const lockRevision = (p: Patch, rev: string): Patch =>
  p.ifRevisionId(rev).unset([REVISION_LOCK_FIELD])

/** How often a write that lost a revision guard re-reads and tries again. */
export const MAX_RETRIES = 3

/**
 * Options for one Sanity request that ends it after `ms`: an abort signal.
 * The client's own `timeout` does not bound every request (measured on
 * @sanity/client 7.27: a no-store fetch ignores it, and doc reads retry a
 * socket timeout up to six times); a signal aborts on time, once.
 * `undefined` leaves the request unbounded.
 */
export const requestCap = (ms: number | undefined) =>
  ms === undefined ? {} : { signal: AbortSignal.timeout(ms) }

/** Each request of a sweep whose caller gave no cap ends after this long. */
export const SWEEP_REQUEST_TIMEOUT_MS = 10_000

/** How often the post-commit sweep may re-patch a stale version. */
const MAX_SWEEP_PATCHES = 3

/**
 * A write that lost to a concurrent edit and should re-read and try again: a
 * failed `ifRevisionId` (409), or a version deleted since the read (Sanity
 * answers a patch of a missing document with 404 and rolls the whole
 * transaction back).
 */
export function isRetryable(error: unknown): boolean {
  const status = sanityStatus(error)
  if (status === 409 || status === 404) return true
  const message = error instanceof Error ? error.message.toLowerCase() : ''
  return message.includes('revision')
}

/**
 * §4.2's post-commit sweep. A revision guard cannot catch a version created
 * between the version lookup and the commit, because it is not in the
 * transaction, and the GROQ lookup can lag a write by about a second. So
 * re-read the published talk, `drafts.<id>` and every release's
 * `versions.<release>.<id>` BY ID through the doc endpoint, and re-patch any
 * version whose `field` differs from the PUBLISHED talk's as it is now (not
 * the value this request wrote: a later write may have replaced it). At most
 * {@link MAX_SWEEP_PATCHES} times; logged at the cap.
 *
 * Never throws: the write it follows has committed.
 */
export async function sweepTalkVersions(
  client: VersionsClient,
  talkId: string,
  field: VersionedTalkField = 'feedbackCode',
  { requestTimeoutMs }: { requestTimeoutMs?: number } = {},
): Promise<void> {
  await sweep(client, talkId, field, { requestTimeoutMs }, (published) => {
    const value = published?.[field]
    if (!value) return null
    return {
      stale: (d) => d[field] !== value,
      patch: (p) => p.set({ [field]: value }),
    }
  })
}

/**
 * The sweep after a fold (§12.2) or an erasure's code unset (§12.3): every
 * version must end without a `feedbackCode` the published talk no longer
 * has, and with the PUBLISHED talk's `feedbackFolded` totals when it has
 * any. Not {@link sweepTalkVersions}: its `!==` cannot compare an object,
 * and it stops when the published value is absent, which is exactly the case
 * for a code that was unset. Compared field by field; a version still holding
 * a code the published talk does not is re-patched, so publishing it cannot
 * bring the code back. Never throws.
 */
export async function sweepFoldedTalkVersions(
  client: VersionsClient,
  talkId: string,
  { requestTimeoutMs }: { requestTimeoutMs?: number } = {},
): Promise<void> {
  await sweep(
    client,
    talkId,
    'feedbackFolded',
    { requestTimeoutMs },
    (published) => {
      if (!published) return null
      const totals = published.feedbackFolded
      const code = published.feedbackCode
      return {
        stale: (d) =>
          d.feedbackCode !== code ||
          (!!totals && !sameFolded(d.feedbackFolded, totals)),
        patch: (p) => {
          const withTotals = totals ? p.set({ feedbackFolded: totals }) : p
          return code === undefined
            ? withTotals.unset(['feedbackCode'])
            : withTotals.set({ feedbackCode: code })
        },
      }
    },
  )
}

const FOLDED_FIELDS = [
  'greenCount',
  'yellowCount',
  'redCount',
  'foldedAt',
] as const satisfies readonly (keyof FoldedCounts)[]

const sameFolded = (a: FoldedCounts | null | undefined, b: FoldedCounts) =>
  !!a && FOLDED_FIELDS.every((k) => a[k] === b[k])

/** What a sweep mirrors: which versions are stale, and the patch that fixes one. */
interface Mirror {
  stale: (version: TalkDoc) => boolean
  patch: (p: Patch) => Patch
}

async function sweep(
  client: VersionsClient,
  talkId: string,
  /** For the log lines. */
  field: string,
  { requestTimeoutMs }: { requestTimeoutMs?: number },
  /** Null: the published talk has nothing to mirror, and the sweep stops. */
  mirrorOf: (published: TalkDoc | null) => Mirror | null,
): Promise<void> {
  // Every request of a sweep ends: one that stalled must not land long
  // after the write it follows, past a speaker erasure's settle wait (§12.3).
  const cap = requestTimeoutMs ?? SWEEP_REQUEST_TIMEOUT_MS
  try {
    for (let patches = 0; ; patches++) {
      const { published, versions, locked } = await readTalkVersions(
        client,
        talkId,
        { requestTimeoutMs: cap },
      )
      const mirror = mirrorOf(published)
      if (!mirror || !published) return
      if (patches === 0 && locked.some(mirror.stale)) {
        // Locked while this write ran; publishing it would undo the write.
        console.error(
          `[feedback] a locked release holds a stale version of ${talkId} (${field})`,
        )
      }
      const stale = versions.filter(mirror.stale)
      if (stale.length === 0) return
      if (patches >= MAX_SWEEP_PATCHES) {
        console.error(
          `[feedback] gave up sweeping stale versions of ${talkId} (${field}) after ${MAX_SWEEP_PATCHES} patches`,
        )
        return
      }
      // Guarded on the PUBLISHED talk too, at the revision this copy was read
      // from: if it changed since (an erasure unset its code), the copy fails
      // and the next read decides afresh, instead of writing the old value
      // onto a version the change did not touch.
      const tx = client
        .transaction()
        .patch(published._id, (p) => lockRevision(p, published._rev))
      for (const d of stale) {
        tx.patch(d._id, (p) => mirror.patch(p.ifRevisionId(d._rev)))
      }
      try {
        await tx.commit(requestCap(cap))
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
export async function readTalkVersions(
  client: VersionsClient,
  talkId: string,
  /** Each request ends after this long (see {@link requestCap}). */
  { requestTimeoutMs }: { requestTimeoutMs?: number } = {},
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
      { ...raw, ...requestCap(requestTimeoutMs) },
    ),
    client
      // `[]` projects each release: without it Sanity answers null when
      // the dataset has no releases (measured), which read as a failed list.
      .fetch<unknown>(
        'releases::all()[]{ _id, state }',
        {},
        {
          ...raw,
          ...requestCap(requestTimeoutMs),
        },
      )
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
  const [published, ...rest] = await client.getDocuments<TalkDoc>(
    [talkId, ...ids],
    requestCap(requestTimeoutMs),
  )
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
