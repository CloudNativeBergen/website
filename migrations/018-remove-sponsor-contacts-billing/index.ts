import { defineMigration, at, unset } from 'sanity/migrate'

export default defineMigration({
  title: 'Remove contact_persons and billing from sponsor documents',
  description:
    'Removes the deprecated contact_persons and billing fields from sponsor documents. This data has been migrated to sponsorForConference documents by migration 017.',
  documentTypes: ['sponsor'],

  migrate: {
    document(doc) {
      const sponsor = doc as unknown as {
        _id: string
        name?: string
        contact_persons?: unknown[]
        billing?: unknown
      }

      const hasContacts =
        Array.isArray(sponsor.contact_persons) &&
        sponsor.contact_persons.length > 0
      const hasBilling = sponsor.billing != null

      if (!hasContacts && !hasBilling) {
        return []
      }

      const mutations = []

      if (hasContacts) {
        mutations.push(at('contact_persons', unset()))
      }

      if (hasBilling) {
        mutations.push(at('billing', unset()))
      }

      console.log(
        `  ✓ Removing ${hasContacts ? 'contact_persons' : ''}${hasContacts && hasBilling ? ' + ' : ''}${hasBilling ? 'billing' : ''} from ${sponsor.name || sponsor._id}`,
      )

      return mutations
    },
  },
})
