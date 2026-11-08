import { NextRequest, NextResponse } from 'next/server'
import { unstable_noStore as noStore } from 'next/cache'
import { z } from 'zod'
import {
  SERVICE_ASSERTION_HEADER,
  verifyServiceAssertion,
} from '@/lib/provisioning'
import { sendEmail } from '@/lib/cospeaker/server'
import { platformFallbackFrom } from '@/lib/email/from'
import { IdentityInvitationTemplate } from '@/components/email/IdentityInvitationTemplate'

/**
 * `POST /api/identity/service/invitations` (#2130): emails an identity
 * organization invitation. identity asks tenant-directory (its SiteMail
 * entrypoint), which signs a 60-second assertion over the exact body for the
 * `konf-site-invitations` audience, so a provisioning assertion is refused
 * here and this one is refused there. Unset TENANT_DIRECTORY_PUBLIC_KEYS
 * refuses everyone.
 *
 * The link is built here, on the fixed identity host: the body cannot point
 * the email anywhere else.
 *
 *   body: { invitationId, email, orgId, orgName, inviterName }
 *   200 { sent: true } · 400 · 401 · 502 (Resend refused)
 */

const IDENTITY_INVITE_BASE = 'https://id.konf.app/invite/'
const AUDIENCE = 'konf-site-invitations'

const Body = z.object({
  invitationId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
  email: z.email().max(320),
  orgId: z.string().min(1).max(200),
  orgName: z.string().regex(/^[^\r\n]{1,200}$/),
  inviterName: z.string().regex(/^[^\r\n]{0,200}$/),
})

export async function POST(request: NextRequest): Promise<NextResponse> {
  noStore()
  const raw = await request.text()
  const sub = await verifyServiceAssertion(
    request.headers.get(SERVICE_ASSERTION_HEADER),
    process.env.TENANT_DIRECTORY_PUBLIC_KEYS,
    raw,
    AUDIENCE,
  )
  if (!sub) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  }
  const body = Body.safeParse(json)
  if (!body.success)
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  const { invitationId, email, orgId, orgName, inviterName } = body.data

  const result = await sendEmail({
    to: email,
    subject: `You've been invited to join ${orgName}`,
    from: platformFallbackFrom(),
    orgId,
    component: IdentityInvitationTemplate,
    props: {
      orgName,
      inviterName: inviterName || 'A member',
      invitationUrl: `${IDENTITY_INVITE_BASE}${invitationId}`,
    },
  })
  if (!result.success) {
    console.error(`[identity/invitations] send failed for ${invitationId}`)
    return NextResponse.json({ error: 'send_failed' }, { status: 502 })
  }
  return NextResponse.json({ sent: true })
}
