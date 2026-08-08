import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { resolveMetadataBrand } from '@/lib/seo/brand'
import { emailLinkIdentifierOf } from '@/lib/auth/email-link/identity'
import { normalizeEmail } from '@/lib/speaker/email'
import { maskAddress } from '@/app/(main)/signin/confirm/pending'
import { formatDate } from '@/lib/time'
import {
  ORGANIZER_INVITE_ACCEPT_PATH,
  getOrganizerInvitationById,
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
 * The ownership evaluation here MIRRORS `organizerInvite.accept` — including its
 * ORDER — but is NOT the authority; the mutation re-checks everything. Matching
 * the order matters as much as matching the checks: an earlier draft rendered
 * `expired` / `inactive` BEFORE evaluating ownership, which handed a
 * forwarded-token holder the invitation's lifecycle state that the mutation is
 * careful never to reveal. Ownership is now decided first and every non-owner
 * lands on ONE state.
 *
 * THE ONE THING A NON-OWNER STILL LEARNS, stated because it is a deliberate
 * trade: that an invitation exists, and its address MASKED to first-initial +
 * domain. Both are unavoidable if a real invitee signed in with the wrong
 * identity is to be told which mailbox to use — and the mutation concedes the
 * same existence bit by answering FORBIDDEN rather than NOT_FOUND. The full
 * address is never rendered to a non-owner.
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
    currentEmail:
      session.speaker.email || session.user?.email || 'this account',
    provedAddress: emailLinkIdentifierOf(
      session as unknown as Record<string, unknown>,
    ),
  })

  return <OrganizerInvitePanel state={state} />
}

async function resolveState(args: {
  token: string
  signInHref: string
  currentEmail: string
  provedAddress: string | null
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

  // OWNERSHIP FIRST — see the module note. A non-owner never reaches the
  // lifecycle states below.
  const invitedNormalized = normalizeEmail(invitation.invitedEmail)
  const ownsAddress =
    !!invitedNormalized &&
    !!args.provedAddress &&
    normalizeEmail(args.provedAddress) === invitedNormalized

  if (!ownsAddress) {
    return {
      kind: 'wrong-identity',
      maskedEmail: maskAddress(invitation.invitedEmail),
      currentEmail: args.currentEmail,
      signInHref: args.signInHref,
    }
  }

  // `isOrganizerInvitationExpired` covers BOTH `status === 'expired'` and a
  // pending invitation past its date, so anything still non-pending below is
  // accepted or revoked.
  if (isOrganizerInvitationExpired(invitation)) return { kind: 'expired' }
  if (invitation.status === 'accepted' || invitation.status === 'revoked') {
    return { kind: 'inactive', status: invitation.status }
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
