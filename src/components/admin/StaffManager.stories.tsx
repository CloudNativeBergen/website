import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { http, HttpResponse } from 'msw'
import { ThemeProvider } from 'next-themes'
import { StaffManager } from './StaffManager'
import { NotificationProvider } from './NotificationProvider'

const staff = [
  {
    _id: 'staff-1',
    name: 'Ada Lovelace',
    role: 'organizer',
    email: 'ada@example.com',
    company: 'Analytical Engines',
    link: 'https://example.com/ada',
    imageURL: 'https://i.pravatar.cc/80?u=ada',
    imageAssetId: 'image-ada-200x200-png',
  },
  {
    _id: 'staff-2',
    name: 'Grace Hopper',
    role: 'organizer',
    email: 'grace@example.com',
    company: 'US Navy',
    link: 'https://example.com/grace',
  },
  {
    _id: 'staff-3',
    name: 'Katherine Johnson',
    role: 'volunteer coordinator',
    link: 'https://example.com/katherine',
  },
]

const handlers = [
  http.get('/api/trpc/staff.list', () =>
    HttpResponse.json({ result: { data: staff } }),
  ),
  http.post('/api/trpc/staff.create', () =>
    HttpResponse.json({ result: { data: { _id: 'staff-new' } } }),
  ),
  http.post('/api/trpc/staff.update', () =>
    HttpResponse.json({ result: { data: { success: true } } }),
  ),
  http.post('/api/trpc/staff.delete', () =>
    HttpResponse.json({ result: { data: { success: true } } }),
  ),
]

const meta = {
  title: 'Systems/People/Admin/StaffManager',
  component: StaffManager,
  parameters: {
    layout: 'fullscreen',
    msw: { handlers },
    docs: {
      description: {
        component:
          'SE-4 — the Staff admin surface. A table of every staff document with create/edit/delete, all editing through a shared ModalShell form (image uploads via /api/admin/speaker-image).',
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
} satisfies Meta<typeof StaffManager>

export default meta
type Story = StoryObj<typeof meta>

export const Table: Story = {}

export const TableDark: Story = {
  parameters: { theme: 'dark', backgrounds: { default: 'dark' } },
}

export const Form: Story = {
  args: { defaultOpen: true },
}

export const FormDark: Story = {
  args: { defaultOpen: true },
  parameters: { theme: 'dark', backgrounds: { default: 'dark' } },
}
