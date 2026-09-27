import { at, defineMigration, patch, set } from 'sanity/migrate'
import { rewritesFor } from './rewrites'

/**
 * Talk posts name all of a talk's speakers (#1153): the built-in talk
 * skeletons moved from `{name} ({company})` to `{speakers}` in Template
 * `2026.3`. A plan seeded earlier keeps its stored Recipes, and for a
 * two-speaker talk `{name} ({company})` now reads "Alice and Bob (Alice's
 * title)". This rewrites every stored talk Recipe skeleton that is still the
 * UNEDITED built-in text; an edited one is left alone. Not run automatically —
 * see the README. Idempotent: a rewritten skeleton no longer matches.
 */
export default defineMigration({
  title: 'Talk Recipes name every speaker ({speakers})',
  documentTypes: ['marketingCampaign'],
  async *migrate(documents) {
    for await (const campaign of documents()) {
      // Drafts and Content Release copies too: publishing one later would
      // replace the live Campaign and bring the old text back.
      const rewrites = rewritesFor(campaign)
      if (rewrites.length === 0) continue
      yield patch(
        campaign._id,
        rewrites.map((r) =>
          at(['recipes', { _key: r._key }, 'skeleton'], set(r.to)),
        ),
        { ifRevision: campaign._rev },
      )
    }
  },
})
