import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { z } from 'zod'
import { getAuthSession } from '@/lib/auth'
import { isOrganizerForOrg, resolveCurrentOrgId } from '@/lib/authz/organizer'
import { normalizeEmail } from '@/lib/speaker/email'
import {
  OrgErasureConflictError,
  runOrgErasure,
} from '@/lib/privacy/org-erasure'

/**
 * A speaker erasure waits FEEDBACK_SETTLE_MS (60 s or more) before folding
 * Session Feedback, so this one write has its own route and limit rather
 * than raising the limit of every tRPC call.
 */
export const maxDuration = 300

// One address per request, bounded like any address field (RFC 5321: 254).
const Body = z.object({
  email: z.string().trim().email().max(254),
  confirmEmail: z.string().max(254),
})

const json = (status: number, body: unknown) =>
  NextResponse.json(body, { status })

/**
 * The erase step of the admin Privacy page (#1045, #1310). Same gate as
 * `adminProcedure`: an organizer of the request's organization. The plan is
 * recomputed from the address; the client never sends one.
 */
export async function POST(request: Request) {
  const session = await getAuthSession()
  if (!session?.speaker?._id) return json(404, { error: 'Not found' })
  const orgId = await resolveCurrentOrgId()
  if (!orgId || !isOrganizerForOrg(session.speaker, orgId)) {
    return json(404, { error: 'Not found' })
  }

  const parsed = Body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return json(400, { error: 'Invalid request' })
  const { email, confirmEmail } = parsed.data
  if (normalizeEmail(confirmEmail) !== normalizeEmail(email)) {
    return json(400, { error: 'Type the email address exactly to confirm.' })
  }

  try {
    return json(
      200,
      await runOrgErasure(
        email,
        orgId,
        `organizer:${session.speaker._id}`,
        (tag, profile) => revalidateTag(tag, profile),
      ),
    )
  } catch (error) {
    if (error instanceof OrgErasureConflictError) {
      return json(409, {
        error:
          'Something changed while erasing. Run the preview again and retry.',
      })
    }
    return json(400, {
      error: error instanceof Error ? error.message : String(error),
    })
  }
}
