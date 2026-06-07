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

export async function logNote(
  sponsorForConferenceId: string,
  note: string,
  createdBy: string,
): Promise<{ activityId?: string; error?: Error }> {
  return createSponsorActivity(
    sponsorForConferenceId,
    'note',
    note,
    createdBy,
    {
      timestamp: getCurrentDateTime(),
    },
  )
}
