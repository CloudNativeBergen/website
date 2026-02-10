import { defineField, defineType } from 'sanity'

export default defineType({
  name: 'sponsorActivity',
  title: 'Sponsor Activity',
  type: 'document',
  fields: [
    defineField({
      name: 'sponsor_for_conference',
      title: 'Sponsor for Conference',
      type: 'reference',
      to: [{ type: 'sponsorForConference' }],
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'activity_type',
      title: 'Activity Type',
      type: 'string',
      options: {
        list: [
          { title: 'Stage Change', value: 'stage_change' },
          { title: 'Invoice Status Change', value: 'invoice_status_change' },
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
          name: 'old_value',
          title: 'Old Value',
          type: 'string',
        }),
        defineField({
          name: 'new_value',
          title: 'New Value',
          type: 'string',
        }),
        defineField({
          name: 'timestamp',
          title: 'Timestamp',
          type: 'string',
        }),
        defineField({
          name: 'additional_data',
          title: 'Additional Data',
          type: 'text',
        }),
      ],
    }),
    defineField({
      name: 'created_by',
      title: 'Created By',
      type: 'reference',
      to: [{ type: 'speaker' }],
      validation: (Rule) => Rule.required(),
      options: {
        filter: 'is_organizer == true',
      },
    }),
    defineField({
      name: 'created_at',
      title: 'Created At',
      type: 'datetime',
      validation: (Rule) => Rule.required(),
      initialValue: () => new Date().toISOString(),
    }),
  ],
  preview: {
    select: {
      activityType: 'activity_type',
      description: 'description',
      createdBy: 'created_by.name',
      createdAt: 'created_at',
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
      by: [{ field: 'created_at', direction: 'desc' }],
    },
    {
      title: 'Created Date (Oldest first)',
      name: 'createdAtAsc',
      by: [{ field: 'created_at', direction: 'asc' }],
    },
    {
      title: 'Activity Type',
      name: 'activityType',
      by: [
        { field: 'activity_type', direction: 'asc' },
        { field: 'created_at', direction: 'desc' },
      ],
    },
  ],
})
