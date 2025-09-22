import { NextAuthRequest, auth } from '@/lib/auth'
import { setupEmailRoute } from '@/lib/email/route-helpers'
import { sendBroadcastEmail } from '@/lib/email/broadcast'

export const dynamic = 'force-dynamic'

export const POST = auth(async (req: NextAuthRequest) => {
  try {
    const { subject, message } = await req.json()

    const { context, error } = await setupEmailRoute(req, { subject, message })
    if (error) {
      return error
    }

    return await sendBroadcastEmail({
      conference: context!.conference,
      subject: context!.subject,
      messagePortableText: context!.messagePortableText,
      audienceType: 'sponsors',
    })
  } catch {
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
})
