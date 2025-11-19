import { defineField, defineType } from 'sanity'

export default defineType({
  name: 'imageGallery',
  title: 'Image Gallery',
  type: 'document',
  fields: [
    defineField({
      name: 'image',
      title: 'Image',
      type: 'image',
      options: {
        hotspot: true,
      },
      fields: [
        {
          name: 'alt',
          type: 'string',
          title: 'Alternative text',
          description: 'Important for SEO and accessibility.',
        },
      ],
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'photographer',
      title: 'Photographer',
      type: 'string',
      validation: (Rule) =>
        Rule.required().min(1).error('Photographer name is required'),
    }),
    defineField({
      name: 'date',
      title: 'Date',
      type: 'datetime',
      options: {
        dateFormat: 'YYYY-MM-DD',
        timeFormat: 'HH:mm',
        timeStep: 15,
      },
      initialValue: () => new Date().toISOString(),
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'location',
      title: 'Location',
      type: 'string',
      validation: (Rule) =>
        Rule.required().min(1).error('Location is required'),
    }),
    defineField({
      name: 'featured',
      title: 'Featured',
      type: 'boolean',
      description: 'Show this image in featured galleries',
      initialValue: false,
      options: {
        layout: 'checkbox',
      },
    }),
    defineField({
      name: 'speakers',
      title: 'Speakers',
      type: 'array',
      of: [
        {
          type: 'reference',
          to: [{ type: 'speaker' }],
        },
      ],
      description: 'Tag speakers appearing in this image',
      validation: (Rule) => Rule.unique(),
    }),
    defineField({
      name: 'untaggedSpeakers',
      title: 'Untagged Speakers',
      type: 'array',
      of: [
        {
          type: 'reference',
          to: [{ type: 'speaker' }],
        },
      ],
      description:
        'Speakers who have untagged themselves from this image (prevents re-tagging)',
      validation: (Rule) => Rule.unique(),
      readOnly: true,
      hidden: ({ document }) =>
        !document?.untaggedSpeakers ||
        (Array.isArray(document.untaggedSpeakers) &&
          document.untaggedSpeakers.length === 0),
    }),
    defineField({
      name: 'conference',
      title: 'Conference',
      type: 'reference',
      to: [{ type: 'conference' }],
      description: 'The conference this image belongs to',
      validation: (Rule) => Rule.required().error('Conference is required'),
    }),
  ],
  preview: {
    select: {
      title: 'photographer',
      subtitle: 'date',
      media: 'image',
    },
    prepare({ title, subtitle, media }) {
      return {
        title: title || 'Untitled',
        subtitle: subtitle ? `Photo taken on ${subtitle}` : 'No date',
        media,
      }
    },
  },
})
