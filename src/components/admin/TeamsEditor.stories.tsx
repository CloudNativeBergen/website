import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { http, HttpResponse } from 'msw'
import { ThemeProvider } from 'next-themes'
import { TeamsEditor } from './TeamsEditor'
import { NotificationProvider } from './NotificationProvider'

const handlers = [
  http.post('/api/trpc/conference.updateTeams', () =>
    HttpResponse.json({ result: { data: { success: true, updated: {} } } }),
  ),
]

const organizers = [
  { _id: 'sp-1', name: 'Hanna Sørensen' },
  { _id: 'sp-2', name: 'Mikael Berg' },
  { _id: 'sp-3', name: 'Priya Sharma' },
]

const teams = [
  {
    _key: 'team-cfp',
    key: 'cfp',
    title: 'CFP Team',
    members: ['sp-1', 'sp-2'],
    slackChannel: '#cnb-cfp',
    emailIdentity: ['cfpEmail' as const],
  },
  {
    _key: 'team-sponsors',
    key: 'sponsors',
    title: 'Sponsors Team',
    members: ['sp-3'],
    slackChannel: '#cnb-sales',
  },
]

const meta = {
  title: 'Systems/Settings/Admin/TeamsEditor',
  component: TeamsEditor,
  parameters: {
    layout: 'fullscreen',
    msw: { handlers },
    docs: {
      description: {
        component:
          'SE-2 — the organizer Teams editor. Teams are a soft lens for routing (never an access boundary). Each team has a kebab `key` (auto-slugged from the title, editable, unique), ≥1 members drawn only from the current organizers, an optional Slack channel and email identity. The server enforces the member ⊆ organizers subset.',
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
} satisfies Meta<typeof TeamsEditor>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: { teams, organizers, defaultOpen: true },
}

export const Dark: Story = {
  args: { teams, organizers, defaultOpen: true },
  parameters: { theme: 'dark', backgrounds: { default: 'dark' } },
}
