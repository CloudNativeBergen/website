import { at, defineMigration, unset } from 'sanity/migrate'

export default defineMigration({
  title: 'Unset unknown experienceLevel/operatingSystem on workshopSignup',
  description:
    'Removes the "unknown" placeholder values set by migration 026. ' +
    'These fields are now optional, so legacy signups without this data ' +
    'should have the fields unset rather than holding a fake value.',
  documentTypes: ['workshopSignup'],

  migrate: {
    document(doc) {
      const operations = []

      if (doc.experienceLevel === 'unknown') {
        operations.push(at('experienceLevel', unset()))
      }

      if (doc.operatingSystem === 'unknown') {
        operations.push(at('operatingSystem', unset()))
      }

      return operations
    },
  },
})
