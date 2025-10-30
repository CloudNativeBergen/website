import { NextAuthRequest, auth } from '@/lib/auth'
import { verifiedEmails } from '@/lib/profile/github'
import {
  defaultEmails,
  profileEmailResponse,
  profileEmailResponseError,
} from '@/lib/profile/server'
import { updateProfileEmail } from '@/lib/profile/sanity'

export const GET = auth(async (req: NextAuthRequest) => {
  if (
    !req.auth ||
    !req.auth.user ||
    !req.auth.speaker ||
    !req.auth.speaker._id ||
    !req.auth.account
  ) {
    return profileEmailResponseError({
      emails: [],
      message: 'Unauthorized',
      type: 'authentication',
      status: 401,
    })
  }

  switch (req.auth.account?.provider) {
    case 'github':
      const result = await verifiedEmails(req.auth.account)
      const error = result.error
      let emails = result.emails

      if (emails.length === 0) {
        emails = defaultEmails(req.auth)
      }

      if (error) {
        console.error(error)
        return profileEmailResponseError({
          emails,
          message: 'Failed to fetch emails',
          error,
          status: 200,
        })
      }

      return profileEmailResponse(emails)

    default:
      console.error(
        `Emails not implemented for provider: ${req.auth.account?.provider}`,
      )
      return profileEmailResponse(defaultEmails(req.auth))
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
}) as any

export const PUT = auth(async (req: NextAuthRequest): Promise<Response> => {
  if (
    !req.auth ||
    !req.auth.user ||
    !req.auth.speaker ||
    !req.auth.speaker._id ||
    !req.auth.account
  ) {
    return profileEmailResponseError({
      emails: [],
      message: 'Unauthorized',
      type: 'authentication',
      status: 401,
    })
  }

  const { email } = await req.json()

  if (!email || email.length === 0) {
    return profileEmailResponseError({
      emails: [],
      message: 'Email is required',
      type: 'validation',
      status: 400,
    })
  }

  if (!email.match(/^.+@.+\..+$/)) {
    return profileEmailResponseError({
      emails: [],
      message: 'Email is invalid',
      type: 'validation',
      status: 400,
    })
  }

  // @TODO: validate speaker email change against verified emails

  const { error } = await updateProfileEmail(email, req.auth.speaker._id)
  if (error) {
    return profileEmailResponseError({
      emails: [],
      message: 'Failed to update email',
      error,
      status: 200,
    })
  }

  return profileEmailResponse([])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
}) as any
