import {
  clientWrite,
  clientReadUncached as clientRead,
} from '@/lib/sanity/client'
import { prepareArrayWithKeys } from '@/lib/sanity/helpers'
import { scopedFetch } from '@/lib/sanity/scoped'
import { tierExistenceQuery } from './tier-validation'
import type { ConferenceSponsor } from '@/lib/sponsor/types'
import type {
  SponsorForConference,
  SponsorForConferenceExpanded,
  SponsorForConferenceInput,
  CopySponsorsParams,
  CopySponsorsResult,
  ImportAllHistoricSponsorsParams,
  ImportAllHistoricSponsorsResult,
  SponsorStatus,
  SponsorTag,
} from './types'

const SPONSOR_FOR_CONFERENCE_FIELDS = `
  _id,
  _createdAt,
  _updatedAt,
  sponsor->{
    _id,
    name,
    website,
    logo,
    logoBright,
    orgNumber,
    address,
    linkedinUrl
  },
  conference->{
    _id,
    title,
    organizer,
    organizerOrgNumber,
    organizerAddress,
    signingProvider,
    city,
    venueName,
    venueAddress,
    startDate,
    endDate,
    sponsorEmail,
    domains,
    socialLinks,
    logoBright,
    theme,
    organization
  },
  tier->{
    _id,
    title,
    tagline,
    tierType,
    price[]{
      _key,
      amount,
      currency
    }
  },
  addons[]->{
    _id,
    title,
    tierType,
    price[]{
      _key,
      amount,
      currency
    }
  },
  status,
  contractStatus,
  signatureStatus,
  signatureId,
  signerName,
  signerEmail,
  signingUrl,
  contractSentAt,
  contractDocument{
    asset->{
      _ref,
      url
    }
  },
  reminderCount,
  contractTemplate->{
    _id,
    title
  },
  assignedTo->{
    _id,
    name,
    email,
    "image": coalesce(image.asset->url, imageURL)
  },
  contactInitiatedAt,
  contractSignedAt,
  organizerSignedAt,
  organizerSignedBy,
  contractValue,
  contractCurrency,
  invoiceStatus,
  invoiceSentAt,
  invoicePaidAt,
  tags,
  contactPersons[]{
    _key,
    name,
    email,
    phone,
    role,
    linkedinUrl,
    isPrimary
  },
  billing{
    invoiceFormat,
    email,
    reference,
    comments
  },
  registrationToken,
  registrationComplete,
  registrationCompletedAt,
  nextFollowUpAt,
  outreachCount,
  "lastActivity": *[_type == "sponsorActivity" && sponsorForConference._ref == ^._id] | order(createdAt desc)[0]{
    activityType,
    description,
    createdAt,
    createdBy->{ _id, name }
  },
  "activityCount": count(*[_type == "sponsorActivity" && sponsorForConference._ref == ^._id])
`

export async function getPublicSponsorsForConference(
  conferenceId: string,
): Promise<ConferenceSponsor[]> {
  return clientRead.fetch<ConferenceSponsor[]>(
    `*[_type == "sponsorForConference" && conference._ref == $conferenceId && status == "closed-won"]
      | order(tier->tierType asc, tier->price[0].amount desc, tier->title asc){
      "_sfcId": _id,
      sponsor->{
        _id,
        name,
        website,
        logo,
        logoBright,
      },
      tier->{
        _id,
        title,
        tagline,
        tierType,
        price[]{
          _key,
          amount,
          currency
        }
      }
    }`,
    { conferenceId },
  )
}

export async function createSponsorForConference(
  data: SponsorForConferenceInput,
): Promise<{
  sponsorForConference?: SponsorForConferenceExpanded
  error?: Error
}> {
  try {
    const doc = {
      _type: 'sponsorForConference',
      sponsor: { _type: 'reference', _ref: data.sponsor },
      conference: { _type: 'reference', _ref: data.conference },
      tier: data.tier ? { _type: 'reference', _ref: data.tier } : undefined,
      addons: data.addons?.length
        ? [...new Set(data.addons)].map((id) => ({
            _type: 'reference',
            _ref: id,
            _key: id,
          }))
        : undefined,
      status: data.status,
      contractStatus: data.contractStatus || 'none',
      assignedTo: data.assignedTo
        ? { _type: 'reference', _ref: data.assignedTo }
        : undefined,
      signerName: data.signerName,
      signerEmail: data.signerEmail,
      contractTemplate: data.contractTemplate
        ? { _type: 'reference', _ref: data.contractTemplate }
        : undefined,
      contactInitiatedAt: data.contactInitiatedAt,
      contractSignedAt: data.contractSignedAt,
      contractValue: data.contractValue,
      contractCurrency: data.contractCurrency || 'NOK',
      invoiceStatus: data.invoiceStatus,
      invoiceSentAt: data.invoiceSentAt,
      invoicePaidAt: data.invoicePaidAt,
      tags: data.tags,
      contactPersons: data.contactPersons
        ? prepareArrayWithKeys(data.contactPersons, 'contact')
        : undefined,
      billing: data.billing || undefined,
      nextFollowUpAt: data.nextFollowUpAt,
      outreachCount: data.outreachCount,
    }

    const created = await clientWrite.create(doc)

    const sponsorForConference =
      await clientRead.fetch<SponsorForConferenceExpanded>(
        `*[_type == "sponsorForConference" && _id == $id][0]{${SPONSOR_FOR_CONFERENCE_FIELDS}}`,
        { id: created._id },
      )

    if (!sponsorForConference) {
      return {
        error: new Error('Failed to fetch created sponsor relationship'),
      }
    }

    return { sponsorForConference }
  } catch (error) {
    return { error: error as Error }
  }
}

export async function updateSponsorForConference(
  id: string,
  data: Partial<SponsorForConferenceInput>,
): Promise<{
  sponsorForConference?: SponsorForConferenceExpanded
  error?: Error
}> {
  try {
    const updates: Record<string, unknown> = {}

    if (data.tier !== undefined) {
      updates.tier = data.tier ? { _type: 'reference', _ref: data.tier } : null
    }
    if (data.addons !== undefined) {
      updates.addons = data.addons.length
        ? [...new Set(data.addons)].map((id) => ({
            _type: 'reference',
            _ref: id,
            _key: id,
          }))
        : []
    }
    if (data.status !== undefined) updates.status = data.status
    if (data.contractStatus !== undefined)
      updates.contractStatus = data.contractStatus
    if (data.signerName !== undefined) updates.signerName = data.signerName
    if (data.signerEmail !== undefined) updates.signerEmail = data.signerEmail
    if (data.contractTemplate !== undefined) {
      updates.contractTemplate = data.contractTemplate
        ? { _type: 'reference', _ref: data.contractTemplate }
        : null
    }
    if (data.assignedTo !== undefined) {
      updates.assignedTo = data.assignedTo
        ? { _type: 'reference', _ref: data.assignedTo }
        : null
    }
    if (data.contactInitiatedAt !== undefined)
      updates.contactInitiatedAt = data.contactInitiatedAt
    if (data.contractSignedAt !== undefined)
      updates.contractSignedAt = data.contractSignedAt
    if (data.contractValue !== undefined)
      updates.contractValue = data.contractValue
    if (data.contractCurrency !== undefined)
      updates.contractCurrency = data.contractCurrency
    if (data.invoiceStatus !== undefined)
      updates.invoiceStatus = data.invoiceStatus
    if (data.invoiceSentAt !== undefined)
      updates.invoiceSentAt = data.invoiceSentAt
    if (data.invoicePaidAt !== undefined)
      updates.invoicePaidAt = data.invoicePaidAt
    if (data.tags !== undefined) updates.tags = data.tags
    if (data.contactPersons !== undefined) {
      updates.contactPersons = data.contactPersons
        ? prepareArrayWithKeys(data.contactPersons, 'contact')
        : null
    }
    if (data.billing !== undefined) updates.billing = data.billing
    if (data.nextFollowUpAt !== undefined)
      updates.nextFollowUpAt = data.nextFollowUpAt
    if (data.outreachCount !== undefined)
      updates.outreachCount = data.outreachCount

    await clientWrite.patch(id).set(updates).commit()

    const sponsorForConference =
      await clientRead.fetch<SponsorForConferenceExpanded>(
        `*[_type == "sponsorForConference" && _id == $id][0]{${SPONSOR_FOR_CONFERENCE_FIELDS}}`,
        { id },
      )

    if (!sponsorForConference) {
      return { error: new Error('Sponsor relationship not found') }
    }

    return { sponsorForConference }
  } catch (error) {
    return { error: error as Error }
  }
}

export async function deleteSponsorForConference(
  id: string,
  options?: { deleteContractAsset?: boolean },
): Promise<{ error?: Error }> {
  try {
    // Look up contract asset before deleting
    let contractAssetId: string | undefined
    if (options?.deleteContractAsset) {
      const doc = await clientWrite.fetch<{
        contractDocument?: { asset?: { _ref: string } }
      }>(
        `*[_type == "sponsorForConference" && _id == $id][0]{ contractDocument }`,
        { id },
      )
      contractAssetId = doc?.contractDocument?.asset?._ref
    }

    // Only delete the asset if it's not referenced by other documents
    let safeContractAssetId: string | undefined
    if (contractAssetId) {
      const safe = await clientWrite.fetch<string[]>(
        `*[
          _type == "sanity.fileAsset" &&
          _id == $assetId &&
          count(*[_type == "sponsorForConference" && contractDocument.asset._ref == ^._id && _id != $id]) == 0
        ]._id`,
        { assetId: contractAssetId, id },
      )
      safeContractAssetId = safe?.[0]
    }

    // Clean up related activity documents to prevent orphans
    const relatedActivityIds = await clientWrite.fetch<string[]>(
      `*[_type == "sponsorActivity" && sponsorForConference._ref == $id]._id`,
      { id },
    )

    const transaction = clientWrite.transaction()
    transaction.delete(id)
    for (const activityId of relatedActivityIds) {
      transaction.delete(activityId)
    }
    if (safeContractAssetId) {
      transaction.delete(safeContractAssetId)
    }
    await transaction.commit()

    return {}
  } catch (error) {
    return { error: error as Error }
  }
}

export async function getSponsorForConference(id: string): Promise<{
  sponsorForConference?: SponsorForConferenceExpanded
  error?: Error
}> {
  try {
    const sponsorForConference =
      await clientRead.fetch<SponsorForConferenceExpanded>(
        `*[_type == "sponsorForConference" && _id == $id][0]{${SPONSOR_FOR_CONFERENCE_FIELDS}}`,
        { id },
      )

    if (!sponsorForConference) {
      return { error: new Error('Sponsor relationship not found') }
    }

    return { sponsorForConference }
  } catch (error) {
    return { error: error as Error }
  }
}

/**
 * Whether a tier reference id resolves to a real (published) sponsor tier.
 * Used by the create/update guards to reject a dangling tier on a closed-won
 * record — the truthiness check in the state machine can't see that a non-empty
 * id points at a deleted tier, which would leave the sponsor silently hidden
 * from the public site. Matches how moveStage (expanded record) and bulkUpdate
 * (`!defined(tier->_id)`) already enforce resolvability.
 */
export async function tierExists(tierId: string): Promise<boolean> {
  const { query, params } = tierExistenceQuery(tierId)
  return clientRead.fetch<boolean>(query, params)
}

export async function listSponsorsForConference(
  conferenceId: string,
  filters?: {
    status?: string[]
    invoiceStatus?: string[]
    assignedTo?: string
    /** TEAMS-3 (L3): match sponsors whose assignee is any of these ids (a team's members). */
    assignedToIds?: string[]
    unassignedOnly?: boolean
    tags?: string[]
    tiers?: string[]
    searchQuery?: string
  },
): Promise<{
  sponsors?: SponsorForConferenceExpanded[]
  error?: Error
}> {
  try {
    let filterQuery = `_type == "sponsorForConference" && conference._ref == $conferenceId`

    if (filters?.status && filters.status.length > 0) {
      filterQuery += ` && status in $statuses`
    }
    if (filters?.invoiceStatus && filters.invoiceStatus.length > 0) {
      filterQuery += ` && invoiceStatus in $invoiceStatuses`
    }
    if (filters?.unassignedOnly) {
      filterQuery += ` && !defined(assignedTo)`
    } else if (filters?.assignedToIds) {
      // TEAM filter (L3): assignee ∈ the team's member set. Defined-but-empty
      // (a member-less team) correctly matches nothing (`in []`).
      filterQuery += ` && assignedTo._ref in $assignedToIds`
    } else if (filters?.assignedTo) {
      filterQuery += ` && assignedTo._ref == $assignedTo`
    }
    if (filters?.tags && filters.tags.length > 0) {
      filterQuery += ` && count((tags[])[@ in $tags]) > 0`
    }
    if (filters?.tiers && filters.tiers.length > 0) {
      filterQuery += ` && tier._ref in $tierIds`
    }

    if (filters?.searchQuery) {
      filterQuery += ` && (
        sponsor->name match $searchTerm || 
        sponsor->website match $searchTerm || 
        contactPersons[].name match $searchTerm || 
        contactPersons[].email match $searchTerm ||
        contactPersons[].linkedinUrl match $searchTerm
      )`
    }

    const sponsors = await clientRead.fetch<SponsorForConferenceExpanded[]>(
      `*[${filterQuery}] | order(status asc, _createdAt desc){${SPONSOR_FOR_CONFERENCE_FIELDS}}`,
      {
        conferenceId,
        statuses: filters?.status,
        invoiceStatuses: filters?.invoiceStatus,
        assignedTo: filters?.assignedTo,
        assignedToIds: filters?.assignedToIds,
        tags: filters?.tags,
        tierIds: filters?.tiers,
        searchTerm: filters?.searchQuery
          ? `*${filters.searchQuery}*`
          : undefined,
      },
    )

    return { sponsors }
  } catch (error) {
    return { error: error as Error }
  }
}

/**
 * Counts sponsors in the given pipeline stages, without projecting the
 * expanded document.
 *
 * Exists so a page that needs only "how many are there in total" (an
 * `X of Y` result line) does not have to fetch the whole expanded list a
 * second time — that projection pulls tier prices, add-ons, contacts and
 * activity stats, which is a lot of payload to turn into one number.
 *
 * Deliberately supports ONLY the GROQ-side status filter: the readiness and
 * billing filters are evaluated in the resolver over full documents, so a
 * count that pretended to honour them would silently return a number for a
 * different set than the caller asked for.
 */
export async function countSponsorsForConference(
  conferenceId: string,
  statuses?: string[],
): Promise<{ count?: number; error?: Error }> {
  try {
    let filterQuery = `_type == "sponsorForConference" && conference._ref == $conferenceId`
    if (statuses && statuses.length > 0) {
      filterQuery += ` && status in $statuses`
    }

    const count = await clientRead.fetch<number>(`count(*[${filterQuery}])`, {
      conferenceId,
      statuses,
    })

    return { count }
  } catch (error) {
    return { error: error as Error }
  }
}

export async function copySponsorsFromPreviousYear(
  params: CopySponsorsParams,
): Promise<{
  result?: CopySponsorsResult
  error?: Error
}> {
  const { sourceConferenceId, targetConferenceId, organizationId } = params

  // FAIL CLOSED: no tenant, no query, no write.
  if (!organizationId) {
    return {
      error: new Error(
        'copySponsorsFromPreviousYear: refusing to run without a resolved organization',
      ),
    }
  }

  try {
    // OWNERSHIP FIRST (#823). BOTH conference ids are client input, so neither
    // may be used as a scope key until an ORG-scoped read has proven it belongs
    // to the request's tenant. Without this an organizer of one organization
    // could name another organization's conference as the SOURCE and copy that
    // tenant's closed-won sponsor roster — names, contacts and billing details —
    // into their own. `scopedFetch` prepends `organization._ref == $orgId` and
    // throws on an empty scope; a foreign id simply resolves to null here, so
    // the refusal never confirms that it exists.
    const sourceConference = await scopedFetch<{ _id: string } | null>(
      clientRead,
      { orgId: organizationId },
      `*[_type == "conference" && _id == $sourceConferenceId][0]{ _id }`,
      { sourceConferenceId },
    )

    if (!sourceConference) {
      return { error: new Error('Source conference not found') }
    }

    // Get target conference organizers — same org-scoped ownership check.
    const targetConference = await scopedFetch<{
      organizers: Array<{ _ref: string }>
    } | null>(
      clientRead,
      { orgId: organizationId },
      `*[_type == "conference" && _id == $targetConferenceId][0]{
        organizers[]
      }`,
      { targetConferenceId },
    )

    if (!targetConference) {
      return { error: new Error('Target conference not found') }
    }

    // Get source sponsors. `sponsorForConference` carries no `organization` key
    // of its own, so its tenant is the one of the conference it hangs off —
    // proven ours by the org-scoped read above.
    const sourceSponsors = await clientRead.fetch<SponsorForConference[]>(
      // groq-global-scoped: `conference._ref == $conferenceId` IS the tenant
      // predicate, and `$conferenceId` is an id the org-scoped read above
      // proved belongs to the request's organization.
      `*[_type == "sponsorForConference" && conference._ref == $conferenceId && status == "closed-won"]{
        _id,
        sponsor,
        tier,
        assignedTo,
        contractCurrency,
        tags,
        contactPersons[]{ _key, name, email, phone, role, isPrimary },
        billing{ invoiceFormat, email, reference, comments }
      }`,
      { conferenceId: sourceConferenceId },
    )

    const targetOrganizerIds = new Set(
      targetConference.organizers.map((o: { _ref: string }) => o._ref),
    )

    const result: CopySponsorsResult = {
      created: 0,
      skipped: 0,
      warnings: [],
    }

    // Check for existing sponsors in target conference
    const existingSponsors = await clientRead.fetch<
      Array<{ sponsor: { _ref: string } }>
    >(
      // groq-global-scoped: `conference._ref == $conferenceId` IS the tenant
      // predicate, bound to the target conference the org-scoped read above
      // proved belongs to the request's organization.
      `*[_type == "sponsorForConference" && conference._ref == $conferenceId]{
        sponsor
      }`,
      { conferenceId: targetConferenceId },
    )

    const existingSponsorIds = new Set(
      existingSponsors.map(
        (s: { sponsor: { _ref: string } }) => s.sponsor._ref,
      ),
    )

    for (const sourceSponsor of sourceSponsors) {
      // Skip if already exists in target conference
      if (existingSponsorIds.has(sourceSponsor.sponsor._ref)) {
        result.skipped++
        continue
      }

      // Check if assigned organizer is in target conference
      let assignedTo = sourceSponsor.assignedTo?._ref
      if (assignedTo && !targetOrganizerIds.has(assignedTo)) {
        result.warnings.push(
          `Sponsor ${sourceSponsor.sponsor._ref}: assigned organizer not in target conference, unassigning`,
        )
        assignedTo = undefined
      }

      const newDoc = {
        _type: 'sponsorForConference',
        sponsor: sourceSponsor.sponsor,
        conference: { _type: 'reference', _ref: targetConferenceId },
        tier: sourceSponsor.tier,
        status: 'prospect' as const,
        assignedTo: assignedTo
          ? { _type: 'reference', _ref: assignedTo }
          : undefined,
        contractCurrency: sourceSponsor.contractCurrency || 'NOK',
        invoiceStatus: 'not-sent' as const,
        tags: sourceSponsor.tags,
        contactPersons: sourceSponsor.contactPersons,
        billing: sourceSponsor.billing,
      }

      await clientWrite.create(newDoc)
      result.created++
    }

    return { result }
  } catch (error) {
    return { error: error as Error }
  }
}

/**
 * Import all sponsors from all previous conferences into the target conference's Prospect column.
 * Tags sponsors based on their historical status: 'returning-sponsor' for closed-won,
 * 'previously-declined' for closed-lost.
 */
export async function importAllHistoricSponsors(
  params: ImportAllHistoricSponsorsParams,
): Promise<{
  result?: ImportAllHistoricSponsorsResult
  error?: Error
}> {
  const { targetConferenceId, organizationId } = params

  // FAIL CLOSED: no tenant, no query, no write.
  if (!organizationId) {
    return {
      error: new Error(
        'importAllHistoricSponsors: refusing to run without a resolved organization',
      ),
    }
  }

  try {
    // OWNERSHIP FIRST (#823): `targetConferenceId` is client input, so it is
    // only usable as a scope key once an ORG-scoped read has proven it ours.
    const targetConference = await scopedFetch<{
      _id: string
      startDate: string
    } | null>(
      clientRead,
      { orgId: organizationId },
      `*[_type == "conference" && _id == $conferenceId][0]{
        _id,
        startDate
      }`,
      { conferenceId: targetConferenceId },
    )

    if (!targetConference) {
      return { error: new Error('Target conference not found') }
    }

    // Get all of THIS ORGANIZATION's conferences before the target conference.
    //
    // TENANCY (#823): the org predicate is the whole fix. Unscoped, this asks
    // for every conference in the shared dataset that started before ours —
    // which made `historicSponsors` below a cross-tenant read and offered one
    // tenant's sponsor roster inside another tenant's import flow. Date is not
    // a tenant key; `organization._ref` is, and `scopedFetch` prepends it.
    const previousConferences = await scopedFetch<Array<{ _id: string }>>(
      clientRead,
      { orgId: organizationId },
      `*[_type == "conference" && startDate < $targetStartDate] | order(startDate desc) {
        _id
      }`,
      { targetStartDate: targetConference.startDate },
    )

    if (previousConferences.length === 0) {
      return {
        result: {
          created: 0,
          skipped: 0,
          taggedAsReturning: 0,
          taggedAsDeclined: 0,
          sourceConferencesCount: 0,
        },
      }
    }

    const previousConferenceIds = previousConferences.map((c) => c._id)

    // Get all sponsors from previous conferences
    const historicSponsors = await clientRead.fetch<
      Array<{
        sponsor: { _ref: string }
        status: SponsorStatus
        conference: { _ref: string }
      }>
    >(
      // groq-global-scoped: `conference._ref in $conferenceIds` IS the tenant
      // predicate — `$conferenceIds` is exactly the set the ORG-scoped read
      // above returned, so this cannot reach a conference of another tenant.
      `*[_type == "sponsorForConference" && conference._ref in $conferenceIds]{
        sponsor,
        status,
        conference
      }`,
      { conferenceIds: previousConferenceIds },
    )

    // Get existing sponsors in target conference
    const existingSponsors = await clientRead.fetch<
      Array<{ sponsor: { _ref: string } }>
    >(
      // groq-global-scoped: `conference._ref == $conferenceId` IS the tenant
      // predicate, bound to the target conference the org-scoped read above
      // proved belongs to the request's organization.
      `*[_type == "sponsorForConference" && conference._ref == $conferenceId]{
        sponsor
      }`,
      { conferenceId: targetConferenceId },
    )

    const existingSponsorIds = new Set(
      existingSponsors.map((s) => s.sponsor._ref),
    )

    // Group by unique sponsor and track historical outcomes
    const sponsorHistory = new Map<
      string,
      { hasWon: boolean; allLost: boolean }
    >()

    for (const record of historicSponsors) {
      const sponsorId = record.sponsor._ref
      const existing = sponsorHistory.get(sponsorId)

      if (!existing) {
        sponsorHistory.set(sponsorId, {
          hasWon: record.status === 'closed-won',
          allLost: record.status === 'closed-lost',
        })
      } else {
        if (record.status === 'closed-won') {
          existing.hasWon = true
        }
        if (record.status !== 'closed-lost') {
          existing.allLost = false
        }
      }
    }

    const result: ImportAllHistoricSponsorsResult = {
      created: 0,
      skipped: 0,
      taggedAsReturning: 0,
      taggedAsDeclined: 0,
      sourceConferencesCount: previousConferences.length,
    }

    // Create new sponsorForConference records
    for (const [sponsorId, history] of sponsorHistory) {
      // Skip if already exists in target conference
      if (existingSponsorIds.has(sponsorId)) {
        result.skipped++
        continue
      }

      // Determine tags based on history
      const tags: SponsorTag[] = []
      if (history.hasWon) {
        tags.push('returning-sponsor')
        result.taggedAsReturning++
      } else if (history.allLost) {
        tags.push('previously-declined')
        result.taggedAsDeclined++
      }

      const newDoc = {
        _type: 'sponsorForConference',
        sponsor: { _type: 'reference', _ref: sponsorId },
        conference: { _type: 'reference', _ref: targetConferenceId },
        status: 'prospect' as const,
        contractStatus: 'none' as const,
        contractCurrency: 'NOK',
        invoiceStatus: 'not-sent' as const,
        tags: tags.length > 0 ? tags : undefined,
      }

      await clientWrite.create(newDoc)
      result.created++
    }

    return { result }
  } catch (error) {
    return { error: error as Error }
  }
}
