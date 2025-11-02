import { at, defineMigration, set, unset } from 'sanity/migrate'

/**
 * IMPORTANT: Before running this migration:
 * 1. Always create a backup of your dataset:
 *    npx sanity@latest dataset export production backup-before-009-$(date +%Y%m%d).tar.gz
 *
 * 2. Validate your documents against schema changes:
 *    npx sanity@latest documents validate -y
 */

interface TalkDocument {
  _id: string
  _type: string
  title?: string
  tags?: string[]
  workshopCapacity?: number
  capacity?: number
  topics?: Array<{ _type: string; _ref: string }>
}

export default defineMigration({
  title: 'Clean up deprecated talk fields',
  description:
    'Removes deprecated tags field (replaced by topics) and migrates workshopCapacity to capacity',
  documentTypes: ['talk'],

  migrate: {
    document(doc) {
      const talk = doc as TalkDocument
      const operations = []

      // Migrate workshopCapacity to capacity
      if (talk.workshopCapacity !== undefined && talk.capacity === undefined) {
        console.log(
          `Migrating workshopCapacity to capacity for talk "${talk.title}" (${talk._id})`,
        )
        operations.push(at('capacity', set(talk.workshopCapacity)))
      }

      // Remove deprecated workshopCapacity field
      if (talk.workshopCapacity !== undefined) {
        console.log(
          `Removing workshopCapacity from talk "${talk.title}" (${talk._id})`,
        )
        operations.push(at('workshopCapacity', unset()))
      }

      // Remove deprecated tags field (now using topics references)
      if (talk.tags !== undefined) {
        if (talk.tags.length > 0) {
          console.warn(
            `Warning: Removing tags field with ${talk.tags.length} tag(s) from talk "${talk.title}" (${talk._id}). Consider mapping to topics if needed.`,
          )
        } else {
          console.log(
            `Removing empty tags field from talk "${talk.title}" (${talk._id})`,
          )
        }
        operations.push(at('tags', unset()))
      }

      return operations
    },
  },
})
