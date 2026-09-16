import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import {
  CompanyBreakdownTable,
  type CompanyBreakdownRow,
} from './CompanyBreakdownTable'

const companies: CompanyBreakdownRow[] = [
  {
    originalName: 'Nordic Cloud Systems AS',
    normalizedName: 'nordic cloud systems',
    attendeeCount: 14,
    orderCount: 3,
  },
  {
    originalName: 'Bouvet',
    normalizedName: 'bouvet',
    attendeeCount: 9,
    orderCount: 2,
  },
  {
    originalName: 'Statens vegvesen',
    normalizedName: 'statens vegvesen',
    attendeeCount: 1,
    orderCount: 1,
  },
]

const meta = {
  title: 'Systems/Tickets/Admin/CompanyBreakdownTable',
  component: CompanyBreakdownTable,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Attendees per company on /admin/tickets/companies. Below `md` each row is a card and the rank moves in front of the company name — as its own label/value row it cost a full line to say "#1".',
      },
    },
  },
  args: { companies, totalAttendees: 24 },
  decorators: [
    (Story) => (
      <div className="min-h-screen bg-gray-50 p-4 dark:bg-gray-950">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof CompanyBreakdownTable>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

/**
 * The phone case. `defaultViewport` is load-bearing: the test runner resizes
 * the page from it and otherwise renders this at 1280, where the table — not
 * the card — is on screen and the assertions would prove nothing.
 *
 * Both halves matter: the rank must be in the card title AND gone from the
 * label list. Either one alone stays green while the other breaks.
 */
export const Mobile: Story = {
  parameters: { viewport: { defaultViewport: 'phone' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // The desktop table is still in the DOM (`hidden md:block`), so match on
    // what is actually on screen, not on what exists.
    const [cardTitle] = await canvas.findAllByText('Nordic Cloud Systems AS')
    await expect(cardTitle).toBeVisible()
    await expect(cardTitle).toHaveTextContent('#1')
    await expect(canvas.getByText('Rank')).not.toBeVisible()
  },
}

export const MobileDark: Story = {
  // `globals`, not a parameter: the preview decorator puts the `dark` class on
  // from `context.globals.theme`.
  globals: { theme: 'dark' },
  parameters: { viewport: { defaultViewport: 'phone' } },
}
