import { clientWrite } from '@/lib/sanity/client'
import {
  SponsorTierInput,
  SponsorTierExisting,
  SponsorInput,
  SponsorExisting,
  SponsorEmailTemplate,
} from './types'
import { prepareArrayWithKeys, createReference } from '@/lib/sanity/helpers'

export async function createSponsorTier(
  data: SponsorTierInput & { conference: string },
): Promise<{ sponsorTier?: SponsorTierExisting; error?: Error }> {
  try {
    const sponsorTier = await clientWrite.create({
      _type: 'sponsorTier',
      title: data.title,
      tagline: data.tagline,
      tierType: data.tierType,
      price: prepareArrayWithKeys(data.price, 'price'),
      perks: prepareArrayWithKeys(data.perks, 'perk'),
      soldOut: data.soldOut,
      mostPopular: data.mostPopular,
      maxQuantity: data.maxQuantity,
      conference: createReference(data.conference),
    })

    const result: SponsorTierExisting = {
      _id: sponsorTier._id,
      _createdAt: sponsorTier._createdAt,
      _updatedAt: sponsorTier._updatedAt,
      title: sponsorTier.title,
      tagline: sponsorTier.tagline,
      tierType: sponsorTier.tierType,
      price: sponsorTier.price,
      perks: sponsorTier.perks,
      soldOut: sponsorTier.soldOut,
      mostPopular: sponsorTier.mostPopular,
      maxQuantity: sponsorTier.maxQuantity,
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
    let patch = clientWrite.patch(id).set({
      title: data.title,
      tagline: data.tagline,
      tierType: data.tierType,
      price: prepareArrayWithKeys(data.price, 'price'),
      perks: prepareArrayWithKeys(data.perks, 'perk'),
      soldOut: data.soldOut,
      mostPopular: data.mostPopular,
    })

    if (data.maxQuantity != null) {
      patch = patch.set({ maxQuantity: data.maxQuantity })
    } else {
      patch = patch.unset(['maxQuantity'])
    }

    const sponsorTier = await patch.commit()

    const result: SponsorTierExisting = {
      _id: sponsorTier._id,
      _createdAt: sponsorTier._createdAt,
      _updatedAt: sponsorTier._updatedAt,
      title: sponsorTier.title,
      tagline: sponsorTier.tagline,
      tierType: sponsorTier.tierType,
      price: sponsorTier.price,
      perks: sponsorTier.perks,
      soldOut: sponsorTier.soldOut,
      mostPopular: sponsorTier.mostPopular,
      maxQuantity: sponsorTier.maxQuantity,
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
        tierType,
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
        soldOut,
        mostPopular,
        maxQuantity
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
      logoBright: data.logoBright,
      orgNumber: data.orgNumber,
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
        logoBright: data.logoBright,
        orgNumber: data.orgNumber,
        address: data.address,
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
    // Find all sponsorForConference records referencing this sponsor
    const sfcDocs = await clientWrite.fetch<
      Array<{
        _id: string
        contractAssetRef?: string
      }>
    >(
      `*[_type == "sponsorForConference" && sponsor._ref == $id]{
        _id,
        "contractAssetRef": contractDocument.asset._ref
      }`,
      { id },
    )

    const sfcIds = sfcDocs.map((d) => d._id)

    // Find related activity documents for all sponsorForConference records
    let relatedActivityIds: string[] = []
    if (sfcIds.length > 0) {
      relatedActivityIds = await clientWrite.fetch<string[]>(
        `*[_type == "sponsorActivity" && sponsorForConference._ref in $sfcIds]._id`,
        { sfcIds },
      )
    }

    // Find contract assets that are safe to delete (not referenced by other SFC docs)
    const candidateAssetIds = [
      ...new Set(
        sfcDocs.map((d) => d.contractAssetRef).filter(Boolean) as string[],
      ),
    ]
    let safeAssetIds: string[] = []
    if (candidateAssetIds.length > 0) {
      safeAssetIds = await clientWrite.fetch<string[]>(
        `*[
          _type == "sanity.fileAsset" &&
          _id in $assetIds &&
          count(*[_type == "sponsorForConference" && contractDocument.asset._ref == ^._id && !(sponsor._ref == $id)]) == 0
        ]._id`,
        { assetIds: candidateAssetIds, id },
      )
    }

    const transaction = clientWrite.transaction()
    transaction.delete(id)
    for (const sfcId of sfcIds) {
      transaction.delete(sfcId)
    }
    for (const activityId of relatedActivityIds) {
      transaction.delete(activityId)
    }
    for (const assetId of safeAssetIds) {
      transaction.delete(assetId)
    }
    await transaction.commit()

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
        logoBright
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
        logoBright
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
        logoBright
      }`,
    )

    return { sponsors }
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
  "language": coalesce(language, "no"),
  subject,
  body,
  description,
  isDefault,
  sortOrder
}`

export async function getSponsorEmailTemplates(): Promise<{
  templates?: SponsorEmailTemplate[]
  error?: Error
}> {
  try {
    const templates = await clientWrite.fetch(
      `*[_type == "sponsorEmailTemplate"] | order(category asc, sortOrder asc) ${EMAIL_TEMPLATE_PROJECTION}`,
    )
    return { templates }
  } catch (error) {
    return { error: error as Error }
  }
}

export async function getSponsorEmailTemplate(
  id: string,
): Promise<{ template?: SponsorEmailTemplate; error?: Error }> {
  try {
    const template = await clientWrite.fetch(
      `*[_type == "sponsorEmailTemplate" && _id == $id][0] ${EMAIL_TEMPLATE_PROJECTION}`,
      { id },
    )
    return { template: template ?? undefined }
  } catch (error) {
    return { error: error as Error }
  }
}

export async function getSponsorEmailTemplateBySlug(
  slug: string,
): Promise<{ template?: SponsorEmailTemplate; error?: Error }> {
  try {
    const template = await clientWrite.fetch(
      `*[_type == "sponsorEmailTemplate" && slug.current == $slug][0] ${EMAIL_TEMPLATE_PROJECTION}`,
      { slug },
    )
    return { template: template ?? undefined }
  } catch (error) {
    return { error: error as Error }
  }
}

export async function createSponsorEmailTemplate(data: {
  title: string
  slug: string
  category: string
  language: string
  subject: string
  body?: unknown[]
  description?: string
  isDefault?: boolean
  sortOrder?: number
}): Promise<{ template?: SponsorEmailTemplate; error?: Error }> {
  try {
    const template = await clientWrite.create({
      _type: 'sponsorEmailTemplate',
      title: data.title,
      slug: { _type: 'slug', current: data.slug },
      category: data.category,
      language: data.language,
      subject: data.subject,
      body: data.body,
      description: data.description,
      isDefault: data.isDefault ?? false,
      sortOrder: data.sortOrder ?? 0,
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
    language?: string
    subject?: string
    body?: unknown[]
    description?: string
    isDefault?: boolean
    sortOrder?: number
  },
): Promise<{ template?: SponsorEmailTemplate; error?: Error }> {
  try {
    const patch: Record<string, unknown> = {}
    if (data.title !== undefined) patch.title = data.title
    if (data.slug !== undefined)
      patch.slug = { _type: 'slug', current: data.slug }
    if (data.category !== undefined) patch.category = data.category
    if (data.language !== undefined) patch.language = data.language
    if (data.subject !== undefined) patch.subject = data.subject
    if (data.body !== undefined) patch.body = data.body
    if (data.description !== undefined) patch.description = data.description
    if (data.isDefault !== undefined) patch.isDefault = data.isDefault
    if (data.sortOrder !== undefined) patch.sortOrder = data.sortOrder

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

export async function setDefaultSponsorEmailTemplate(
  id: string,
): Promise<{ error?: Error }> {
  try {
    // Fetch template to derive category server-side (don't trust client)
    const current = await clientWrite.fetch<{
      isDefault?: boolean
      category?: string
    }>(
      `*[_type == "sponsorEmailTemplate" && _id == $id][0]{ isDefault, category }`,
      { id },
    )
    if (!current) {
      return { error: new Error('Sponsor email template not found') }
    }
    if (!current.category) {
      return { error: new Error('Sponsor email template has no category') }
    }

    // Unset is_default for all other templates in the same category
    const others = await clientWrite.fetch<{ _id: string }[]>(
      `*[_type == "sponsorEmailTemplate" && category == $category && _id != $id && isDefault == true]{ _id }`,
      { category: current.category, id },
    )
    const tx = clientWrite.transaction()
    for (const t of others) {
      tx.patch(t._id, (p) => p.set({ isDefault: false }))
    }
    // Toggle: if already default, unset; otherwise set
    tx.patch(id, (p) => p.set({ isDefault: !current.isDefault }))
    await tx.commit()
    return {}
  } catch (error) {
    return { error: error as Error }
  }
}

export async function reorderSponsorEmailTemplates(
  orderedIds: string[],
): Promise<{ error?: Error }> {
  try {
    // Validate all IDs belong to sponsorEmailTemplate documents
    const valid = await clientWrite.fetch<{ _id: string }[]>(
      `*[_type == "sponsorEmailTemplate" && _id in $ids]{ _id }`,
      { ids: orderedIds },
    )
    const validIds = new Set(valid.map((t) => t._id))
    const invalid = orderedIds.filter((id) => !validIds.has(id))
    if (invalid.length > 0) {
      return {
        error: new Error(`Invalid template IDs: ${invalid.join(', ')}`),
      }
    }

    const tx = clientWrite.transaction()
    orderedIds.forEach((id, index) => {
      tx.patch(id, (p) => p.set({ sortOrder: index }))
    })
    await tx.commit()
    return {}
  } catch (error) {
    return { error: error as Error }
  }
}
