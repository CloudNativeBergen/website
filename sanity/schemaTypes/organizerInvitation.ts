import { defineType, defineField } from 'sanity'
import { ORGANIZER_INVITATION_STATUSES } from '../../src/lib/organizer-invite/types'

/**
 * An invitation to join a conference's `organizers[]` by email address
 * (platform#49). A standalone document rather than a field on `conference`:
 * `conference` is APPEND-ONLY and read straight out of Sanity by
 * `RunKonf/kontroll`, so keeping invitation churn off it avoids putting a
 * high-write, short-lived list on the cross-app contract.
 *
 * The `token` stored here is a bearer string, but it is NOT sufficient to gain
 * the grant: acceptance additionally requires an email magic-link sign-in to
 * `invitedEmail`. See `src/lib/organizer-invite/types.ts`.
 */
export default defineType({
  name: 'organizerInvitation',
  type: 'document',
  title: 'Organizer Invitation',
  fields: [
    defineField({
      name: 'conference',
      type: 'reference',
      title: 'Conference',
      to: [{ type: 'conference' }],
      description: 'The conference whose organizer team the invitee joins.',
      validation: (Rule) => Rule.required(),
      readOnly: true,
    }),
    defineField({
      name: 'invitedBy',
      type: 'reference',
      title: 'Invited By',
      to: [{ type: 'speaker' }],
      description: 'The organizer who issued the invitation.',
      validation: (Rule) => Rule.required(),
      readOnly: true,
    }),
    defineField({
      name: 'invitedEmail',
      type: 'string',
      title: 'Invited Email',
      description:
        'Canonical (trimmed, lowercased) address the invitation was sent to. ' +
        'Acceptance requires proving control of this exact mailbox.',
      validation: (Rule) => Rule.required().email(),
      readOnly: true,
    }),
    defineField({
      name: 'invitedName',
      type: 'string',
      title: 'Invited Name',
      description: 'Optional display name for the invitee.',
    }),
    defineField({
      name: 'status',
      type: 'string',
      title: 'Status',
      initialValue: 'pending',
      options: {
        list: ORGANIZER_INVITATION_STATUSES.map((status) => ({
          title: status.charAt(0).toUpperCase() + status.slice(1),
          value: status,
        })),
      },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'token',
      type: 'string',
      title: 'Invitation Token',
      description:
        'Signed bearer token carried by the emailed link. Not ownership proof.',
      validation: (Rule) => Rule.required(),
      readOnly: true,
    }),
    defineField({
      name: 'expiresAt',
      type: 'datetime',
      title: 'Expires At',
      validation: (Rule) => Rule.required(),
      readOnly: true,
    }),
    defineField({
      name: 'createdAt',
      type: 'datetime',
      title: 'Created At',
      readOnly: true,
    }),
    defineField({
      name: 'respondedAt',
      type: 'datetime',
      title: 'Responded At',
      hidden: ({ document }) => document?.status === 'pending',
      readOnly: true,
    }),
    defineField({
      name: 'acceptedSpeaker',
      type: 'reference',
      title: 'Accepted Speaker',
      to: [{ type: 'speaker' }],
      description: 'The speaker granted organizer standing on acceptance.',
      hidden: ({ document }) => document?.status !== 'accepted',
      readOnly: true,
    }),
  ],
  preview: {
    select: {
      invitedEmail: 'invitedEmail',
      invitedName: 'invitedName',
      conferenceTitle: 'conference.title',
      status: 'status',
      expiresAt: 'expiresAt',
    },
    prepare({ invitedEmail, invitedName, conferenceTitle, status, expiresAt }) {
      const isExpired = new Date(expiresAt) < new Date() && status === 'pending'
      return {
        title: `${invitedName || invitedEmail} — ${conferenceTitle || 'Unknown conference'}`,
        subtitle: `Status: ${isExpired ? 'expired' : status}`,
      }
    },
  },
})
