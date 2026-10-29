import { defineField, defineType } from 'sanity'

/**
 * A Wall Post (Photo Wall spec §4.2): one anonymous photo posted to a
 * conference's Photo Wall, with the id `wallPost-<uploadId>`. Written only by
 * the server; organizers moderate on `/admin/photo-wall`, so it is read-only
 * here. Stores the device key (a hash), never the cookie token, and nothing
 * else that identifies the contributor.
 */
export default defineType({
  name: 'wallPost',
  title: 'Wall Post',
  type: 'document',
  readOnly: true,
  fields: [
    defineField({
      name: 'conference',
      title: 'Conference',
      type: 'reference',
      to: [{ type: 'conference' }],
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'status',
      title: 'Status',
      type: 'string',
      options: {
        list: [
          { title: 'Waiting for approval', value: 'pending' },
          { title: 'On the wall', value: 'approved' },
          { title: 'Not shown', value: 'notShown' },
          { title: 'Deleting', value: 'deleting' },
        ],
      },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'photo',
      title: 'Photo',
      description:
        'The whole photo, filtered and resized on the phone. Unset while a delete is in progress.',
      type: 'image',
    }),
    defineField({
      name: 'deletingAssetId',
      title: 'Asset being deleted',
      type: 'string',
    }),
    defineField({
      name: 'crop',
      title: 'Square crop position',
      description: 'CSS object-position of the square crop, each 0–1.',
      type: 'object',
      fields: [
        defineField({ name: 'x', type: 'number' }),
        defineField({ name: 'y', type: 'number' }),
      ],
    }),
    defineField({
      name: 'caption',
      title: 'Caption',
      type: 'string',
      validation: (Rule) => Rule.max(80),
    }),
    defineField({
      name: 'name',
      title: 'Name',
      type: 'string',
      validation: (Rule) => Rule.max(40),
    }),
    defineField({
      name: 'talk',
      title: 'Talk',
      description: 'The talk this photo shows, if the contributor tagged one.',
      type: 'reference',
      to: [{ type: 'talk' }],
      weak: true,
    }),
    defineField({
      name: 'marketingConsent',
      title: 'Marketing OK',
      type: 'boolean',
    }),
    defineField({
      name: 'deviceKey',
      title: 'Device key',
      description: 'A hash of the device cookie, never the cookie itself.',
      type: 'string',
    }),
    defineField({
      name: 'submittedAt',
      title: 'Submitted at',
      type: 'datetime',
    }),
    defineField({
      name: 'approvedAt',
      title: 'Approved at',
      type: 'datetime',
    }),
    defineField({
      name: 'decidedAt',
      title: 'Decided at',
      description: 'The last Approve, Reject or Remove.',
      type: 'datetime',
    }),
    defineField({
      name: 'autoApproval',
      title: 'Auto-approved',
      description:
        'A trusted poster’s post, approved at Submit: who, as which role, and the organizer behind an impersonation.',
      type: 'object',
      fields: [
        defineField({
          name: 'speaker',
          type: 'reference',
          to: [{ type: 'speaker' }],
          weak: true,
        }),
        defineField({
          name: 'role',
          type: 'string',
          options: { list: ['organizer', 'speaker'] },
        }),
        defineField({
          name: 'realAdmin',
          type: 'reference',
          to: [{ type: 'speaker' }],
          weak: true,
        }),
      ],
    }),
  ],
  preview: {
    select: { caption: 'caption', status: 'status', media: 'photo' },
    prepare: ({ caption, status, media }) => ({
      title: caption || 'Wall Post',
      subtitle: status,
      media,
    }),
  },
})
