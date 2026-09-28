import { defineField, defineType } from 'sanity'

export default defineType({
  name: 'sponsor',
  title: 'Sponsor',
  type: 'document',
  fields: [
    defineField({
      name: 'name',
      title: 'Name',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'website',
      title: 'Website',
      type: 'url',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'logo',
      title: 'Logo',
      type: 'inlineSvg',
    }),
    defineField({
      name: 'logoBright',
      title: 'Logo (Bright)',
      type: 'inlineSvg',
      description:
        'Optional bright/white version of the logo for use on dark backgrounds',
    }),
    defineField({
      name: 'orgNumber',
      title: 'Organization Number',
      type: 'string',
      description: 'Company registration number or organization number',
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
      name: 'address',
      title: 'Address',
      type: 'string',
      description: 'Registered company address (used in contracts)',
      hidden: ({ currentUser }) => {
        return !(
          currentUser != null &&
          currentUser.roles.find(
            ({ name }) => name === 'administrator' || name === 'editor',
          )
        )
      },
    }),
    // The company's social accounts, entered once in the sponsor CRM and
    // reused across editions (tagging spec §3.3). A sponsor has no opt-out:
    // these are an organizer's entries about a commercial partner.
    defineField({
      name: 'blueskyHandle',
      title: 'Bluesky handle',
      type: 'string',
      description:
        'The company Bluesky handle without the @ (e.g. acme.com). Sponsor posts on Bluesky tag it. Checked against Bluesky when saved from the sponsor CRM.',
      validation: (Rule) =>
        Rule.max(253).regex(
          /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]([a-z0-9-]{0,61}[a-z0-9])?$/,
          {
            name: 'Bluesky handle, lower-case, without the @',
          },
        ),
    }),
    defineField({
      name: 'linkedinUrl',
      title: 'LinkedIn company page',
      type: 'url',
      description:
        'Listed beside the company name under "Tag by hand" when a LinkedIn post about this sponsor is posted.',
    }),
    // Multi-tenant owner (CaaS T1-1, #613). Additive/optional; populated by the
    // 044 backfill and stamped at creation. Server code must not assume presence.
    defineField({
      name: 'organization',
      title: 'Organization',
      type: 'reference',
      to: [{ type: 'organization' }],
      description: 'The organization (tenant) that owns this sponsor.',
    }),
  ],
  preview: {
    select: {
      title: 'name',
    },
  },
})
