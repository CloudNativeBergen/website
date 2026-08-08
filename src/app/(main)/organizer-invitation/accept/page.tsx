import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { resolveMetadataBrand } from '@/lib/seo/brand'
import { EMAIL_LINK_PROVIDER_ID } from '@/lib/auth/email-link/constants'
import { providerAccount } from '@/lib/speaker/sanity'
import { normalizeEmail } from '@/lib/speaker/email'
import { maskAddress } from '@/app/(main)/signin/confirm/pending'
import { formatDate } from '@/lib/time'
import {
  ORGANIZER_INVITE_ACCEPT_PATH,
  getOrganizerInvitationById,
  getSpeakerProviders,
  isOrganizerInvitationExpired,
  tokensMatch,
  verifyOrganizerInviteToken,
} from '@/lib/organizer-invite'
import {
  OrganizerInvitePanel,
  type OrganizerInviteState,
} from '@/components/organizer-invite'

/**
 * The organizer-invitation accept page (platform#49).
 *
 * SIGN-IN FIRST, like `/invitation/respond`: an anonymous visitor is bounced to
 * `/signin` before anything about the invitation is read, so the page discloses
 * nothing to a bare token holder.
 *
 * The ownership evaluation here MIRRORS `organizerInvite.accept` but is NOT the
 * authority — it exists so the page can explain what to do instead of rendering
 * a button that throws. The mutation re-checks everything.
 */

export async function generateMetadata(): Promise<Metadata> {
  const brand = await resolveMetadataBrand()
  return {
    title: { absolute: `Organizer Invitation | ${brand}` },
    description: 'Accept your invitation to join the organizer team',
    robots: { index: false, follow: false },
  }
}

interface PageProps {
  searchParams: Promise<{ token?: string }>
}

export default async function OrganizerInvitationAcceptPage({
  searchParams,
}: PageProps) {
  const params = await searchParams
  const token = typeof params.token === 'string' ? params.token : ''
  const acceptPath = `${ORGANIZER_INVITE_ACCEPT_PATH}?token=${encodeURIComponent(token)}`
  const signInHref = `/signin?callbackUrl=${encodeURIComponent(acceptPath)}`

  const session = await auth()
  if (!session?.speaker?._id) redirect(signInHref)

  const state = await resolveState({
    token,
    signInHref,
    speakerId: session.speaker._id,
    currentEmail:
      session.speaker.email || session.user?.email || 'this account',
    isEmailLinkSession: session.account?.provider === EMAIL_LINK_PROVIDER_ID,
  })

  return <OrganizerInvitePanel state={state} />
}

async function resolveState(args: {
  token: string
  signInHref: string
  speakerId: string
  currentEmail: string
  isEmailLinkSession: boolean
}): Promise<OrganizerInviteState> {
  const verified = verifyOrganizerInviteToken(args.token)
  if (!verified.ok) return { kind: 'invalid' }

  const { conference, error } = await getConferenceForCurrentDomain()
  if (error || !conference?._id) return { kind: 'invalid' }

  const invitation = await getOrganizerInvitationById(
    conference._id,
    verified.payload.docId,
  )
  // Both branches collapse to the same state: a token naming another tenant's
  // invitation must be indistinguishable from a token naming nothing.
  if (!invitation || !tokensMatch(args.token, invitation.token)) {
    return { kind: 'invalid' }
  }

  if (invitation.status === 'expired') return { kind: 'expired' }
  if (invitation.status !== 'pending') {
    return { kind: 'inactive', status: invitation.status }
  }
  if (isOrganizerInvitationExpired(invitation)) return { kind: 'expired' }

  const invitedNormalized = normalizeEmail(invitation.invitedEmail)
  const providers = args.isEmailLinkSession
    ? await getSpeakerProviders(args.speakerId)
    : null
  const ownsAddress =
    args.isEmailLinkSession &&
    !!invitedNormalized &&
    !!providers &&
    providers.includes(
      providerAccount(EMAIL_LINK_PROVIDER_ID, invitedNormalized),
    )

  if (!ownsAddress) {
    return {
      kind: 'wrong-identity',
      maskedEmail: maskAddress(invitation.invitedEmail),
      currentEmail: args.currentEmail,
      signInHref: args.signInHref,
    }
  }

  return {
    kind: 'ready',
    token: args.token,
    conferenceName: conference.title || 'this event',
    inviterName: invitation.invitedByName || 'An organizer',
    invitedEmail: invitation.invitedEmail,
    expiresAt: formatDate(invitation.expiresAt),
  }
}
