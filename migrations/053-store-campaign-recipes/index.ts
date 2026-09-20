import { at, defineMigration, patch, set } from 'sanity/migrate'
import { backfillCampaign, isLive } from './backfill'

/**
 * Store the Task Recipes on the Campaign (Templates spec §2.1, #1120). Not run
 * automatically — see the README for the dry run, the apply and the checks.
 *
 * From this release Triggers, the recurring expansion and `plan.copy` read
 * ONLY `marketingCampaign.recipes[]`. A Campaign seeded before it has none, so
 * until this runs it generates nothing. For every live Campaign whose `key`
 * is a built-in Campaign's it copies that Campaign's `2026.1` Recipes on, and
 * records the keys of the Campaign's existing countdown Tasks on
 * `generatedKeys[]`.
 *
 * Every patch is compare-and-set on the revision read at stream start: the
 * generator appends to `generatedKeys` under the same guard, so a run that
 * overlaps it fails that one patch rather than dropping a key. Idempotent —
 * re-run after a conflict.
 */
export default defineMigration({
  title: 'Store Task Recipes on marketing Campaigns',
  documentTypes: ['marketingCampaign', 'marketingTask'],
  async *migrate(documents) {
    const campaigns: Record<string, unknown>[] = []
    const tasks: Record<string, unknown>[] = []
    for await (const document of documents()) {
      if (!isLive(document._id)) continue
      if (document._type === 'marketingCampaign') campaigns.push(document)
      else if (document._type === 'marketingTask') tasks.push(document)
    }
    for (const campaign of campaigns) {
      const fields = backfillCampaign(campaign, tasks)
      if (!fields) continue
      yield patch(
        campaign._id as string,
        Object.entries(fields).map(([key, value]) => at(key, set(value))),
        { ifRevision: campaign._rev as string },
      )
    }
  },
})
