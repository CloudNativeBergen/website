import { at, defineMigration, setIfMissing } from 'sanity/migrate'

/**
 * IMPORTANT: Before running this migration:
 * 1. Always create a backup of your dataset:
 *    npx sanity@latest dataset export production my-backup-filename.tar.gz
 *
 * 2. Validate your documents against schema changes:
 *    npx sanity@latest documents validate -y
 */

const conferenceId = '0d9747cd-e128-4698-8ba7-3dfd4029d692'

export default defineMigration({
  title: 'Add required conference reference to talks',
  description:
    'Adds a reference to the default conference for all talk documents',
  documentTypes: ['talk'],

  migrate: {
    document(doc, context) {
      if (doc.conference) {
        console.log(
          `Talk "${doc.title}" (${doc._id}) already has a conference, skipping`,
        )
        return []
      }

      console.log(
        `Adding conference reference to talk "${doc.title}" (${doc._id})`,
      )

      return at(
        'conference',
        setIfMissing({
          _type: 'reference',
          _ref: conferenceId,
        }),
      )
    },
  },
})
