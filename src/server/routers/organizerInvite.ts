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
import { emailLinkIdentifierOf } from '@/lib/auth/email-link/identity'
import { isPlausibleEmail } from '@/lib/auth/email-link/request'
import { revalidateTag } from 'next/cache'
import { conferenceTag } from '@/lib/cache/tags'
import {
  createOrganizerInvitation,
  getConferenceOrganizerIds,
  getOrganizerInvitationById,
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
 * The single accepted proof is `session.emailLinkIdentifier`: the address THIS
 * session proved by redeeming an email magic link, stamped onto the JWT at the
 * moment of redemption (`src/lib/auth/email-link/identity.ts`).
 *
 * WHY A SESSION CLAIM AND NOT DOCUMENT STATE — this was got wrong first, so the
 * reasoning is recorded. The obvious proof is `speaker.providers[]` containing
 * `email-link:<address>`, since only `getOrCreateSpeakerForVerifiedEmail` MINTS
 * such an entry, and only after a link to that address was redeemed. But
 * `providers[]` is an ACCUMULATING dedup key, not an assertion about the person
 * holding the session: `mergeSpeakers` unions a loser's `providers[]` onto the
 * survivor, so an organizer of any org who can arrange to merge a document
 * carrying `email-link:victim@x` moves that entry onto their own — and could
 * then present it here as proof of a mailbox they never controlled. Reading the
 * fact from the session instead of the document removes the laundering path AND
 * the weaker "controlled it at some point" semantics in one move.
 *
 * WHY NOT `knownEmails`, and why not the display `email`. Both are matched by
 * `findSpeakersByEmails`, and `knownEmails` has a wider writer set that has
 * historically included unverified sources (#808). Inheriting that taint on a
 * CONFERENCE-ADMIN grant is precisely the account-takeover primitive this
 * feature must not create.
 *
 * ABSENT MEANS NO PROOF. OAuth sessions carry no claim, and neither does a
 * session minted before it existed, so both are refused — which is also how
 * platform#49 phase 3 (OAuth accept, gated on #808) stays deferred by
 * construction rather than by a separate check.
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

      // REVISION-CONDITIONED, symmetrically with `accept`. Guarding only the
      // accept side closed the race in ONE direction: if an accept commits
      // between the read above and this write, an unconditional patch would
      // overwrite `accepted` with `revoked`, report success, and leave a live
      // organizer whose invitation reads "revoked" — destroying the acceptance
      // provenance and making the document purge-eligible. The status check
      // above is made against a stale read; this is what makes it binding.
      if (!invitation._rev) {
        throw new TRPCError({
          code: 'CONFLICT',
          message:
            'This invitation could not be read cleanly. Reload the page and try again.',
        })
      }

      try {
        await clientWrite
          .patch(invitation._id)
          .ifRevisionId(invitation._rev)
          .set({
            status: 'revoked' satisfies OrganizerInvitationStatus,
            respondedAt: new Date().toISOString(),
          })
          .commit()
      } catch (error) {
        console.error('Organizer invitation revoke failed:', error)
        throw new TRPCError({
          code: 'CONFLICT',
          message:
            'This invitation changed while you were revoking it. Reload the page and try again.',
        })
      }

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
   *   -> OWNERSHIP -> expiry -> status -> grant
   *
   * OWNERSHIP IS FIRST, and both things below it are below it for a reason.
   * The expiry branch WRITES (`status: 'expired'`) and its error text differs
   * from every other refusal, so checking it first would let a stranger holding
   * a forwarded token learn the invitation exists and has lapsed — and burn it.
   * The status gate is below for the same reason in a quieter form: a distinct
   * "no longer active" above ownership tells that same stranger pending from
   * revoked/accepted, which is an existence-AND-state oracle. Everything above
   * ownership refuses with one identical `NOT_FOUND`.
   *
   * Status sits below EXPIRY so a lapsed invitation gets the expiry message and
   * its "ask for a new one" instruction rather than a generic one.
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

      // ── OWNERSHIP ──────────────────────────────────────────────────────────
      // FIRST, before ANY branch whose refusal differs. Everything above this
      // point returns one identical NOT_FOUND, so a stranger holding a
      // forwarded token learns nothing — not whether the invitation exists, not
      // its lifecycle state, and not (via the expiry write below) how to burn
      // it. The status and expiry checks are deliberately BELOW: their messages
      // are precise because by then we are talking to the invitee.
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

      // THE SESSION THAT PROVED THE MAILBOX MUST BE THE SESSION THAT IS GRANTED.
      // Impersonation swaps `session.speaker` while leaving the rest of the
      // session — including the proof below — intact, so without this an
      // organizer could redeem a link for their OWN invited address and then
      // accept it AS someone else, granting standing to a speaker who never
      // accepted. Production strips the parameter outright (`src/proxy.ts`), so
      // this is dev-only today; it is enforced here anyway because the coupling
      // is an invariant of the grant, not a property of the environment.
      if (ctx.session?.isImpersonating) {
        throw forbiddenWrongIdentity()
      }

      // THE PROOF. Not the token, not the display email, not the speaker
      // document — the address THIS session proved by redeeming a magic link.
      // Absent on every OAuth session and on any session older than the claim,
      // so both fail closed here.
      const proved = emailLinkIdentifierOf(
        ctx.session as unknown as Record<string, unknown>,
      )
      if (!proved || normalizeEmail(proved) !== invitedNormalized) {
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

      // ── STATUS ─────────────────────────────────────────────────────────────
      // After expiry, so an invitation that lapsed gets the expiry message and
      // its "ask for a new one" instruction rather than a generic one.
      if (invitation.status !== 'pending') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'This invitation is no longer active.',
        })
      }

      // ── GRANT ──────────────────────────────────────────────────────────────
      // The only id written is `ctx.speaker._id` — the caller's own,
      // server-derived identity, never client input. It is appended, never
      // replaced, so the `min(1)` validation on `organizers[]` cannot be
      // violated from here and no sitting organizer can be displaced.
      const currentOrganizerIds = await getConferenceOrganizerIds(conferenceId)
      const alreadyOrganizer = currentOrganizerIds.includes(ctx.speaker._id)

      // No revision means the read did not return one — we cannot make the
      // write conditional, so we do not make it at all.
      if (!invitation._rev) {
        throw new TRPCError({
          code: 'CONFLICT',
          message:
            'This invitation could not be read cleanly. Reload the page and try again.',
        })
      }

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
      // REVISION-GUARDED, and it guards the WHOLE transaction. Between the read
      // above and this commit there are two more round trips, and a `revoke`
      // landing in that window would otherwise be silently overwritten — the
      // revoking organizer sees success and the invitee becomes an organizer
      // anyway. Conditioning on the revision we read makes that lose loudly. It
      // also makes a double-accept (two tabs) fail the second time instead of
      // appending the same person twice.
      transaction.patch(
        clientWrite
          .patch(invitation._id)
          .ifRevisionId(invitation._rev)
          .set({
            status: 'accepted' satisfies OrganizerInvitationStatus,
            respondedAt: new Date().toISOString(),
            acceptedSpeaker: {
              _type: 'reference' as const,
              _ref: ctx.speaker._id,
            },
          }),
      )
      try {
        await transaction.commit()
      } catch (error) {
        // A 409 here means the invitation changed underneath us — revoked, or
        // already accepted in another tab. Refusing is the whole point.
        console.error('Organizer grant transaction failed:', error)
        throw new TRPCError({
          code: 'CONFLICT',
          message:
            'This invitation changed while you were accepting it. Reload the page and try again.',
        })
      }

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
 * the caller cannot tell WHICH condition failed — whether the invitation names a
 * different address, whether this session proved no address at all (an OAuth or
 * pre-claim session), or whether the stored address is unclaimable — so none of
 * them is an oracle.
 */
function forbiddenWrongIdentity(): TRPCError {
  return new TRPCError({
    code: 'FORBIDDEN',
    message:
      'This invitation can only be accepted by signing in with an email sign-in link sent to the invited address.',
  })
}
