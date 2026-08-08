import { clientWrite } from '@/lib/sanity/client'
import { createReference } from '@/lib/sanity/helpers'
// `sendEmail` is the repo's generic Resend wrapper (tenant client resolution +
// retry + never-throws). It happens to live in the co-speaker module; reused
// rather than duplicated so the tenant sender policy has ONE implementation.
import { sendEmail } from '@/lib/cospeaker/server'
import { OrganizerInvitationTemplate } from '@/components/email/OrganizerInvitationTemplate'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { conferenceBaseUrl } from '@/lib/conference/baseUrl'
import { emailBrandColor } from '@/lib/branding/theme'
import { canonicalEmail } from '@/lib/speaker/email'
import { AppEnvironment } from '@/lib/environment'
import { PLATFORM_NAME } from '@/lib/branding/platform'
import { formatDate } from '@/lib/time'
import { mintOrganizerInviteToken } from './token'
import {
  ORGANIZER_INVITATION_VALID_DAYS,
  type OrganizerInvitationFull,
} from './types'

/** Where an invitee lands to accept. Public route; the token is its capability. */
export const ORGANIZER_INVITE_ACCEPT_PATH = '/organizer-invitation/accept'

/**
 * Create the invitation document and its bearer token.
 *
 * The address is stored with `canonicalEmail` (trim + lowercase, NO NFKC), and
 * for the same reason the co-speaker flow does: `invitedEmail` is both the
 * mailbox the token is delivered to and the key acceptance is GRANTED against.
 * NFKC folding rewrites the local part (`o<ligature>ice@x.com` -> `office@x.com`)
 * and nothing guarantees the folded address reaches the same mailbox, so a
 * folded key would admit a claimant the mail never reached. The router
 * additionally REFUSES any address whose normalized and canonical forms differ,
 * mirroring the email-link mint path — which is what keeps the claim set exactly
 * equal to the delivery set.
 *
 * Two writes, like `createCoSpeakerInvitation`: the token names the document, so
 * the document must exist before the token can be minted.
 */
export async function createOrganizerInvitation(params: {
  conferenceId: string
  invitedBySpeakerId: string
  /** As typed by the inviter; canonicalized here. */
  invitedEmail: string
  invitedName?: string
  now?: Date
}): Promise<OrganizerInvitationFull | null> {
  try {
    const now = params.now ?? new Date()
    const expiresAt = new Date(now)
    expiresAt.setDate(expiresAt.getDate() + ORGANIZER_INVITATION_VALID_DAYS)
    const invitedEmail = canonicalEmail(params.invitedEmail)

    const created = await clientWrite.create({
      _type: 'organizerInvitation',
      conference: createReference(params.conferenceId),
      invitedBy: createReference(params.invitedBySpeakerId),
      invitedEmail,
      ...(params.invitedName ? { invitedName: params.invitedName } : {}),
      status: 'pending',
      expiresAt: expiresAt.toISOString(),
      createdAt: now.toISOString(),
    })

    // NO TEST-MODE SHORTCUT here, deliberately. The co-speaker flow substitutes
    // a `test-<id>` string in test mode, which works there only because
    // redemption is an exact string lookup that never checks a signature.
    // Acceptance here DOES verify, so a stub token would mint an invitation
    // nobody — including a developer — could ever accept. The test-mode branch
    // lives in the SEND path instead, where it belongs.
    const token = mintOrganizerInviteToken({
      docId: created._id,
      invitedEmail,
      expiresAt: expiresAt.getTime(),
    })

    // A document created without its token is unusable AND harmful: it is
    // `pending`, so it occupies the duplicate-pending slot and blocks the
    // organizer from simply retrying. Roll it back rather than leave it.
    let updated
    try {
      updated = await clientWrite.patch(created._id).set({ token }).commit()
    } catch (patchError) {
      console.error(
        'Organizer invitation created but the token could not be stored; rolling back',
        patchError,
      )
      try {
        await clientWrite.delete(created._id)
      } catch (cleanupError) {
        console.error(
          'Failed to roll back a token-less organizer invitation:',
          cleanupError,
        )
      }
      return null
    }

    return {
      _id: updated._id,
      invitedEmail,
      invitedName: params.invitedName,
      status: 'pending',
      token,
      expiresAt: expiresAt.toISOString(),
      createdAt: now.toISOString(),
      conferenceId: params.conferenceId,
      invitedById: params.invitedBySpeakerId,
    }
  } catch (error) {
    console.error('Error creating organizer invitation:', error)
    return null
  }
}

/**
 * Mail the invitation. Returns false on any failure so the caller can delete the
 * orphaned document rather than leave an invitation nobody was told about.
 */
export async function sendOrganizerInvitationEmail(params: {
  invitation: OrganizerInvitationFull
  inviterName: string
  inviterEmail: string
}): Promise<boolean> {
  const { invitation, inviterName, inviterEmail } = params
  try {
    if (!invitation.token) {
      console.error('No token on organizer invitation:', invitation._id)
      return false
    }

    const {
      conference,
      domain,
      error: conferenceError,
    } = await getConferenceForCurrentDomain()
    if (conferenceError || !conference || !domain) {
      console.error(
        'Cannot send organizer invitation: failed to resolve conference or domain',
        conferenceError,
      )
      return false
    }

    // The link is minted from the REQUEST host, which is the host the inviting
    // organizer is signed in on and therefore one the conference claims. That
    // matters beyond cosmetics: email magic-link sign-in refuses to mint or
    // redeem on a host no conference claims (`isServedTenantHost`), so an
    // invitation pointed at any other origin would be unacceptable by
    // construction.
    const protocol = domain.includes('localhost') ? 'http://' : 'https://'
    const invitationUrl = `${protocol}${domain}${ORGANIZER_INVITE_ACCEPT_PATH}?token=${encodeURIComponent(invitation.token)}`

    if (AppEnvironment.isTestMode) {
      console.log('[TEST MODE] Would send organizer invitation email:')
      console.log('To:', invitation.invitedEmail)
      console.log('Invitation URL:', invitationUrl)
      return true
    }

    const result = await sendEmail({
      to: invitation.invitedEmail,
      subject: `You've been invited to organize ${conference.title || PLATFORM_NAME}`,
      from: `${conference.organizer} <${conference.contactEmail}>`,
      orgId: conference.organization?._ref,
      component: OrganizerInvitationTemplate,
      props: {
        inviterName,
        inviterEmail,
        inviteeName: invitation.invitedName || 'there',
        invitedEmail: invitation.invitedEmail,
        invitationUrl,
        eventName: conference.title || PLATFORM_NAME,
        eventLocation:
          [conference.city, conference.country].filter(Boolean).join(', ') ||
          'Location TBA',
        eventDate: conference.startDate
          ? formatDate(conference.startDate)
          : 'TBD',
        eventUrl: conferenceBaseUrl(conference),
        expiresAt: formatDate(invitation.expiresAt),
        socialLinks: conference.socialLinks || [],
        brandColor: emailBrandColor(conference.theme),
      },
    })

    return result.success
  } catch (error) {
    console.error('Error sending organizer invitation email:', error)
    return false
  }
}
