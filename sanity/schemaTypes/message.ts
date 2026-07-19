import { defineField, defineType } from 'sanity'

/**
 * A single message within a {@link conversation} (messaging M1).
 *
 * Messages are append-only; adding one also bumps the parent conversation's
 * `lastMessageAt` in the SAME transaction (see `src/lib/messaging/sanity.ts`).
 */
export default defineType({
  name: 'message',
  title: 'Message',
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
      name: 'author',
      title: 'Author',
      type: 'reference',
      to: [{ type: 'speaker' }],
      // Weak so erasing a speaker (GDPR) doesn't orphan-block their deletion;
      // messages are immortal, so a dangling author ref is tolerated (it simply
      // no longer resolves to a speaker).
      weak: true,
      description:
        'The speaker (or organizer) who wrote this message. OPTIONAL as of G2b: a SPONSOR-authored message (portal side) has no speaker doc — it carries `authorParty = { sponsor }` plus an `authorName` snapshot instead, with this ref unset. Speaker/organizer authors still always set it.',
    }),
    defineField({
      name: 'authorName',
      title: 'Author Name (snapshot)',
      type: 'string',
      description:
        'Display-name SNAPSHOT of the author, written for SPONSOR-authored messages where there is no `author` speaker doc to dereference (the contact person the portal sender picked). Unset for speaker/organizer authors — the thread derives their name from the `author` ref. Written by the server, not edited in Studio.',
      readOnly: true,
    }),
    defineField({
      name: 'body',
      title: 'Body',
      type: 'text',
      rows: 4,
      validation: (Rule) => Rule.required().max(5000),
    }),
    defineField({
      name: 'createdAt',
      title: 'Created At',
      type: 'datetime',
      validation: (Rule) => Rule.required(),
      initialValue: () => new Date().toISOString(),
    }),
    defineField({
      name: 'authorParty',
      title: 'Author (party)',
      type: 'conversationParticipant',
      description:
        'The GENERAL party representation of the author (messaging party model, G1). Dual-written next to the legacy `author` ref; only speaker parties are produced in G1. NOT yet the read source — `author` still drives fan-out and previews; the read path flips in G2. Written by the server, not edited in Studio.',
      readOnly: true,
    }),
  ],
  preview: {
    select: {
      body: 'body',
      author: 'author.name',
      authorName: 'authorName',
      createdAt: 'createdAt',
    },
    prepare({ body, author, authorName, createdAt }) {
      const when = createdAt
        ? new Date(createdAt).toLocaleString()
        : 'Unknown date'
      return {
        title: body ? String(body).slice(0, 80) : 'Message',
        // `authorName` snapshot covers sponsor authors (no `author` ref).
        subtitle: `By ${author || authorName || 'Unknown'} · ${when}`,
      }
    },
  },
  orderings: [
    {
      title: 'Created Date (Oldest first)',
      name: 'createdAtAsc',
      by: [{ field: 'createdAt', direction: 'asc' }],
    },
  ],
})
