import { defineMigration, createIfNotExists } from 'sanity/migrate'
import { SanityClient } from '@sanity/client'

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
  title:
    'Create sponsorForConference documents from existing conference sponsors',
  description:
    'Creates sponsorForConference documents for all existing conference.sponsors[] entries. Sets default status to "closed-won", invoice_status to "paid", and copies tier pricing information. Preserves the original conference.sponsors[] array for backward compatibility.',
  documentTypes: ['conference'],

  migrate: {
    async document(doc, context) {
      const conference = doc as unknown as Conference

      if (!conference.sponsors || conference.sponsors.length === 0) {
        return []
      }

      console.log(`\nProcessing conference: ${conference.title}`)
      console.log(`  Sponsors to migrate: ${conference.sponsors.length}`)

      const mutations = []

      for (const sponsorEntry of conference.sponsors) {
        try {
          // Check if sponsorForConference already exists
          const existing = await context.client.fetch(
            `*[_type == "sponsorForConference" && sponsor._ref == $sponsorRef && conference._ref == $conferenceRef][0]`,
            {
              sponsorRef: sponsorEntry.sponsor._ref,
              conferenceRef: conference._id,
            },
          )

          if (existing) {
            console.log(`  - Skipping existing: ${sponsorEntry.sponsor._ref}`)
            continue
          }

          // Fetch tier information to get pricing
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

          // Generate a unique ID for the new document
          const newDocId = `sponsorForConf-${conference._id}-${sponsorEntry.sponsor._ref}`

          // Create sponsorForConference document
          const newDoc = {
            _id: newDocId,
            _type: 'sponsorForConference',
            sponsor: sponsorEntry.sponsor,
            conference: { _type: 'reference', _ref: conference._id },
            tier: sponsorEntry.tier,
            status: 'closed-won' as const,
            contract_signed_at: conference._createdAt,
            contract_value: contractValue,
            contract_currency: contractCurrency,
            invoice_status: 'paid' as const,
            invoice_paid_at: conference._createdAt,
          }

          mutations.push(createIfNotExists(newDoc))
          console.log(`  ✓ Will create: ${sponsorEntry.sponsor._ref}`)
        } catch (error) {
          console.error(
            `  ✗ Failed to prepare sponsor ${sponsorEntry.sponsor._ref}: ${error}`,
          )
        }
      }

      return mutations
    },
  },
})

// Migration runner function (to be called via migration script)
export async function runMigration(client: SanityClient) {
  console.log('Starting migration: Create sponsorForConference documents')

  // Fetch all conferences with sponsors
  const conferences = await client.fetch<Conference[]>(`
    *[_type == "conference" && count(sponsors) > 0]{
      _id,
      _createdAt,
      title,
      sponsors[]{
        sponsor,
        tier
      }
    }
  `)

  console.log(`Found ${conferences.length} conferences with sponsors`)

  let totalCreated = 0
  let totalSkipped = 0
  const errors: string[] = []

  for (const conference of conferences) {
    console.log(`\nProcessing conference: ${conference.title}`)
    console.log(`  Sponsors to migrate: ${conference.sponsors?.length || 0}`)

    if (!conference.sponsors || conference.sponsors.length === 0) {
      continue
    }

    for (const sponsorEntry of conference.sponsors) {
      try {
        // Check if sponsorForConference already exists
        const existing = await client.fetch(
          `*[_type == "sponsorForConference" && sponsor._ref == $sponsorRef && conference._ref == $conferenceRef][0]`,
          {
            sponsorRef: sponsorEntry.sponsor._ref,
            conferenceRef: conference._id,
          },
        )

        if (existing) {
          console.log(`  - Skipping existing: ${sponsorEntry.sponsor._ref}`)
          totalSkipped++
          continue
        }

        // Fetch tier information to get pricing
        let contractValue: number | undefined
        let contractCurrency = 'NOK'

        if (sponsorEntry.tier?._ref) {
          const tier = await client.fetch<SponsorTier>(
            `*[_type == "sponsorTier" && _id == $tierId][0]{price}`,
            { tierId: sponsorEntry.tier._ref },
          )

          if (tier?.price && tier.price.length > 0) {
            contractValue = tier.price[0].amount
            contractCurrency = tier.price[0].currency
          }
        }

        // Create sponsorForConference document
        const newDoc = {
          _type: 'sponsorForConference',
          sponsor: sponsorEntry.sponsor,
          conference: { _type: 'reference', _ref: conference._id },
          tier: sponsorEntry.tier,
          status: 'closed-won',
          contract_signed_at: conference._createdAt,
          contract_value: contractValue,
          contract_currency: contractCurrency,
          invoice_status: 'paid',
          invoice_paid_at: conference._createdAt,
        }

        await client.create(newDoc)
        console.log(`  ✓ Created: ${sponsorEntry.sponsor._ref}`)
        totalCreated++
      } catch (error) {
        const errorMsg = `Failed to migrate sponsor ${sponsorEntry.sponsor._ref} for conference ${conference.title}: ${error}`
        console.error(`  ✗ ${errorMsg}`)
        errors.push(errorMsg)
      }
    }
  }

  console.log('\n=== Migration Summary ===')
  console.log(`Total created: ${totalCreated}`)
  console.log(`Total skipped: ${totalSkipped}`)
  console.log(`Errors: ${errors.length}`)

  if (errors.length > 0) {
    console.log('\nErrors encountered:')
    errors.forEach((err) => console.log(`  - ${err}`))
  }

  return {
    created: totalCreated,
    skipped: totalSkipped,
    errors,
  }
}
