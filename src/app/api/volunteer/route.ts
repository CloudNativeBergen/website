import { NextRequest, NextResponse } from 'next/server'
import { createVolunteer } from '@/lib/volunteer/sanity'
import { VolunteerFormInputSchema } from '@/lib/volunteer/validation'
import type { VolunteerInput } from '@/lib/volunteer/types'
import { PRIVACY_POLICY_VERSION } from '@/lib/privacy/config'
import { notifyNewVolunteer } from '@/lib/slack/notify'
import { getConferenceById } from '@/lib/conference/sanity'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const validationResult = VolunteerFormInputSchema.safeParse(body)

    if (!validationResult.success) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          details: validationResult.error.flatten(),
        },
        { status: 400 },
      )
    }

    const formData = validationResult.data
    const forwardedFor = req.headers.get('x-forwarded-for')
    const realIp = req.headers.get('x-real-ip')

    let ipAddress = ''
    if (forwardedFor) {
      ipAddress = forwardedFor.split(',')[0].trim()
    } else if (realIp) {
      ipAddress = realIp
    }

    const volunteerInput: VolunteerInput = {
      name: formData.name,
      email: formData.email,
      phone: formData.phone,
      occupation: formData.occupation,
      availability: formData.availability,
      preferredTasks: formData.preferredTasks,
      tshirtSize: formData.tshirtSize,
      dietaryRestrictions: formData.dietaryRestrictions,
      otherInfo: formData.otherInfo,
      conference: {
        _type: 'reference',
        _ref: formData.conferenceId,
      },
      consent: {
        dataProcessing: {
          granted: true,
          grantedAt: new Date().toISOString(),
          ipAddress: ipAddress,
        },
        privacyPolicyVersion: PRIVACY_POLICY_VERSION,
      },
    }

    const result = await createVolunteer(volunteerInput)

    if (result.error || !result.volunteer) {
      throw new Error(
        result.error?.message || 'Failed to create volunteer record',
      )
    }

    try {
      const { conference } = await getConferenceById(formData.conferenceId)
      if (conference) {
        void notifyNewVolunteer(result.volunteer, conference)
      }
    } catch {}

    return NextResponse.json(
      {
        success: true,
        volunteerId: result.volunteer._id,
      },
      { status: 201 },
    )
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to create volunteer application',
        message:
          error instanceof Error
            ? error.message
            : 'An unexpected error occurred',
      },
      { status: 500 },
    )
  }
}
