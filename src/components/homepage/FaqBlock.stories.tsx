import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { FaqBlock } from './FaqBlock'
import type { Conference } from '@/lib/conference/types'

const conference = {
  _id: 'conf-1',
  title: 'Cloud Native Days Norway 2026',
  ticketFaqs: [
    {
      _key: 't1',
      question: 'Can I get a refund?',
      answer: 'Tickets are refundable up to 14 days before the event.',
    },
    {
      _key: 't2',
      question: 'Is lunch included?',
      answer: 'Yes — lunch and coffee are included with every ticket.',
    },
  ],
} as unknown as Conference

const meta = {
  title: 'Systems/Homepage/Public/FaqBlock',
  component: FaqBlock,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Front-page builder (F4) FAQ accordion. Renders EITHER its own items or, via `source: "ticketFaqs"`, the existing ticket FAQs (no duplication). Uses the shared FaqAccordion so it matches the tickets page. Renders nothing when empty.',
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof FaqBlock>

export default meta
type Story = StoryObj<typeof meta>

export const OwnItems: Story = {
  args: {
    conference,
    section: {
      _key: 'faq-1',
      _type: 'homepageFaq',
      heading: 'Frequently asked questions',
      source: 'own',
      items: [
        {
          _key: 'i1',
          question: 'Where is the conference held?',
          answer: 'At Grieghallen in the centre of Bergen, Norway.',
        },
        {
          _key: 'i2',
          question: 'Will talks be recorded?',
          answer:
            'Yes, all talks are recorded and published on our YouTube channel afterwards.',
        },
      ],
    },
  },
}

export const FromTicketFaqs: Story = {
  args: {
    conference,
    section: {
      _key: 'faq-2',
      _type: 'homepageFaq',
      source: 'ticketFaqs',
    },
  },
}

/** Edge case: no items and own source → the block renders nothing. */
export const EmptyItems: Story = {
  args: {
    conference,
    section: {
      _key: 'faq-3',
      _type: 'homepageFaq',
      source: 'own',
      items: [],
    },
  },
}

export const Dark: Story = {
  args: OwnItems.args,
  parameters: { theme: 'dark', backgrounds: { default: 'dark' } },
  decorators: [
    (Story) => (
      <div className="dark bg-gray-950">
        <Story />
      </div>
    ),
  ],
}
