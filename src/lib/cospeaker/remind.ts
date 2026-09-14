import { clientWrite } from '@/lib/sanity/client'
import {
  INVITATION_REMINDER_COOLDOWN_HOURS,
  isInvitationExpired,
  isInvitationOpen,
  reminderCooldownRemainingMs,
} from './constants'
import { sendInvitationEmail, type InvitationEmailContext } from './server'
import type { CoSpeakerInvitationFull } from './types'

export type RemindInvitationResult =
  | { ok: true }
  | {
      ok: false
      reason: 'expired' | 'not-open' | 'cooldown' | 'conflict' | 'send-failed'
      /** Only on `cooldown`: how long until another reminder is allowed. */
      remainingMs?: number
    }

/**
 * Nudge an invitation that is STILL OPEN: same token, same expiry, so the
 * invitee's link keeps working and their clock keeps running.
 *
 * THE ONE PLACE A REMINDER IS SENT. `invitation.remind` (an organizer clicking)
 * and the daily cron both route through here, so they share one cooldown claim
 * and cannot double-send: the claim is written BEFORE the email and conditioned
 * on the revision the caller read, so a loser gets Sanity's 409 and never sends.
 *
 * Authorization belongs to the caller. `context` names the tenant to send as —
 * omitted, the send resolves the conference from the request Host, which only
 * exists on a request-served call.
 */
export async function remindCoSpeakerInvitation(
  invitation: CoSpeakerInvitationFull,
  context?: InvitationEmailContext,
): Promise<RemindInvitationResult> {
  if (!isInvitationOpen(invitation)) {
    return {
      ok: false,
      reason: isInvitationExpired(invitation) ? 'expired' : 'not-open',
    }
  }

  const remainingMs = reminderCooldownRemainingMs(invitation.lastRemindedAt)
  if (remainingMs > 0) {
    return { ok: false, reason: 'cooldown', remainingMs }
  }

  try {
    await clientWrite
      .patch(invitation._id)
      .ifRevisionId(invitation._rev ?? '')
      .set({ lastRemindedAt: new Date().toISOString() })
      .commit()
  } catch (claimError) {
    console.error('Failed to claim co-speaker reminder cooldown:', claimError)
    return { ok: false, reason: 'conflict' }
  }

  const sent = await sendInvitationEmail(invitation, 'reminder', context)
  if (!sent) {
    // Release the claim so a failed send does not burn a day of cooldown. Best
    // effort: if this patch also fails the next attempt waits, which is safe.
    await clientWrite
      .patch(invitation._id)
      .unset(['lastRemindedAt'])
      .commit()
      .catch((releaseError) => {
        console.error(
          'Failed to release co-speaker reminder cooldown:',
          releaseError,
        )
      })

    return { ok: false, reason: 'send-failed' }
  }

  return { ok: true }
}

/** Human-readable reason a reminder was refused. Shared by tRPC and the cron. */
export function remindFailureMessage(
  result: Extract<RemindInvitationResult, { ok: false }>,
  invitationStatus: string,
): string {
  switch (result.reason) {
    case 'expired':
      return 'This invitation has expired. Use resend to issue a new link.'
    case 'not-open':
      return `This invitation was already ${invitationStatus} and cannot be reminded about.`
    case 'cooldown': {
      const hours = Math.ceil((result.remainingMs ?? 0) / (60 * 60 * 1000))
      return `A reminder for this invitation was sent in the last ${INVITATION_REMINDER_COOLDOWN_HOURS} hours. You can send another in ${hours} hour${hours === 1 ? '' : 's'}.`
    }
    case 'conflict':
      return 'This invitation could not be claimed for a reminder — it changed while the reminder was being sent, or its revision could not be read. Reload and try again.'
    case 'send-failed':
      return 'Failed to send the reminder email. The invitation is unchanged, so you can try again.'
  }
}
