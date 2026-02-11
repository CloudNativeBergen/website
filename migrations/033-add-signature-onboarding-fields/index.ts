import { defineMigration, at, setIfMissing } from 'sanity/migrate'

export default defineMigration({
  title: 'Add signature and onboarding fields to sponsorForConference',
  description:
    'Backfills default values for new signatureStatus, reminderCount, and onboardingComplete fields ' +
    'on all sponsorForConference documents to support contract signing and sponsor onboarding features.',
  documentTypes: ['sponsorForConference'],

  migrate: {
    document(_doc) {
      const operations = []

      operations.push(at('signatureStatus', setIfMissing('not-started')))
      operations.push(at('reminderCount', setIfMissing(0)))
      operations.push(at('onboardingComplete', setIfMissing(false)))

      return operations
    },
  },
})
