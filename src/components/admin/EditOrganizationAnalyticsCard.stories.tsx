import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { userEvent, screen, expect } from 'storybook/test'
import { http, HttpResponse } from 'msw'
import { ThemeProvider } from 'next-themes'
import { EditOrganizationAnalyticsCard } from './EditOrganizationAnalyticsCard'
import { NotificationProvider } from './NotificationProvider'

const handlers = [
  http.post('/api/trpc/organization.updateAnalytics', () =>
    HttpResponse.json({ result: { data: { success: true } } }),
  ),
]

const TOKEN = 'phc_AtRfmihK9AhZtiupD4mFCukbYiUEwQystESTSQvbq5gh'

const meta = {
  title: 'Systems/Settings/Admin/EditOrganizationAnalyticsCard',
  component: EditOrganizationAnalyticsCard,
  parameters: {
    layout: 'fullscreen',
    msw: { handlers },
    docs: {
      description: {
        component:
          'The organization half of the Analytics settings card (#1008): a 44px pencil opening a ModalShell form for the public PostHog project token. Save patches the ORGANIZATION document (one token for every edition) and refreshes the server-rendered card. Stories open the modal on mount (`defaultOpen`).',
      },
    },
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
              <div className="min-h-screen bg-white p-6 dark:bg-gray-950">
                <Story />
              </div>
            </div>
          </NotificationProvider>
        </ThemeProvider>
      )
    },
  ],
  tags: ['autodocs'],
} satisfies Meta<typeof EditOrganizationAnalyticsCard>

export default meta
type Story = StoryObj<typeof meta>

/** Organization not yet switched: empty field, modal open. */
export const Interactive: Story = {
  args: { initialToken: null, defaultOpen: true },
  parameters: {
    docs: {
      description: {
        story:
          'Interactive playground — type a token and Save. A value that is not a `phc_` token is refused inline before any request.',
      },
    },
  },
}

/** Already on PostHog: the stored token is the baseline, so Save stays disabled until it changes. */
export const WithToken: Story = {
  args: { initialToken: TOKEN, defaultOpen: true },
}

/** Client-side validation: a personal `phx_` key never reaches the server. */
export const RejectsNonPublicToken: Story = {
  args: { initialToken: null, defaultOpen: true },
  play: async () => {
    const input = await screen.findByLabelText('PostHog project token')
    await userEvent.type(input, 'phx_personal_key_not_allowed_here')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    // The inline error, not the help text (which also names the token).
    await expect(
      await screen.findByText(/^Enter the public project token/),
    ).toBeInTheDocument()
  },
}

export const Dark: Story = {
  args: { initialToken: TOKEN, defaultOpen: true },
  parameters: { theme: 'dark' },
}
