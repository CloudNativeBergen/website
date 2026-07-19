import {
  Flags,
  genderOptions,
  genderPreferToSelfDescribe,
} from '../../src/lib/speaker/types'
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
      name: 'knownEmails',
      title: 'Known Emails',
      type: 'array',
      description:
        'Normalized (lowercased) verified emails used to match this speaker across OAuth providers. Managed automatically on login; distinct from the display email.',
      of: [{ type: 'string' }],
      readOnly: true,
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
      name: 'gender',
      title: 'Gender',
      type: 'string',
      description:
        'Optional self-reported gender. Diversity data used only for aggregate reporting.',
      options: {
        list: genderOptions.map((value) => ({ title: value, value })),
      },
    }),
    defineField({
      name: 'genderSelfDescribe',
      title: 'Gender (self-described)',
      type: 'string',
      description:
        'Optional free-text value used when gender is "Prefer to self-describe".',
      hidden: ({ parent }) => parent?.gender !== genderPreferToSelfDescribe,
    }),
    defineField({
      name: 'country',
      title: 'Country',
      type: 'string',
      description:
        'Optional country of residence. Helps organizers understand travel needs.',
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
    // Opt-in web push (#444). Additive/optional — legacy speaker documents
    // without these fields remain valid, so no migration is required. Managed
    // entirely by the app (tRPC `push` router); read-only in the Studio.
    defineField({
      name: 'pushSubscriptions',
      title: 'Push Subscriptions',
      type: 'array',
      description:
        'Browser web-push subscriptions this speaker has opted into. Managed by the app; do not edit here.',
      readOnly: true,
      of: [
        {
          type: 'object',
          fields: [
            defineField({ name: 'endpoint', title: 'Endpoint', type: 'url' }),
            defineField({
              name: 'keys',
              title: 'Keys',
              type: 'object',
              fields: [
                defineField({
                  name: 'p256dh',
                  title: 'p256dh',
                  type: 'string',
                }),
                defineField({ name: 'auth', title: 'auth', type: 'string' }),
              ],
            }),
            defineField({
              name: 'createdAt',
              title: 'Created At',
              type: 'datetime',
            }),
            defineField({
              name: 'userAgent',
              title: 'User Agent',
              type: 'string',
            }),
          ],
          preview: {
            select: { title: 'userAgent', subtitle: 'endpoint' },
          },
        },
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
    defineField({
      name: 'pushPreferences',
      title: 'Push Preferences',
      type: 'object',
      description:
        'Per-category web push opt-outs. Absent/unset means all categories are enabled.',
      readOnly: true,
      fields: [
        defineField({
          name: 'proposalDecisions',
          title: 'Proposal Decisions',
          type: 'boolean',
          initialValue: true,
        }),
        defineField({
          name: 'talkConfirmed',
          title: 'Talk Confirmed',
          type: 'boolean',
          initialValue: true,
        }),
        defineField({
          name: 'coSpeakerInvites',
          title: 'Co-Speaker Invites',
          type: 'boolean',
          initialValue: true,
        }),
        defineField({
          name: 'messages',
          title: 'Messages',
          type: 'boolean',
          initialValue: true,
        }),
        defineField({
          name: 'otherUpdates',
          title: 'Other Updates',
          type: 'boolean',
          initialValue: true,
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
    // Messaging emails (M4 flipped M1's opt-in to opt-OUT): the speaker
    // receives an email for new conversation messages whose per-conversation
    // override is 'default' unless this field is EXPLICITLY false. Absent/unset
    // means ENABLED, so all existing speaker docs are covered — no migration.
    defineField({
      name: 'messagingEmailDefault',
      title: 'Messaging Email (default)',
      type: 'boolean',
      description:
        'Default email delivery for new conversation messages. ON by default (absent counts as on); only an explicit off disables it. Per-conversation overrides can still force on/off.',
      initialValue: true,
    }),
  ],
  preview: {
    select: {
      title: 'name',
      media: 'image',
    },
  },
})
