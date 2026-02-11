import { Flags } from '../../src/lib/speaker/types'
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
      validation: (Rule) => Rule.required(),
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
      description: 'URL-friendly identifier, auto-generated from name',
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
      description: 'Login email address (from OAuth provider)',
      validation: (Rule) => Rule.required().email(),
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
      description:
        'OAuth providers linked to this account (e.g., github, linkedin)',
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
      description: 'Profile image URL from OAuth provider',
    }),
    defineField({
      name: 'image',
      title: 'Image',
      type: 'image',
      description: 'Manually uploaded profile image (overrides imageURL)',
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
      description: 'Social media and personal website URLs',
      of: [{ type: 'string' }],
      validation: (Rule) =>
        Rule.custom((links) => {
          if (!links) return true
          for (const link of links as string[]) {
            try {
              new URL(link)
            } catch {
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
      description: 'Speaker biography displayed on the public profile',
    }),
    defineField({
      name: 'isOrganizer',
      title: 'Is this a organizer?',
      type: 'boolean',
      description: 'Grants access to the admin interface',
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
          type: 'dataProcessingConsent',
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
