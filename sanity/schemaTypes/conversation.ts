import { defineField, defineType } from 'sanity'

/**
 * A speaker↔organizer conversation thread (messaging M1).
 *
 * Two shapes:
 * - `proposal` threads hang off a single proposal (talk). There is AT MOST ONE
 *   per proposal: the router enforces this with a deterministic document id
 *   (`conversation.proposal.<proposalId>`) written via `createIfNotExists`, so a
 *   race between two starters is harmless (both converge on the same doc).
 * - `general` threads are free-standing (creator ↔ organizers) with a random id.
 *
 * `subject` is stored EXPLICITLY even for proposal threads (defaulted to the
 * proposal title at creation) so a thread can render without resolving the
 * proposal, and so a later proposal-title edit doesn't silently rewrite history.
 */
export default defineType({
  name: 'conversation',
  title: 'Conversation',
  type: 'document',
  fields: [
    defineField({
      name: 'conference',
      title: 'Conference',
      type: 'reference',
      to: [{ type: 'conference' }],
      description: 'The conference edition this conversation belongs to.',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'conversationType',
      title: 'Type',
      type: 'string',
      options: {
        list: [
          { title: 'Proposal', value: 'proposal' },
          { title: 'General', value: 'general' },
        ],
        layout: 'radio',
      },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'proposal',
      title: 'Proposal',
      type: 'reference',
      to: [{ type: 'talk' }],
      // Weak so deleting the proposal does not orphan-block or fail the delete.
      weak: true,
      description:
        'The proposal (talk) this thread is about. Required for proposal threads.',
      validation: (Rule) =>
        Rule.custom((value, context) => {
          const type = (context.parent as { conversationType?: string })
            ?.conversationType
          if (type === 'proposal' && !value) {
            return 'A proposal reference is required for proposal threads'
          }
          return true
        }),
    }),
    defineField({
      name: 'createdBy',
      title: 'Created By',
      type: 'reference',
      to: [{ type: 'speaker' }],
      // Weak so erasing a speaker (GDPR) doesn't orphan-block their deletion; a
      // dangling creator ref is tolerated.
      weak: true,
      description: 'The speaker who started this conversation.',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'subjectSpeaker',
      title: 'Subject Speaker',
      type: 'reference',
      to: [{ type: 'speaker' }],
      // Weak so erasing a speaker (GDPR) doesn't orphan-block their deletion.
      weak: true,
      description:
        'The speaker a general conversation is ABOUT/with. Set when an ORGANIZER initiates a general thread targeting a speaker; speaker-created threads leave this unset (the creator IS the speaker). Unused for proposal threads.',
    }),
    defineField({
      name: 'subject',
      title: 'Subject',
      type: 'string',
      description:
        'Thread subject. For proposal threads this defaults to the proposal title at creation and is stored explicitly.',
      validation: (Rule) => Rule.required().max(200),
    }),
    defineField({
      name: 'createdAt',
      title: 'Created At',
      type: 'datetime',
      validation: (Rule) => Rule.required(),
      initialValue: () => new Date().toISOString(),
    }),
    defineField({
      name: 'lastMessageAt',
      title: 'Last Message At',
      type: 'datetime',
      description:
        'Timestamp of the most recent message; bumped in the same transaction that adds a message. Drives the inbox ordering.',
      validation: (Rule) => Rule.required(),
      initialValue: () => new Date().toISOString(),
    }),
    defineField({
      name: 'status',
      title: 'Status',
      type: 'string',
      description:
        'Ticketing state for the ORGANIZER audience. ABSENT MEANS OPEN — pre-ticketing threads carry no status and every read coalesces undefined to "open", so existing documents need no migration.',
      options: {
        list: [
          { title: 'Open', value: 'open' },
          { title: 'Resolved', value: 'resolved' },
        ],
        layout: 'radio',
      },
      initialValue: 'open',
    }),
    defineField({
      name: 'assignedTo',
      title: 'Assigned To',
      type: 'reference',
      to: [{ type: 'speaker' }],
      // Weak so erasing a speaker (GDPR) doesn't orphan-block their deletion; a
      // dangling assignee ref is tolerated (mirrors createdBy/subjectSpeaker).
      weak: true,
      description: 'Organizer responsible for following up.',
      // Restrict the Studio picker to organizers. `isOrganizer` is global, so
      // (unlike sponsorForConference.assignedTo) this deliberately skips the
      // per-conference filtering — the router validates the assignee instead.
      options: {
        filter: '_id in *[_type == "conference"].organizers[]._ref',
      },
    }),
    defineField({
      name: 'archivedAt',
      title: 'Archived At',
      type: 'datetime',
      description:
        'GLOBAL organizer archive. TIMESTAMP SEMANTICS: a conversation is globally archived IFF archivedAt >= lastMessageAt. A new message bumps lastMessageAt past archivedAt, so the thread AUTO-RESURFACES with zero fan-out writes. Speakers ignore this field (global archive is an organizer-side hide); a speaker archives via their own conversationPreference.archivedAt.',
    }),
    defineField({
      name: 'lastStaleNudgeAt',
      title: 'Last Stale Nudge At',
      type: 'datetime',
      description:
        'Bookkeeping for the stale-thread cron: when a stale-nudge notification was last emitted for this thread. A nudge fires again only once a NEWER message arrives (lastStaleNudgeAt < lastMessageAt), so a thread is never nudged twice for the same trailing message.',
      readOnly: true,
      hidden: true,
    }),
  ],
  preview: {
    select: {
      subject: 'subject',
      conversationType: 'conversationType',
      lastMessageAt: 'lastMessageAt',
    },
    prepare({ subject, conversationType, lastMessageAt }) {
      const when = lastMessageAt
        ? new Date(lastMessageAt).toLocaleDateString()
        : 'Unknown date'
      return {
        title: subject || 'Conversation',
        subtitle: `${conversationType || 'general'} · last activity ${when}`,
      }
    },
  },
  orderings: [
    {
      title: 'Last Message (Newest first)',
      name: 'lastMessageAtDesc',
      by: [{ field: 'lastMessageAt', direction: 'desc' }],
    },
  ],
})
