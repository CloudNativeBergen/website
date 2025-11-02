import { at, defineMigration, unset } from 'sanity/migrate'

/**
 * IMPORTANT: Before running this migration:
 * 1. Always create a backup of your dataset:
 *    npx sanity@latest dataset export production backup-before-008-$(date +%Y%m%d).tar.gz
 *
 * 2. Validate your documents against schema changes:
 *    npx sanity@latest documents validate -y
 */

interface SpeakerDocument {
  _id: string
  _type: string
  name?: string
  company?: string
  is_diverse?: boolean
  is_first_time?: boolean
  is_local?: boolean
  github?: string
  linkedin?: string
  twitter?: string
  website?: string
  flags?: string[]
}

export default defineMigration({
  title: 'Clean up deprecated speaker fields',
  description:
    'Removes deprecated fields (company, is_diverse, is_first_time, is_local, and old social media fields). These have been replaced by the flags array and links array.',
  documentTypes: ['speaker'],

  migrate: {
    document(doc) {
      const speaker = doc as SpeakerDocument
      const operations = []

      // Remove deprecated company field (now part of title or bio)
      if (speaker.company !== undefined) {
        console.log(
          `Removing company field from speaker ${speaker.name} (${speaker._id})`,
        )
        operations.push(at('company', unset()))
      }

      // Remove deprecated flag fields (now in flags array)
      if (speaker.is_diverse !== undefined) {
        console.log(
          `Removing is_diverse from speaker ${speaker.name} (${speaker._id})`,
        )
        operations.push(at('is_diverse', unset()))
      }

      if (speaker.is_first_time !== undefined) {
        console.log(
          `Removing is_first_time from speaker ${speaker.name} (${speaker._id})`,
        )
        operations.push(at('is_first_time', unset()))
      }

      if (speaker.is_local !== undefined) {
        console.log(
          `Removing is_local from speaker ${speaker.name} (${speaker._id})`,
        )
        operations.push(at('is_local', unset()))
      }

      // Remove old social media fields (now in links array)
      if (speaker.github !== undefined) {
        console.log(
          `Removing github field from speaker ${speaker.name} (${speaker._id})`,
        )
        operations.push(at('github', unset()))
      }

      if (speaker.linkedin !== undefined) {
        console.log(
          `Removing linkedin field from speaker ${speaker.name} (${speaker._id})`,
        )
        operations.push(at('linkedin', unset()))
      }

      if (speaker.twitter !== undefined) {
        console.log(
          `Removing twitter field from speaker ${speaker.name} (${speaker._id})`,
        )
        operations.push(at('twitter', unset()))
      }

      if (speaker.website !== undefined) {
        console.log(
          `Removing website field from speaker ${speaker.name} (${speaker._id})`,
        )
        operations.push(at('website', unset()))
      }

      return operations
    },
  },
})
