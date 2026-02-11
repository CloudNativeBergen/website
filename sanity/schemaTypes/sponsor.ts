import { defineField, defineType } from 'sanity'

export default defineType({
  name: 'sponsor',
  title: 'Sponsor',
  type: 'document',
  fields: [
    defineField({
      name: 'name',
      title: 'Name',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'website',
      title: 'Website',
      type: 'url',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'logo',
      title: 'Logo',
      type: 'inlineSvg',
    }),
    defineField({
      name: 'logoBright',
      title: 'Logo (Bright)',
      type: 'inlineSvg',
      description:
        'Optional bright/white version of the logo for use on dark backgrounds',
    }),
    defineField({
      name: 'orgNumber',
      title: 'Organization Number',
      type: 'string',
      description: 'Company registration number or organization number',
      hidden: ({ currentUser }) => {
        return !(
          currentUser != null &&
          currentUser.roles.find(
            ({ name }) => name === 'administrator' || name === 'editor',
          )
        )
      },
    }),
  ],
  preview: {
    select: {
      title: 'name',
    },
  },
})
