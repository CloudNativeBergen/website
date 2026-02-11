import { defineMigration, at, unset } from 'sanity/migrate'

export default defineMigration({
  title:
    'Remove conference.sponsors[] inline array and sponsorForConference.legacy_synced_at',
  description:
    'Removes the legacy conference.sponsors[] inline array from all conference documents ' +
    'and the unused legacy_synced_at field from all sponsorForConference documents. ' +
    'All sponsor data now lives exclusively in sponsorForConference documents.',

  migrate: {
    document(doc) {
      if (doc._type === 'conference') {
        const conference = doc as unknown as {
          _id: string
          title?: string
          sponsors?: unknown[]
        }

        if (!conference.sponsors || conference.sponsors.length === 0) {
          return []
        }

        console.log(
          `  ✓ Removing sponsors[] array (${conference.sponsors.length} entries) from conference ${conference.title || conference._id}`,
        )
        return [at('sponsors', unset())]
      }

      if (doc._type === 'sponsorForConference') {
        const sfc = doc as unknown as {
          _id: string
          legacy_synced_at?: string | null
        }

        if (!('legacy_synced_at' in sfc)) {
          return []
        }

        console.log(`  ✓ Removing legacy_synced_at from ${sfc._id}`)
        return [at('legacy_synced_at', unset())]
      }

      return []
    },
  },

  documentTypes: ['conference', 'sponsorForConference'],
})
