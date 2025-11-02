import { at, defineMigration, set, unset } from 'sanity/migrate'

/**
 * IMPORTANT: Before running this migration:
 * 1. Always create a backup of your dataset:
 *    npx sanity@latest dataset export production backup-before-007-$(date +%Y%m%d).tar.gz
 *
 * 2. Validate your documents against schema changes:
 *    npx sanity@latest documents validate -y
 */

interface WorkshopSignupDocument {
  _id: string
  _type: string
  userEmail?: string
  cancellationReason?: string
  cancelledAt?: string
  signupDate?: string
  status?: string
  signedUpAt?: string
  confirmedAt?: string
}

export default defineMigration({
  title: 'Update workshopSignup schema',
  description:
    'Removes deprecated fields (cancellationReason, cancelledAt, signupDate) and migrates cancelled status to waitlist',
  documentTypes: ['workshopSignup'],

  migrate: {
    document(doc) {
      const signup = doc as WorkshopSignupDocument
      const operations = []

      // Remove deprecated cancellation fields
      if (signup.cancellationReason !== undefined) {
        console.log(
          `Removing cancellationReason from signup ${signup._id} (${signup.userEmail})`,
        )
        operations.push(at('cancellationReason', unset()))
      }

      if (signup.cancelledAt !== undefined) {
        console.log(
          `Removing cancelledAt from signup ${signup._id} (${signup.userEmail})`,
        )
        operations.push(at('cancelledAt', unset()))
      }

      // Migrate signupDate to signedUpAt if missing
      if (signup.signupDate && !signup.signedUpAt) {
        console.log(
          `Migrating signupDate to signedUpAt for signup ${signup._id}`,
        )
        operations.push(at('signedUpAt', set(signup.signupDate)))
      }

      // Remove deprecated signupDate field
      if (signup.signupDate !== undefined) {
        console.log(`Removing signupDate from signup ${signup._id}`)
        operations.push(at('signupDate', unset()))
      }

      // Migrate cancelled status to waitlist
      if (signup.status === 'cancelled') {
        console.log(
          `Migrating status from 'cancelled' to 'waitlist' for signup ${signup._id}`,
        )
        operations.push(at('status', set('waitlist')))
      }

      // Set signedUpAt if missing (use current time as fallback)
      if (!signup.signedUpAt) {
        console.warn(
          `Warning: Setting default signedUpAt for signup ${signup._id}`,
        )
        operations.push(at('signedUpAt', set(new Date().toISOString())))
      }

      return operations
    },
  },
})
