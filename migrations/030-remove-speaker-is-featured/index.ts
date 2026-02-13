import { at, defineMigration, unset } from 'sanity/migrate'

export default defineMigration({
  title: 'Remove deprecated isFeatured field from speakers',
  description:
    'Removes the deprecated isFeatured boolean from speaker documents. Featured speakers are tracked via the conference.featuredSpeakers[] array instead.',
  documentTypes: ['speaker'],

  migrate: {
    document(doc) {
      if (doc.isFeatured !== undefined) {
        console.log(
          `Removing isFeatured from speaker "${doc.name}" (${doc._id})`,
        )
        return [at('isFeatured', unset())]
      }
      return []
    },
  },
})
