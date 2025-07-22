import { NextAuthRequest, auth } from '@/lib/auth'
import { checkOrganizerAccess } from '@/lib/auth/admin'
import {
  sendSpeakerEmail,
  validateSpeakerEmailRequest,
  SpeakerEmailRequest,
} from '@/lib/email/speaker'

export const dynamic = 'force-dynamic'

export const POST = auth(async (req: NextAuthRequest) => {
  // Check organizer access
  const accessError = checkOrganizerAccess(req)
  if (accessError) {
    return accessError
  }

  try {
    const requestData: SpeakerEmailRequest = await req.json()

    // Validate the request
    const validation = validateSpeakerEmailRequest(requestData)
    if (!validation.isValid) {
      return Response.json({ error: validation.error }, { status: 400 })
    }

    const senderName = req.auth?.speaker?.name || 'Conference Organizer'

    // Send the email
    const result = await sendSpeakerEmail({
      ...requestData,
      senderName,
    })

    if (result.error) {
      return Response.json({ error: result.error.error }, { status: result.error.status })
    }

    return Response.json(result.data, { status: 200 })
  } catch (error) {
    console.error('Error in speaker email API:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
})