import { defineType, defineField } from 'sanity'

/**
 * A PENDING EMAIL SIGN-IN LINK for the STORED tier (organizers/admins only).
 *
 * Speaker/attendee links are STATELESS (a signed, self-describing token — see
 * `src/lib/auth/email-link/token.ts`) and never produce a document. Only
 * privileged identities get a stored token, so that their links are
 * single-use (replay-proof) and revocable. Volume is therefore a handful of
 * documents per conference per month.
 *
 * PLATFORM-INTERNAL, GLOBAL identity artifact:
 *  - No `organization` reference. Identity is a global person on this platform
 *    (the same rule `findSpeakersByEmails` follows), so these documents are
 *    deliberately NOT tenant-scoped and must be excluded from tenant export.
 *  - Hidden from the Studio structure (see `sanity.config.ts`). It is registered
 *    here only so the shape is typed and documented.
 *
 * SECURITY: the raw token is NEVER stored. `tokenHash` is
 * `sha256(rawToken + AUTH_SECRET)`, so neither a Studio viewer nor a leaked
 * read token can redeem a link. `origin` pins the document to the tenant host
 * the link was minted on; `consumedAt` is the single-use marker, set through a
 * revision-conditioned patch so exactly one concurrent redeemer can win.
 */
export default defineType({
  name: 'emailSignInToken',
  type: 'document',
  title: 'Email Sign-In Token (internal)',
  // Keep these out of Studio search results as well as the structure list.
  __experimental_omnisearch_visibility: false,
  fields: [
    defineField({
      name: 'identifier',
      type: 'string',
      title: 'Identifier',
      description:
        'The normalized email address the link was issued to. Required to resolve the account at redemption.',
      readOnly: true,
    }),
    defineField({
      name: 'tokenHash',
      type: 'string',
      title: 'Token hash',
      description:
        'sha256(rawToken + AUTH_SECRET). The raw token exists only in the recipient mailbox.',
      readOnly: true,
    }),
    defineField({
      name: 'origin',
      type: 'string',
      title: 'Origin host',
      description:
        'The tenant host the link was minted on. A link redeemed against a different host is rejected.',
      readOnly: true,
    }),
    defineField({
      name: 'expiresAt',
      type: 'datetime',
      title: 'Expires at',
      readOnly: true,
    }),
    defineField({
      name: 'consumedAt',
      type: 'datetime',
      title: 'Consumed at',
      description:
        'Set by the single-use consume. A document with this set can never be redeemed again.',
      readOnly: true,
    }),
  ],
  preview: {
    select: { title: 'identifier', subtitle: 'expiresAt' },
  },
})
