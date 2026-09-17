import { at, defineMigration, patch, set } from 'sanity/migrate'
import { backfillSnapshot, weakenOwnerRefs } from './backfill'

/** Mandatory BEFORE enabling Campaign/Plan deletion. Not run automatically.
 * Read the complete source set and validate every join before yielding ANY
 * mutation, so a dataset that cannot be fully migrated is not half-migrated.
 * A dangling CAMPAIGN join throws: without its key and title the snapshot
 * becomes unattributable, which is the loss this migration exists to prevent,
 * so restore the Campaign from backup rather than weakening the reference. A
 * dangling perTask row is kept keyless instead — `task.delete` predates this
 * migration, so those rows are expected, and there is no key left to recover.
 * Includes draft snapshots because their strong references also block deletes.
 */
export default defineMigration({
  title: 'Preserve marketing measurement before Campaign deletion',
  documentTypes: ['marketingSnapshot', 'marketingCampaign', 'marketingTask'],
  async *migrate(documents) {
    const byId = new Map<string, Record<string, unknown>>()
    for await (const document of documents()) byId.set(document._id, document)
    const operations = [...byId.values()]
      .filter((document) => document._type === 'marketingSnapshot')
      .map((document) => ({
        id: document._id as string,
        fields: backfillSnapshot(document, byId),
      }))
    // Same job, second reference family: the plan and Campaign references that
    // Tasks and Campaigns hold were strong, which is what let an un-enumerated
    // referrer wedge a half-deleted plan.
    for (const document of byId.values()) {
      if (
        document._type !== 'marketingTask' &&
        document._type !== 'marketingCampaign'
      )
        continue
      const fields = weakenOwnerRefs(document)
      if (fields) operations.push({ id: document._id as string, fields })
    }
    for (const { id, fields } of operations) {
      yield patch(
        id,
        Object.entries(fields).map(([key, value]) => at(key, set(value))),
      )
    }
  },
})
