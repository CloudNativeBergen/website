import { at, defineMigration, patch, set } from 'sanity/migrate'
import { backfillSnapshot, weakenOwnerRefs } from './backfill'

/** Mandatory BEFORE enabling Campaign/Plan deletion. Not run automatically.
 * Two independent passes. The owner-reference pass runs FIRST and cannot throw,
 * so a Snapshot that cannot be attributed can no longer stop every reference
 * being weakened — and since deletion refuses until they are weak, that
 * previously let one bad document freeze deletion entirely. The Snapshot pass
 * keeps its own all-or-nothing contract: every join is resolved before any of
 * it is written. A partial run therefore leaves references weakened and
 * Snapshots un-backfilled. That state is resumable, but it is NOT safe on its
 * own: reference strength is what the deletion preflight used to check, so a
 * run that stopped between the passes would have let a Campaign delete go
 * ahead and strip those readings of their only attribution — unrecoverably,
 * since the backfill needs the Campaign it would have read. The preflight
 * therefore refuses independently while any Snapshot pointing into the delete
 * set still has no `campaignKey` of its own.
 * A dangling CAMPAIGN join throws: without its key and title the snapshot
 * becomes unattributable, which is the loss this migration exists to prevent,
 * so restore the Campaign from backup rather than weakening the reference. A
 * dangling perTask row is kept keyless instead — `task.delete` predates this
 * migration, so those rows are expected, and there is no key left to recover.
 * Includes draft snapshots because their strong references also block deletes.
 */
export default defineMigration({
  title: 'Preserve marketing measurement before Campaign deletion',
  documentTypes: [
    'marketingSnapshot',
    'marketingCampaign',
    'marketingTask',
    'marketingPlan',
    'socialPostVariant',
  ],
  async *migrate(documents) {
    const byId = new Map<string, Record<string, unknown>>()
    for await (const document of documents()) byId.set(document._id, document)
    // COMPARE-AND-SET on the revision read at stream start.
    //
    // Both passes rewrite whole values — `perTask` is re-emitted as an array —
    // from the copy this run streamed. Without a guard, a run overlapping the
    // 04:20 UTC `marketing-snapshots` cron writes that stale array back and
    // discards the reading taken in between. With it, the conflicting patch
    // fails and the migration can simply be re-run; the passes are idempotent,
    // and only documents that would actually change are patched at all.
    const emit = function* (
      entries: {
        id: string
        rev?: string | undefined
        fields: Record<string, unknown>
      }[],
    ) {
      for (const { id, rev, fields } of entries)
        yield patch(
          id,
          Object.entries(fields).map(([key, value]) => at(key, set(value))),
          rev ? { ifRevision: rev } : undefined,
        )
    }

    // ONE PATCH PER DOCUMENT, because each is compare-and-set on the revision
    // read at stream start. A Snapshot is touched by BOTH jobs — the owner pass
    // weakens its `campaign` and `perTask[].task`, the backfill copies the
    // Campaign's key and title onto it — so emitting them as two patches meant
    // the first flushed, changed the revision, and the second's guard then
    // conflicted on every Snapshot in the dataset. The migration could not
    // complete in one run, and deletion stays gated until it does.
    const ownerFields = new Map<string, Record<string, unknown>>()
    const other: {
      id: string
      rev?: string
      fields: Record<string, unknown>
    }[] = []
    for (const document of byId.values()) {
      if (
        document._type !== 'marketingTask' &&
        document._type !== 'marketingCampaign' &&
        document._type !== 'socialPostVariant' &&
        document._type !== 'marketingPlan' &&
        document._type !== 'marketingSnapshot'
      )
        continue
      const fields = weakenOwnerRefs(document)
      if (!fields) continue
      const id = document._id as string
      if (document._type === 'marketingSnapshot') ownerFields.set(id, fields)
      else other.push({ id, rev: document._rev as string, fields })
    }

    // Everything that is not a Snapshot can go now: nothing else writes to it.
    yield* emit(other)

    // The backfill keeps its all-or-nothing contract — every join is resolved
    // before any of it is written — but it must not be able to block the owner
    // weakening. Computing the joins first and only then deciding what to emit
    // keeps both: an unresolvable Campaign still leaves every Snapshot's
    // references weakened, so one unrestorable document can no longer make
    // every plan permanently undeletable, and it still refuses to write a
    // half-attributed dataset. A partial backfill is separately safe because
    // the deletion preflight refuses while any Snapshot in the delete set has
    // no `campaignKey` of its own.
    const snapshots = [...byId.values()].filter(
      (document) => document._type === 'marketingSnapshot',
    )
    let joinError: unknown = null
    const backfilled = new Map<string, Record<string, unknown>>()
    for (const document of snapshots) {
      try {
        backfilled.set(document._id as string, backfillSnapshot(document, byId))
      } catch (error) {
        joinError ??= error
      }
    }
    // Backfill fields are spread LAST: where the two overlap (`campaign`,
    // `perTask`) its versions already carry the `_weak` markers the owner pass
    // sets, plus the attribution the owner pass knows nothing about.
    yield* emit(
      snapshots.flatMap((document) => {
        const id = document._id as string
        const fields = {
          ...(ownerFields.get(id) ?? {}),
          ...(joinError ? {} : (backfilled.get(id) ?? {})),
        }
        return Object.keys(fields).length
          ? [{ id, rev: document._rev as string, fields }]
          : []
      }),
    )
    if (joinError) throw joinError
  },
})
