import { at, defineMigration, set } from 'sanity/migrate'

/**
 * IMPORTANT: Before running this migration:
 * 1. Always create a backup of your dataset:
 *    npx sanity@latest dataset export production my-backup-filename.tar.gz
 *
 * 2. Validate your documents against schema changes:
 *    npx sanity@latest documents validate -y
 */

interface TalkDocument {
  _id: string
  _type: string
  title?: string
  speaker?: {
    _type: string
    _ref: string
  }
  speakers?: Array<{
    _type: string
    _ref: string
  }>
}

export default defineMigration({
  title: 'Migrate speaker to speakers array',
  description:
    'Converts the single speaker reference to an array of speakers, preserving existing fields for backward compatibility',
  documentTypes: ['talk'],

  migrate: {
    document(doc, context) {
      const talk = doc as TalkDocument

      if (talk.speakers && Array.isArray(talk.speakers)) {
        console.log(
          `Talk "${talk.title}" (${talk._id}) already has speakers array, skipping`,
        )
        return []
      }

      let sourceRef: string | null = null
      let sourceField: string | null = null

      if (talk.speaker?._ref) {
        sourceRef = talk.speaker._ref
        sourceField = 'speaker'
      }

      if (!sourceRef || !sourceField) {
        console.log(
          `Talk "${talk.title}" (${talk._id}) has no speaker to migrate, skipping`,
        )
        return []
      }

      console.log(
        `Migrating talk "${talk.title}" (${talk._id}) - converting ${sourceField} to speakers array`,
      )

      const speakersArray = [
        {
          _type: 'reference',
          _ref: sourceRef,
        },
      ]

      return [
        at('speakers', set(speakersArray)),
        // Keep original speaker field for backward compatibility (intentional)
      ]
    },
  },
})
