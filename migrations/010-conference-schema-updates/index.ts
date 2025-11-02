import { at, defineMigration, unset } from 'sanity/migrate'

interface Conference {
  _id: string
  _type: 'conference'
  title: string
  coc_link?: string
  cfp_email?: string
  domains?: string[]
  formats?: string[]
  topics?: Array<{ _ref: string }>
}

export default defineMigration({
  title:
    'Remove deprecated coc_link field from conferences (moved to site-wide config)',
  documentTypes: ['conference'],

  migrate: {
    document(doc, context) {
      const conference = doc as unknown as Conference
      const operations = []

      // Remove deprecated coc_link field
      if (conference.coc_link !== undefined) {
        console.log(
          `Removing deprecated coc_link from conference ${conference._id} (${conference.title})`,
        )
        operations.push(at('coc_link', unset()))
      }

      return operations
    },
  },
})
