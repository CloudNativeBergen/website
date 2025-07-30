import { defineType, defineField } from 'sanity'
import { INVITATION_STATUSES } from '../../src/lib/cospeaker/types'

export type InvitationStatus = (typeof INVITATION_STATUSES)[number]

export default defineType({
  name: 'coSpeakerInvitation',
  type: 'document',
  title: 'Co-speaker Invitation',
  fields: [
    defineField({
      name: 'proposal',
      type: 'reference',
      title: 'Proposal',
      to: [{ type: 'talk' }],
      description: 'The proposal for which the co-speaker is being invited.',
      validation: (Rule) => Rule.required().error('Proposal is required.'),
    }),
    defineField({
      name: 'invitedBy',
      type: 'reference',
      title: 'Invited By',
      to: [{ type: 'speaker' }],
      description: 'The speaker who sent the invitation.',
      validation: (Rule) =>
        Rule.required().error('Inviting speaker is required.'),
    }),
    defineField({
      name: 'invitedEmail',
      type: 'string',
      title: 'Invited Email',
      description: 'Email address of the person being invited.',
      validation: (Rule) =>
        Rule.required().email().error('A valid email address is required.'),
    }),
    defineField({
      name: 'invitedName',
      type: 'string',
      title: 'Invited Name',
      description: 'Name of the person being invited (optional).',
    }),
    defineField({
      name: 'status',
      type: 'string',
      title: 'Status',
      description: 'Current status of the invitation.',
      initialValue: 'pending',
      options: {
        list: INVITATION_STATUSES.map((status) => ({
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
      description: 'Unique token for secure invitation access.',
      initialValue: () => crypto.randomUUID(),
      readOnly: true,
    }),
    defineField({
      name: 'expiresAt',
      type: 'datetime',
      title: 'Expires At',
      description: 'When this invitation expires (14 days from creation).',
      validation: (Rule) => Rule.required(),
      readOnly: true,
    }),
    defineField({
      name: 'acceptedSpeaker',
      type: 'reference',
      title: 'Accepted Speaker',
      to: [{ type: 'speaker' }],
      description:
        'The speaker profile created/linked when invitation is accepted.',
      hidden: ({ document }) => document?.status !== 'accepted',
    }),
    defineField({
      name: 'createdAt',
      type: 'datetime',
      title: 'Created At',
      description: 'When the invitation was created.',
      readOnly: true,
    }),
    defineField({
      name: 'respondedAt',
      type: 'datetime',
      title: 'Responded At',
      description: 'When the invitation was accepted or declined.',
      hidden: ({ document }) =>
        !['accepted', 'declined'].includes(document?.status as string),
      readOnly: true,
    }),
    defineField({
      name: 'declineReason',
      type: 'text',
      title: 'Decline Reason',
      description: 'Optional reason provided when declining the invitation.',
      hidden: ({ document }) => document?.status !== 'declined',
    }),
  ],
  preview: {
    select: {
      invitedEmail: 'invitedEmail',
      invitedName: 'invitedName',
      proposalTitle: 'proposal.title',
      status: 'status',
      expiresAt: 'expiresAt',
    },
    prepare({ invitedEmail, invitedName, proposalTitle, status, expiresAt }) {
      const name = invitedName || invitedEmail
      const isExpired = new Date(expiresAt) < new Date() && status === 'pending'
      const displayStatus = isExpired ? 'expired' : status

      return {
        title: `${name} - ${proposalTitle || 'Unknown Proposal'}`,
        subtitle: `Status: ${displayStatus}`,
      }
    },
  },
})
