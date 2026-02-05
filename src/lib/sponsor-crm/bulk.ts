import { clientWrite } from '@/lib/sanity/client'
import {
  SponsorForConference,
  SponsorStatus,
  ContractStatus,
  InvoiceStatus,
  SponsorTag,
} from './types'
import { formatStatusName } from '@/components/admin/sponsor-crm/utils'
import { getCurrentDateTime } from '@/lib/time'

export interface BulkUpdateParams {
  ids: string[]
  status?: SponsorStatus
  contract_status?: ContractStatus
  invoice_status?: InvoiceStatus
  assigned_to?: string | null
  tags?: SponsorTag[]
  add_tags?: SponsorTag[]
  remove_tags?: SponsorTag[]
}

/**
 * Performs bulk updates on sponsor CRM records using a single transaction.
 * Also logs relevant activities for status and assignee changes.
 */
export async function bulkUpdateSponsors(
  params: BulkUpdateParams,
  userId: string,
): Promise<{ success: true; updatedCount: number; totalCount: number }> {
  const { ids, ...input } = params

  // Fetch all target sponsors in one query
  const sponsors = await clientWrite.fetch<SponsorForConference[]>(
    `*[_type == "sponsorForConference" && _id in $ids]`,
    { ids },
  )

  const transaction = clientWrite.transaction()
  let updatedCount = 0

  interface CRMUpdates {
    status?: SponsorStatus
    contract_status?: ContractStatus
    invoice_status?: InvoiceStatus
    assigned_to?: { _type: 'reference'; _ref: string } | null
    tags?: SponsorTag[]
  }

  for (const existing of sponsors) {
    const updates: CRMUpdates = {}
    if (input.status !== undefined) updates.status = input.status
    if (input.contract_status !== undefined)
      updates.contract_status = input.contract_status
    if (input.invoice_status !== undefined)
      updates.invoice_status = input.invoice_status
    if (input.assigned_to !== undefined) {
      updates.assigned_to =
        input.assigned_to === null
          ? null
          : { _type: 'reference', _ref: input.assigned_to }
    }

    // Handle tags
    let currentTags = existing.tags || []
    let tagsChanged = false

    if (input.tags !== undefined) {
      currentTags = input.tags
      tagsChanged = true
    }
    if (input.add_tags) {
      const newTags = [...new Set([...currentTags, ...input.add_tags])]
      if (newTags.length !== currentTags.length) {
        currentTags = newTags
        tagsChanged = true
      }
    }
    if (input.remove_tags) {
      const newTags = currentTags.filter((t) => !input.remove_tags?.includes(t))
      if (newTags.length !== currentTags.length) {
        currentTags = newTags
        tagsChanged = true
      }
    }

    if (tagsChanged) {
      updates.tags = currentTags
    }

    if (Object.keys(updates).length > 0) {
      transaction.patch(existing._id, { set: updates })
      updatedCount++

      // Prepare activity logs
      if (input.status && input.status !== existing.status) {
        const activityId = `activity-status-${existing._id}-${Date.now()}`
        transaction.create({
          _id: activityId,
          _type: 'sponsorActivity',
          sponsor_for_conference: {
            _type: 'reference',
            _ref: existing._id,
          },
          activity_type: 'stage_change',
          description: `Status changed from ${formatStatusName(existing.status)} to ${formatStatusName(input.status)}`,
          metadata: {
            old_value: existing.status,
            new_value: input.status,
            timestamp: getCurrentDateTime(),
          },
          created_by: { _type: 'reference', _ref: userId },
          created_at: getCurrentDateTime(),
        })
      }

      if (
        input.assigned_to !== undefined &&
        input.assigned_to !== (existing.assigned_to?._ref || null)
      ) {
        const activityId = `activity-assign-${existing._id}-${Date.now()}`
        transaction.create({
          _id: activityId,
          _type: 'sponsorActivity',
          sponsor_for_conference: {
            _type: 'reference',
            _ref: existing._id,
          },
          activity_type: 'note',
          description: input.assigned_to
            ? `Assigned via bulk update`
            : 'Unassigned via bulk update',
          created_by: { _type: 'reference', _ref: userId },
          created_at: getCurrentDateTime(),
        })
      }
    }
  }

  if (updatedCount > 0) {
    await transaction.commit()
  }

  return {
    success: true,
    updatedCount,
    totalCount: ids.length,
  }
}

/**
 * Deletes multiple sponsor CRM records in a single transaction.
 */
export async function bulkDeleteSponsors(
  ids: string[],
): Promise<{ success: true; deletedCount: number; totalCount: number }> {
  const transaction = clientWrite.transaction()
  for (const id of ids) {
    transaction.delete(id)
  }
  await transaction.commit()
  return {
    success: true,
    deletedCount: ids.length,
    totalCount: ids.length,
  }
}
