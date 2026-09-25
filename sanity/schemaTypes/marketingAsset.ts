import { defineField, defineType } from 'sanity'

/**
 * An organization's marketing asset (docs/MARKETING_ASSETS_SPEC.md §3): a
 * finished image kept for social posts. Never public, and separate from the
 * photo gallery (`imageGallery`). Owned by the organization and read with the
 * organization filter. `scope` is explicit because "has no conference" cannot
 * be queried safely: organization-wide is `scope == "organization"`.
 */
export default defineType({
  name: 'marketingAsset',
  title: 'Marketing Asset',
  type: 'document',
  fields: [
    defineField({
      name: 'organization',
      title: 'Organization',
      type: 'reference',
      to: [{ type: 'organization' }],
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'scope',
      title: 'Scope',
      type: 'string',
      options: {
        list: [
          { title: 'Organization-wide', value: 'organization' },
          { title: 'One edition', value: 'edition' },
        ],
      },
      initialValue: 'organization',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'conference',
      title: 'Edition',
      description: 'Only for an edition asset: the edition it is about.',
      type: 'reference',
      to: [{ type: 'conference' }],
      hidden: ({ document }) => document?.scope !== 'edition',
      validation: (Rule) =>
        Rule.custom((value, { document }) => {
          if (document?.scope === 'edition' && !value)
            return 'An edition asset needs its edition'
          if (document?.scope !== 'edition' && value)
            return 'Only an edition asset has an edition'
          return true
        }),
    }),
    defineField({
      name: 'kind',
      title: 'Kind',
      type: 'string',
      // GIF and video arrive with #1167; until their fields and UI exist, an
      // asset is an image, so Studio cannot publish one with no media.
      options: { list: ['image'] },
      initialValue: 'image',
      readOnly: true,
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'image',
      title: 'Image',
      type: 'image',
      description: 'For an image or a GIF.',
      validation: (Rule) =>
        Rule.custom((value, { document }) =>
          document?.kind !== 'video' && !value
            ? 'An image or GIF asset needs its image'
            : true,
        ),
    }),
    defineField({
      name: 'createdImageAssetId',
      title: 'Image asset created by this upload',
      description:
        'Absent when Sanity already held these exact bytes. The image is deleted with the asset only while it is still this one.',
      type: 'string',
      readOnly: true,
      hidden: true,
    }),
    defineField({
      name: 'title',
      title: 'Title',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'alt',
      title: 'Alt text',
      description: 'Copied into a post with the asset, so it is written once.',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'subject',
      title: 'Subject',
      description:
        'Who the asset is about. An image with no subject cannot be found when a speaker asks to be erased.',
      type: 'reference',
      to: [{ type: 'speaker' }, { type: 'talk' }, { type: 'sponsor' }],
      // Weak: the person, talk or sponsor can still be merged or deleted.
      weak: true,
    }),
    defineField({
      name: 'tags',
      title: 'Tags',
      description: 'Lower-case, so a filter matches them whole.',
      type: 'array',
      of: [{ type: 'string' }],
      options: { layout: 'tags' },
    }),
    defineField({
      name: 'credit',
      title: 'Credit',
      description: 'Who made it.',
      type: 'string',
    }),
    defineField({
      name: 'source',
      title: 'Source',
      type: 'string',
      options: { list: ['upload', 'studio'] },
      readOnly: true,
    }),
  ],
  preview: {
    select: { title: 'title', subtitle: 'alt', media: 'image' },
  },
})
