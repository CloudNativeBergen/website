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
    // THE PROVENANCE TRAIL FOR ORGANIZER-LINKED TICKET ADDRESSES.
    //
    // `knownEmails` is a flat list of strings: once an address is in it, nothing
    // records HOW it got there. Every other entry got there by a login proving
    // the address; these got there because an organizer matched a ticket. If one
    // later turns out to grant the wrong person access, an operator has to be
    // able to see who added it, when, and off which ticket — and undo it. That
    // is what this array is for, and it is the reason the write is auditable
    // rather than indistinguishable from a verified login.
    defineField({
      name: 'ticketEmailGrants',
      title: 'Ticket Email Grants',
      type: 'array',
      description:
        'Addresses added to Known Emails by an organizer matching a ticket for this event, with who added each one and off which ticket. Removing an entry here is what revokes the sign-in it granted.',
      of: [
        {
          type: 'object',
          name: 'ticketEmailGrant',
          fields: [
            {
              name: 'email',
              type: 'string',
              title: 'Email',
              description: 'Normalized address, as written to Known Emails.',
            },
            {
              name: 'registeredEmail',
              type: 'string',
              title: 'Registered Email',
              description: 'The address exactly as it appears on the ticket.',
            },
            {
              name: 'ticketId',
              type: 'number',
              title: 'Ticket ID',
              description: "The ticket provider's own id for that ticket.",
            },
            {
              name: 'addedBy',
              type: 'string',
              title: 'Added By',
              description: 'Speaker document id of the organizer who added it.',
            },
            { name: 'addedByName', type: 'string', title: 'Added By (name)' },
            {
              name: 'addedByOrg',
              type: 'string',
              title: 'Added By (organization)',
              description:
                'Organization the grant was made in. A speaker can belong to several; an organizer of another one is shown the address but not who at this one linked it.',
            },
            { name: 'addedAt', type: 'datetime', title: 'Added At' },
          ],
          preview: {
            select: { title: 'email', subtitle: 'addedByName' },
          },
        },
      ],
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
    // Multi-tenant membership (CaaS T1-1, #613). A speaker is a GLOBAL PERSON:
    // the SAME human can belong to several organizations (tenants), so membership
    // is an ARRAY of organization references rather than a single owner ref.
    // Populated by the 044 backfill and appended-to (setIfMissing + append) on
    // login for the current conference's organization. Additive/optional —
    // legacy speaker docs without it remain valid.
    defineField({
      name: 'organizations',
      title: 'Organizations',
      type: 'array',
      description:
        'Organizations (tenants) this person belongs to. A person can be a member of several organizations; membership accrues as they participate in each.',
      of: [{ type: 'reference', to: [{ type: 'organization' }] }],
      validation: (Rule) => Rule.unique(),
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
    /**
     * RECOVERY TRAIL for duplicate merges (#1027 item 9).
     *
     * `speaker.admin.merge` DELETES the duplicate document; before this the only
     * record was a `console.info` carrying counts, so the discarded values were
     * unrecoverable outside Sanity's dataset history. Each entry is written
     * INSIDE the merge transaction, ordered before the loser `delete` (still
     * last), so a failed merge leaves no entry and a committed merge always has
     * one.
     *
     * IT LIVES ON THE SURVIVOR ON PURPOSE, not in a document of its own:
     *  - ORG-SCOPED by construction — the speaker document already is, so there
     *    is no separate tenant attribution to get wrong;
     *  - ERASED by construction — `ERASURE_UNSET_FIELDS` in
     *    `src/lib/speaker/erasure.ts` unsets it, so a GDPR erasure of this
     *    speaker takes the copied personal data with it;
     *  - RETENTION is structural — the trail dies with the record it describes,
     *    so it needs no sweeper and no policy;
     *  - it never enters the reference graph, so a later merge cannot rewrite
     *    it and the exclusivity probe cannot trip over it.
     *
     * PRIVATE. Entries hold a deleted person's email, bio and possibly
     * gender/country, so `EXCLUDE_PRIVATE_SPEAKER_FIELDS` nulls this out of
     * every `...` speaker projection (pinned by `push-exclusion.test.ts`).
     *
     * ERASABLE FOR THE COPIED PERSON TOO, via `loserEmails` below. The deleted
     * document's id no longer resolves, so nothing in the reference graph leads
     * from that person to this entry; `loserEmails` is the typed match key that
     * does, and `eraseSpeakerInPlace` redacts the entry through it.
     *
     * THERE IS NO UNDO, deliberately: reversing a merge means un-repointing
     * references in documents that have since been edited. Recovery is a human
     * reading `snapshot` and re-creating what they need by hand.
     */
    defineField({
      name: 'mergedWith',
      title: 'Merged duplicates',
      type: 'array',
      description:
        'Duplicate speaker records folded into this one. Written by the merge ' +
        'tool; there is no undo — recovery is by hand from the snapshot.',
      readOnly: true,
      of: [
        {
          type: 'object',
          name: 'speakerMergeRecord',
          fields: [
            defineField({
              name: 'mergedAt',
              title: 'Merged At',
              type: 'datetime',
            }),
            defineField({
              name: 'actorId',
              title: 'Actor speaker id',
              type: 'string',
            }),
            defineField({
              name: 'actorName',
              title: 'Actor name',
              type: 'string',
            }),
            // Plain strings: historical ids, and the loser's is dangling by
            // definition (that document no longer exists). `survivorId` is the
            // survivor AT THE TIME, which a carried-forward entry shows was a
            // different document than the one now holding it.
            defineField({
              name: 'survivorId',
              title: 'Survivor speaker id',
              type: 'string',
            }),
            defineField({
              name: 'loserId',
              title: 'Deleted duplicate id',
              type: 'string',
            }),
            /**
             * THE ERASURE HANDLE for the person this entry describes.
             *
             * Their `_id` is dangling and their name/email/bio live inside
             * `snapshot`, which is a JSON STRING — GROQ cannot look inside one.
             * So an erasure request from them would find nothing and the
             * operator would report "done" over a live copy of their data.
             * These are their normalised addresses (display `email` plus
             * `knownEmails`), stored as a typed array precisely so the
             * email-keyed erasure sweep can select the entry:
             * `count(mergedWith[count(loserEmails[@ in $emails]) > 0]) > 0`.
             *
             * Normalised (`normalizeEmail`) because that is the form the whole
             * match rail uses — see `src/lib/speaker/email.ts`. This is a MATCH
             * SET, never a recipient address.
             *
             * CLEARED BY ERASURE along with the snapshot's personal fields, so
             * an erased entry is no longer findable — there is nothing left of
             * that person to find.
             */
            defineField({
              name: 'loserEmails',
              title: 'Deleted duplicate’s email match set',
              type: 'array',
              of: [{ type: 'string' }],
              description:
                'Normalised addresses of the deleted duplicate. The key the ' +
                'GDPR erasure sweep uses to reach this entry; cleared when it ' +
                'runs.',
            }),
            defineField({
              name: 'snapshot',
              title: 'Snapshot (JSON)',
              type: 'text',
              description:
                'JSON: { loser } the deleted document as stored, minus push ' +
                'subscriptions and the consent IP address — the ' +
                'recovery artifact, carrying bioTruncated: true when the bio ' +
                'was too long to copy whole; { survivorBefore } the survivor values the ' +
                'merge overwrote; { fields } which side each selectable field ' +
                'came from plus the recommendation and reason; { references } ' +
                'the repoint summary. Opaque JSON rather than typed fields so it ' +
                'stays a faithful copy when the speaker schema changes. After a ' +
                'GDPR erasure the personal parts are dropped and a ' +
                'loserRedactedAt timestamp marks what is left — the record of ' +
                'the merge survives, the person in it does not.',
            }),
          ],
          preview: {
            select: { title: 'loserId', subtitle: 'mergedAt' },
          },
        },
      ],
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
    // Right to erasure, Phase 1 (RunKonf/platform#52). Set by
    // `eraseSpeakerInPlace` with `setIfMissing`, so a repeated erasure PRESERVES
    // the original timestamp — the date a request was answered is itself a
    // record. Its presence is the marker that this document is an ANONYMISED
    // placeholder rather than a person: the name is "Deleted speaker", the email
    // is an RFC 2606 `.invalid` address, and the login match keys are gone.
    // Never written by any other path; read-only in the Studio.
    defineField({
      name: 'erasedAt',
      title: 'Erased At',
      type: 'datetime',
      readOnly: true,
      description:
        'When this speaker was anonymised under the right to erasure. Set once and never updated. See docs/SPEAKER_ERASURE_RUNBOOK.md.',
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
