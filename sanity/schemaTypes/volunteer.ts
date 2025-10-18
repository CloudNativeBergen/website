import { defineType, defineField } from 'sanity'

export default defineType({
  name: 'volunteer',
  title: 'Volunteer',
  type: 'document',
  fields: [
    // Basic Information
    defineField({
      name: 'name',
      title: 'Full Name',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'email',
      title: 'Email',
      type: 'string',
      validation: (Rule) => Rule.required().email(),
    }),
    defineField({
      name: 'phone',
      title: 'Phone Number',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'occupation',
      title: 'Occupation',
      type: 'string',
      options: {
        list: [
          { title: 'Student', value: 'student' },
          { title: 'Working', value: 'working' },
          { title: 'Unemployed', value: 'unemployed' },
          { title: 'Other', value: 'other' },
        ],
      },
      validation: (Rule) => Rule.required(),
    }),

    // Volunteer Details
    defineField({
      name: 'availability',
      title: 'Availability',
      type: 'text',
      description: 'When are you available to volunteer?',
    }),
    defineField({
      name: 'preferredTasks',
      title: 'Preferred Tasks',
      type: 'array',
      of: [{ type: 'string' }],
      description: 'What tasks would you like to help with?',
    }),
    defineField({
      name: 'tshirtSize',
      title: 'T-Shirt Size',
      type: 'string',
      options: {
        list: [
          { title: 'XS', value: 'XS' },
          { title: 'S', value: 'S' },
          { title: 'M', value: 'M' },
          { title: 'L', value: 'L' },
          { title: 'XL', value: 'XL' },
          { title: 'XXL', value: 'XXL' },
        ],
      },
    }),
    defineField({
      name: 'dietaryRestrictions',
      title: 'Dietary Restrictions',
      type: 'text',
      description:
        'Any dietary restrictions or allergies we should know about?',
    }),
    defineField({
      name: 'otherInfo',
      title: 'Other Information',
      type: 'text',
      description: 'Anything else you would like us to know?',
    }),

    // Conference Association
    defineField({
      name: 'conference',
      title: 'Conference',
      type: 'reference',
      to: [{ type: 'conference' }],
      validation: (Rule) => Rule.required(),
    }),

    // Status Management
    defineField({
      name: 'status',
      title: 'Status',
      type: 'string',
      options: {
        list: [
          { title: 'Pending', value: 'pending' },
          { title: 'Approved', value: 'approved' },
          { title: 'Rejected', value: 'rejected' },
        ],
      },
      initialValue: 'pending',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'submittedAt',
      title: 'Submitted At',
      type: 'datetime',
      readOnly: true,
    }),
    defineField({
      name: 'reviewedAt',
      title: 'Reviewed At',
      type: 'datetime',
      readOnly: true,
      hidden: ({ document }) => document?.status === 'pending',
    }),
    defineField({
      name: 'reviewedBy',
      title: 'Reviewed By',
      type: 'reference',
      to: [{ type: 'speaker' }],
      hidden: ({ document }) => document?.status === 'pending',
    }),
    defineField({
      name: 'reviewNotes',
      title: 'Review Notes',
      type: 'text',
      hidden: ({ document }) => document?.status === 'pending',
    }),

    // GDPR Consent
    defineField({
      name: 'consent',
      title: 'Consent',
      type: 'object',
      fields: [
        defineField({
          name: 'dataProcessing',
          title: 'Data Processing',
          type: 'object',
          fields: [
            defineField({
              name: 'granted',
              title: 'Granted',
              type: 'boolean',
            }),
            defineField({
              name: 'grantedAt',
              title: 'Granted At',
              type: 'datetime',
              readOnly: true,
            }),
            defineField({
              name: 'ipAddress',
              title: 'IP Address',
              type: 'string',
              readOnly: true,
            }),
          ],
        }),
        defineField({
          name: 'privacyPolicyVersion',
          title: 'Privacy Policy Version',
          type: 'string',
          readOnly: true,
        }),
      ],
    }),
  ],
  preview: {
    select: {
      title: 'name',
      subtitle: 'conference.name',
      status: 'status',
    },
    prepare({ title, subtitle, status }) {
      return {
        title,
        subtitle: `${subtitle || 'No conference'} - ${status || 'pending'}`,
      }
    },
  },
})
