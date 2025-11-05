import { defineMigration, at, setIfMissing, set } from 'sanity/migrate'

const MIGRATION_TITLE = 'Add contract_status field to sponsorForConference'

export default defineMigration({
  title: MIGRATION_TITLE,
  documentTypes: ['sponsorForConference'],

  migrate: {
    document(doc, context) {
      const status = doc.status
      const hasContractSignedAt = !!doc.contract_signed_at

      let contractStatus: string

      if (status === 'closed-won') {
        if (hasContractSignedAt) {
          contractStatus = 'contract-signed'
        } else {
          contractStatus = 'none'
        }
      } else if (status === 'negotiating') {
        contractStatus = 'verbal-agreement'
      } else {
        contractStatus = 'none'
      }

      return [
        at('contract_status', setIfMissing(contractStatus)),
        at('legacy_synced_at', set(null)),
      ]
    },
  },
})
