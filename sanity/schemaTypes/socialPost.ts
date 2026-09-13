import { defineArrayMember, defineField, defineType } from 'sanity'

/**
 * The canonical social post an organizer writes ONCE (dashboard #786). Its
 * per-platform `socialPostVariant` documents are the schedulable units; the
 * targeted platforms are implicit in which variants exist. Body is plain text:
 * every platform accepts only plain text, so there are no Portable Text
 * serializers to keep in sync.
 */
export default defineType({
  name: 'socialPost',
  title: 'Social Post',
  type: 'document',
  fields: [
    defineField({
      name: 'conference',
      title: 'Conference',
      type: 'reference',
      to: [{ type: 'conference' }],
      validation: (Rule) =>
        Rule.required().error('Conference reference is required'),
    }),
    defineField({
      name: 'body',
      title: 'Body',
      type: 'text',
      rows: 6,
      validation: (Rule) => Rule.required().error('Body is required'),
    }),
    defineField({
      name: 'attachments',
      title: 'Attachments',
      description:
        'Source images. Uploads and gallery/share-card picks both land here as asset references; variants pick and crop from this list.',
      type: 'array',
      of: [
        defineArrayMember({
          type: 'object',
          name: 'socialPostAttachment',
          fields: [
            defineField({
              name: 'image',
              title: 'Image',
              type: 'image',
              options: { hotspot: true },
              validation: (Rule) => Rule.required(),
            }),
            defineField({
              name: 'alt',
              title: 'Alt text',
              type: 'string',
              validation: (Rule) =>
                Rule.required().error('Alt text is required'),
            }),
          ],
          preview: {
            select: { title: 'alt', media: 'image' },
          },
        }),
      ],
    }),
    defineField({
      name: 'defaultScheduledAt',
      title: 'Default scheduled time',
      description:
        'UTC instant, edited in the conference timezone. Variants without a custom time follow it.',
      type: 'datetime',
    }),
    defineField({
      name: 'createdBy',
      title: 'Created by',
      type: 'reference',
      to: [{ type: 'speaker' }],
      // WEAK (GDPR house rule): the post outlives an erased organizer.
      weak: true,
    }),
    defineField({
      name: 'createdAt',
      title: 'Created at',
      type: 'datetime',
      readOnly: true,
    }),
    defineField({
      name: 'updatedAt',
      title: 'Updated at',
      type: 'datetime',
      readOnly: true,
    }),
  ],
  preview: {
    select: { body: 'body', conference: 'conference.title' },
    prepare({ body, conference }) {
      return {
        title: body ? String(body).slice(0, 80) : 'Untitled post',
        subtitle: conference,
      }
    },
  },
})
