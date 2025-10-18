'use server'

import { withAuth } from '@workos-inc/authkit-nextjs'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import {
  createWorkshopSignup,
  checkWorkshopCapacity,
  verifyWorkshopBelongsToConference,
  getWorkshopById,
  updateWorkshopSignupEmailStatus,
} from '@/lib/workshop/sanity'
import { workshopSignupInputSchema } from '@/server/schemas/workshop'
import { sendBasicWorkshopConfirmation } from '@/lib/email/workshop'
export async function signupForWorkshop(workshopId: string) {
  try {
    const { user } = await withAuth({ ensureSignedIn: true })

    if (!user) {
      return {
        success: false,
        error: 'Authentication required',
      }
    }

    const { conference, error: confError } =
      await getConferenceForCurrentDomain()
    if (confError || !conference?._id) {
      return {
        success: false,
        error: 'Conference not found',
      }
    }

    const workshopValid = await verifyWorkshopBelongsToConference(
      workshopId,
      conference._id,
    )
    if (!workshopValid) {
      return {
        success: false,
        error: 'Workshop not found or not available for this conference',
      }
    }

    const hasCapacity = await checkWorkshopCapacity(workshopId)
    if (!hasCapacity) {
      return {
        success: false,
        error: 'This workshop is at full capacity',
      }
    }

    const signupData = workshopSignupInputSchema.parse({
      userWorkOSId: user.id,
      userEmail: user.email,
      userName:
        user.firstName && user.lastName
          ? `${user.firstName} ${user.lastName}`
          : user.email,
      workshop: {
        _type: 'reference' as const,
        _ref: workshopId,
      },
      conference: {
        _type: 'reference' as const,
        _ref: conference._id,
      },
    })

    const signup = await createWorkshopSignup(signupData)

    let emailSent = false
    let emailError: string | undefined

    try {
      const workshop = await getWorkshopById(workshopId)

      if (workshop) {
        await sendBasicWorkshopConfirmation({
          userEmail: signup.userEmail,
          userName: signup.userName,
          status: signup.status,
          conference: conference || undefined,
          workshopTitle: workshop.title || 'Workshop',
          workshopDate: workshop.date,
          workshopTime: workshop.startTime,
        })

        await updateWorkshopSignupEmailStatus(signup._id, true)
        emailSent = true
      }
    } catch (error) {
      // Log error but don't fail the signup
      console.error('Error sending workshop confirmation email:', error)
      emailError = error instanceof Error ? error.message : 'Unknown error'
    }

    revalidatePath('/workshop')

    return {
      success: true,
      data: signup,
      emailSent,
      emailError,
    }
  } catch (error) {
    console.error('Workshop signup error:', error)

    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: 'Invalid signup data',
      }
    }

    if (error instanceof Error) {
      if (error.message.includes('already signed up')) {
        return {
          success: false,
          error: 'You are already signed up for this workshop',
        }
      }
      if (error.message.includes('full capacity')) {
        return {
          success: false,
          error: 'This workshop is at full capacity',
        }
      }
      return {
        success: false,
        error: error.message,
      }
    }

    return {
      success: false,
      error: 'Failed to sign up for workshop. Please try again.',
    }
  }
}

export async function cancelWorkshopSignup(signupId: string) {
  try {
    const { user } = await withAuth({ ensureSignedIn: true })

    if (!user) {
      return {
        success: false,
        error: 'Authentication required',
      }
    }

    const { cancelWorkshopSignup } = await import('@/lib/workshop/sanity')
    const cancelled = await cancelWorkshopSignup(signupId, user.id)

    revalidatePath('/workshop')

    return {
      success: true,
      data: cancelled,
    }
  } catch (error) {
    console.error('Workshop cancellation error:', error)

    if (error instanceof Error) {
      return {
        success: false,
        error: error.message,
      }
    }

    return {
      success: false,
      error: 'Failed to cancel workshop signup. Please try again.',
    }
  }
}
