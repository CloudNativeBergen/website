import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { http, HttpResponse } from 'msw'
import { ThemeProvider } from 'next-themes'
import { OrganizersEditor } from './OrganizersEditor'
import { NotificationProvider } from './NotificationProvider'

const searchResults = [
  {
    _id: 'sp-4',
    name: 'Nadia Okonkwo',
    title: 'Staff Engineer',
    isOrganizer: false,
    proposals: [],
  },
  {
    _id: 'sp-5',
    name: 'Lars Vik',
    title: 'Platform Lead',
    isOrganizer: true,
    proposals: [],
  },
]

const handlers = [
  http.get('/api/trpc/speaker.admin.search', () =>
    HttpResponse.json({ result: { data: searchResults } }),
  ),
  http.post('/api/trpc/conference.updateOrganizers', () =>
    HttpResponse.json({ result: { data: { success: true, updated: {} } } }),
  ),
]

const organizers = [
  { _id: 'sp-1', name: 'Hanna Sørensen', title: 'Conference Chair' },
  { _id: 'sp-2', name: 'Mikael Berg', title: 'Program Committee' },
  { _id: 'sp-3', name: 'Priya Sharma', title: 'Sponsors Lead' },
]

const meta = {
  title: 'Systems/Settings/Admin/OrganizersEditor',
  component: OrganizersEditor,
  parameters: {
    layout: 'fullscreen',
    msw: { handlers },
    docs: {
      description: {
        component:
          'SE-2 — the Organizers editor. `organizers[]` is the canonical organizer set (admin access + notification fan-out). The acting organizer’s own row is LOCKED (lock icon, no remove) so they cannot revoke their own access; the server enforces the same guard.',
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
} satisfies Meta<typeof OrganizersEditor>

export default meta
type Story = StoryObj<typeof meta>

/** Modal open; the caller (sp-1) is the first, locked row. */
export const Default: Story = {
  args: { organizers, currentUserId: 'sp-1', defaultOpen: true },
}

export const Dark: Story = {
  args: { organizers, currentUserId: 'sp-1', defaultOpen: true },
  parameters: { theme: 'dark', backgrounds: { default: 'dark' } },
}
