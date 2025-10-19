'use server'

import { clientWrite } from '@/lib/sanity/client'
import { revalidatePath } from 'next/cache'

export async function updateWorkshopRegistrationTimes(
  conferenceId: string,
  startDate: string | null,
  endDate: string | null,
) {
  try {
    // Validate dates
    if (startDate && endDate && new Date(startDate) >= new Date(endDate)) {
      return {
        success: false,
        error: 'End date must be after start date',
      }
    }

    await clientWrite
      .patch(conferenceId)
      .set({
        workshop_registration_start: startDate
          ? new Date(startDate).toISOString()
          : null,
        workshop_registration_end: endDate
          ? new Date(endDate).toISOString()
          : null,
      })
      .commit()

    // Revalidate the settings page and workshop page
    revalidatePath('/admin/settings')
    revalidatePath('/workshop')

    return {
      success: true,
    }
  } catch (error) {
    console.error('Error updating workshop registration times:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update',
    }
  }
}
