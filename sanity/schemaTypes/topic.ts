import { defineField, defineType } from 'sanity'

export default defineType({
  name: 'topic',
  title: 'Talk Topic',
  type: 'document',
  fields: [
    defineField({
      name: 'title',
      title: 'Title',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'description',
      title: 'Description',
      type: 'text',
    }),
    defineField({
      name: 'color',
      title: 'Color',
      description: 'Color used to visually identify this topic',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'slug',
      title: 'Slug',
      type: 'slug',
      options: {
        source: 'title',
        maxLength: 96,
      },
      validation: (Rule) => Rule.required(),
    }),
  ],
  preview: {
    select: {
      title: 'title',
      color: 'color',
    },
    prepare(selection) {
      const { title, color } = selection
      return {
        title,
        subtitle: color,
      }
    },
  },
})
