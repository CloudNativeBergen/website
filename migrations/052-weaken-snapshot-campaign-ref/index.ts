import { at, defineMigration, patch, set } from 'sanity/migrate'
import { backfillSnapshot, weakenOwnerRefs } from './backfill'

/** Mandatory BEFORE enabling Campaign/Plan deletion. Not run automatically.
 * Two independent passes. The owner-reference pass runs FIRST and cannot throw,
 * so a Snapshot that cannot be attributed can no longer stop every reference
 * being weakened — and since deletion refuses until they are weak, that
 * previously let one bad document freeze deletion entirely. The Snapshot pass
 * keeps its own all-or-nothing contract: every join is resolved before any of
 * it is written. A partial run therefore leaves references weakened and
 * Snapshots un-backfilled, which is safe and resumable.
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
    const emit = function* (
      entries: { id: string; fields: Record<string, unknown> }[],
    ) {
      for (const { id, fields } of entries)
        yield patch(
          id,
          Object.entries(fields).map(([key, value]) => at(key, set(value))),
        )
    }

    // The owner-reference pass runs FIRST and on its own, because it cannot
    // throw. Computing the snapshot pass first meant a single unattributable
    // Snapshot aborted the whole migration before a single reference was
    // weakened — and since deletion refuses until those references are weak,
    // one unrestorable document made every plan permanently undeletable. The
    // two jobs are independent; neither should be able to block the other.
    const ownerRefs: { id: string; fields: Record<string, unknown> }[] = []
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
      if (fields) ownerRefs.push({ id: document._id as string, fields })
    }
    yield* emit(ownerRefs)

    // The Snapshot pass keeps its all-or-nothing contract: every join is
    // resolved before any of it is written, so a dataset that cannot be fully
    // migrated is not half-migrated. It throws with an actionable message.
    const snapshots = [...byId.values()]
      .filter((document) => document._type === 'marketingSnapshot')
      .map((document) => ({
        id: document._id as string,
        fields: backfillSnapshot(document, byId),
      }))
      .filter(({ fields }) => Object.keys(fields).length > 0)
    yield* emit(snapshots)
  },
})
