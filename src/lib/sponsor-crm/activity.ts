import { clientWrite } from '@/lib/sanity/client'
import { getCurrentDateTime } from '@/lib/time'
import type { ActivityType, SponsorActivityInput } from './types'
import { formatStatusName } from '@/components/admin/sponsor-crm/utils'
import { checkPipelineState, type SponsorState } from './state-machine'

export async function createSponsorActivity(
  sponsorForConferenceId: string,
  activityType: ActivityType,
  description: string,
  createdBy: string,
  metadata?: {
    oldValue?: string
    newValue?: string
    timestamp?: string
    additionalData?: string
  },
): Promise<{ activityId?: string; error?: Error }> {
  try {
    const activity: SponsorActivityInput = {
      sponsorForConference: sponsorForConferenceId,
      activityType: activityType,
      description,
      createdBy: createdBy,
      createdAt: getCurrentDateTime(),
      metadata,
    }

    const doc = {
      _type: 'sponsorActivity' as const,
      sponsorForConference: {
        _type: 'reference',
        _ref: activity.sponsorForConference,
      },
      activityType: activity.activityType,
      description: activity.description,
      metadata: activity.metadata,
      createdAt: activity.createdAt,
      ...(activity.createdBy &&
        activity.createdBy !== 'system' && {
          createdBy: { _type: 'reference', _ref: activity.createdBy },
        }),
    }

    const created = await clientWrite.create(doc)

    return { activityId: created._id }
  } catch (error) {
    console.error('Failed to create sponsor activity:', error)
    return { error: error as Error }
  }
}

export async function logStageChange(
  sponsorForConferenceId: string,
  oldStatus: string,
  newStatus: string,
  createdBy: string,
): Promise<{ activityId?: string; error?: Error }> {
  return createSponsorActivity(
    sponsorForConferenceId,
    'stage_change',
    `Status changed from ${formatStatusName(oldStatus)} to ${formatStatusName(newStatus)}`,
    createdBy,
    {
      oldValue: oldStatus,
      newValue: newStatus,
      timestamp: getCurrentDateTime(),
    },
  )
}

/**
 * Pipeline stages a deal can be auto-advanced *from* when a contract is sent
 * or signed. These are the pre-won, non-terminal stages; `closed-won` and
 * `closed-lost` are deliberately excluded so promotion is forward-only.
 */
const EARLY_PIPELINE_STAGES: ReadonlyArray<string> = [
  'prospect',
  'contacted',
  'negotiating',
]

/**
 * Every pipeline status the CRM recognises. Used only to distinguish a *known*
 * non-early stage (e.g. a legitimate `closed-lost` no-op) from a missing or
 * unrecognised status — which signals a data problem, or a call site that
 * forgot to select `status`, and must fail closed rather than promote.
 */
const KNOWN_PIPELINE_STAGES: ReadonlyArray<string> = [
  ...EARLY_PIPELINE_STAGES,
  'closed-won',
  'closed-lost',
]

export type PromotionResult = {
  promoted: boolean
  reason?:
    | 'not-early-stage'
    | 'tier-missing'
    | 'unknown-status'
    | 'concurrent-transition'
  error?: Error
}

/**
 * The slice of a sponsor record the promotion helper reads. The tier arrives in
 * different shapes at each call site (a dereferenced doc `{ _id, title, ... }`,
 * a raw reference `{ _ref }`, or a partial `{ title }`) and only its presence
 * matters to the tier guard, so it is accepted as `unknown`.
 */
export interface ContractPromotionSponsor {
  status?: string | null
  tier?: unknown
}

/**
 * Forward-only pipeline promotion to `closed-won`, fired when a contract is
 * sent or signed (issue #348). Monotonic and idempotent: it only advances a
 * deal still resting in an early stage (prospect / contacted / negotiating).
 * Records already `closed-won` or `closed-lost` are left untouched and never
 * re-logged, so a re-send or a duplicate webhook can neither regress the
 * pipeline nor spam the activity feed.
 *
 * The `closed-won` tier guard is enforced *before* promoting, so an automated
 * caller (e.g. the Adobe Sign webhook) can never mint a tier-less `closed-won`
 * — which would be silently hidden from the public site. When the tier is
 * missing the promotion is skipped and a note is logged for the audit trail.
 *
 * Fails **closed**: a missing or unrecognised `status` is never treated as an
 * early stage, so a legacy record without a status (or a future call site that
 * forgets to select it) can never be silently auto-advanced.
 *
 * Guards against a TOCTOU resurrection: the caller passes a separately-fetched,
 * potentially stale `status`, so the write is a GROQ-conditional patch that
 * only sets `closed-won` while the record is *still* stored in an early stage.
 * If an admin marked the deal `closed-lost` (or it reached any terminal state)
 * between the read and this write, the patch matches nothing and the deal is
 * left untouched — no overwrite, no phantom stage-change log.
 *
 * Best-effort: failures are swallowed and returned in `error`, never thrown,
 * so a promotion problem cannot fail the contract send/sign it rides along on.
 */
export async function promoteToClosedWonOnContract(
  sponsorForConferenceId: string,
  sponsor: ContractPromotionSponsor,
  createdBy: string,
): Promise<PromotionResult> {
  const currentStatus = sponsor.status

  // Fail closed: only an explicit early stage is eligible. A missing or
  // unrecognised status must never default into a promotable stage.
  if (!currentStatus || !EARLY_PIPELINE_STAGES.includes(currentStatus)) {
    if (currentStatus && KNOWN_PIPELINE_STAGES.includes(currentStatus)) {
      // A recognised non-early stage (e.g. closed-won / closed-lost): a
      // legitimate forward-only no-op, left silent so re-sends don't spam.
      return { promoted: false, reason: 'not-early-stage' }
    }
    console.warn(
      '[promoteToClosedWonOnContract] Skipping auto-promotion for %s: status %o is missing or not a recognised early stage',
      sponsorForConferenceId,
      currentStatus,
    )
    return { promoted: false, reason: 'unknown-status' }
  }

  const guard = checkPipelineState('closed-won', {
    tier: sponsor.tier as SponsorState['tier'],
  })
  if (!guard.ok) {
    await createSponsorActivity(
      sponsorForConferenceId,
      'note',
      'Auto-promotion to Won skipped: set a sponsor tier before this deal can be marked Won.',
      createdBy,
      { timestamp: getCurrentDateTime() },
    )
    return { promoted: false, reason: 'tier-missing' }
  }

  // Conditional write: only advance while the *stored* status is still early.
  // This closes the TOCTOU window between the caller's stale read and here, so
  // a concurrently set terminal state (closed-lost / closed-won) is never
  // clobbered.
  let applied = false
  try {
    const result = await clientWrite
      .patch({
        query: '*[_id == $id && status in $earlyStages]',
        params: {
          id: sponsorForConferenceId,
          earlyStages: [...EARLY_PIPELINE_STAGES],
        },
      })
      .set({ status: 'closed-won' })
      .commit({ returnFirst: false, returnDocuments: false })
    applied = (result.results?.length ?? 0) > 0
  } catch (error) {
    console.error('Failed to auto-promote sponsor to closed-won:', error)
    return { promoted: false, error: error as Error }
  }

  if (!applied) {
    // The stored status left the early stages between the caller's read and
    // this write. Do not resurrect the deal and do not log a phantom change.
    return { promoted: false, reason: 'concurrent-transition' }
  }

  await logStageChange(
    sponsorForConferenceId,
    currentStatus,
    'closed-won',
    createdBy,
  )

  return { promoted: true }
}

export async function logInvoiceStatusChange(
  sponsorForConferenceId: string,
  oldStatus: string,
  newStatus: string,
  createdBy: string,
): Promise<{ activityId?: string; error?: Error }> {
  return createSponsorActivity(
    sponsorForConferenceId,
    'invoice_status_change',
    `Invoice status changed from ${formatStatusName(oldStatus)} to ${formatStatusName(newStatus)}`,
    createdBy,
    {
      oldValue: oldStatus,
      newValue: newStatus,
      timestamp: getCurrentDateTime(),
    },
  )
}

export async function logContractStatusChange(
  sponsorForConferenceId: string,
  oldStatus: string,
  newStatus: string,
  createdBy: string,
): Promise<{ activityId?: string; error?: Error }> {
  return createSponsorActivity(
    sponsorForConferenceId,
    'contract_status_change',
    `Contract status changed from ${formatStatusName(oldStatus ?? 'Not Set')} to ${formatStatusName(newStatus ?? 'Not Set')}`,
    createdBy,
    {
      oldValue: oldStatus,
      newValue: newStatus,
      timestamp: getCurrentDateTime(),
    },
  )
}

export async function logAssignmentChange(
  sponsorForConferenceId: string,
  assigneeName: string | null,
  createdBy: string,
): Promise<{ activityId?: string; error?: Error }> {
  const description = assigneeName
    ? `Assigned to ${assigneeName}`
    : 'Unassigned'

  return createSponsorActivity(
    sponsorForConferenceId,
    'note',
    description,
    createdBy,
    {
      additionalData: assigneeName || '',
      timestamp: getCurrentDateTime(),
    },
  )
}

export async function logEmailSent(
  sponsorForConferenceId: string,
  subject: string,
  createdBy: string,
): Promise<{ activityId?: string; error?: Error }> {
  return createSponsorActivity(
    sponsorForConferenceId,
    'email',
    `Email sent: ${subject}`,
    createdBy,
    {
      additionalData: subject,
      timestamp: getCurrentDateTime(),
    },
  )
}

export async function logSponsorCreated(
  sponsorForConferenceId: string,
  createdBy: string,
): Promise<{ activityId?: string; error?: Error }> {
  return createSponsorActivity(
    sponsorForConferenceId,
    'note',
    'Sponsor opportunity created in pipeline',
    createdBy,
    {
      timestamp: getCurrentDateTime(),
    },
  )
}

export async function logSignatureStatusChange(
  sponsorForConferenceId: string,
  oldStatus: string,
  newStatus: string,
  createdBy: string,
): Promise<{ activityId?: string; error?: Error }> {
  return createSponsorActivity(
    sponsorForConferenceId,
    'signature_status_change',
    `Signature status changed from ${formatStatusName(oldStatus ?? 'Not Started')} to ${formatStatusName(newStatus ?? 'Not Started')}`,
    createdBy,
    {
      oldValue: oldStatus,
      newValue: newStatus,
      timestamp: getCurrentDateTime(),
    },
  )
}

export async function logRegistrationComplete(
  sponsorForConferenceId: string,
  createdBy: string,
): Promise<{ activityId?: string; error?: Error }> {
  return createSponsorActivity(
    sponsorForConferenceId,
    'registration_complete',
    'Sponsor completed self-service registration',
    createdBy,
    {
      timestamp: getCurrentDateTime(),
    },
  )
}

export async function logBulkEmailSent(
  sponsorForConferenceIds: string[],
  subject: string,
  createdBy: string,
): Promise<{ success: boolean; error?: Error }> {
  try {
    const transaction = clientWrite.transaction()
    const timestamp = getCurrentDateTime()

    for (const id of sponsorForConferenceIds) {
      transaction.create({
        _type: 'sponsorActivity',
        sponsorForConference: {
          _type: 'reference',
          _ref: id,
        },
        activityType: 'email',
        description: `Broadcast email sent: ${subject}`,
        metadata: {
          additionalData: subject,
          timestamp,
        },
        createdBy: { _type: 'reference', _ref: createdBy },
        createdAt: timestamp,
      })
    }

    await transaction.commit()
    return { success: true }
  } catch (error) {
    console.error('Failed to log bulk email activities:', error)
    return { success: false, error: error as Error }
  }
}

export async function deleteSponsorActivity(
  activityId: string,
  userId: string,
): Promise<{ success: boolean; error?: Error }> {
  try {
    // Fetch the activity to check its type and creator before deleting
    const activity = await clientWrite.fetch<{
      activityType: ActivityType
      createdBy?: { _ref: string }
    }>(
      `*[_type == "sponsorActivity" && _id == $activityId][0]{ activityType, createdBy }`,
      {
        activityId,
      },
    )

    if (!activity) {
      return { success: false, error: new Error('Activity not found') }
    }

    // Only allow deleting user-supplied activity types
    const deletableTypes: ActivityType[] = ['note', 'call', 'meeting', 'email']
    if (!deletableTypes.includes(activity.activityType)) {
      return {
        success: false,
        error: new Error(
          `Cannot delete system-generated activity of type: ${activity.activityType}`,
        ),
      }
    }

    // Ensure the user is the creator of the activity
    if (activity.createdBy?._ref !== userId) {
      return {
        success: false,
        error: new Error('You can only delete your own activities'),
      }
    }

    await clientWrite.delete(activityId)
    return { success: true }
  } catch (error) {
    console.error('Failed to delete sponsor activity:', error)
    return { success: false, error: error as Error }
  }
}
