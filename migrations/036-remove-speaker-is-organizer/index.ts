import { defineMigration, at, unset } from 'sanity/migrate'

export default defineMigration({
  title: 'Remove isOrganizer field from speakers',
  description:
    'Removes the isOrganizer boolean field from speaker documents. ' +
    'Organizer status is now computed from conference.organizers[] references.',
  documentTypes: ['speaker'],

  migrate: {
    document(doc) {
      const d = doc as Record<string, unknown>

      if (d.isOrganizer !== undefined) {
        return [at('isOrganizer', unset())]
      }

      return []
    },
  },
})
