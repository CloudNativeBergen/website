import { defineType, defineField } from 'sanity'
import {
  RICH_TEXT_CALLOUT_TONES,
  RICH_TEXT_CODE_LANGUAGES,
  RICH_TEXT_LIMITS,
} from '../../src/lib/homepage/richText'

/**
 * Studio-side mirror of the homepage Rich Text vocabulary.
 *
 * The allowlists are IMPORTED from `src/lib/homepage/richText.ts` — the same
 * module the server validator and the renderer use — so the Studio can never
 * offer an option the write path would refuse. (That module is deliberately
 * dependency-free and alias-free so this relative import resolves in the Studio
 * build too.)
 *
 * Every field here is a string, a boolean, an enum literal or a Sanity image
 * asset. There is no HTML field, no URL field pointing at a remote image, and
 * nothing that becomes an attribute or a script source at render.
 */

const languageOptions = RICH_TEXT_CODE_LANGUAGES.map((value) => ({
  title: value === 'text' ? 'Plain text' : value,
  value,
}))

export const richTextCode = defineType({
  name: 'richTextCode',
  title: 'Code / preformatted',
  type: 'object',
  description:
    'Monospaced, preformatted text — a YAML manifest, a config snippet, an ASCII diagram. Always rendered as TEXT, never executed and never syntax-highlighted.',
  fields: [
    defineField({
      name: 'language',
      title: 'Language label',
      type: 'string',
      initialValue: 'text',
      options: { list: languageOptions },
    }),
    defineField({
      name: 'filename',
      title: 'Filename (optional)',
      type: 'string',
      description: 'Shown as a small header above the block, e.g. venue.yaml.',
      validation: (Rule) => Rule.max(RICH_TEXT_LIMITS.filename),
    }),
    defineField({
      name: 'code',
      title: 'Code',
      type: 'text',
      rows: 10,
      validation: (Rule) => Rule.required().max(RICH_TEXT_LIMITS.code),
    }),
  ],
  preview: {
    select: { title: 'filename', subtitle: 'language', code: 'code' },
    prepare: ({ title, subtitle, code }) => ({
      title: title || 'Code block',
      subtitle: [subtitle, String(code || '').split('\n')[0]]
        .filter(Boolean)
        .join(' — '),
    }),
  },
})

/**
 * `type: 'image'` (not `'object'`) so the stored value is Sanity's native image
 * shape — `{ _type: 'richTextImage', asset: { _ref } }` — which is exactly the
 * `RichTextImageBlock` model, and so the Studio gives organizers the real upload
 * widget instead of a raw reference field.
 */
export const richTextImage = defineType({
  name: 'richTextImage',
  title: 'Image',
  type: 'image',
  description:
    'An image uploaded here. External image URLs are not supported — a remote image would load from someone else’s server for every visitor. SVG is not accepted.',
  options: { accept: 'image/jpeg,image/png,image/webp,image/gif' },
  fields: [
    defineField({
      name: 'alt',
      title: 'Alt text',
      type: 'string',
      description:
        'Describes the image for screen readers. Leave blank only when the image is purely decorative.',
      validation: (Rule) => Rule.max(RICH_TEXT_LIMITS.alt),
    }),
    defineField({
      name: 'caption',
      title: 'Caption (optional)',
      type: 'string',
      validation: (Rule) => Rule.max(RICH_TEXT_LIMITS.caption),
    }),
  ],
  preview: {
    select: { title: 'caption', subtitle: 'alt' },
    prepare: ({ title, subtitle }) => ({
      title: title || subtitle || 'Image',
    }),
  },
})

export const richTextTable = defineType({
  name: 'richTextTable',
  title: 'Table',
  type: 'object',
  description:
    'A small plain-text table. Two columns gives you a definition list (label / value). Cells are plain text — no formatting, no links.',
  fields: [
    defineField({
      name: 'headerRow',
      title: 'First row is a header',
      type: 'boolean',
      initialValue: true,
    }),
    defineField({
      name: 'rows',
      title: 'Rows',
      type: 'array',
      validation: (Rule) => Rule.required().max(RICH_TEXT_LIMITS.tableRows),
      of: [
        {
          type: 'object',
          name: 'richTextTableRow',
          fields: [
            defineField({
              name: 'cells',
              title: 'Cells',
              type: 'array',
              of: [{ type: 'string' }],
              validation: (Rule) =>
                Rule.required().max(RICH_TEXT_LIMITS.tableColumns),
            }),
          ],
          preview: {
            select: { cells: 'cells' },
            prepare: ({ cells }) => ({
              title:
                (cells as string[] | undefined)?.join(' · ') || 'Empty row',
            }),
          },
        },
      ],
    }),
    defineField({
      name: 'caption',
      title: 'Caption (optional)',
      type: 'string',
      validation: (Rule) => Rule.max(RICH_TEXT_LIMITS.caption),
    }),
  ],
  preview: {
    select: { title: 'caption', rows: 'rows' },
    prepare: ({ title, rows }) => ({
      title: title || 'Table',
      subtitle: `${(rows as unknown[] | undefined)?.length ?? 0} rows`,
    }),
  },
})

export const richTextCallout = defineType({
  name: 'richTextCallout',
  title: 'Callout',
  type: 'object',
  description:
    'A short aside in one of three house tones. Body text is plain text — line breaks are kept, formatting and links are not.',
  fields: [
    defineField({
      name: 'tone',
      title: 'Tone',
      type: 'string',
      initialValue: 'info',
      options: {
        list: RICH_TEXT_CALLOUT_TONES.map((value) => ({
          title: value[0].toUpperCase() + value.slice(1),
          value,
        })),
        layout: 'radio',
      },
    }),
    defineField({
      name: 'title',
      title: 'Title (optional)',
      type: 'string',
      validation: (Rule) => Rule.max(RICH_TEXT_LIMITS.calloutTitle),
    }),
    defineField({
      name: 'body',
      title: 'Body',
      type: 'text',
      rows: 3,
      validation: (Rule) => Rule.required().max(RICH_TEXT_LIMITS.calloutBody),
    }),
  ],
  preview: {
    select: { title: 'title', subtitle: 'body', tone: 'tone' },
    prepare: ({ title, subtitle, tone }) => ({
      title: title || 'Callout',
      subtitle: [tone, subtitle].filter(Boolean).join(' — '),
    }),
  },
})
