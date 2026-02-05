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
    old_value?: string
    new_value?: string
    timestamp?: string
    additional_data?: string
  },
): Promise<{ activityId?: string; error?: Error }> {
  try {
    const activity: SponsorActivityInput = {
      sponsor_for_conference: sponsorForConferenceId,
      activity_type: activityType,
      description,
      created_by: createdBy,
      created_at: getCurrentDateTime(),
      metadata,
    }

    const doc = {
      _type: 'sponsorActivity',
      sponsor_for_conference: {
        _type: 'reference',
        _ref: activity.sponsor_for_conference,
      },
      activity_type: activity.activity_type,
      description: activity.description,
      metadata: activity.metadata,
      created_by: { _type: 'reference', _ref: activity.created_by },
      created_at: activity.created_at,
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
      old_value: oldStatus,
      new_value: newStatus,
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
      old_value: oldStatus,
      new_value: newStatus,
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
      old_value: oldStatus,
      new_value: newStatus,
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
      additional_data: subject,
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
        sponsor_for_conference: {
          _type: 'reference',
          _ref: id,
        },
        activity_type: 'email',
        description: `Broadcast email sent: ${subject}`,
        metadata: {
          additional_data: subject,
          timestamp,
        },
        created_by: { _type: 'reference', _ref: createdBy },
        created_at: timestamp,
      })
    }

    await transaction.commit()
    return { success: true }
  } catch (error) {
    console.error('Failed to log bulk email activities:', error)
    return { success: false, error: error as Error }
  }
}
