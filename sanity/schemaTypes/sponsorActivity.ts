import { defineField, defineType } from 'sanity'

export default defineType({
  name: 'sponsorActivity',
  title: 'Sponsor Activity',
  type: 'document',
  fields: [
    defineField({
      name: 'sponsorForConference',
      title: 'Sponsor for Conference',
      type: 'reference',
      to: [{ type: 'sponsorForConference' }],
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'activityType',
      title: 'Activity Type',
      type: 'string',
      options: {
        list: [
          { title: 'Stage Change', value: 'stage_change' },
          { title: 'Invoice Status Change', value: 'invoice_status_change' },
          { title: 'Contract Status Change', value: 'contract_status_change' },
          { title: 'Contract Signed', value: 'contract_signed' },
          { title: 'Note', value: 'note' },
          { title: 'Email', value: 'email' },
          { title: 'Call', value: 'call' },
          { title: 'Meeting', value: 'meeting' },
        ],
        layout: 'dropdown',
      },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'description',
      title: 'Description',
      type: 'text',
      validation: (Rule) => Rule.required(),
      rows: 3,
    }),
    defineField({
      name: 'metadata',
      title: 'Metadata',
      type: 'object',
      description: 'Structured data for the activity (old/new values, etc.)',
      fields: [
        defineField({
          name: 'oldValue',
          title: 'Old Value',
          type: 'string',
        }),
        defineField({
          name: 'newValue',
          title: 'New Value',
          type: 'string',
        }),
        defineField({
          name: 'timestamp',
          title: 'Timestamp',
          type: 'string',
        }),
        defineField({
          name: 'additionalData',
          title: 'Additional Data',
          type: 'text',
        }),
      ],
    }),
    defineField({
      name: 'createdBy',
      title: 'Created By',
      type: 'reference',
      to: [{ type: 'speaker' }],
      validation: (Rule) => Rule.required(),
      options: {
        filter: 'isOrganizer == true',
      },
    }),
    defineField({
      name: 'createdAt',
      title: 'Created At',
      type: 'datetime',
      validation: (Rule) => Rule.required(),
      initialValue: () => new Date().toISOString(),
    }),
  ],
  preview: {
    select: {
      activityType: 'activityType',
      description: 'description',
      createdBy: 'created_by.name',
      createdAt: 'createdAt',
    },
    prepare({ activityType, description, createdBy, createdAt }) {
      const typeLabel =
        activityType
          ?.split('_')
          .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ') || 'Activity'

      return {
        title: typeLabel,
        subtitle: `${description || 'No description'} | By ${createdBy || 'Unknown'} on ${createdAt ? new Date(createdAt).toLocaleDateString() : 'Unknown date'}`,
      }
    },
  },
  orderings: [
    {
      title: 'Created Date (Newest first)',
      name: 'createdAtDesc',
      by: [{ field: 'createdAt', direction: 'desc' }],
    },
    {
      title: 'Created Date (Oldest first)',
      name: 'createdAtAsc',
      by: [{ field: 'createdAt', direction: 'asc' }],
    },
    {
      title: 'Activity Type',
      name: 'activityType',
      by: [
        { field: 'activityType', direction: 'asc' },
        { field: 'createdAt', direction: 'desc' },
      ],
    },
  ],
})
