import { at, defineMigration, set } from 'sanity/migrate'

interface SponsorTier {
  _id: string
  _type: 'sponsorTier'
  title: string
  tier_type?: string
  price?: Array<{ amount: number; currency: string }>
}

export default defineMigration({
  title: 'Add default tier_type to sponsorTier documents missing it',
  documentTypes: ['sponsorTier'],

  migrate: {
    document(doc, context) {
      const tier = doc as unknown as SponsorTier
      const operations = []

      // Add default tier_type if missing
      if (!tier.tier_type) {
        // Determine tier type based on presence of price
        // If it has a price, it's a standard sponsor
        // If no price, it's likely a special sponsor (media, community, etc.)
        const tierType =
          tier.price && tier.price.length > 0 ? 'standard' : 'special'

        console.log(
          `Adding tier_type '${tierType}' to sponsorTier ${tier._id} (${tier.title})`,
        )
        operations.push(at('tier_type', set(tierType)))
      }

      return operations
    },
  },
})
