import { defineMigration, at, set } from 'sanity/migrate'

interface Sponsor {
  _id: string
  name?: string
  contact_persons?: Array<{
    _key: string
    name: string
    email: string
    phone?: string
    role?: string
  }>
  billing?: {
    email: string
    reference?: string
    comments?: string
  }
}

export default defineMigration({
  title:
    'Move contact_persons and billing from sponsor to sponsorForConference',
  description:
    'Copies contact_persons[] and billing from each referenced sponsor document into the sponsorForConference document. Adds is_primary=true to the first contact. Skips documents that already have the field populated to avoid overwriting data set directly on the CRM record.',
  documentTypes: ['sponsorForConference'],

  migrate: {
    async document(doc, context) {
      const sfcDoc = doc as unknown as {
        _id: string
        sponsor?: { _ref: string }
        contact_persons?: unknown[]
        billing?: unknown
      }

      if (!sfcDoc.sponsor?._ref) {
        return []
      }

      const hasContacts =
        Array.isArray(sfcDoc.contact_persons) &&
        sfcDoc.contact_persons.length > 0
      const hasBilling =
        sfcDoc.billing != null &&
        typeof sfcDoc.billing === 'object' &&
        'email' in (sfcDoc.billing as Record<string, unknown>)

      // Skip if both fields are already populated
      if (hasContacts && hasBilling) {
        return []
      }

      const sponsor = await context.client.fetch<Sponsor>(
        `*[_type == "sponsor" && _id == $id][0]{
          _id,
          name,
          contact_persons[]{
            _key,
            name,
            email,
            phone,
            role
          },
          billing{
            email,
            reference,
            comments
          }
        }`,
        { id: sfcDoc.sponsor._ref },
      )

      if (!sponsor) {
        console.log(`  ⚠ Sponsor ${sfcDoc.sponsor._ref} not found, skipping`)
        return []
      }

      const setIfMissingFields: Record<string, unknown> = {}

      // Copy contact_persons with is_primary on first contact
      if (
        !hasContacts &&
        sponsor.contact_persons &&
        sponsor.contact_persons.length > 0
      ) {
        setIfMissingFields.contact_persons = sponsor.contact_persons.map(
          (contact, index) => ({
            ...contact,
            is_primary: index === 0,
          }),
        )
      }

      // Copy billing
      if (!hasBilling && sponsor.billing) {
        setIfMissingFields.billing = sponsor.billing
      }

      if (Object.keys(setIfMissingFields).length === 0) {
        return []
      }

      const contactCount =
        (setIfMissingFields.contact_persons as unknown[])?.length ?? 0
      console.log(
        `  ✓ Copying ${contactCount} contacts and ${setIfMissingFields.billing ? 'billing' : 'no billing'} for ${sponsor.name || sponsor._id}`,
      )

      const mutations = []

      if (setIfMissingFields.contact_persons) {
        mutations.push(
          at('contact_persons', set(setIfMissingFields.contact_persons)),
        )
      }

      if (setIfMissingFields.billing) {
        mutations.push(at('billing', set(setIfMissingFields.billing)))
      }

      return mutations
    },
  },
})
