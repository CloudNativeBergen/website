import { clientWrite } from '@/lib/sanity/client'
import {
  SponsorTierInput,
  SponsorTierExisting,
  SponsorInput,
  SponsorExisting,
  SponsorEmailTemplate,
} from './types'
import {
  prepareArrayWithKeys,
  createReference,
  addReferenceToArray,
  removeReferenceFromArray,
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
      price: prepareArrayWithKeys(data.price, 'price'),
      perks: prepareArrayWithKeys(data.perks, 'perk'),
      sold_out: data.sold_out,
      most_popular: data.most_popular,
      max_quantity: data.max_quantity,
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
      max_quantity: sponsorTier.max_quantity,
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
        price: prepareArrayWithKeys(data.price, 'price'),
        perks: prepareArrayWithKeys(data.perks, 'perk'),
        sold_out: data.sold_out,
        most_popular: data.most_popular,
        max_quantity: data.max_quantity,
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
      max_quantity: sponsorTier.max_quantity,
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
        most_popular,
        max_quantity
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

export async function createSponsor(
  data: SponsorInput,
): Promise<{ sponsor?: SponsorExisting; error?: Error }> {
  try {
    const sponsor = await clientWrite.create({
      _type: 'sponsor',
      name: data.name,
      website: data.website,
      logo: data.logo,
      logo_bright: data.logo_bright,
      org_number: data.org_number,
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
        logo_bright: data.logo_bright,
        org_number: data.org_number,
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

export async function getSponsor(id: string): Promise<{
  sponsor?: SponsorExisting
  error?: Error
}> {
  try {
    const sponsor = await clientWrite.fetch(
      `*[_type == "sponsor" && _id == $id][0]{
        _id,
        _createdAt,
        _updatedAt,
        name,
        website,
        logo,
        logo_bright
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

export async function searchSponsors(query: string): Promise<{
  sponsors?: SponsorExisting[]
  error?: Error
}> {
  try {
    const sponsors = await clientWrite.fetch(
      `*[_type == "sponsor" && name match $searchQuery]{
        _id,
        _createdAt,
        _updatedAt,
        name,
        website,
        logo,
        logo_bright
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
        logo,
        logo_bright
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

export async function updateSponsorTierAssignment(
  conferenceId: string,
  sponsorName: string,
  newTierId: string,
): Promise<{ error?: Error }> {
  try {
    const sponsor = await clientWrite.fetch(
      `*[_type == "sponsor" && name == $sponsorName][0]{
        _id
      }`,
      { sponsorName },
    )

    if (!sponsor) {
      return { error: new Error('Sponsor not found') }
    }

    const sponsorId = sponsor._id

    const conference = await clientWrite.fetch(
      `*[_type == "conference" && _id == $conferenceId][0]{
        sponsors[sponsor._ref == $sponsorId]{
          _key,
          sponsor,
          tier
        }
      }`,
      { conferenceId, sponsorId },
    )

    if (
      !conference ||
      !conference.sponsors ||
      conference.sponsors.length === 0
    ) {
      return { error: new Error('Sponsor not found in conference') }
    }

    const sponsorEntry = conference.sponsors[0]
    const sponsorKey = sponsorEntry._key

    if (!sponsorKey) {
      return { error: new Error('Sponsor entry missing _key') }
    }

    await clientWrite
      .patch(conferenceId)
      .set({
        [`sponsors[_key == "${sponsorKey}"].tier`]: createReference(newTierId),
      })
      .commit()

    return {}
  } catch (error) {
    return { error: error as Error }
  }
}

const EMAIL_TEMPLATE_PROJECTION = `{
  _id,
  _createdAt,
  _updatedAt,
  title,
  slug,
  category,
  subject,
  body,
  description,
  is_default,
  sort_order
}`

export async function getSponsorEmailTemplates(): Promise<{
  templates?: SponsorEmailTemplate[]
  error?: Error
}> {
  try {
    const templates = await clientWrite.fetch(
      `*[_type == "sponsorEmailTemplate"] | order(category asc, sort_order asc) ${EMAIL_TEMPLATE_PROJECTION}`,
    )
    return { templates }
  } catch (error) {
    return { error: error as Error }
  }
}

export async function createSponsorEmailTemplate(data: {
  title: string
  slug: string
  category: string
  subject: string
  body?: unknown[]
  description?: string
  is_default?: boolean
  sort_order?: number
}): Promise<{ template?: SponsorEmailTemplate; error?: Error }> {
  try {
    const template = await clientWrite.create({
      _type: 'sponsorEmailTemplate',
      title: data.title,
      slug: { _type: 'slug', current: data.slug },
      category: data.category,
      subject: data.subject,
      body: data.body,
      description: data.description,
      is_default: data.is_default ?? false,
      sort_order: data.sort_order ?? 0,
    })
    return { template: template as unknown as SponsorEmailTemplate }
  } catch (error) {
    return { error: error as Error }
  }
}

export async function updateSponsorEmailTemplate(
  id: string,
  data: {
    title?: string
    slug?: string
    category?: string
    subject?: string
    body?: unknown[]
    description?: string
    is_default?: boolean
    sort_order?: number
  },
): Promise<{ template?: SponsorEmailTemplate; error?: Error }> {
  try {
    const patch: Record<string, unknown> = {}
    if (data.title !== undefined) patch.title = data.title
    if (data.slug !== undefined)
      patch.slug = { _type: 'slug', current: data.slug }
    if (data.category !== undefined) patch.category = data.category
    if (data.subject !== undefined) patch.subject = data.subject
    if (data.body !== undefined) patch.body = data.body
    if (data.description !== undefined) patch.description = data.description
    if (data.is_default !== undefined) patch.is_default = data.is_default
    if (data.sort_order !== undefined) patch.sort_order = data.sort_order

    const template = await clientWrite.patch(id).set(patch).commit()
    return { template: template as unknown as SponsorEmailTemplate }
  } catch (error) {
    return { error: error as Error }
  }
}

export async function deleteSponsorEmailTemplate(
  id: string,
): Promise<{ error?: Error }> {
  try {
    await clientWrite.delete(id)
    return {}
  } catch (error) {
    return { error: error as Error }
  }
}
