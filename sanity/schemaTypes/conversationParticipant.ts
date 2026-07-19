import { defineField, defineType } from 'sanity'
import {
  ORGANIZERS_GROUP,
  validateConversationParticipant,
} from '../../src/lib/messaging/types'

/**
 * A single PARTY in a conversation (messaging party model, G1).
 *
 * This is the GENERAL representation of "who is on a thread", introduced so the
 * messaging system can later address non-speaker parties (sponsors, conference
 * teams) without a parallel data model. In G1 it is written ALONGSIDE the legacy
 * `createdBy`/`subjectSpeaker`/`proposal` fields (dual-write) and is NOT yet the
 * read source — the read path still derives participants from those legacy fields
 * (see `resolveParticipants` in `src/lib/messaging/sanity.ts`). Only `speaker`
 * and `group` parties are produced in G1; `sponsor` parties arrive in G2.
 *
 * A party has a `partyType` discriminator and EXACTLY ONE matching identity
 * field:
 * - `speaker` → a WEAK ref to the speaker (weak so a GDPR erase never
 *   orphan-blocks, consistent with every other human-pointing messaging ref);
 * - `sponsor` → a ref to the `sponsorForConference` edition membership (G2);
 * - `group`   → a group KEY string (e.g. `'organizers'`, the universal organizer
 *   group; per-conference teams come in G3).
 *
 * The object-level validation enforces the discriminator↔field congruence so a
 * malformed party (wrong field for its type, or more than one identity field)
 * can never be written.
 */

interface ParticipantValue {
  partyType?: string
}

export default defineType({
  name: 'conversationParticipant',
  title: 'Participant',
  type: 'object',
  fields: [
    defineField({
      name: 'partyType',
      title: 'Party Type',
      type: 'string',
      options: {
        list: [
          { title: 'Speaker', value: 'speaker' },
          { title: 'Sponsor', value: 'sponsor' },
          { title: 'Group', value: 'group' },
        ],
        layout: 'radio',
      },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'speaker',
      title: 'Speaker',
      type: 'reference',
      to: [{ type: 'speaker' }],
      // Weak so erasing a speaker (GDPR) doesn't orphan-block their deletion —
      // consistent with conversation.createdBy / message.author.
      weak: true,
      description: 'The speaker party (when partyType is "speaker").',
      hidden: ({ parent }) =>
        (parent as ParticipantValue)?.partyType !== 'speaker',
    }),
    defineField({
      name: 'sponsorForConference',
      title: 'Sponsor (for conference)',
      type: 'reference',
      to: [{ type: 'sponsorForConference' }],
      // Weak for symmetry with the other party refs; G2 begins using it.
      weak: true,
      description:
        'The sponsor edition-membership party (when partyType is "sponsor"). Unused in G1 — sponsor messaging lands in G2.',
      hidden: ({ parent }) =>
        (parent as ParticipantValue)?.partyType !== 'sponsor',
    }),
    defineField({
      name: 'group',
      title: 'Group',
      type: 'string',
      description:
        'A group KEY (when partyType is "group"), e.g. "organizers" — the universal organizer group. Per-conference teams come in G3.',
      options: {
        list: [{ title: 'Organizers', value: ORGANIZERS_GROUP }],
      },
      hidden: ({ parent }) =>
        (parent as ParticipantValue)?.partyType !== 'group',
    }),
  ],
  // EXACTLY ONE identity field must be present AND it must match `partyType`.
  // This keeps the discriminated union honest on write: no speaker party without
  // a speaker ref, no group party carrying a sponsor ref, etc. The rule is a pure
  // function shared with the unit tests (see validateConversationParticipant).
  validation: (Rule) =>
    Rule.custom((value) => validateConversationParticipant(value)),
  preview: {
    select: {
      partyType: 'partyType',
      speakerName: 'speaker.name',
      group: 'group',
    },
    prepare({ partyType, speakerName, group }) {
      const who =
        partyType === 'speaker'
          ? (speakerName ?? 'Speaker')
          : partyType === 'group'
            ? `Group: ${group ?? '—'}`
            : partyType === 'sponsor'
              ? 'Sponsor'
              : 'Participant'
      return { title: who, subtitle: partyType }
    },
  },
})
