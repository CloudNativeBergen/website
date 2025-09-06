import { defineField, defineType } from 'sanity'
import { CONTACT_ROLE_OPTIONS } from '@/lib/sponsor/types'

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
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'org_number',
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
      name: 'contact_persons',
      title: 'Contact Persons',
      type: 'array',
      of: [
        {
          type: 'object',
          name: 'contactPerson',
          title: 'Contact Person',
          fields: [
            {
              name: 'name',
              title: 'Name',
              type: 'string',
              validation: (Rule) => Rule.required(),
            },
            {
              name: 'email',
              title: 'Email',
              type: 'string',
              validation: (Rule) =>
                Rule.required().email().error('Please enter a valid email'),
            },
            {
              name: 'phone',
              title: 'Phone',
              type: 'string',
            },
            {
              name: 'role',
              title: 'Role',
              type: 'string',
              description: "Select the contact person's role",
              options: {
                list: CONTACT_ROLE_OPTIONS.map((role) => ({
                  title: role,
                  value: role,
                })),
                layout: 'dropdown',
              },
            },
          ],
          preview: {
            select: {
              title: 'name',
              subtitle: 'role',
              description: 'email',
            },
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
      name: 'billing',
      title: 'Billing Information',
      type: 'object',
      fields: [
        {
          name: 'email',
          title: 'Billing Email',
          type: 'string',
          validation: (Rule) =>
            Rule.required().email().error('Please enter a valid email'),
        },
        {
          name: 'reference',
          title: 'Billing Reference',
          type: 'string',
          description: 'Purchase order number, reference code, etc.',
        },
        {
          name: 'comments',
          title: 'Billing Comments',
          type: 'text',
          description: 'Additional billing instructions or notes',
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
  ],
})
