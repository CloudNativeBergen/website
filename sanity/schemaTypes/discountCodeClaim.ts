import { defineField, defineType } from 'sanity'

/**
 * The ownership lock for a ticket discount code (#1262): one document per
 * (conference, code), with a deterministic id, created by the first request
 * that links the code to a sponsor and refused to every later one. It is not
 * the link itself — that is `sponsorForConference.discountCodes`, which every
 * attribution reads — only the arbiter between two concurrent links.
 * See `src/lib/sponsor-crm/discount-code-claims.ts`.
 */
export default defineType({
  name: 'discountCodeClaim',
  title: 'Discount Code Claim',
  type: 'document',
  readOnly: true,
  fields: [
    defineField({
      name: 'code',
      title: 'Code',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'conference',
      title: 'Conference',
      type: 'reference',
      to: [{ type: 'conference' }],
      weak: true,
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'organization',
      title: 'Organization',
      type: 'reference',
      to: [{ type: 'organization' }],
      weak: true,
      description: 'Denormalized tenant key (CaaS T1-1).',
    }),
    defineField({
      name: 'sponsorForConference',
      title: 'Held by',
      type: 'reference',
      to: [{ type: 'sponsorForConference' }],
      // Weak: deleting a sponsor's CRM record must not be blocked by its
      // claims; a claim whose holder is gone is taken over by the next link.
      weak: true,
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'claimedAt',
      title: 'Claimed At',
      type: 'datetime',
    }),
  ],
  preview: {
    select: { title: 'code', subtitle: 'sponsorForConference.sponsor.name' },
  },
})
