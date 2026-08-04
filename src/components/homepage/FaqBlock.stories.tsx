import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite'
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

const ownItems = [
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
]

/** A longer set, so the open list has enough entries to fill two columns. */
const manyItems = [
  ...ownItems,
  {
    _key: 'i3',
    question: 'Is there a student rate?',
    answer:
      'Yes. Students pay a reduced rate; bring a valid student ID to the registration desk.',
  },
  {
    _key: 'i4',
    question: 'Can I transfer my ticket to a colleague?',
    answer:
      'Up to 48 hours before the event, from your order confirmation email. After that, ask at the registration desk on the day.',
  },
  {
    _key: 'i5',
    question: 'Do you cater for dietary requirements?',
    answer:
      'Vegetarian and vegan options are served at every meal. Tell us about allergies when you register and the kitchen will accommodate them.',
  },
  {
    _key: 'i6',
    question: 'How do I get there?',
    answer:
      'Four minutes on foot from the Bybanen stop at Nonneseteret, ten from Bergen station. There is no visitor parking at the venue.',
  },
]

const meta = {
  title: 'Systems/Homepage/Public/FaqBlock',
  component: FaqBlock,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Front-page builder (F4) FAQ block. Renders EITHER its own items or, via `source: "ticketFaqs"`, the existing ticket FAQs (no duplication). Two variants: `accordion` (the default — the shared FaqAccordion, so it matches the tickets page) and `list` (every answer open, in two columns from `md` up, with NO disclosure widget: headings and paragraphs, not forced-open `<details>`). Renders nothing when empty.',
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof FaqBlock>

export default meta
type Story = StoryObj<typeof meta>

const darkDecorator: Decorator[] = [
  (Story) => (
    <div className="dark bg-gray-950">
      <Story />
    </div>
  ),
]

const dark = {
  parameters: { theme: 'dark', backgrounds: { default: 'dark' } },
  decorators: darkDecorator,
}

/* ------------------------------ accordion (default) --------------------- */

export const OwnItems: Story = {
  args: {
    conference,
    section: {
      _key: 'faq-1',
      _type: 'homepageFaq',
      heading: 'Frequently asked questions',
      source: 'own',
      items: ownItems,
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
  ...dark,
}

/* ---------------------------------- list -------------------------------- */

/**
 * `list`: every question and answer readable at once, nothing to click. Two
 * columns from `md` up, one on a phone; entries never split across a column or
 * page break, so the band prints as it reads.
 */
export const List: Story = {
  args: {
    conference,
    section: {
      _key: 'faq-4',
      _type: 'homepageFaq',
      variant: 'list',
      heading: 'Frequently asked questions',
      source: 'own',
      items: manyItems,
    },
  },
}

export const ListDark: Story = {
  args: List.args,
  ...dark,
}

/** A short FAQ — the case the open list is really for. */
export const ListShort: Story = {
  args: {
    conference,
    section: {
      _key: 'faq-5',
      _type: 'homepageFaq',
      variant: 'list',
      source: 'own',
      items: ownItems,
    },
  },
}
