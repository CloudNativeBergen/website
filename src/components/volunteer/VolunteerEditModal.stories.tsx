import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { http, HttpResponse } from 'msw'
import { ThemeProvider } from 'next-themes'
import { fn } from 'storybook/test'
import { VolunteerEditModal } from './VolunteerEditModal'
import { NotificationProvider } from '@/components/admin/NotificationProvider'
import {
  Occupation,
  TShirtSize,
  VolunteerStatus,
  type VolunteerWithConference,
} from '@/lib/volunteer/types'

const volunteer: VolunteerWithConference = {
  _id: 'vol-1',
  _rev: 'r1',
  _createdAt: '2026-06-01T10:00:00Z',
  _updatedAt: '2026-06-01T10:00:00Z',
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  phone: '+47 111 11 111',
  occupation: Occupation.WORKING,
  availability: 'Weekends and Friday afternoon',
  preferredTasks: ['registration', 'catering'],
  tshirtSize: TShirtSize.M,
  dietaryRestrictions: 'Vegetarian',
  otherInfo: 'Happy to help with anything.',
  status: VolunteerStatus.PENDING,
  conference: { _id: 'conf-1', title: 'Cloud Native Day' },
}

const handlers = [
  http.post('/api/trpc/volunteer.admin.update', () =>
    HttpResponse.json({ result: { data: { success: true } } }),
  ),
]

const meta = {
  title: 'Systems/People/Admin/VolunteerEditModal',
  component: VolunteerEditModal,
  parameters: {
    layout: 'fullscreen',
    msw: { handlers },
    docs: {
      description: {
        component:
          'SE-4 — organizer edit of a volunteer’s own detail fields. Status and review provenance are managed elsewhere and are intentionally absent.',
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
              <div className="min-h-screen bg-gray-100 dark:bg-gray-950" />
              <Story />
            </div>
          </NotificationProvider>
        </ThemeProvider>
      )
    },
  ],
  args: {
    isOpen: true,
    volunteer,
    onClose: fn(),
  },
  tags: ['autodocs'],
} satisfies Meta<typeof VolunteerEditModal>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const Dark: Story = {
  parameters: { theme: 'dark', backgrounds: { default: 'dark' } },
}
