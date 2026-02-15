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
  contractStatus?: ContractStatus
  invoiceStatus?: InvoiceStatus
  assignedTo?: string | null
  tags?: SponsorTag[]
  addTags?: SponsorTag[]
  removeTags?: SponsorTag[]
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

  // SECURITY: Only fetch and update documents of type sponsorForConference
  const sponsors = await clientWrite.fetch<SponsorForConference[]>(
    `*[_type == "sponsorForConference" && _id in $ids]`,
    { ids },
  )

  const transaction = clientWrite.transaction()
  let updatedCount = 0

  // Fetch the new assignee's name if we're assigning someone
  let assigneeName = ''
  if (input.assignedTo) {
    const assignee = await clientWrite.fetch<{ name: string }>(
      `*[_type == "speaker" && _id == $id][0]{name}`,
      { id: input.assignedTo },
    )
    assigneeName = assignee?.name || input.assignedTo
  }

  interface CRMUpdates {
    status?: SponsorStatus
    contractStatus?: ContractStatus
    invoiceStatus?: InvoiceStatus
    assignedTo?: { _type: 'reference'; _ref: string } | null
    tags?: SponsorTag[]
  }

  for (const existing of sponsors) {
    const updates: CRMUpdates = {}
    if (input.status !== undefined) updates.status = input.status
    if (input.contractStatus !== undefined)
      updates.contractStatus = input.contractStatus
    if (input.invoiceStatus !== undefined)
      updates.invoiceStatus = input.invoiceStatus
    if (input.assignedTo !== undefined) {
      updates.assignedTo =
        input.assignedTo === null
          ? null
          : { _type: 'reference', _ref: input.assignedTo }
    }

    // Handle tags
    let currentTags = existing.tags || []
    let tagsChanged = false

    if (input.tags !== undefined) {
      currentTags = input.tags
      tagsChanged = true
    }
    if (input.addTags) {
      const newTags = [...new Set([...currentTags, ...input.addTags])]
      if (newTags.length !== currentTags.length) {
        currentTags = newTags as SponsorTag[]
        tagsChanged = true
      }
    }
    if (input.removeTags) {
      const newTags = currentTags.filter((t) => !input.removeTags?.includes(t))
      if (newTags.length !== currentTags.length) {
        currentTags = newTags as SponsorTag[]
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
      // FIXED: Use undefined check instead of truthiness to avoid skipping valid enum values
      if (input.status !== undefined && input.status !== existing.status) {
        const activityId = `activity-status-${existing._id}-${Date.now()}`
        transaction.create({
          _id: activityId,
          _type: 'sponsorActivity',
          sponsorForConference: {
            _type: 'reference',
            _ref: existing._id,
          },
          activityType: 'stage_change',
          description: `Status changed from ${formatStatusName(existing.status)} to ${formatStatusName(input.status)}`,
          metadata: {
            oldValue: existing.status,
            newValue: input.status,
            timestamp: getCurrentDateTime(),
          },
          createdBy: { _type: 'reference', _ref: userId },
          createdAt: getCurrentDateTime(),
        })
      }

      if (
        input.assignedTo !== undefined &&
        input.assignedTo !== (existing.assignedTo?._ref || null)
      ) {
        const activityId = `activity-assign-${existing._id}-${Date.now()}`
        transaction.create({
          _id: activityId,
          _type: 'sponsorActivity',
          sponsorForConference: {
            _type: 'reference',
            _ref: existing._id,
          },
          activityType: 'note',
          description: input.assignedTo
            ? `Assigned to ${assigneeName} via bulk update`
            : 'Unassigned via bulk update',
          createdBy: { _type: 'reference', _ref: userId },
          createdAt: getCurrentDateTime(),
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
 * Also cleans up related activity documents and optionally contract assets.
 */
export async function bulkDeleteSponsors(
  ids: string[],
  options?: { deleteContractAssets?: boolean },
): Promise<{ success: true; deletedCount: number; totalCount: number }> {
  // Find all related activity documents
  const relatedActivityIds = await clientWrite.fetch<string[]>(
    `*[_type == "sponsorActivity" && sponsorForConference._ref in $ids]._id`,
    { ids },
  )

  // Find contract asset IDs if cleanup requested (only delete assets not referenced elsewhere)
  let contractAssetIds: string[] = []
  if (options?.deleteContractAssets) {
    const candidateAssetIds = await clientWrite.fetch<string[]>(
      `*[_type == "sponsorForConference" && _id in $ids && defined(contractDocument.asset._ref)].contractDocument.asset._ref`,
      { ids },
    )

    if (candidateAssetIds.length > 0) {
      const unique = Array.from(new Set(candidateAssetIds.filter(Boolean)))
      contractAssetIds = await clientWrite.fetch<string[]>(
        `*[
          _type == "sanity.fileAsset" &&
          _id in $assetIds &&
          count(*[_type == "sponsorForConference" && contractDocument.asset._ref == ^._id && !(_id in $ids)]) == 0
        ]._id`,
        { assetIds: unique, ids },
      )
    }
  }

  const transaction = clientWrite.transaction()

  // Delete the sponsor-conference documents
  for (const id of ids) {
    transaction.delete(id)
  }

  // Delete the related activity documents
  for (const id of relatedActivityIds) {
    transaction.delete(id)
  }

  // Delete contract PDF assets
  for (const assetId of contractAssetIds) {
    transaction.delete(assetId)
  }

  await transaction.commit()
  return {
    success: true,
    deletedCount: ids.length,
    totalCount: ids.length,
  }
}
