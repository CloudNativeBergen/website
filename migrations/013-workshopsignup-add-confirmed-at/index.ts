import { at, defineMigration, set } from 'sanity/migrate'

interface WorkshopSignup {
  _id: string
  _type: 'workshopSignup'
  userEmail: string
  status: 'confirmed' | 'waitlist'
  signedUpAt?: string
  confirmedAt?: string
  _createdAt: string
}

export default defineMigration({
  title: 'Add confirmedAt timestamp to confirmed workshop signups',
  documentTypes: ['workshopSignup'],

  migrate: {
    document(doc, context) {
      const signup = doc as unknown as WorkshopSignup
      const operations = []

      // Add confirmedAt for confirmed signups that don't have it
      if (signup.status === 'confirmed' && !signup.confirmedAt) {
        // Use signedUpAt if available, otherwise fall back to _createdAt
        const timestamp = signup.signedUpAt || signup._createdAt

        console.log(
          `Adding confirmedAt to signup ${signup._id} (${signup.userEmail})`,
        )
        console.log(`  Using timestamp: ${timestamp}`)
        operations.push(at('confirmedAt', set(timestamp)))
      }

      return operations
    },
  },
})
