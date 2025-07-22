import { NextAuthRequest, auth } from '@/lib/auth'
import { checkOrganizerAccess } from '@/lib/auth/admin'
import {
  sendMultiSpeakerEmail,
  validateMultiSpeakerEmailRequest,
  MultiSpeakerEmailRequest,
} from '@/lib/email/speaker'

export const dynamic = 'force-dynamic'

export const POST = auth(async (req: NextAuthRequest) => {
  // Check organizer access
  const accessError = checkOrganizerAccess(req)
  if (accessError) {
    return accessError
  }

  try {
    const requestData: MultiSpeakerEmailRequest = await req.json()

    // Validate the request
    const validation = validateMultiSpeakerEmailRequest(requestData)
    if (!validation.isValid) {
      return Response.json({ error: validation.error }, { status: 400 })
    }

    const senderName = req.auth?.speaker?.name || 'Conference Organizer'

    // Send the email
    const result = await sendMultiSpeakerEmail({
      ...requestData,
      senderName,
    })

    if (result.error) {
      return Response.json(
        { error: result.error.error },
        { status: result.error.status },
      )
    }

    return Response.json(result.data, { status: 200 })
  } catch (error) {
    console.error('Error in multi-speaker email API:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
})
