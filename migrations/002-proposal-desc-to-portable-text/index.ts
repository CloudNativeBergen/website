/**
 * IMPORTANT: Before running this migration:
 * 1. Always create a backup of your dataset:
 *    npx sanity@latest dataset export production my-backup-filename.tar.gz
 *
 * 2. Validate your documents against schema changes:
 *    npx sanity@latest documents validate -y
 */

// Import the module directly, not the '@/lib/proposal' barrel: the barrel
// re-exports .tsx modules that the Sanity CLI migration loader cannot parse,
// which breaks `sanity migration list` for every migration.
import { convertStringToPortableTextBlocks } from '@/lib/proposal/utils/validation'
import { PortableTextBlock } from '@portabletext/editor'
import { at, defineMigration, set } from '@sanity/migrate'

export default defineMigration({
  title: 'Migrate proposal descriptions from string to portable text',
  description:
    'Changes the type of proposal descriptions to PortableTextBlock[] and creates one block for each paragraph (distinguished by \\n\\n) in the existing string',
  documentTypes: ['talk'],

  migrate: {
    document(doc) {
      const shouldSkip = typeof doc.description !== 'string'
      if (shouldSkip) {
        console.log(
          `Talk "${doc.title}" (${doc._id}) does not have a string description (type: '${typeof doc.description}'), skipping`,
        )

        return []
      }

      console.log(
        `Mapping "${doc.title}" (${doc._id})'s description from string to PortableTextBlock[]`,
      )

      const blocks = convertStringToPortableTextBlocks(
        doc.description as PortableTextBlock[] | string | undefined,
      )
      return at('description', set(blocks))
    },
  },
})
