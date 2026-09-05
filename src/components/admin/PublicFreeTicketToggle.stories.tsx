import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { http, HttpResponse } from 'msw'
import { ThemeProvider } from 'next-themes'
import { PublicFreeTicketToggle } from './PublicFreeTicketToggle'
import { NotificationProvider } from './NotificationProvider'

/**
 * The #860 per-type opt-in on /admin/tickets/types: publishes a free ticket
 * type on the public /tickets page next to the paid grid. The SERVER decides
 * which rows get this control (only public free types — the same
 * `isPublicFreeTicketType` predicate the display policy filters on); these
 * stories cover the island itself in both states, on the card background the
 * types page gives it.
 */

const handlers = [
  http.post('/api/trpc/conference.updatePublicFreeTickets', () =>
    HttpResponse.json({ result: { data: { success: true } } }),
  ),
]

const meta = {
  title: 'Systems/Tickets/Admin/PublicFreeTicketToggle',
  component: PublicFreeTicketToggle,
  parameters: {
    msw: { handlers },
    docs: {
      description: {
        component:
          'Per-type organizer opt-in that shows a free ticket type on the public tickets page. Optimistic flip, rolled back on mutation error.',
      },
    },
  },
  args: {
    ticketId: 7,
    ticketName: 'Student',
    initialVisible: false,
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
          <NotificationProvider>
            <div className={dark ? 'dark' : ''}>
              <div className="min-h-screen bg-gray-50 p-6 dark:bg-gray-950">
                {/* The bottom row of a types-page card, where the toggle lives. */}
                <div className="rounded-lg bg-white p-6 shadow-sm ring-1 ring-gray-200 dark:bg-gray-900 dark:ring-gray-700">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-3 dark:border-gray-800">
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      Type: <span className="font-mono">regular</span>
                    </span>
                    <Story />
                  </div>
                </div>
              </div>
            </div>
          </NotificationProvider>
        </ThemeProvider>
      )
    },
  ],
  tags: ['autodocs'],
} satisfies Meta<typeof PublicFreeTicketToggle>

export default meta
type Story = StoryObj<typeof meta>

/** Not yet published — the default for every free type. */
export const Hidden: Story = {}

/** Opted in: the type is live on the public /tickets page. */
export const Shown: Story = {
  args: { initialVisible: true },
}

export const ShownDark: Story = {
  args: { initialVisible: true },
  parameters: {
    theme: 'dark',
    backgrounds: { default: 'dark' },
    msw: { handlers },
  },
}
