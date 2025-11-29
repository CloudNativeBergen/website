import { NextAuthRequest, auth } from '@/lib/auth'
import { setupEmailRoute } from '@/lib/email/route-helpers'
import { sendBroadcastEmail } from '@/lib/email/broadcast'

export const POST = auth(async (req: NextAuthRequest) => {
  const startTime = Date.now()

  try {
    const { subject, message } = await req.json()

    const { context, error } = await setupEmailRoute(req, { subject, message })
    if (error) {
      console.warn('[SponsorBroadcast] Setup failed:', {
        status: error.status,
      })
      return error
    }

    const result = await sendBroadcastEmail({
      conference: context!.conference,
      subject: context!.subject,
      messagePortableText: context!.messagePortableText,
      audienceType: 'sponsors',
    })

    if (!result.ok) {
      const duration = Date.now() - startTime
      const errorData = await result.json()
      console.error('[SponsorBroadcast] Broadcast failed:', {
        status: result.status,
        error: errorData,
        durationMs: duration,
      })
    }

    return result
  } catch (error) {
    const duration = Date.now() - startTime
    console.error('[SponsorBroadcast] Unexpected error:', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      type: error?.constructor?.name,
      durationMs: duration,
    })
    return Response.json(
      {
        error: 'Internal server error during broadcast',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    )
  }
})
