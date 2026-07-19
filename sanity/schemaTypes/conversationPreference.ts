import { defineField, defineType } from 'sanity'

/**
 * A single participant's per-conversation delivery preference (messaging M1).
 *
 * There is EXACTLY ONE document per (conversation, speaker) pair, addressed by a
 * deterministic `_id` (`convpref.<conversationId>.<speakerId>`) written via
 * `createIfNotExists` + a follow-up patch. This doc-per-pair model exists
 * precisely to AVOID a read-modify-write race on a shared array — two
 * participants (or two devices) editing their own preference can never clobber
 * each other.
 */
export default defineType({
  name: 'conversationPreference',
  title: 'Conversation Preference',
  type: 'document',
  fields: [
    defineField({
      name: 'conversation',
      title: 'Conversation',
      type: 'reference',
      to: [{ type: 'conversation' }],
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'speaker',
      title: 'Speaker',
      type: 'reference',
      to: [{ type: 'speaker' }],
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'muted',
      title: 'Muted',
      type: 'boolean',
      description:
        'When true, this participant receives no notifications (hub, push, or email) for the conversation.',
      initialValue: false,
    }),
    defineField({
      name: 'emailOverride',
      title: 'Email Override',
      type: 'string',
      description:
        "Per-conversation email override: 'default' follows the speaker's messagingEmailDefault, 'on'/'off' force it.",
      options: {
        list: [
          { title: 'Default (follow speaker setting)', value: 'default' },
          { title: 'Always email', value: 'on' },
          { title: 'Never email', value: 'off' },
        ],
        layout: 'radio',
      },
      initialValue: 'default',
    }),
    defineField({
      name: 'archivedAt',
      title: 'Archived At',
      type: 'datetime',
      description:
        'PER-USER archive for this participant. Same TIMESTAMP SEMANTICS as conversation.archivedAt: archived IFF archivedAt >= the conversation lastMessageAt, so a new message auto-resurfaces the thread for this participant with no extra write. This is the ONLY archive that hides a thread from a SPEAKER; organizers additionally honor the global conversation.archivedAt.',
    }),
  ],
  preview: {
    select: {
      speaker: 'speaker.name',
      muted: 'muted',
      emailOverride: 'emailOverride',
    },
    prepare({ speaker, muted, emailOverride }) {
      return {
        title: speaker || 'Unknown speaker',
        subtitle: `${muted ? 'muted' : 'active'} · email: ${emailOverride || 'default'}`,
      }
    },
  },
})
