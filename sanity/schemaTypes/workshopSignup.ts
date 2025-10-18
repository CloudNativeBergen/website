import { defineField, defineType } from 'sanity'

export default defineType({
  name: 'workshopSignup',
  title: 'Workshop Signup',
  type: 'document',
  fields: [
    defineField({
      name: 'userEmail',
      title: 'User Email',
      type: 'string',
      validation: (Rule) => [
        Rule.required().error('User email is required'),
        Rule.email().error('Must be a valid email address'),
      ],
    }),
    defineField({
      name: 'userName',
      title: 'User Name',
      type: 'string',
      validation: (Rule) => Rule.required().error('User name is required'),
    }),
    defineField({
      name: 'userWorkOSId',
      title: 'WorkOS User ID',
      type: 'string',
      validation: (Rule) => Rule.required().error('WorkOS User ID is required'),
    }),
    defineField({
      name: 'experienceLevel',
      title: 'Experience Level',
      type: 'string',
      options: {
        list: [
          { title: 'Beginner', value: 'beginner' },
          { title: 'Intermediate', value: 'intermediate' },
          { title: 'Advanced', value: 'advanced' },
        ],
        layout: 'radio',
      },
      validation: (Rule) =>
        Rule.required().error('Experience level is required'),
    }),
    defineField({
      name: 'operatingSystem',
      title: 'Operating System',
      type: 'string',
      options: {
        list: [
          { title: 'Windows', value: 'windows' },
          { title: 'macOS', value: 'macos' },
          { title: 'Linux', value: 'linux' },
        ],
        layout: 'radio',
      },
      validation: (Rule) =>
        Rule.required().error('Operating system is required'),
    }),

    defineField({
      name: 'workshop',
      title: 'Workshop',
      type: 'reference',
      to: [{ type: 'talk' }],
      validation: (Rule) => [
        Rule.required().error('Workshop reference is required'),
        Rule.custom(async (value, context) => {
          if (!value?._ref) return true
          const client = context.getClient({ apiVersion: '2024-01-01' })
          const workshop = await client.fetch(
            `*[_type == "talk" && _id == $id][0]`,
            { id: value._ref },
          )
          if (!workshop) return 'Workshop not found'
          if (!['workshop_120', 'workshop_240'].includes(workshop.format)) {
            return 'Referenced talk must be a workshop format'
          }
          return true
        }),
      ],
    }),

    defineField({
      name: 'conference',
      title: 'Conference',
      type: 'reference',
      to: [{ type: 'conference' }],
      validation: (Rule) =>
        Rule.required().error('Conference reference is required'),
    }),

    defineField({
      name: 'status',
      title: 'Status',
      type: 'string',
      options: {
        list: [
          { title: 'Confirmed', value: 'confirmed' },
          { title: 'Waitlist', value: 'waitlist' },
        ],
        layout: 'radio',
      },
      initialValue: 'confirmed',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'signedUpAt',
      title: 'Signed Up At',
      type: 'datetime',
      validation: (Rule) =>
        Rule.required().error('Signup timestamp is required'),
      initialValue: () => new Date().toISOString(),
      readOnly: true,
    }),
    defineField({
      name: 'confirmedAt',
      title: 'Confirmed At',
      type: 'datetime',
      hidden: ({ parent }) => parent?.status !== 'confirmed',
      validation: (Rule) =>
        Rule.custom((value, context) => {
          const { parent } = context as { parent?: { status?: string } }
          if (parent?.status === 'confirmed' && !value) {
            return 'Confirmed timestamp is required when status is confirmed'
          }
          return true
        }),
    }),

    defineField({
      name: 'confirmationEmailSent',
      title: 'Confirmation Email Sent',
      type: 'boolean',
      initialValue: false,
    }),
    defineField({
      name: 'notes',
      title: 'Admin Notes',
      type: 'text',
      rows: 3,
    }),
  ],

  preview: {
    select: {
      userName: 'userName',
      userEmail: 'userEmail',
      workshopTitle: 'workshop.title',
      status: 'status',
      signedUpAt: 'signedUpAt',
      experienceLevel: 'experienceLevel',
      operatingSystem: 'operatingSystem',
    },
    prepare(selection) {
      const {
        userName,
        userEmail,
        workshopTitle,
        status,
        signedUpAt,
        experienceLevel,
        operatingSystem,
      } = selection
      const date = signedUpAt ? new Date(signedUpAt).toLocaleDateString() : ''
      const statusLabel = status
        ? status.charAt(0).toUpperCase() + status.slice(1)
        : 'Pending'
      const expLabel = experienceLevel
        ? ` • ${experienceLevel.charAt(0).toUpperCase() + experienceLevel.slice(1)}`
        : ''
      const osLabel = operatingSystem
        ? ` • ${operatingSystem === 'macos' ? 'macOS' : operatingSystem.charAt(0).toUpperCase() + operatingSystem.slice(1)}`
        : ''

      return {
        title: userName || userEmail,
        subtitle: `${workshopTitle || 'Unknown Workshop'} • ${statusLabel} • ${date}${expLabel}${osLabel}`,
      }
    },
  },
})
