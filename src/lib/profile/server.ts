import { Session } from 'next-auth'
import { NextResponse } from 'next/server'
import {
  ProfileEmail,
  ProfileEmailResponse,
  ProfileImage,
  ProfileImageResponse,
} from '@/lib/profile/types'
import { FormValidationError } from '@/lib/proposal/types'
import { findSpeakerByEmail } from '@/lib/speaker/sanity'

export function defaultEmails(session: Session) {
  return [
    {
      email: session.user.email,
      verified: true,
      primary: true,
      visibility: 'private',
    },
  ]
}

/**
 * Check if a user is an organizer based on their email
 */
export async function isUserOrganizer(email: string): Promise<boolean> {
  try {
    const { speaker, err } = await findSpeakerByEmail(email)
    if (err || !speaker?._id) {
      return false
    }
    return speaker.is_organizer === true
  } catch {
    return false
  }
}

export function profileEmailResponseError({
  emails,
  error,
  message,
  validationErrors,
  type = 'server',
  status = 500,
}: {
  emails: ProfileEmail[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  error?: any
  message: string
  validationErrors?: FormValidationError[]
  type?: string
  status?: number
}) {
  if (error) {
    console.error(error)
  }

  error = { message, type, validationErrors }
  const response = new NextResponse(
    JSON.stringify({ emails, error, status } as ProfileEmailResponse),
    { status },
  )
  response.headers.set('cache-control', 'no-store')

  return response
}

export function profileEmailResponse(emails: ProfileEmail[]) {
  const response = NextResponse.json({ emails } as ProfileEmailResponse)
  return response
}

export function profileImageResponseError({
  image,
  error,
  message,
  type = 'server',
  status = 500,
}: {
  image?: ProfileImage
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  error?: any
  message: string
  type?: string
  status?: number
}) {
  if (error) {
    console.error(error)
  }

  error = { message, type }
  const response = new NextResponse(
    JSON.stringify({ image, error, status } as ProfileImageResponse),
    { status },
  )
  response.headers.set('cache-control', 'no-store')

  return response
}

export function profileImageResponse(image: ProfileImage) {
  const response = NextResponse.json({ image } as ProfileImageResponse)
  return response
}
