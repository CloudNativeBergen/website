import { at, defineMigration, set } from 'sanity/migrate'
import { v4 as uuidv4 } from 'uuid'

interface TalkDocument {
  _id: string
  _type: string
  title?: string
  video?: string
  attachments?: Array<{
    _type: string
    _key: string
    url?: string
    attachmentType?: string
    uploadedAt?: string
  }>
}

export default defineMigration({
  title: 'Migrate video URLs to attachments array',
  description:
    'Converts the video field to a urlAttachment in the attachments array, preserving the original video field for backward compatibility',
  documentTypes: ['talk'],

  migrate: {
    document(doc) {
      const talk = doc as TalkDocument

      if (!talk.video) {
        return []
      }

      if (talk.attachments && talk.attachments.length > 0) {
        const hasVideoAttachment = talk.attachments.some(
          (a) =>
            a._type === 'urlAttachment' &&
            a.attachmentType === 'recording' &&
            a.url === talk.video,
        )

        if (hasVideoAttachment) {
          return []
        }
      }

      const videoAttachment = {
        _type: 'urlAttachment',
        _key: uuidv4(),
        url: talk.video,
        attachmentType: 'recording',
        title: 'Session Recording',
        uploadedAt: new Date().toISOString(),
      }

      const newAttachments = talk.attachments
        ? [...talk.attachments, videoAttachment]
        : [videoAttachment]

      return [at('attachments', set(newAttachments))]
    },
  },
})
