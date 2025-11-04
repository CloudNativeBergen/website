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
  status,
  assigned_to->{
    _id,
    name,
    email,
    avatar
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
    if (data.status !== undefined) updates.status = data.status
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

    const sponsors = await clientRead.fetch<SponsorForConferenceExpanded[]>(
      `*[${filterQuery}] | order(status asc, _createdAt desc){${SPONSOR_FOR_CONFERENCE_FIELDS}}`,
      {
        conferenceId,
        statuses: filters?.status,
        invoiceStatuses: filters?.invoice_status,
        assignedTo: filters?.assigned_to,
        tags: filters?.tags,
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
