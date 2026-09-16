import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { http, HttpResponse } from 'msw'
import { ThemeProvider } from 'next-themes'
import { expect, within } from 'storybook/test'
import { TicketPageContentEditor } from './TicketPageContentEditor'

const meta = {
  title: 'Systems/Tickets/Admin/TicketPageContentEditor',
  component: TicketPageContentEditor,
  parameters: {
    layout: 'fullscreen',
    msw: {
      handlers: [
        http.post('/api/trpc/tickets.admin.updatePageContent', () =>
          HttpResponse.json({ result: { data: { success: true } } }),
        ),
      ],
    },
    docs: {
      description: {
        component:
          'The /admin/tickets/content editor. On a phone the icon select sits under the title input instead of taking 144px of the same line, and the add/remove controls are 44px targets.',
      },
    },
  },
  args: {
    conferenceTitle: 'Cloud Native Days Bergen 2026',
    initialCustomization: {
      heroHeadline: 'Tickets',
      ctaButtonText: 'Register now',
      showVanityMetrics: true,
      groupDiscountInfo:
        'Groups of five or more get 10% off. Contact us for details.',
    },
    initialInclusions: [
      {
        _key: 'a',
        title: 'Two days of talks',
        description: 'Five tracks, all recorded.',
        icon: 'MicrophoneIcon',
      },
      {
        _key: 'b',
        title: 'Lunch and coffee',
        description: '',
        icon: 'GiftIcon',
      },
    ],
    initialFaqs: [
      {
        _key: 'c',
        question: 'Can I transfer my ticket?',
        answer: 'Yes, up to 48 hours before the event.',
      },
    ],
    vanityMetrics: [
      { label: 'Attendees', value: '600' },
      { label: 'Speakers', value: '48' },
    ],
  },
  decorators: [
    (Story, ctx) => {
      const dark = ctx.parameters.theme === 'dark'
      return (
        <ThemeProvider
          attribute="class"
          forcedTheme={dark ? 'dark' : 'light'}
          enableSystem={false}
        >
          <div className={dark ? 'dark' : ''}>
            <div className="min-h-screen bg-gray-50 p-4 dark:bg-gray-950">
              <Story />
            </div>
          </div>
        </ThemeProvider>
      )
    },
  ],
} satisfies Meta<typeof TicketPageContentEditor>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

/**
 * The phone case, pinned. `defaultViewport` is load-bearing: the test runner
 * resizes the page from it, and its default of 1280 would run these assertions
 * against the desktop layout, where they hold anyway and prove nothing.
 *
 * Both halves are the net: the icon select must have the row to itself AND the
 * remove button must be a 44px target — either can regress alone.
 */
export const Mobile: Story = {
  parameters: { viewport: { defaultViewport: 'phone' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const title = await canvas.findByDisplayValue('Two days of talks')
    const select = canvas.getAllByRole('combobox')[0]
    // Stacked, not side by side.
    await expect(select.getBoundingClientRect().top).toBeGreaterThanOrEqual(
      title.getBoundingClientRect().bottom,
    )

    const trash = canvas.getByRole('button', {
      name: 'Remove Two days of talks',
    })
    await expect(trash.getBoundingClientRect().height).toBeGreaterThanOrEqual(
      44,
    )
    await expect(trash.getBoundingClientRect().width).toBeGreaterThanOrEqual(44)
  },
}

export const MobileDark: Story = {
  parameters: {
    viewport: { defaultViewport: 'phone' },
    theme: 'dark',
    backgrounds: { default: 'dark' },
  },
}
