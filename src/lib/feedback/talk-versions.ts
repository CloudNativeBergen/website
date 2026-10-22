/**
 * EVERY VERSION OF A TALK (speaker feedback spec §4.2).
 *
 * A server write to one of the talk fields this feature owns
 * (`feedbackCode`, `feedbackSummarySentAt`, and later `feedbackFolded`) also
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
import { versionsClient } from './sanity'
import { sanityStatus } from './sanity-error'

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
}

/** A talk field a server write keeps equal on every version of the talk. */
export type VersionedTalkField = 'feedbackCode' | 'feedbackSummarySentAt'

export type VersionsClient = ReturnType<typeof versionsClient>

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
  try {
    for (let patches = 0; ; patches++) {
      const { published, versions, locked } = await readTalkVersions(
        client,
        talkId,
        { requestTimeoutMs },
      )
      const value = published?.[field]
      if (!value) return
      if (patches === 0 && locked.some((d) => d[field] !== value)) {
        // Locked while this write ran; publishing it would undo the write.
        console.error(
          `[feedback] a locked release holds a stale version of ${talkId} (${field})`,
        )
      }
      const stale = versions.filter((d) => d[field] !== value)
      if (stale.length === 0) return
      if (patches >= MAX_SWEEP_PATCHES) {
        console.error(
          `[feedback] gave up sweeping stale versions of ${talkId} (${field}) after ${MAX_SWEEP_PATCHES} patches`,
        )
        return
      }
      const tx = client.transaction()
      for (const d of stale) {
        tx.patch(d._id, (p) => p.ifRevisionId(d._rev).set({ [field]: value }))
      }
      try {
        await tx.commit(requestCap(requestTimeoutMs))
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
