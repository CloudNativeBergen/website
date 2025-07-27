import { clientWrite } from '@/lib/sanity/client'
import {
  SponsorTierInput,
  SponsorTierExisting,
  SponsorInput,
  SponsorExisting,
  SponsorWithContactInfo,
} from './types'
import {
  prepareArrayWithKeys,
  createReference,
  addReferenceToArray,
  removeReferenceFromArray,
  fixArrayKeys,
} from '@/lib/sanity/helpers'

export async function createSponsorTier(
  data: SponsorTierInput & { conference: string },
): Promise<{ sponsorTier?: SponsorTierExisting; error?: Error }> {
  try {
    const sponsorTier = await clientWrite.create({
      _type: 'sponsorTier',
      title: data.title,
      tagline: data.tagline,
      tier_type: data.tier_type,
      price:
        data.tier_type === 'standard'
          ? prepareArrayWithKeys(data.price, 'price')
          : undefined,
      perks: prepareArrayWithKeys(data.perks, 'perk'),
      sold_out: data.sold_out,
      most_popular: data.most_popular,
      conference: createReference(data.conference),
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
        price:
          data.tier_type === 'standard'
            ? prepareArrayWithKeys(data.price, 'price')
            : undefined,
        perks: prepareArrayWithKeys(data.perks, 'perk'),
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
        price[]{
          _key,
          amount,
          currency
        },
        perks[]{
          _key,
          label,
          description
        },
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
): Promise<{ sponsor?: SponsorWithContactInfo; error?: Error }> {
  try {
    const sponsor = await clientWrite.create({
      _type: 'sponsor',
      name: data.name,
      website: data.website,
      logo: data.logo,
      org_number: data.org_number,
      contact_persons: data.contact_persons
        ? prepareArrayWithKeys(data.contact_persons, 'contact')
        : undefined,
      billing: data.billing,
    })

    const result: SponsorWithContactInfo = {
      _id: sponsor._id,
      _createdAt: sponsor._createdAt,
      _updatedAt: sponsor._updatedAt,
      name: sponsor.name,
      website: sponsor.website,
      logo: sponsor.logo,
      org_number: sponsor.org_number,
      contact_persons: sponsor.contact_persons,
      billing: sponsor.billing,
    }

    return { sponsor: result }
  } catch (error) {
    return { error: error as Error }
  }
}

export async function updateSponsor(
  id: string,
  data: SponsorInput,
): Promise<{ sponsor?: SponsorWithContactInfo; error?: Error }> {
  try {
    const sponsor = await clientWrite
      .patch(id)
      .set({
        name: data.name,
        website: data.website,
        logo: data.logo,
        org_number: data.org_number,
        contact_persons: data.contact_persons
          ? prepareArrayWithKeys(data.contact_persons, 'contact')
          : undefined,
        billing: data.billing,
      })
      .commit()

    const result: SponsorWithContactInfo = {
      _id: sponsor._id,
      _createdAt: sponsor._createdAt,
      _updatedAt: sponsor._updatedAt,
      name: sponsor.name,
      website: sponsor.website,
      logo: sponsor.logo,
      org_number: sponsor.org_number,
      contact_persons: sponsor.contact_persons,
      billing: sponsor.billing,
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
  includeContactInfo: boolean = false,
): Promise<{
  sponsor?: SponsorExisting | SponsorWithContactInfo
  error?: Error
}> {
  try {
    const fields = includeContactInfo
      ? `_id,
        _createdAt,
        _updatedAt,
        name,
        website,
        logo,
        org_number,
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
        }`
      : `_id,
        _createdAt,
        _updatedAt,
        name,
        website,
        logo`

    const sponsor = await clientWrite.fetch(
      `*[_type == "sponsor" && _id == $id][0]{
        ${fields}
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
  includeContactInfo: boolean = false,
): Promise<{
  sponsors?: SponsorExisting[] | SponsorWithContactInfo[]
  error?: Error
}> {
  try {
    const fields = includeContactInfo
      ? `_id,
        _createdAt,
        _updatedAt,
        name,
        website,
        logo,
        org_number,
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
        }`
      : `_id,
        _createdAt,
        _updatedAt,
        name,
        website,
        logo`

    const sponsors = await clientWrite.fetch(
      `*[_type == "sponsor" && name match $searchQuery]{
        ${fields}
      }`,
      { searchQuery: `${query}*` },
    )

    return { sponsors }
  } catch (error) {
    return { error: error as Error }
  }
}

export async function getAllSponsors(
  includeContactInfo: boolean = false,
): Promise<{
  sponsors?: SponsorExisting[] | SponsorWithContactInfo[]
  error?: Error
}> {
  try {
    const fields = includeContactInfo
      ? `_id,
        _createdAt,
        _updatedAt,
        name,
        website,
        logo,
        org_number,
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
        }`
      : `_id,
        _createdAt,
        _updatedAt,
        name,
        website,
        logo`

    const sponsors = await clientWrite.fetch(
      `*[_type == "sponsor"] | order(name asc){
        ${fields}
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
  return await addReferenceToArray(
    conferenceId,
    'sponsors',
    sponsorId,
    {
      sponsor: createReference(sponsorId),
      tier: createReference(tierId),
    },
    'sponsor',
  )
}

export async function removeSponsorFromConference(
  conferenceId: string,
  sponsorId: string,
): Promise<{ error?: Error }> {
  return await removeReferenceFromArray(
    conferenceId,
    'sponsors',
    sponsorId,
    'sponsor',
  )
}

export async function fixSponsorKeys(): Promise<{ error?: Error }> {
  return await fixArrayKeys('conference', [
    { field: 'sponsors', prefix: 'sponsor' },
  ])
}

export async function fixSponsorTierArrayKeys(): Promise<{
  error?: Error
  fixed?: number
}> {
  return await fixArrayKeys('sponsorTier', [
    { field: 'price', prefix: 'price' },
    { field: 'perks', prefix: 'perk' },
  ])
}
