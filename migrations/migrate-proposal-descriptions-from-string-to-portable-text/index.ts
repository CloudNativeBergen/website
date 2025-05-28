/**
 * IMPORTANT: Before running this migration:
 * 1. Always create a backup of your dataset:
 *    npx sanity@latest dataset export production my-backup-filename.tar.gz
 *
 * 2. Validate your documents against schema changes:
 *    npx sanity@latest documents validate -y
 */

import { convertStringToPortableTextBlocks } from '@/lib/proposal/validation'
import { PortableTextBlock } from '@portabletext/editor'
import { at, defineMigration, set } from '@sanity/migrate'

export default defineMigration({
  title: 'Migrate proposal descriptions from string to portable text',
  description:
    'Changes the type of proposal descriptions to PortableTextBlock[] and creates one block for each paragraph (distinguished by \\n\\n) in the existing string',
  documentTypes: ['talk'],

  migrate: {
    document(doc) {
      // Skip documents where the description is not string
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
    // No need for other migration handlers as we're only adding a reference at the document level
  },
})
