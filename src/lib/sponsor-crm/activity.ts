import { clientWrite } from '@/lib/sanity/client'
import { getCurrentDateTime } from '@/lib/time'
import type { ActivityType, SponsorActivityInput } from './types'
import { formatStatusName } from '@/components/admin/sponsor-crm/utils'

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

export async function logOnboardingComplete(
  sponsorForConferenceId: string,
  createdBy: string,
): Promise<{ activityId?: string; error?: Error }> {
  return createSponsorActivity(
    sponsorForConferenceId,
    'onboarding_complete',
    'Sponsor completed self-service onboarding',
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
