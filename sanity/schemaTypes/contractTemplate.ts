import { defineField, defineType } from 'sanity'
import { CURRENCY_OPTIONS } from './constants'

export default defineType({
  name: 'contractTemplate',
  title: 'Contract Template',
  type: 'document',
  fields: [
    defineField({
      name: 'title',
      title: 'Title',
      type: 'string',
      description: 'Internal name for this contract template',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'conference',
      title: 'Conference',
      type: 'reference',
      to: [{ type: 'conference' }],
      description: 'Conference this template belongs to',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'tier',
      title: 'Default Tier',
      type: 'reference',
      to: [{ type: 'sponsorTier' }],
      description:
        'Optional: associate this template with a specific sponsor tier',
      options: {
        filter: ({ document }: { document: any }) => {
          if (!document?.conference?._ref) return {}

          return {
            filter: 'conference._ref == $conferenceId',
            params: { conferenceId: document.conference._ref },
          }
        },
      },
    }),
    defineField({
      name: 'language',
      title: 'Language',
      type: 'string',
      options: {
        list: [
          { title: 'Norwegian (Bokmål)', value: 'nb' },
          { title: 'English', value: 'en' },
        ],
        layout: 'radio',
      },
      initialValue: 'nb',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'currency',
      title: 'Default Currency',
      type: 'string',
      options: {
        list: [...CURRENCY_OPTIONS],
        layout: 'dropdown',
      },
      initialValue: 'NOK',
    }),
    defineField({
      name: 'sections',
      title: 'Contract Sections',
      type: 'array',
      description:
        'Ordered list of sections that make up the contract document',
      of: [
        {
          type: 'object',
          name: 'contractSection',
          title: 'Section',
          fields: [
            {
              name: 'heading',
              title: 'Section Heading',
              type: 'string',
              validation: (Rule) => Rule.required(),
            },
            {
              name: 'body',
              title: 'Section Body',
              type: 'blockContent',
              description:
                'Use {{{VARIABLE_NAME}}} for dynamic values (e.g. {{{SPONSOR_NAME}}}, {{{TIER_NAME}}}, {{{CONTRACT_VALUE}}})',
            },
          ],
          preview: {
            select: {
              title: 'heading',
            },
          },
        },
      ],
      validation: (Rule) => Rule.required().min(1),
    }),
    defineField({
      name: 'headerText',
      title: 'Header Text',
      type: 'string',
      description: 'Text shown in the PDF header (e.g. organization name)',
      initialValue: 'Cloud Native Days Norway',
    }),
    defineField({
      name: 'footerText',
      title: 'Footer Text',
      type: 'string',
      description:
        'Text shown in the PDF footer (e.g. org number, contact info)',
    }),
    defineField({
      name: 'terms',
      title: 'General Terms & Conditions',
      type: 'blockContent',
      description:
        'General terms and conditions included as Appendix 1 in the contract PDF and displayed on the public sponsor terms page',
    }),
    defineField({
      name: 'isDefault',
      title: 'Default Template',
      type: 'boolean',
      description:
        'Use this template as the default when no tier-specific template exists',
      initialValue: false,
    }),
    defineField({
      name: 'isActive',
      title: 'Active',
      type: 'boolean',
      description: 'Whether this template is available for use',
      initialValue: true,
    }),
  ],
  preview: {
    select: {
      title: 'title',
      conferenceName: 'conference.title',
      tierName: 'tier.title',
      language: 'language',
      isActive: 'isActive',
    },
    prepare({ title, conferenceName, tierName, language, isActive }) {
      const lang = language === 'nb' ? '🇳🇴' : '🇬🇧'
      const status = isActive === false ? ' (inactive)' : ''
      const tier = tierName ? ` — ${tierName}` : ''
      return {
        title: `${lang} ${title}${status}`,
        subtitle: `${conferenceName || 'No Conference'}${tier}`,
      }
    },
  },
  orderings: [
    {
      title: 'Title',
      name: 'title',
      by: [{ field: 'title', direction: 'asc' }],
    },
  ],
})
