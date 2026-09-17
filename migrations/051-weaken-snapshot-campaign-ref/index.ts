import { at, defineMigration, patch, set } from 'sanity/migrate'
import { backfillSnapshot } from './backfill'

/** Mandatory BEFORE enabling Campaign/Plan deletion. Not run automatically.
 * Read the complete source set and validate every join before yielding ANY
 * mutation. A dangling legacy join is unrecoverable after deletion: restore
 * its source from backup instead of silently losing measurement metadata.
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
    for (const { id, fields } of operations) {
      yield patch(
        id,
        Object.entries(fields).map(([key, value]) => at(key, set(value))),
      )
    }
  },
})
