import { at, defineMigration, setIfMissing } from 'sanity/migrate'

/**
 * IMPORTANT: Before running this migration:
 * 1. Always create a backup of your dataset:
 *    npx sanity@latest dataset export production my-backup-filename.tar.gz
 *
 * 2. Validate your documents against schema changes:
 *    npx sanity@latest documents validate -y
 */

/**
 * Generate a slug from a speaker's name, similar to the Sanity schema slugify function
 */
function generateSlug(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-').slice(0, 96)
}

interface SpeakerDocument {
  _id: string
  name?: string
  slug?: {
    _type: string
    current: string
  }
}

export default defineMigration({
  title: 'Ensure all speakers have slugs',
  description:
    'Adds slug fields to all speaker documents that do not have them, generated from their names',
  documentTypes: ['speaker'],

  migrate: {
    document(doc, context) {
      const speaker = doc as SpeakerDocument
      
      // Skip documents that already have a slug
      if (speaker.slug && speaker.slug.current) {
        console.log(
          `Speaker "${speaker.name}" (${speaker._id}) already has a slug: "${speaker.slug.current}", skipping`,
        )
        return []
      }

      // Skip documents without a name (can't generate slug)
      if (!speaker.name || typeof speaker.name !== 'string') {
        console.warn(
          `Speaker (${speaker._id}) does not have a valid name, cannot generate slug, skipping`,
        )
        return []
      }

      const slugValue = generateSlug(speaker.name)
      
      console.log(
        `Adding slug "${slugValue}" to speaker "${speaker.name}" (${speaker._id})`,
      )

      // Add slug to speakers that don't have it
      return at(
        'slug',
        setIfMissing({
          _type: 'slug',
          current: slugValue,
        }),
      )
    },
    // No need for other migration handlers as we're only adding a slug at the document level
  },
})
