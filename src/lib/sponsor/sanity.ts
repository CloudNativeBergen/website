import { clientWrite } from '@/lib/sanity/client'
import {
  SponsorTierInput,
  SponsorTierExisting,
  SponsorInput,
  SponsorExisting,
} from './types'

/**
 * Type for sponsor reference in Sanity documents
 */
interface SponsorReference {
  _key?: string
  sponsor?: {
    _ref: string
    _type: string
  }
  tier?: {
    _ref: string
    _type: string
  }
}

/**
 * Generate a unique key for Sanity array items
 */
function generateKey(prefix: string = 'sponsor'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

export async function createSponsorTier(
  data: SponsorTierInput & { conference: string },
): Promise<{ sponsorTier?: SponsorTierExisting; error?: Error }> {
  try {
    const sponsorTier = await clientWrite.create({
      _type: 'sponsorTier',
      title: data.title,
      tagline: data.tagline,
      tier_type: data.tier_type,
      price: data.tier_type === 'standard' ? data.price : undefined,
      perks: data.perks,
      sold_out: data.sold_out,
      most_popular: data.most_popular,
      conference: {
        _type: 'reference',
        _ref: data.conference,
      },
    })

    const result: SponsorTierExisting = {
      _id: sponsorTier._id,
      _createdAt: sponsorTier._createdAt,
      _updatedAt: sponsorTier._updatedAt,
      title: sponsorTier.title,
      tagline: sponsorTier.tagline,
      tier_type: sponsorTier.tier_type,
      price: sponsorTier.price,
      perks: sponsorTier.perks,
      sold_out: sponsorTier.sold_out,
      most_popular: sponsorTier.most_popular,
    }

    return { sponsorTier: result }
  } catch (error) {
    return { error: error as Error }
  }
}

export async function updateSponsorTier(
  id: string,
  data: SponsorTierInput,
): Promise<{ sponsorTier?: SponsorTierExisting; error?: Error }> {
  try {
    const sponsorTier = await clientWrite
      .patch(id)
      .set({
        title: data.title,
        tagline: data.tagline,
        tier_type: data.tier_type,
        price: data.tier_type === 'standard' ? data.price : undefined,
        perks: data.perks,
        sold_out: data.sold_out,
        most_popular: data.most_popular,
      })
      .commit()

    const result: SponsorTierExisting = {
      _id: sponsorTier._id,
      _createdAt: sponsorTier._createdAt,
      _updatedAt: sponsorTier._updatedAt,
      title: sponsorTier.title,
      tagline: sponsorTier.tagline,
      tier_type: sponsorTier.tier_type,
      price: sponsorTier.price,
      perks: sponsorTier.perks,
      sold_out: sponsorTier.sold_out,
      most_popular: sponsorTier.most_popular,
    }

    return { sponsorTier: result }
  } catch (error) {
    return { error: error as Error }
  }
}

export async function deleteSponsorTier(
  id: string,
): Promise<{ error?: Error }> {
  try {
    await clientWrite.delete(id)
    return {}
  } catch (error) {
    return { error: error as Error }
  }
}

export async function getSponsorTier(
  id: string,
): Promise<{ sponsorTier?: SponsorTierExisting; error?: Error }> {
  try {
    const sponsorTier = await clientWrite.fetch(
      `*[_type == "sponsorTier" && _id == $id][0]{
        _id,
        _createdAt,
        _updatedAt,
        title,
        tagline,
        tier_type,
        price,
        perks,
        sold_out,
        most_popular
      }`,
      { id },
    )

    if (!sponsorTier) {
      return { error: new Error('Sponsor tier not found') }
    }

    return { sponsorTier }
  } catch (error) {
    return { error: error as Error }
  }
}

// Sponsor functions
export async function createSponsor(
  data: SponsorInput,
): Promise<{ sponsor?: SponsorExisting; error?: Error }> {
  try {
    const sponsor = await clientWrite.create({
      _type: 'sponsor',
      name: data.name,
      website: data.website,
      logo: data.logo,
    })

    const result: SponsorExisting = {
      _id: sponsor._id,
      _createdAt: sponsor._createdAt,
      _updatedAt: sponsor._updatedAt,
      name: sponsor.name,
      website: sponsor.website,
      logo: sponsor.logo,
    }

    return { sponsor: result }
  } catch (error) {
    return { error: error as Error }
  }
}

export async function updateSponsor(
  id: string,
  data: SponsorInput,
): Promise<{ sponsor?: SponsorExisting; error?: Error }> {
  try {
    const sponsor = await clientWrite
      .patch(id)
      .set({
        name: data.name,
        website: data.website,
        logo: data.logo,
      })
      .commit()

    const result: SponsorExisting = {
      _id: sponsor._id,
      _createdAt: sponsor._createdAt,
      _updatedAt: sponsor._updatedAt,
      name: sponsor.name,
      website: sponsor.website,
      logo: sponsor.logo,
    }

    return { sponsor: result }
  } catch (error) {
    return { error: error as Error }
  }
}

export async function deleteSponsor(id: string): Promise<{ error?: Error }> {
  try {
    await clientWrite.delete(id)
    return {}
  } catch (error) {
    return { error: error as Error }
  }
}

export async function getSponsor(
  id: string,
): Promise<{ sponsor?: SponsorExisting; error?: Error }> {
  try {
    const sponsor = await clientWrite.fetch(
      `*[_type == "sponsor" && _id == $id][0]{
        _id,
        _createdAt,
        _updatedAt,
        name,
        website,
        logo
      }`,
      { id },
    )

    if (!sponsor) {
      return { error: new Error('Sponsor not found') }
    }

    return { sponsor }
  } catch (error) {
    return { error: error as Error }
  }
}

export async function searchSponsors(
  query: string,
): Promise<{ sponsors?: SponsorExisting[]; error?: Error }> {
  try {
    const sponsors = await clientWrite.fetch(
      `*[_type == "sponsor" && name match $searchQuery]{
        _id,
        _createdAt,
        _updatedAt,
        name,
        website,
        logo
      }`,
      { searchQuery: `${query}*` },
    )

    return { sponsors }
  } catch (error) {
    return { error: error as Error }
  }
}

export async function getAllSponsors(): Promise<{
  sponsors?: SponsorExisting[]
  error?: Error
}> {
  try {
    const sponsors = await clientWrite.fetch(
      `*[_type == "sponsor"] | order(name asc){
        _id,
        _createdAt,
        _updatedAt,
        name,
        website,
        logo
      }`,
    )

    return { sponsors }
  } catch (error) {
    return { error: error as Error }
  }
}

export async function addSponsorToConference(
  conferenceId: string,
  sponsorId: string,
  tierId: string,
): Promise<{ error?: Error }> {
  try {
    // First, get the current conference data
    const conference = await clientWrite.fetch(
      `*[_type == "conference" && _id == $conferenceId][0]{
        _id,
        sponsors
      }`,
      { conferenceId },
    )

    if (!conference) {
      return { error: new Error('Conference not found') }
    }

    // Check if sponsor is already in this conference
    const existingSponsors = conference.sponsors || []
    const existingSponsor = existingSponsors.find(
      (s: SponsorReference) => s.sponsor?._ref === sponsorId,
    )

    if (existingSponsor) {
      return { error: new Error('Sponsor is already added to this conference') }
    }

    // Ensure all existing sponsors have _key properties
    const sponsorsWithKeys = existingSponsors.map((s: SponsorReference) => ({
      ...s,
      _key: s._key || generateKey(),
    }))

    // Add the new sponsor
    const updatedSponsors = [
      ...sponsorsWithKeys,
      {
        _key: generateKey(),
        sponsor: {
          _type: 'reference',
          _ref: sponsorId,
        },
        tier: {
          _type: 'reference',
          _ref: tierId,
        },
      },
    ]

    await clientWrite
      .patch(conferenceId)
      .set({ sponsors: updatedSponsors })
      .commit()

    return {}
  } catch (error) {
    return { error: error as Error }
  }
}

export async function removeSponsorFromConference(
  conferenceId: string,
  sponsorId: string,
): Promise<{ error?: Error }> {
  try {
    // First, get the current conference data
    const conference = await clientWrite.fetch(
      `*[_type == "conference" && _id == $conferenceId][0]{
        _id,
        sponsors
      }`,
      { conferenceId },
    )

    if (!conference) {
      return { error: new Error('Conference not found') }
    }

    // Remove the sponsor and ensure remaining ones have _key properties
    const existingSponsors = conference.sponsors || []
    const updatedSponsors = existingSponsors
      .filter((s: SponsorReference) => s.sponsor?._ref !== sponsorId)
      .map((s: SponsorReference) => ({
        ...s,
        _key: s._key || generateKey(),
      }))

    await clientWrite
      .patch(conferenceId)
      .set({ sponsors: updatedSponsors })
      .commit()

    return {}
  } catch (error) {
    return { error: error as Error }
  }
}

export async function fixSponsorKeys(
  conferenceId: string,
): Promise<{ error?: Error }> {
  try {
    // Get the current conference data
    const conference = await clientWrite.fetch(
      `*[_type == "conference" && _id == $conferenceId][0]{
        _id,
        sponsors
      }`,
      { conferenceId },
    )

    if (!conference) {
      return { error: new Error('Conference not found') }
    }

    // Ensure all sponsors have _key properties
    const existingSponsors = conference.sponsors || []
    const sponsorsWithKeys = existingSponsors.map((s: SponsorReference) => ({
      ...s,
      _key: s._key || generateKey(),
    }))

    // Update the conference with sponsors that have keys
    await clientWrite
      .patch(conferenceId)
      .set({ sponsors: sponsorsWithKeys })
      .commit()

    return {}
  } catch (error) {
    return { error: error as Error }
  }
}
