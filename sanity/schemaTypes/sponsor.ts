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
      description: 'Sponsor logo in SVG format',
      type: 'file',
      fields: [
        {
          name: 'description',
          type: 'string',
          title: 'Description'
        },
      ],
      options: {
        accept: 'image/*',
        storeOriginalFilename: false,
      },
      validation: (Rule) => Rule.required(),
    })
  ]
})

