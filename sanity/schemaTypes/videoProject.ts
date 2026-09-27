import { defineArrayMember, defineField, defineType } from 'sanity'

/**
 * A saved studio video (docs/MARKETING_STUDIO_VIDEO_SPEC.md §7): the scenes
 * with their designs and timings, and the track. Organization-owned and
 * scoped like a gallery asset — `scope` is explicit, since "has no
 * conference" cannot be queried safely. Any organizer of the organization may
 * open, change and delete it.
 *
 * It references FILES, the way a post does: a scene's background holds the
 * image asset (strong) with a weak pointer to the gallery asset it came from,
 * so deleting that asset never breaks the project — the gallery's orphan
 * check sees this reference and keeps the file. Never bytes. Written by the
 * studio (`src/lib/video-project`); `formatVersion` says which shape it is.
 */

/** Copied from the gallery asset, so a speaker's erasure finds the file after it. */
const weakSubject = defineField({
  name: 'subject',
  title: 'Subject',
  description:
    'Who the gallery asset said this shows, kept so an erasure request still finds the file.',
  type: 'reference',
  to: [{ type: 'speaker' }, { type: 'talk' }, { type: 'sponsor' }],
  weak: true,
  readOnly: true,
})

const weakGalleryAsset = defineField({
  name: 'galleryAsset',
  title: 'Gallery asset',
  description:
    'Where the file came from, for display. Weak: deleting the asset keeps this project and its file.',
  type: 'reference',
  to: [{ type: 'marketingAsset' }],
  weak: true,
})

export default defineType({
  name: 'videoProject',
  title: 'Video Project',
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
      description: 'Only for an edition project: the edition it is for.',
      type: 'reference',
      to: [{ type: 'conference' }],
      hidden: ({ document }) =>
        document?.scope !== 'edition' && !document?.conference,
      // The studio refuses to open an edition project without one.
      validation: (Rule) =>
        Rule.custom((value, { document }) => {
          if (document?.scope === 'edition' && !value)
            return 'An edition project needs its edition'
          if (document?.scope !== 'edition' && value)
            return 'Only an edition project has an edition'
          return true
        }),
    }),
    defineField({
      name: 'title',
      title: 'Title',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'formatVersion',
      title: 'Format version',
      description:
        'The shape the studio wrote. A version the studio does not know is refused, never reinterpreted.',
      type: 'number',
      readOnly: true,
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'scenes',
      title: 'Scenes',
      description: 'Written by the studio as one whole array.',
      type: 'array',
      of: [
        defineArrayMember({
          type: 'object',
          name: 'videoProjectScene',
          fields: [
            defineField({ name: 'duration', type: 'number' }),
            defineField({
              name: 'transition',
              type: 'string',
              options: { list: ['cut', 'fade', 'slide', 'zoom'] },
            }),
            defineField({ name: 'drift', type: 'boolean' }),
            defineField({
              name: 'elements',
              title: 'Element motion',
              type: 'array',
              of: [
                defineArrayMember({
                  type: 'object',
                  name: 'videoProjectElement',
                  fields: [
                    defineField({ name: 'element', type: 'string' }),
                    defineField({ name: 'entrance', type: 'string' }),
                    defineField({ name: 'exit', type: 'string' }),
                    defineField({ name: 'enter', type: 'number' }),
                    defineField({ name: 'leave', type: 'number' }),
                  ],
                }),
              ],
            }),
            defineField({
              name: 'background',
              type: 'object',
              fields: [
                defineField({ name: 'color', type: 'string' }),
                defineField({
                  name: 'image',
                  description:
                    'The file, with a weak pointer to its gallery asset. Removed on a speaker erasure; the scene then shows its colour.',
                  type: 'image',
                  fields: [
                    defineField({ name: 'name', type: 'string' }),
                    weakGalleryAsset,
                    weakSubject,
                    defineField({
                      name: 'createdByGallery',
                      description:
                        'The gallery upload created this file, so deleting the project may delete it once nothing else holds it.',
                      type: 'boolean',
                      readOnly: true,
                    }),
                  ],
                }),
              ],
            }),
            defineField({
              name: 'textLines',
              type: 'array',
              of: [
                defineArrayMember({
                  type: 'object',
                  name: 'videoProjectTextLine',
                  fields: [
                    defineField({ name: 'text', type: 'string' }),
                    defineField({ name: 'verticalPosition', type: 'number' }),
                    defineField({ name: 'fontSize', type: 'number' }),
                    defineField({ name: 'fontFamily', type: 'string' }),
                    defineField({ name: 'isBold', type: 'boolean' }),
                    defineField({ name: 'isUppercase', type: 'boolean' }),
                    defineField({ name: 'color', type: 'string' }),
                    defineField({ name: 'textAlign', type: 'string' }),
                    defineField({ name: 'horizontalPosition', type: 'number' }),
                    defineField({ name: 'textPadding', type: 'number' }),
                  ],
                }),
              ],
            }),
            defineField({
              name: 'logo',
              type: 'object',
              fields: [
                defineField({ name: 'size', type: 'number' }),
                defineField({ name: 'bottom', type: 'number' }),
                defineField({ name: 'right', type: 'number' }),
                defineField({ name: 'variant', type: 'string' }),
              ],
            }),
            defineField({
              name: 'qr',
              title: 'QR code settings',
              description: 'Settings only; the image is regenerated.',
              type: 'object',
              fields: [
                defineField({ name: 'url', type: 'string' }),
                defineField({ name: 'size', type: 'number' }),
                defineField({ name: 'dotsColor', type: 'string' }),
                defineField({ name: 'backgroundColor', type: 'string' }),
                defineField({ name: 'dotsType', type: 'string' }),
                defineField({ name: 'cornerSquareType', type: 'string' }),
                defineField({ name: 'cornerDotType', type: 'string' }),
                defineField({ name: 'horizontalPosition', type: 'number' }),
                defineField({ name: 'verticalPosition', type: 'number' }),
              ],
            }),
          ],
        }),
      ],
    }),
    defineField({
      name: 'track',
      title: 'Music track',
      type: 'object',
      fields: [
        defineField({
          name: 'file',
          type: 'file',
          fields: [
            weakGalleryAsset,
            weakSubject,
            defineField({
              name: 'createdByGallery',
              type: 'boolean',
              readOnly: true,
            }),
          ],
        }),
        defineField({ name: 'title', type: 'string' }),
        defineField({
          name: 'rightsConfirmation',
          title: 'Rights confirmation',
          description:
            'Copied from the gallery track with the reference, so it survives the asset’s deletion.',
          type: 'object',
          readOnly: true,
          fields: [
            defineField({
              name: 'confirmedBy',
              type: 'reference',
              to: [{ type: 'speaker' }],
              weak: true,
            }),
            defineField({ name: 'confirmedAt', type: 'datetime' }),
          ],
        }),
        defineField({ name: 'start', type: 'number' }),
        defineField({ name: 'volume', type: 'number' }),
        defineField({ name: 'fadeIn', type: 'number' }),
        defineField({ name: 'fadeOut', type: 'number' }),
      ],
    }),
    defineField({
      name: 'updatedAt',
      title: 'Last saved',
      type: 'datetime',
      readOnly: true,
    }),
  ],
  preview: {
    select: { title: 'title', subtitle: 'scope' },
  },
})
