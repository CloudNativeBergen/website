import { defineMigration, createIfNotExists } from 'sanity/migrate'

interface Conference {
  _id: string
  _createdAt: string
  title: string
  sponsors?: Array<{
    sponsor: { _ref: string }
    tier?: { _ref: string }
  }>
}

interface SponsorTier {
  price?: Array<{
    amount: number
    currency: string
  }>
}

export default defineMigration({
  title: 'Reconcile conference.sponsors[] with sponsorForConference documents',
  description:
    'Ensures every entry in conference.sponsors[] has a corresponding sponsorForConference document with status "closed-won". ' +
    'This handles any data drift since migration 014 initially created sponsorForConference documents.',
  documentTypes: ['conference'],

  migrate: {
    async document(doc, context) {
      const conference = doc as unknown as Conference

      if (!conference.sponsors || conference.sponsors.length === 0) {
        return []
      }

      console.log(`\nReconciling conference: ${conference.title}`)
      console.log(`  Inline sponsors: ${conference.sponsors.length}`)

      const mutations = []
      let created = 0
      let skipped = 0

      for (const sponsorEntry of conference.sponsors) {
        if (!sponsorEntry.sponsor?._ref) {
          console.warn(`  ⚠ Skipping entry with no sponsor reference`)
          continue
        }

        try {
          const existing = await context.client.fetch(
            `*[_type == "sponsorForConference" && sponsor._ref == $sponsorRef && conference._ref == $conferenceRef][0]{ _id, status }`,
            {
              sponsorRef: sponsorEntry.sponsor._ref,
              conferenceRef: conference._id,
            },
          )

          if (existing) {
            skipped++
            continue
          }

          let contractValue: number | undefined
          let contractCurrency = 'NOK'

          if (sponsorEntry.tier?._ref) {
            const tier = await context.client.fetch<SponsorTier>(
              `*[_type == "sponsorTier" && _id == $tierId][0]{price}`,
              { tierId: sponsorEntry.tier._ref },
            )

            if (tier?.price && tier.price.length > 0) {
              contractValue = tier.price[0].amount
              contractCurrency = tier.price[0].currency
            }
          }

          const newDocId = `sponsorForConf-${conference._id}-${sponsorEntry.sponsor._ref}`

          const newDoc = {
            _id: newDocId,
            _type: 'sponsorForConference',
            sponsor: sponsorEntry.sponsor,
            conference: { _type: 'reference', _ref: conference._id },
            tier: sponsorEntry.tier || undefined,
            status: 'closed-won' as const,
            contract_status: 'none' as const,
            contract_signed_at: conference._createdAt,
            contract_value: contractValue,
            contract_currency: contractCurrency,
            invoice_status: 'paid' as const,
            invoice_paid_at: conference._createdAt,
          }

          mutations.push(createIfNotExists(newDoc))
          created++
          console.log(
            `  ✓ Will create missing sponsorForConference for sponsor ${sponsorEntry.sponsor._ref}`,
          )
        } catch (error) {
          console.error(
            `  ✗ Failed to process sponsor ${sponsorEntry.sponsor._ref}: ${error}`,
          )
        }
      }

      console.log(`  Summary: ${created} to create, ${skipped} already exist`)
      return mutations
    },
  },
})
