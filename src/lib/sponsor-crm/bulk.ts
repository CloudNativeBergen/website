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
import {
  getOrganizationRefForCurrentConference,
  organizationField,
} from '@/lib/organization/sanity'
import { scopedFetch } from '@/lib/sanity/scoped'

/**
 * A bulk operation was refused because the batch referenced documents outside
 * the caller's tenant. Distinct from a generic failure so the router can map it
 * to a client-visible refusal instead of masking it as a 500.
 */
export class BulkTenancyError extends Error {
  readonly name = 'BulkTenancyError'
}

/**
 * Refuse a bulk operation unless EVERY supplied id resolved inside the caller's
 * conference — the all-or-nothing rule. A partial match means the batch mixed in
 * an id the tenant does not own (or one that no longer exists); silently acting
 * on the subset would let a crafted batch probe another tenant's id space by
 * observing which ids "succeeded".
 *
 * The message deliberately does not say WHICH ids were rejected, so a foreign
 * id's existence never leaks.
 */
function assertAllOwned(
  requestedIds: string[],
  ownedIds: string[],
  operation: string,
): void {
  const requested = new Set(requestedIds)
  if (ownedIds.length !== requested.size) {
    throw new BulkTenancyError(
      `${operation}: refusing the batch — ${requested.size - ownedIds.length} of ${requested.size} sponsor records are not in this conference`,
    )
  }
}

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
 *
 * TENANCY: `conferenceId` is REQUIRED and is the tenant boundary for the whole
 * operation. `ids` is CLIENT INPUT; the read below is scoped to the conference
 * so a foreign id simply does not resolve, and {@link assertAllOwned} then
 * refuses the batch outright rather than patching the owned subset. Previously
 * this matched on `_id in $ids` with no tenant predicate at all, so an organizer
 * of one tenant could rewrite another tenant's status/assignee/tags.
 */
export async function bulkUpdateSponsors(
  params: BulkUpdateParams,
  userId: string,
  conferenceId: string,
): Promise<{ success: true; updatedCount: number; totalCount: number }> {
  const { ids, ...input } = params

  // FAIL CLOSED: an unresolvable tenant must issue NO query, not a global one.
  if (!conferenceId) {
    throw new Error(
      'bulkUpdateSponsors: refusing to run without a resolved conference',
    )
  }

  // SECURITY: type-restricted AND conference-scoped. `scopedFetch` prepends
  // `conference._ref == $conferenceId` and throws on an empty scope.
  const sponsors = await scopedFetch<SponsorForConference[]>(
    clientWrite,
    { conferenceId },
    `*[_type == "sponsorForConference" && _id in $ids]`,
    { ids },
  )

  assertAllOwned(
    ids,
    sponsors.map((s) => s._id),
    'bulkUpdateSponsors',
  )

  const transaction = clientWrite.transaction()
  let updatedCount = 0

  // A bulk update operates within the CURRENT conference, so every logged
  // activity shares its organization (CaaS T1-1). Resolve once. Best-effort:
  // absent before the 044 backfill. The ids this stamp is applied to are now
  // proven to belong to `conferenceId` by the scoped read above.
  const orgRef = await getOrganizationRefForCurrentConference()

  // Fetch the new assignee's name if we're assigning someone
  let assigneeName = ''
  if (input.assignedTo) {
    const assignee = await clientWrite.fetch<{ name: string }>(
      // A name-only point read by an id the router has already validated as an
      // organizer of this conference.
      // groq-global: `speaker` is the deliberate cross-tenant identity type (#615) and carries no tenant key.
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
          ...organizationField(orgRef),
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
          ...organizationField(orgRef),
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
 *
 * TENANCY: `conferenceId` is REQUIRED. `ids` is CLIENT INPUT and previously
 * drove `transaction.delete(id)` directly with no tenant predicate anywhere in
 * the function — a cross-tenant DELETE. The owned set is now resolved through a
 * conference-scoped read FIRST, the batch is refused unless every id is ours,
 * and only the resolved ids are deleted.
 */
export async function bulkDeleteSponsors(
  ids: string[],
  conferenceId: string,
  options?: { deleteContractAssets?: boolean },
): Promise<{ success: true; deletedCount: number; totalCount: number }> {
  // FAIL CLOSED: no tenant, no query, no delete.
  if (!conferenceId) {
    throw new Error(
      'bulkDeleteSponsors: refusing to run without a resolved conference',
    )
  }

  // OWNERSHIP FIRST: resolve which of the supplied ids actually live in this
  // conference, and refuse the whole batch if any does not.
  const ownedIds = await scopedFetch<string[]>(
    clientWrite,
    { conferenceId },
    `*[_type == "sponsorForConference" && _id in $ids]._id`,
    { ids },
  )
  assertAllOwned(ids, ownedIds, 'bulkDeleteSponsors')

  // Find all related activity documents. `sponsorActivity` carries no
  // `conference` ref of its own (only the post-044 `organization` key, which is
  // best-effort), so the tenant predicate is expressed by traversing the parent:
  // `sponsorForConference->conference._ref == $conferenceId`. That is a real
  // tenant predicate — the lint rule cannot yet recognise reference traversal,
  // so this site keeps warning honestly rather than being annotated away.
  const relatedActivityIds = await clientWrite.fetch<string[]>(
    `*[_type == "sponsorActivity" && sponsorForConference._ref in $ids && sponsorForConference->conference._ref == $conferenceId]._id`,
    { ids: ownedIds, conferenceId },
  )

  // Find contract asset IDs if cleanup requested (only delete assets not referenced elsewhere)
  let contractAssetIds: string[] = []
  if (options?.deleteContractAssets) {
    const candidateAssetIds = await scopedFetch<string[]>(
      clientWrite,
      { conferenceId },
      `*[_type == "sponsorForConference" && _id in $ids && defined(contractDocument.asset._ref)].contractDocument.asset._ref`,
      { ids: ownedIds },
    )

    if (candidateAssetIds.length > 0) {
      const unique = Array.from(new Set(candidateAssetIds.filter(Boolean)))
      contractAssetIds = await clientWrite.fetch<string[]>(
        // The inner "is anyone else still using it?" count MUST stay
        // cross-tenant — scoping it to this conference would delete an asset
        // another edition or another tenant still references. The candidate set
        // is already restricted to assets reached from THIS conference's rows.
        // groq-global: `sanity.fileAsset` carries no tenant key of any kind.
        `*[
          _type == "sanity.fileAsset" &&
          _id in $assetIds &&
          count(*[_type == "sponsorForConference" && contractDocument.asset._ref == ^._id && !(_id in $ids)]) == 0
        ]._id`,
        { assetIds: unique, ids: ownedIds },
      )
    }
  }

  const transaction = clientWrite.transaction()

  // Delete the sponsor-conference documents — only the ids proven to be ours.
  for (const id of ownedIds) {
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
    deletedCount: ownedIds.length,
    totalCount: ids.length,
  }
}
