import { clientWrite } from '@/lib/sanity/client'
import {
  SponsorTierInput,
  SponsorTierExisting,
  SponsorInput,
  SponsorExisting,
  SponsorEmailTemplate,
} from './types'
import { prepareArrayWithKeys, createReference } from '@/lib/sanity/helpers'
import { scopedFetch } from '@/lib/sanity/scoped'
import {
  getOrganizationRefForCurrentConference,
  organizationField,
} from '@/lib/organization/sanity'

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

/**
 * TENANCY. `sponsorTier` carries a `conference` ref, so `conferenceId` is the
 * tenant boundary and is REQUIRED: the tier is resolved through a scoped point
 * read FIRST and the delete is refused when it does not belong to the caller's
 * conference. Previously this deleted whatever id it was handed — a
 * client-supplied id straight to `transaction.delete` — and cascaded an `unset`
 * across every `sponsorForConference` referencing it, in any tenant.
 */
export async function deleteSponsorTier(
  id: string,
  conferenceId: string,
): Promise<{ error?: Error }> {
  // FAIL CLOSED: no tenant, no query, no delete.
  if (!conferenceId) {
    return {
      error: new Error(
        'deleteSponsorTier: refusing to delete without a resolved conference',
      ),
    }
  }

  try {
    // OWNERSHIP FIRST. A NOT-FOUND-shaped refusal either way, so a foreign id's
    // existence is not distinguishable from a missing one.
    const owned = await scopedFetch<string | null>(
      clientWrite,
      { conferenceId },
      `*[_type == "sponsorTier" && _id == $id][0]._id`,
      { id },
    )
    if (!owned) {
      return { error: new Error('Sponsor tier not found in this conference') }
    }

    // Clear the tier from any sponsor that references it before deleting, so we
    // never leave a dangling reference (which projects to null and would let a
    // tierless sponsor slip onto public surfaces). Referencing sponsors become
    // cleanly tierless: hidden from public, surfaced under "No Tier" in admin.
    // Scoped to the same conference the tier belongs to.
    const referencingSponsorIds = await scopedFetch<string[]>(
      clientWrite,
      { conferenceId },
      `*[_type == "sponsorForConference" && tier._ref == $id]._id`,
      { id },
    )

    const transaction = clientWrite.transaction()
    for (const sponsorId of referencingSponsorIds) {
      transaction.patch(sponsorId, { unset: ['tier'] })
    }
    transaction.delete(id)
    await transaction.commit()

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
    // Stamp the current conference's organization (CaaS T1-1) so the sponsor is
    // born tenant-owned. Best-effort: absent before the 044 backfill.
    const orgRef = await getOrganizationRefForCurrentConference()
    const sponsor = await clientWrite.create({
      _type: 'sponsor',
      name: data.name,
      website: data.website,
      logo: data.logo,
      logoBright: data.logoBright,
      orgNumber: data.orgNumber,
      ...organizationField(orgRef),
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

/**
 * TENANCY. `sponsor` is an ORG-level document (a shared company catalog entry)
 * whose cascade deletes every `sponsorForConference` linking it — across all of
 * the org's editions, which is why the cascade reads below are deliberately NOT
 * conference-scoped. `orgId` is REQUIRED and ownership is proved first.
 *
 * The ownership probe is backfill-independent: it accepts the sponsor's own
 * `organization` key (set on create, backfilled by migration 044) AND the orgs
 * reached through the conferences it is linked to. It refuses unless the
 * caller's org is the ONLY claimant, and refuses a sponsor with NO claimant at
 * all — an orphan legacy row with neither an org key nor a conference link
 * cannot be attributed to a tenant, so it fails closed rather than open.
 */
export async function deleteSponsor(
  id: string,
  orgId: string | null,
): Promise<{ error?: Error }> {
  // FAIL CLOSED: no tenant, no query, no delete.
  if (!orgId) {
    return {
      error: new Error(
        'deleteSponsor: refusing to delete without a resolved organization',
      ),
    }
  }

  try {
    const claim = await clientWrite.fetch<{
      sponsorOrg: string | null
      linkedOrgs: (string | null)[] | null
    }>(
      // Nothing here is returned to the caller — only the comparison result.
      // groq-global: an OWNERSHIP PROBE must see the document whichever tenant owns it; resolving its tenant is the whole point of REFUSING it.
      `{"sponsorOrg": *[_type == "sponsor" && _id == $id][0].organization._ref,
        "linkedOrgs": *[_type == "sponsorForConference" && sponsor._ref == $id].conference->organization._ref
      }`,
      { id },
    )
    const claimants = [claim.sponsorOrg, ...(claim.linkedOrgs ?? [])].filter(
      (o): o is string => Boolean(o),
    )
    if (claimants.length === 0 || claimants.some((o) => o !== orgId)) {
      return { error: new Error('Sponsor not found in this organization') }
    }

    // Find all sponsorForConference records referencing this sponsor. Org-wide
    // by design (see the doc comment): ownership is already proven above, so
    // `sponsor._ref == $id` cannot reach another tenant's rows.
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
        // The inner "is anyone else still using it?" count MUST stay
        // cross-tenant — scoping it would delete an asset another edition or
        // another tenant still references.
        // groq-global: `sanity.fileAsset` carries no tenant key of any kind.
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

/**
 * Tenant filter for the sponsor company pickers (E10).
 *
 * CALLERS MUST FAIL CLOSED FIRST. This helper is only ever reached with a
 * resolved `orgId`; the `null` case is handled by the callers below, which
 * return empty WITHOUT querying. Previously a null org produced an EMPTY clause
 * — an unresolvable tenant read every tenant's sponsor list.
 *
 * NOTE (flagged design question, unchanged here): `!defined(organization)`
 * tolerates org-less legacy sponsors (pre-044 backfill). That tolerance is a
 * documented bridge with an owner decision still pending — whether sponsor
 * companies are a shared catalog or partitioned per-org — and it is NOT touched
 * by this change: dropping it would hide every un-backfilled sponsor from the
 * live deployment. It must be closed (by confirming the 044 backfill ran, then
 * deleting the clause) before a second tenant's sponsors enter the dataset.
 */
function sponsorOrgFilter(orgId: string): {
  clause: string
  params: Record<string, string>
} {
  return {
    clause: ' && (!defined(organization) || organization._ref == $orgId)',
    params: { orgId },
  }
}

export async function searchSponsors(
  query: string,
  orgId: string | null | undefined,
): Promise<{
  sponsors?: SponsorExisting[]
  error?: Error
}> {
  // FAIL CLOSED: an unresolvable org must return nothing, never every tenant's
  // sponsors. No query is issued.
  if (!orgId) {
    return {
      error: new Error(
        'searchSponsors: refusing to search sponsors without a resolved organization',
      ),
    }
  }

  try {
    const { clause, params } = sponsorOrgFilter(orgId)
    const sponsors = await clientWrite.fetch(
      `*[_type == "sponsor" && name match $searchQuery${clause}]{
        _id,
        _createdAt,
        _updatedAt,
        name,
        website,
        logo,
        logoBright
      }`,
      { searchQuery: `${query}*`, ...params },
    )

    return { sponsors }
  } catch (error) {
    return { error: error as Error }
  }
}

export async function getAllSponsors(
  orgId: string | null | undefined,
): Promise<{
  sponsors?: SponsorExisting[]
  error?: Error
}> {
  // FAIL CLOSED: see `searchSponsors`.
  if (!orgId) {
    return {
      error: new Error(
        'getAllSponsors: refusing to list sponsors without a resolved organization',
      ),
    }
  }

  try {
    const { clause, params } = sponsorOrgFilter(orgId)
    const sponsors = await clientWrite.fetch(
      `*[_type == "sponsor"${clause}] | order(name asc){
        _id,
        _createdAt,
        _updatedAt,
        name,
        website,
        logo,
        logoBright,
        linkedinUrl
      }`,
      params,
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

/**
 * Sponsor email templates carry an `organization` ref (CaaS T1-1). Every read
 * and mutation below is TENANT-SCOPED (#616/#19) to the current-domain org so an
 * organizer can only see and modify their OWN org's templates — a cross-tenant
 * read OR write (the worse half) is denied.
 *
 * These paths FAIL CLOSED: `scopedFetch` injects no predicate when `orgId` is
 * null and would degrade to an UNSCOPED global query, re-enabling cross-tenant
 * reads and (via the existence-only mutation guard) foreign-id writes. So an
 * unresolvable tenant returns an EMPTY read result and REJECTS every mutation
 * rather than falling through to a global query.
 */
export async function getSponsorEmailTemplates(): Promise<{
  templates?: SponsorEmailTemplate[]
  error?: Error
}> {
  try {
    const orgId = await getOrganizationRefForCurrentConference()
    // FAIL CLOSED (#616/#19): no tenant → empty list, never a global read.
    if (!orgId) return { templates: [] }
    const templates = await scopedFetch<SponsorEmailTemplate[]>(
      clientWrite,
      { orgId },
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
    const orgId = await getOrganizationRefForCurrentConference()
    // FAIL CLOSED (#616/#19): no tenant → not found, never a global read.
    if (!orgId) return { template: undefined }
    const template = await scopedFetch<SponsorEmailTemplate | null>(
      clientWrite,
      { orgId },
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
    const orgId = await getOrganizationRefForCurrentConference()
    // FAIL CLOSED (#616/#19): no tenant → not found, never a global read.
    if (!orgId) return { template: undefined }
    const template = await scopedFetch<SponsorEmailTemplate | null>(
      clientWrite,
      { orgId },
      `*[_type == "sponsorEmailTemplate" && slug.current == $slug][0] ${EMAIL_TEMPLATE_PROJECTION}`,
      { slug },
    )
    return { template: template ?? undefined }
  } catch (error) {
    return { error: error as Error }
  }
}

/**
 * True when `id` names a sponsorEmailTemplate owned by the current-domain org.
 * The mutation guard (#19): a scoped existence probe that returns false for a
 * FOREIGN org's template, so update/delete/set-default reject rather than
 * silently mutating another tenant's data. FAILS CLOSED: an unresolvable tenant
 * returns `false` (treated as not-owned) so the mutation is rejected — it never
 * degrades to an unscoped existence-only probe that would pass any foreign id.
 */
async function isTemplateInCurrentOrg(id: string): Promise<boolean> {
  const orgId = await getOrganizationRefForCurrentConference()
  // FAIL CLOSED (#616/#19): no tenant → not-owned, so the caller rejects.
  if (!orgId) return false
  const found = await scopedFetch<string | null>(
    clientWrite,
    { orgId },
    `*[_type == "sponsorEmailTemplate" && _id == $id][0]._id`,
    { id },
  )
  return Boolean(found)
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
    // Stamp the current conference's organization (CaaS T1-1) so the template is
    // born tenant-owned. Best-effort: absent before the 044 backfill.
    const orgRef = await getOrganizationRefForCurrentConference()
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
      ...organizationField(orgRef),
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
    // Tenant guard (#19): reject a write to another org's template.
    if (!(await isTemplateInCurrentOrg(id))) {
      return { error: new Error('Sponsor email template not found') }
    }
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
    // Tenant guard (#19): reject a delete of another org's template.
    if (!(await isTemplateInCurrentOrg(id))) {
      return { error: new Error('Sponsor email template not found') }
    }
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
    // Fetch template to derive category server-side (don't trust client).
    // Tenant-scoped (#19): a foreign org's template reads as not-found, so
    // set-default can never toggle another tenant's template.
    const orgId = await getOrganizationRefForCurrentConference()
    // FAIL CLOSED (#616/#19): no tenant → reject, never an unscoped read/write.
    if (!orgId) {
      return { error: new Error('Sponsor email template not found') }
    }
    const current = await scopedFetch<{
      isDefault?: boolean
      category?: string
    } | null>(
      clientWrite,
      { orgId },
      `*[_type == "sponsorEmailTemplate" && _id == $id][0]{ isDefault, category }`,
      { id },
    )
    if (!current) {
      return { error: new Error('Sponsor email template not found') }
    }
    if (!current.category) {
      return { error: new Error('Sponsor email template has no category') }
    }

    // Unset is_default for all OTHER templates in the same category — scoped to
    // this org so a shared category name across tenants can't cross-clear.
    const others = await scopedFetch<{ _id: string }[]>(
      clientWrite,
      { orgId },
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
    // Validate all IDs belong to sponsorEmailTemplate documents OWNED BY this
    // org (#19): a foreign template id is not in `valid`, so reorder rejects it
    // and never re-sorts another tenant's templates.
    const orgId = await getOrganizationRefForCurrentConference()
    // FAIL CLOSED (#616/#19): no tenant → reject, never an unscoped validation
    // that would treat every supplied id as valid and re-sort foreign templates.
    if (!orgId) {
      return { error: new Error('Tenant could not be resolved') }
    }
    const valid = await scopedFetch<{ _id: string }[]>(
      clientWrite,
      { orgId },
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
