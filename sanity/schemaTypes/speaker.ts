import { Flags } from '@/lib/speaker/types'
import { defineField, defineType } from 'sanity'

export default defineType({
  name: 'speaker',
  title: 'Speaker',
  type: 'document',
  fields: [
    defineField({
      name: 'name',
      title: 'Name',
      type: 'string',
    }),
    defineField({
      name: 'title',
      title: 'Title',
      type: 'string',
    }),
    defineField({
      name: 'slug',
      title: 'Slug',
      type: 'slug',
      options: {
        source: 'name',
        maxLength: 96,
        slugify: (input) =>
          input.toLowerCase().replace(/\s+/g, '-').slice(0, 96),
      },
    }),
    defineField({
      name: 'email',
      title: 'Email',
      type: 'string',
      hidden: ({ currentUser }) => {
        return !(
          currentUser != null &&
          currentUser.roles.find(
            ({ name }) => name === 'administrator' || name === 'editor',
          )
        )
      },
    }),
    defineField({
      name: 'providers',
      title: 'Profile Providers',
      type: 'array',
      of: [{ type: 'string' }],
      hidden: ({ currentUser }) => {
        return !(
          currentUser != null &&
          currentUser.roles.find(
            ({ name }) => name === 'administrator' || name === 'editor',
          )
        )
      },
    }),
    defineField({
      name: 'imageURL',
      title: 'Image URL',
      type: 'string',
    }),
    defineField({
      name: 'image',
      title: 'Image',
      type: 'image',
      options: {
        hotspot: true,
      },
      fields: [
        {
          name: 'alt',
          type: 'string',
          title: 'Alternative Text',
        },
      ],
    }),
    defineField({
      name: 'links',
      title: 'Links',
      type: 'array',
      of: [{ type: 'string' }],
      validation: (Rule) =>
        Rule.custom((links) => {
          if (!links) return true
          for (const link of links as string[]) {
            try {
              new URL(link)
            } catch (error) {
              return 'Invalid URL format'
            }
          }
          return true
        }),
    }),
    defineField({
      name: 'bio',
      title: 'Bio',
      type: 'text',
    }),
    defineField({
      name: 'is_organizer',
      title: 'Is this a organizer?',
      type: 'boolean',
    }),
    defineField({
      name: 'is_featured',
      title: 'Is this as featured speaker?',
      type: 'boolean',
      deprecated: {
        reason:
          'Use the featured_speakers array in the conference document instead',
      },
    }),
    defineField({
      title: 'Flags',
      description: 'Meta information about the speaker',
      name: 'flags',
      type: 'array',
      of: [{ type: 'string' }],
      options: {
        list: [
          { title: 'Is Local Speaker', value: Flags.localSpeaker },
          { title: 'Is First Time Speaker', value: Flags.firstTimeSpeaker },
          { title: 'Is Diverse Speaker', value: Flags.diverseSpeaker },
          {
            title: 'Requires Travel Funding',
            value: Flags.requiresTravelFunding,
          },
        ],
      },
    }),
    defineField({
      name: 'consent',
      title: 'Privacy Consent',
      type: 'object',
      description: 'GDPR consent tracking for data processing',
      fields: [
        defineField({
          name: 'dataProcessing',
          title: 'Data Processing Consent',
          type: 'object',
          fields: [
            defineField({
              name: 'granted',
              title: 'Consent Granted',
              type: 'boolean',
              initialValue: false,
            }),
            defineField({
              name: 'grantedAt',
              title: 'Consent Granted At',
              type: 'datetime',
              readOnly: true,
            }),
            defineField({
              name: 'ipAddress',
              title: 'IP Address',
              type: 'string',
              readOnly: true,
              description:
                'IP address when consent was granted (for audit purposes)',
            }),
          ],
        }),
        defineField({
          name: 'marketing',
          title: 'Marketing Communications Consent',
          type: 'object',
          fields: [
            defineField({
              name: 'granted',
              title: 'Marketing Consent Granted',
              type: 'boolean',
              initialValue: false,
            }),
            defineField({
              name: 'grantedAt',
              title: 'Marketing Consent Granted At',
              type: 'datetime',
              readOnly: true,
            }),
            defineField({
              name: 'withdrawnAt',
              title: 'Marketing Consent Withdrawn At',
              type: 'datetime',
              readOnly: true,
            }),
          ],
        }),
        defineField({
          name: 'publicProfile',
          title: 'Public Profile Display Consent',
          type: 'object',
          fields: [
            defineField({
              name: 'granted',
              title: 'Public Profile Consent Granted',
              type: 'boolean',
              initialValue: false,
            }),
            defineField({
              name: 'grantedAt',
              title: 'Public Profile Consent Granted At',
              type: 'datetime',
              readOnly: true,
            }),
          ],
        }),
        defineField({
          name: 'photography',
          title: 'Photography/Recording Consent',
          type: 'object',
          fields: [
            defineField({
              name: 'granted',
              title: 'Photography Consent Granted',
              type: 'boolean',
              initialValue: false,
            }),
            defineField({
              name: 'grantedAt',
              title: 'Photography Consent Granted At',
              type: 'datetime',
              readOnly: true,
            }),
          ],
        }),
        defineField({
          name: 'privacyPolicyVersion',
          title: 'Privacy Policy Version',
          type: 'string',
          description: 'Version of privacy policy when consent was granted',
          readOnly: true,
        }),
      ],
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
      media: 'image',
    },
  },
})
