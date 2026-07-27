import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { http, HttpResponse } from 'msw'
import { ThemeProvider } from 'next-themes'
import { WorkshopRegistrationSettings } from './WorkshopRegistrationSettings'
import { NotificationProvider } from './NotificationProvider'

const handlers = [
  http.post('/api/trpc/workshop.admin.updateRegistrationTimes', () =>
    HttpResponse.json({ result: { data: { success: true } } }),
  ),
]

const meta = {
  title: 'Systems/Workshops/Admin/WorkshopRegistrationSettings',
  component: WorkshopRegistrationSettings,
  parameters: {
    layout: 'fullscreen',
    msw: { handlers },
    docs: {
      description: {
        component:
          'The workshop registration window card on /admin/workshops: a read-only card showing the open/close instants and the derived status, with a pencil opening a ModalShell form that patches the window via the workshop.admin router.',
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
              <div className="min-h-screen bg-gray-50 p-6 dark:bg-gray-950">
                <Story />
              </div>
            </div>
          </NotificationProvider>
        </ThemeProvider>
      )
    },
  ],
} satisfies Meta<typeof WorkshopRegistrationSettings>

export default meta
type Story = StoryObj<typeof meta>

export const Configured: Story = {
  args: {
    workshopRegistrationStart: '2099-04-01T07:00:00.000Z',
    workshopRegistrationEnd: '2099-05-01T07:00:00.000Z',
  },
}

export const NotConfigured: Story = {
  args: {},
}

export const Dark: Story = {
  args: Configured.args,
  parameters: { theme: 'dark' },
}
