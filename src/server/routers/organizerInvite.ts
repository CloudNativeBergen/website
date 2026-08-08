import { TRPCError } from '@trpc/server'
import {
  router,
  adminProcedure,
  protectedProcedure,
  resolveConferenceId,
} from '../trpc'
import { requireDocumentInCurrentOrg } from '../tenancy'
import {
  OrganizerInviteAcceptSchema,
  OrganizerInviteCreateSchema,
  OrganizerInviteRevokeSchema,
} from '../schemas/organizerInvite'
import { clientWrite } from '@/lib/sanity/client'
import { createReferenceWithKey } from '@/lib/sanity/helpers'
import { canonicalEmail, normalizeEmail } from '@/lib/speaker/email'
import { providerAccount } from '@/lib/speaker/sanity'
import { EMAIL_LINK_PROVIDER_ID } from '@/lib/auth/email-link/constants'
import { isPlausibleEmail } from '@/lib/auth/email-link/request'
import { revalidateTag } from 'next/cache'
import { conferenceTag } from '@/lib/cache/tags'
import {
  createOrganizerInvitation,
  getConferenceOrganizerIds,
  getOrganizerInvitationById,
  getSpeakerProviders,
  hasPendingOrganizerInvitation,
  isEmailAlreadyOrganizer,
  isOrganizerInvitationExpired,
  listOrganizerInvitations,
  sendOrganizerInvitationEmail,
  toMinimalOrganizerInvitation,
  tokensMatch,
  verifyOrganizerInviteToken,
  type OrganizerInvitationStatus,
} from '@/lib/organizer-invite'

/**
 * ORGANIZER INVITE BY EMAIL (platform#49 phases 1-2).
 *
 * `conference.organizers[]` is the canonical `/admin` grant. Until now the only
 * editor was `conference.updateOrganizers`, whose picker corpus is *confirmed
 * speakers of this conference plus current organizers* — so a founding organizer
 * on a fresh tenant had nobody to pick and could not grow a committee at all.
 * This router is the missing door.
 *
 * THE SECURITY CORE, stated once. The bearer token in the invitation mail is NOT
 * ownership proof — invitation mail is forwarded and lands in shared inboxes.
 * The single accepted proof is that the accepting session's speaker has REDEEMED
 * AN EMAIL MAGIC LINK sent to the invited address, evidenced by
 * `providers[] contains "email-link:<address>"`. That entry is written by exactly
 * one code path (`getOrCreateSpeakerForVerifiedEmail`) and only after such a link
 * was redeemed.
 *
 * WHY NOT `knownEmails`, and why not the display `email`. Both are matched by
 * `findSpeakersByEmails`, and `knownEmails` has a wider writer set that has
 * historically included unverified sources (#808). Inheriting that taint on a
 * CONFERENCE-ADMIN grant is precisely the account-takeover primitive this
 * feature must not create. `providers[]` is narrower and means one thing only.
 *
 * WHAT THIS DELIBERATELY NEVER DOES: it never attaches an identity to a speaker
 * document and never writes an identity field (`email`, `knownEmails`,
 * `providers`). The only write on acceptance is the conference's `organizers[]`
 * and the invitation's own status. Identity resolution happens earlier, inside
 * the shipped email sign-in path, on an address whose ownership was proved by
 * delivery.
 *
 * SCOPE OF THE GRANT. `organizerOrgIds` is derived from
 * `*[_type == "conference" && ^._id in organizers[]._ref].organization._ref`, so
 * appending someone here grants standing in THIS conference's organization and
 * nowhere else. `speaker` is a global document; that is exactly why the grant
 * lives on the conference and not on the person.
 */

/** A refusal that never distinguishes "no such invitation" from "not yours". */
function invitationNotFound(): TRPCError {
  return new TRPCError({
    code: 'NOT_FOUND',
    message: 'Invitation not found',
  })
}

export const organizerInviteRouter = router({
  /**
   * Pending and historic invitations for the request's conference, token
   * stripped. `adminProcedure` — the org-scoped authz waist is the only gate
   * needed; the conference is server-resolved.
   */
  list: adminProcedure.query(async () => {
    const conferenceId = await resolveConferenceId()
    return listOrganizerInvitations(conferenceId)
  }),

  /**
   * Issue an invitation to an email address.
   *
   * Every guard here REJECTS, so each one matches on the WIDER NFKC-folded
   * `normalizeEmail` key: a wider key rejects more, which fails closed. The one
   * value that is STORED and later GRANTED against is `canonicalEmail` (trim +
   * lowercase, no NFKC) — and the two are required to agree, below, which is
   * what keeps the claim set exactly equal to the delivery set.
   */
  invite: adminProcedure
    .input(OrganizerInviteCreateSchema)
    .mutation(async ({ ctx, input }) => {
      const conferenceId = await resolveConferenceId()
      const normalized = normalizeEmail(input.email)
      const canonical = canonicalEmail(input.email)

      if (!isPlausibleEmail(normalized)) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Enter a valid email address.',
        })
      }

      // THE ADDRESS WE MAIL MUST BE THE ADDRESS WE GRANT AGAINST. NFKC folding
      // rewrites the local part (`o<ligature>ice@x.com` -> `office@x.com`) and
      // nothing guarantees the folded address reaches the same mailbox. The
      // email-link mint path refuses such addresses for the same reason; if it
      // did not, the sign-in that proves ownership could never be requested for
      // this invitee anyway. Refusing (rather than silently folding) fails
      // closed.
      if (normalized !== canonical) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message:
            'That email address contains characters we cannot deliver to reliably. Please retype it using plain characters.',
        })
      }

      if (normalized === normalizeEmail(ctx.speaker.email)) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'You are already an organizer of this conference.',
        })
      }

      if (await isEmailAlreadyOrganizer(conferenceId, normalized)) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'That person is already an organizer of this conference.',
        })
      }

      if (await hasPendingOrganizerInvitation(conferenceId, normalized)) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'An invitation is already pending for that address.',
        })
      }

      const invitation = await createOrganizerInvitation({
        conferenceId,
        invitedBySpeakerId: ctx.speaker._id,
        // As TYPED — `createOrganizerInvitation` applies the delivery-safe
        // canonicalization. The normalized key above is a comparison key only
        // and must never become the mailbox a token is sent to.
        invitedEmail: input.email,
        invitedName: input.name,
      })

      if (!invitation) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to create the invitation',
        })
      }

      const sent = await sendOrganizerInvitationEmail({
        invitation,
        inviterName: ctx.speaker.name,
        inviterEmail: ctx.speaker.email,
      })

      if (!sent) {
        // An invitation nobody was told about is worse than none: it occupies
        // the duplicate-pending slot and shows as pending in the admin list.
        try {
          await clientWrite.delete(invitation._id)
        } catch (cleanupError) {
          console.error(
            'Failed to clean up orphaned organizer invitation:',
            cleanupError,
          )
        }
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message:
            'Could not send the invitation email. Check the address and try again.',
        })
      }

      // Never expose the bearer token to the inviter's browser.
      return toMinimalOrganizerInvitation(invitation)
    }),

  /**
   * Revoke a pending invitation.
   *
   * `requireDocumentInCurrentOrg` runs FIRST and before any read of our own —
   * the #746 type-confusion guard. Without it a crafted id of another `_type`
   * (a `review`, a `conversation`, another tenant's `conference`) would be
   * patched by the write below, because `adminProcedure` only proves the caller
   * organizes SOME org and Sanity will happily patch any document in the shared
   * dataset.
   */
  revoke: adminProcedure
    .input(OrganizerInviteRevokeSchema)
    .mutation(async ({ input }) => {
      await requireDocumentInCurrentOrg(
        input.invitationId,
        'organizerInvitation',
      )
      const conferenceId = await resolveConferenceId()
      const invitation = await getOrganizerInvitationById(
        conferenceId,
        input.invitationId,
      )
      if (!invitation) throw invitationNotFound()

      if (invitation.status !== 'pending') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'That invitation is no longer pending.',
        })
      }

      await clientWrite
        .patch(invitation._id)
        .set({
          status: 'revoked' satisfies OrganizerInvitationStatus,
          respondedAt: new Date().toISOString(),
        })
        .commit()

      return { _id: invitation._id, status: 'revoked' as const }
    }),

  /**
   * Accept an invitation and take the organizer grant.
   *
   * `protectedProcedure`, NOT `adminProcedure`: the invitee is by definition not
   * yet an organizer. Authorization is the invitation plus the ownership proof
   * below — never the caller's existing standing.
   *
   * CHECK ORDER IS LOAD-BEARING and mirrors `proposal.invitation.respond`:
   *
   *   token signature -> conference-scoped lookup -> stored-token compare
   *   -> status -> OWNERSHIP -> EXPIRY -> grant
   *
   * Ownership is checked BEFORE expiry because the expiry branch WRITES
   * (`status: 'expired'`) and its error text differs from every other refusal.
   * Checking expiry first would let a stranger holding a forwarded token learn
   * that the invitation exists and has lapsed, and would let them burn it.
   * Everything before the ownership check refuses with one identical
   * `NOT_FOUND`, so nothing upstream is an oracle either.
   */
  accept: protectedProcedure
    .input(OrganizerInviteAcceptSchema)
    .mutation(async ({ ctx, input }) => {
      // GUARD BEFORE FETCH: an unsigned or tampered token is refused without
      // touching Sanity at all.
      const verified = verifyOrganizerInviteToken(input.token)
      if (!verified.ok) throw invitationNotFound()

      // The conference is the REQUEST's, from the host — so an invitation minted
      // for another tenant simply does not resolve, and the refusal is the same
      // NOT_FOUND as a bad token.
      const conferenceId = await resolveConferenceId()
      const invitation = await getOrganizerInvitationById(
        conferenceId,
        verified.payload.docId,
      )
      if (!invitation) throw invitationNotFound()
      if (!tokensMatch(input.token, invitation.token)) {
        throw invitationNotFound()
      }

      if (invitation.status !== 'pending') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'This invitation is no longer active.',
        })
      }

      // ── OWNERSHIP ──────────────────────────────────────────────────────────
      const invitedCanonical = canonicalEmail(invitation.invitedEmail)
      const invitedNormalized = normalizeEmail(invitation.invitedEmail)
      // A stored address whose two forms disagree cannot have been issued by
      // `invite` above; treat it as unclaimable rather than picking a form.
      if (
        !invitedCanonical ||
        !invitedNormalized ||
        invitedCanonical !== invitedNormalized
      ) {
        throw forbiddenWrongIdentity()
      }

      // v1 accepts ONLY an email-link session. OAuth-session acceptance is
      // deferred (platform#49 phase 3, gated on #808) precisely because the
      // address on an OAuth session is matched through the wider, more weakly
      // written `knownEmails` set.
      if (ctx.session?.account?.provider !== EMAIL_LINK_PROVIDER_ID) {
        throw forbiddenWrongIdentity()
      }

      const providers = await getSpeakerProviders(ctx.speaker._id)
      // FAIL CLOSED: an unreadable probe proves no ownership.
      if (!providers) throw forbiddenWrongIdentity()
      if (
        !providers.includes(
          providerAccount(EMAIL_LINK_PROVIDER_ID, invitedNormalized),
        )
      ) {
        throw forbiddenWrongIdentity()
      }

      // ── EXPIRY ─────────────────────────────────────────────────────────────
      if (isOrganizerInvitationExpired(invitation)) {
        try {
          await clientWrite
            .patch(invitation._id)
            .set({ status: 'expired' satisfies OrganizerInvitationStatus })
            .commit()
        } catch (expireError) {
          console.error(
            'Failed to mark organizer invitation as expired:',
            expireError,
          )
        }
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message:
            'This invitation has expired. Ask an organizer to send a new one.',
        })
      }

      // ── GRANT ──────────────────────────────────────────────────────────────
      // The only id written is `ctx.speaker._id` — the caller's own,
      // server-derived identity, never client input. It is appended, never
      // replaced, so the `min(1)` validation on `organizers[]` cannot be
      // violated from here and no sitting organizer can be displaced.
      const currentOrganizerIds = await getConferenceOrganizerIds(conferenceId)
      const alreadyOrganizer = currentOrganizerIds.includes(ctx.speaker._id)

      const transaction = clientWrite.transaction()
      if (!alreadyOrganizer) {
        transaction.patch(conferenceId, (patch) =>
          patch
            .setIfMissing({ organizers: [] })
            .append('organizers', [
              createReferenceWithKey(ctx.speaker._id, 'organizer'),
            ]),
        )
      }
      transaction.patch(invitation._id, (patch) =>
        patch.set({
          status: 'accepted' satisfies OrganizerInvitationStatus,
          respondedAt: new Date().toISOString(),
          acceptedSpeaker: {
            _type: 'reference' as const,
            _ref: ctx.speaker._id,
          },
        }),
      )
      await transaction.commit()

      // Bust the tenant-scoped conference read so the settings page reflects the
      // new organizer immediately. The GRANT itself is already committed — a
      // failure here is a staleness bug, never a lost grant, so it is swallowed.
      try {
        revalidateTag(conferenceTag(conferenceId), 'default')
      } catch (error) {
        console.error(
          'Failed to revalidate conference after organizer grant:',
          error,
        )
      }

      return { _id: invitation._id, status: 'accepted' as const }
    }),
})

/**
 * The ONE refusal every ownership branch uses. A single message and code means
 * the caller cannot tell WHICH condition failed — whether the invitation is for
 * a different address, whether they signed in the wrong way, or whether the
 * providers probe failed — so none of them is an oracle.
 */
function forbiddenWrongIdentity(): TRPCError {
  return new TRPCError({
    code: 'FORBIDDEN',
    message:
      'This invitation can only be accepted by signing in with an email sign-in link sent to the invited address.',
  })
}
