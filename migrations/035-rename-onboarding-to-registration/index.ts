import { defineMigration, at, set, unset } from 'sanity/migrate'

export default defineMigration({
  title: 'Rename onboarding fields to registration',
  description:
    'Renames onboardingToken → registrationToken, onboardingComplete → registrationComplete, ' +
    'and onboardingCompletedAt → registrationCompletedAt on all sponsorForConference documents.',
  documentTypes: ['sponsorForConference'],

  migrate: {
    document(doc) {
      const operations = []

      const d = doc as Record<string, unknown>

      if (d.onboardingToken !== undefined) {
        operations.push(at('registrationToken', set(d.onboardingToken)))
        operations.push(at('onboardingToken', unset()))
      }

      if (d.onboardingComplete !== undefined) {
        operations.push(at('registrationComplete', set(d.onboardingComplete)))
        operations.push(at('onboardingComplete', unset()))
      }

      if (d.onboardingCompletedAt !== undefined) {
        operations.push(
          at('registrationCompletedAt', set(d.onboardingCompletedAt)),
        )
        operations.push(at('onboardingCompletedAt', unset()))
      }

      return operations
    },
  },
})
