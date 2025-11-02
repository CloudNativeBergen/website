import { defineField, defineType } from 'sanity'

const attachmentTypes = [
  { title: 'Slides', value: 'slides' },
  { title: 'Recording', value: 'recording' },
  { title: 'Resource', value: 'resource' },
]

export const fileAttachment = defineType({
  name: 'fileAttachment',
  title: 'File Attachment',
  type: 'object',
  fields: [
    defineField({
      name: 'file',
      title: 'File',
      type: 'file',
      options: {
        accept: '.pdf,.pptx,.ppt,.key,.odp',
      },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'attachmentType',
      title: 'Type',
      type: 'string',
      options: {
        list: attachmentTypes,
      },
      initialValue: 'slides',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'title',
      title: 'Title',
      type: 'string',
      description: 'Optional custom title (defaults to filename)',
    }),
    defineField({
      name: 'description',
      title: 'Description',
      type: 'text',
      rows: 2,
    }),
    defineField({
      name: 'filename',
      title: 'File Name',
      type: 'string',
      readOnly: true,
    }),
    defineField({
      name: 'uploadedAt',
      title: 'Uploaded At',
      type: 'datetime',
      readOnly: true,
    }),
  ],
  preview: {
    select: {
      title: 'title',
      filename: 'filename',
      attachmentType: 'attachmentType',
      uploadedAt: 'uploadedAt',
    },
    prepare({ title, filename, attachmentType, uploadedAt }) {
      const typeLabel = attachmentTypes.find((t) => t.value === attachmentType)
      return {
        title: title || filename || 'File attachment',
        subtitle: `${typeLabel?.title || 'File'} - ${uploadedAt ? new Date(uploadedAt).toLocaleDateString() : 'Not uploaded yet'}`,
      }
    },
  },
})

export const urlAttachment = defineType({
  name: 'urlAttachment',
  title: 'URL Attachment',
  type: 'object',
  fields: [
    defineField({
      name: 'url',
      title: 'URL',
      type: 'url',
      validation: (Rule) =>
        Rule.required().uri({
          scheme: ['http', 'https'],
          allowRelative: false,
        }),
    }),
    defineField({
      name: 'attachmentType',
      title: 'Type',
      type: 'string',
      options: {
        list: attachmentTypes,
      },
      initialValue: 'recording',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'title',
      title: 'Title',
      type: 'string',
      description: 'Optional custom title',
    }),
    defineField({
      name: 'description',
      title: 'Description',
      type: 'text',
      rows: 2,
    }),
    defineField({
      name: 'uploadedAt',
      title: 'Added At',
      type: 'datetime',
      readOnly: true,
    }),
  ],
  preview: {
    select: {
      title: 'title',
      url: 'url',
      attachmentType: 'attachmentType',
      uploadedAt: 'uploadedAt',
    },
    prepare({ title, url, attachmentType, uploadedAt }) {
      const typeLabel = attachmentTypes.find((t) => t.value === attachmentType)
      return {
        title: title || url || 'URL attachment',
        subtitle: `${typeLabel?.title || 'URL'} - ${uploadedAt ? new Date(uploadedAt).toLocaleDateString() : 'Not added yet'}`,
      }
    },
  },
})
