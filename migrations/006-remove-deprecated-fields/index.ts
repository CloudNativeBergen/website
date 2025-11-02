import { at, defineMigration, unset } from 'sanity/migrate'

/**
 * IMPORTANT: Before running this migration:
 * 1. Always create a backup of your dataset:
 *    npx sanity@latest dataset export production my-backup-filename.tar.gz
 *
 * 2. Ensure migrations 004 and 005 have been run:
 *    - 004-speaker-to-speakers: Migrates single speaker to speakers array
 *    - 005-video-to-attachments: Migrates video URL to attachments array
 *
 * 3. Validate your documents against schema changes:
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
  video?: string
  speakers?: Array<{
    _type: string
    _ref: string
  }>
  attachments?: Array<{
    _type: string
    _key: string
  }>
}

export default defineMigration({
  title: 'Remove deprecated speaker and video fields',
  description:
    'Removes the deprecated speaker (single reference) and video (URL) fields from talk documents after data has been migrated to speakers array and attachments array',
  documentTypes: ['talk'],

  migrate: {
    document(doc) {
      const talk = doc as TalkDocument
      const operations = []

      if (talk.speaker) {
        if (!talk.speakers || talk.speakers.length === 0) {
          console.warn(
            `Warning: Talk "${talk.title}" (${talk._id}) has speaker but no speakers array. Migration 004 may not have run correctly.`,
          )
        } else {
          console.log(
            `Removing deprecated speaker field from talk "${talk.title}" (${talk._id})`,
          )
          operations.push(at('speaker', unset()))
        }
      }

      if (talk.video) {
        const hasVideoAttachment =
          talk.attachments &&
          talk.attachments.some((a) => a._type === 'urlAttachment')

        if (!hasVideoAttachment) {
          console.warn(
            `Warning: Talk "${talk.title}" (${talk._id}) has video but no video attachment. Migration 005 may not have run correctly.`,
          )
        } else {
          console.log(
            `Removing deprecated video field from talk "${talk.title}" (${talk._id})`,
          )
          operations.push(at('video', unset()))
        }
      }

      return operations
    },
  },
})
