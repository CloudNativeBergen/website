import {
  at,
  defineMigration,
  unset,
  createIfNotExists,
  patch,
} from 'sanity/migrate'

export default defineMigration({
  title: 'Migrate Sponsor Notes to Activity',
  description:
    'Converts legacy notes field on sponsorForConference documents to sponsorActivity documents of type note',
  documentTypes: ['sponsorForConference'],

  async *migrate(documents, context) {
    for await (const doc of documents()) {
      if (
        doc.notes &&
        typeof doc.notes === 'string' &&
        doc.notes.trim() !== ''
      ) {
        const activityId = `activity-note-${doc._id}`

        // Create the activity document
        yield createIfNotExists({
          _id: activityId,
          _type: 'sponsorActivity',
          sponsorForConference: {
            _type: 'reference',
            _ref: doc._id,
          },
          activityType: 'note',
          description: doc.notes,
          createdAt:
            doc._updatedAt || doc._createdAt || new Date().toISOString(),
        })

        // Unset the notes field from the original document
        yield patch(doc._id, [at('notes', unset())])
      } else if (doc.notes) {
        // If it's just empty string, unset it without creating an activity
        yield patch(doc._id, [at('notes', unset())])
      }
    }
  },
})
