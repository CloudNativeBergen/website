import {
  clientWrite,
  clientReadUncached as clientRead,
} from '@/lib/sanity/client'
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
    logo_bright,
    org_number
  },
  conference->{
    _id,
    title
  },
  tier->{
    _id,
    title,
    tagline,
    tier_type,
    price[]{
      _key,
      amount,
      currency
    }
  },
  addons[]->{
    _id,
    title,
    tier_type,
    price[]{
      _key,
      amount,
      currency
    }
  },
  status,
  contract_status,
  assigned_to->{
    _id,
    name,
    email,
    image
  },
  contact_initiated_at,
  contract_signed_at,
  contract_value,
  contract_currency,
  invoice_status,
  invoice_sent_at,
  invoice_paid_at,
  notes,
  tags
`

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
        ? data.addons.map((id) => ({
          _type: 'reference',
          _ref: id,
          _key: id,
        }))
        : undefined,
      status: data.status,
      assigned_to: data.assigned_to
        ? { _type: 'reference', _ref: data.assigned_to }
        : undefined,
      contact_initiated_at: data.contact_initiated_at,
      contract_signed_at: data.contract_signed_at,
      contract_value: data.contract_value,
      contract_currency: data.contract_currency || 'NOK',
      invoice_status: data.invoice_status,
      invoice_sent_at: data.invoice_sent_at,
      invoice_paid_at: data.invoice_paid_at,
      notes: data.notes,
      tags: data.tags,
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
        ? data.addons.map((id) => ({
          _type: 'reference',
          _ref: id,
          _key: id,
        }))
        : []
    }
    if (data.status !== undefined) updates.status = data.status
    if (data.contract_status !== undefined)
      updates.contract_status = data.contract_status
    if (data.assigned_to !== undefined) {
      updates.assigned_to = data.assigned_to
        ? { _type: 'reference', _ref: data.assigned_to }
        : null
    }
    if (data.contact_initiated_at !== undefined)
      updates.contact_initiated_at = data.contact_initiated_at
    if (data.contract_signed_at !== undefined)
      updates.contract_signed_at = data.contract_signed_at
    if (data.contract_value !== undefined)
      updates.contract_value = data.contract_value
    if (data.contract_currency !== undefined)
      updates.contract_currency = data.contract_currency
    if (data.invoice_status !== undefined)
      updates.invoice_status = data.invoice_status
    if (data.invoice_sent_at !== undefined)
      updates.invoice_sent_at = data.invoice_sent_at
    if (data.invoice_paid_at !== undefined)
      updates.invoice_paid_at = data.invoice_paid_at
    if (data.notes !== undefined) updates.notes = data.notes
    if (data.tags !== undefined) updates.tags = data.tags

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
): Promise<{ error?: Error }> {
  try {
    await clientWrite.delete(id)
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

export async function listSponsorsForConference(
  conferenceId: string,
  filters?: {
    status?: string[]
    invoice_status?: string[]
    assigned_to?: string
    tags?: string[]
    tiers?: string[]
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
    if (filters?.invoice_status && filters.invoice_status.length > 0) {
      filterQuery += ` && invoice_status in $invoiceStatuses`
    }
    if (filters?.assigned_to) {
      filterQuery += ` && assigned_to._ref == $assignedTo`
    }
    if (filters?.tags && filters.tags.length > 0) {
      filterQuery += ` && count((tags[])[@ in $tags]) > 0`
    }
    if (filters?.tiers && filters.tiers.length > 0) {
      filterQuery += ` && tier._ref in $tierIds`
    }

    const sponsors = await clientRead.fetch<SponsorForConferenceExpanded[]>(
      `*[${filterQuery}] | order(status asc, _createdAt desc){${SPONSOR_FOR_CONFERENCE_FIELDS}}`,
      {
        conferenceId,
        statuses: filters?.status,
        invoiceStatuses: filters?.invoice_status,
        assignedTo: filters?.assigned_to,
        tags: filters?.tags,
        tierIds: filters?.tiers,
      },
    )

    return { sponsors }
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
  try {
    const { sourceConferenceId, targetConferenceId } = params

    // Get source sponsors
    const sourceSponsors = await clientRead.fetch<SponsorForConference[]>(
      `*[_type == "sponsorForConference" && conference._ref == $conferenceId && status == "closed-won"]{
        _id,
        sponsor,
        tier,
        assigned_to,
        contract_currency,
        tags
      }`,
      { conferenceId: sourceConferenceId },
    )

    // Get target conference organizers
    const targetConference = await clientRead.fetch<{
      organizers: Array<{ _ref: string }>
    }>(
      `*[_type == "conference" && _id == $conferenceId][0]{
        organizers[]
      }`,
      { conferenceId: targetConferenceId },
    )

    if (!targetConference) {
      return { error: new Error('Target conference not found') }
    }

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
      let assignedTo = sourceSponsor.assigned_to?._ref
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
        assigned_to: assignedTo
          ? { _type: 'reference', _ref: assignedTo }
          : undefined,
        contract_currency: sourceSponsor.contract_currency || 'NOK',
        invoice_status: 'not-sent' as const,
        tags: sourceSponsor.tags,
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
  try {
    const { targetConferenceId } = params

    // Get target conference start date
    const targetConference = await clientRead.fetch<{
      _id: string
      start_date: string
    }>(
      `*[_type == "conference" && _id == $conferenceId][0]{
        _id,
        start_date
      }`,
      { conferenceId: targetConferenceId },
    )

    if (!targetConference) {
      return { error: new Error('Target conference not found') }
    }

    // Get all conferences before the target conference
    const previousConferences = await clientRead.fetch<Array<{ _id: string }>>(
      `*[_type == "conference" && start_date < $targetStartDate] | order(start_date desc) {
        _id
      }`,
      { targetStartDate: targetConference.start_date },
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
      `*[_type == "sponsorForConference" && conference._ref == $conferenceId]{
        sponsor
      }`,
      { conferenceId: targetConferenceId },
    )

    const existingSponsorIds = new Set(
      existingSponsors.map((s) => s.sponsor._ref),
    )

    // Priority for determining best historical outcome
    const statusPriority: Record<SponsorStatus, number> = {
      'closed-won': 5,
      negotiating: 4,
      contacted: 3,
      prospect: 2,
      'closed-lost': 1,
    }

    // Group by unique sponsor and determine best historical status
    const sponsorHistory = new Map<
      string,
      { bestStatus: SponsorStatus; hasWon: boolean; allLost: boolean }
    >()

    for (const record of historicSponsors) {
      const sponsorId = record.sponsor._ref
      const existing = sponsorHistory.get(sponsorId)

      if (!existing) {
        sponsorHistory.set(sponsorId, {
          bestStatus: record.status,
          hasWon: record.status === 'closed-won',
          allLost: record.status === 'closed-lost',
        })
      } else {
        const currentPriority = statusPriority[existing.bestStatus]
        const newPriority = statusPriority[record.status]

        if (newPriority > currentPriority) {
          existing.bestStatus = record.status
        }
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
        contract_status: 'none' as const,
        contract_currency: 'NOK',
        invoice_status: 'not-sent' as const,
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
