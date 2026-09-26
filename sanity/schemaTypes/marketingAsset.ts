import { defineField, defineType } from 'sanity'

/**
 * An organization's marketing asset (docs/MARKETING_ASSETS_SPEC.md §3): a
 * finished image kept for social posts, or an audio track for studio videos
 * (docs/MARKETING_STUDIO_VIDEO_SPEC.md §6) — the one kind that never goes into
 * a post, and that has no alt text. Never public, and separate from the
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
      // Still shown while it holds a value, so switching an edition asset to
      // organization-wide leaves the reference visible to clear.
      hidden: ({ document }) =>
        document?.scope !== 'edition' && !document?.conference,
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
      // asset is an image or an audio track. Read-only: the upload sets it.
      options: { list: ['image', 'audio'] },
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
          // Every kind but a track (and, with #1167, a video) has an image;
          // so does a document with no kind yet, which reads as an image.
          document?.kind !== 'audio' && document?.kind !== 'video' && !value
            ? 'An image or GIF asset needs its image'
            : true,
        ),
    }),
    defineField({
      name: 'audio',
      title: 'Audio track',
      description: 'For an audio track: MP3, M4A or WAV, at most 10 minutes.',
      type: 'file',
      options: { accept: 'audio/mpeg,audio/mp4,audio/wav' },
      hidden: ({ document }) => document?.kind !== 'audio',
      validation: (Rule) =>
        Rule.custom((value, { document }) =>
          document?.kind === 'audio' && !value
            ? 'An audio asset needs its track'
            : true,
        ),
    }),
    defineField({
      name: 'createdFileAssetId',
      title: 'File asset created by this upload',
      description:
        'Absent when Sanity already held these exact bytes. The file is deleted with the asset only while it is still this one.',
      type: 'string',
      readOnly: true,
      hidden: true,
    }),
    defineField({
      name: 'durationSeconds',
      title: 'Length (seconds)',
      description: 'Measured from the file on upload.',
      type: 'number',
      readOnly: true,
      hidden: ({ document }) => document?.kind !== 'audio',
    }),
    defineField({
      name: 'rightsConfirmation',
      title: 'Rights confirmation',
      description:
        '“I have the right to use this track in social posts.” — who confirmed it on upload, and when (stamped by the server).',
      type: 'object',
      readOnly: true,
      hidden: ({ document }) => document?.kind !== 'audio',
      fields: [
        defineField({
          name: 'confirmedBy',
          title: 'Confirmed by',
          type: 'reference',
          to: [{ type: 'speaker' }],
          // Weak: the organizer can still be merged or erased.
          weak: true,
        }),
        defineField({
          name: 'confirmedAt',
          title: 'Confirmed at',
          type: 'datetime',
        }),
      ],
      validation: (Rule) =>
        Rule.custom((value, { document }) =>
          document?.kind === 'audio' && !value
            ? 'An audio track needs its rights confirmation'
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
      // An audio track has none: it never goes into a post.
      hidden: ({ document }) => document?.kind === 'audio',
      validation: (Rule) =>
        Rule.custom((value, { document }) =>
          document?.kind !== 'audio' && !value ? 'Required' : true,
        ),
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
