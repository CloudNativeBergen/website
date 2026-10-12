import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { http, HttpResponse } from 'msw'
import { ThemeProvider } from 'next-themes'
import VolunteerAdminPage from './VolunteerAdminPage'
import { NotificationProvider } from '@/components/admin/NotificationProvider'
import {
  Occupation,
  TShirtSize,
  VolunteerStatus,
  type VolunteerWithConference,
} from '@/lib/volunteer/types'

const mockConference = {
  _id: 'conf-123',
  title: 'Cloud Native Days Bergen 2026',
  contactEmail: 'organizers@cloudnativebergen.dev',
  cfpEmail: 'cfp@cloudnativebergen.dev',
  city: 'Bergen',
  country: 'Norway',
  startDate: '2026-10-28T09:00:00Z',
  domains: ['cloudnativebergen.dev'],
  organizer: 'Cloud Native Bergen',
  volunteerRegistrationLink: 'https://tickets.example.test/volunteer-register',
  volunteerSlackInviteUrl: 'https://slack.example.test/volunteer-invite',
  theme: {
    primaryColor: '#1D4ED8',
  },
}

const mockVolunteers: VolunteerWithConference[] = [
  {
    _id: 'vol-1',
    _rev: 'rev-1',
    _createdAt: '2026-06-01T10:00:00Z',
    _updatedAt: '2026-06-01T10:00:00Z',
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    phone: '+47 987 65 432',
    occupation: Occupation.WORKING,
    availability: 'Full day Wednesday and Thursday morning',
    preferredTasks: ['Speaker Check-in', 'Info Desk', 'Badge Handout'],
    tshirtSize: TShirtSize.M,
    dietaryRestrictions: 'Vegetarian, lactose intolerant',
    otherInfo: 'Have previous experience volunteering at tech conferences.',
    status: VolunteerStatus.PENDING,
    submittedAt: '2026-06-01T10:00:00Z',
    conference: mockConference,
  },
  {
    _id: 'vol-2',
    _rev: 'rev-2',
    _createdAt: '2026-05-20T14:30:00Z',
    _updatedAt: '2026-05-22T09:00:00Z',
    name: 'Grace Hopper',
    email: 'grace@example.com',
    phone: '+47 123 45 678',
    occupation: Occupation.WORKING,
    availability: 'Anytime during the event days',
    preferredTasks: ['Stage Assistant', 'Audio/Video Help'],
    tshirtSize: TShirtSize.L,
    status: VolunteerStatus.APPROVED,
    submittedAt: '2026-05-20T14:30:00Z',
    reviewedAt: '2026-05-22T09:00:00Z',
    reviewedBy: {
      _id: 'org-1',
      name: 'Organizer Jane',
    },
    reviewNotes: 'Great profile, ideal for stage assistance.',
    approvalEmailSentAt: '2026-05-22T09:05:00Z',
    approvalEmailSentBy: {
      _id: 'org-1',
      name: 'Organizer Jane',
    },
    conference: mockConference,
  },
  {
    _id: 'vol-3',
    _rev: 'rev-3',
    _createdAt: '2026-06-02T11:15:00Z',
    _updatedAt: '2026-06-03T08:00:00Z',
    name: 'Katherine Johnson',
    email: 'katherine@example.com',
    phone: '+47 555 44 333',
    occupation: Occupation.STUDENT,
    availability: 'Thursday full day',
    preferredTasks: ['Registration Desk'],
    tshirtSize: TShirtSize.S,
    status: VolunteerStatus.APPROVED,
    submittedAt: '2026-06-02T11:15:00Z',
    reviewedAt: '2026-06-03T08:00:00Z',
    reviewedBy: {
      _id: 'org-2',
      name: 'Organizer Bob',
    },
    // Not yet emailed
    conference: mockConference,
  },
  {
    _id: 'vol-4',
    _rev: 'rev-4',
    _createdAt: '2026-05-15T16:00:00Z',
    _updatedAt: '2026-05-16T12:00:00Z',
    name: 'Alan Turing',
    email: 'alan@example.com',
    phone: '+47 999 88 777',
    occupation: Occupation.OTHER,
    availability: 'Only Friday evening after 18:00',
    preferredTasks: ['Clean up'],
    status: VolunteerStatus.REJECTED,
    submittedAt: '2026-05-15T16:00:00Z',
    reviewedAt: '2026-05-16T12:00:00Z',
    reviewedBy: {
      _id: 'org-1',
      name: 'Organizer Jane',
    },
    reviewNotes: 'Availability is outside event schedule.',
    conference: mockConference,
  },
]

const handlers = [
  http.get('/api/trpc/volunteer.admin.list', () =>
    HttpResponse.json({ result: { data: mockVolunteers } }),
  ),
  http.get('/api/trpc/volunteer.admin.getById', ({ request }) => {
    const url = new URL(request.url)
    const input = url.searchParams.get('input')
    let id = 'vol-1'
    if (input) {
      try {
        const parsed = JSON.parse(input)
        id = parsed['0']?.id || parsed.id || 'vol-1'
      } catch {
        // use default
      }
    }
    const volunteer = mockVolunteers.find((v) => v._id === id) || mockVolunteers[0]
    return HttpResponse.json({ result: { data: volunteer } })
  }),
  http.post('/api/trpc/volunteer.admin.updateStatus', () =>
    HttpResponse.json({ result: { data: { success: true } } }),
  ),
  http.post('/api/trpc/volunteer.admin.sendEmail', () =>
    HttpResponse.json({
      result: { data: { success: true, emailId: 'em_test123' } },
    }),
  ),
  http.post('/api/trpc/volunteer.admin.delete', () =>
    HttpResponse.json({ result: { data: { success: true } } }),
  ),
  http.post('/api/trpc/volunteer.admin.update', () =>
    HttpResponse.json({ result: { data: { success: true } } }),
  ),
]

const meta = {
  title: 'Systems/People/Admin/VolunteerAdminPage',
  component: VolunteerAdminPage,
  parameters: {
    layout: 'fullscreen',
    msw: { handlers },
    docs: {
      description: {
        component:
          'Modernized Volunteer Management admin page with responsive master-detail layout, search, task badges, and integrated approval email modal.',
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
              <div className="min-h-screen bg-gray-50 p-6 text-gray-900 transition-colors dark:bg-gray-900 dark:text-gray-100">
                <div className="mx-auto max-w-7xl">
                  <Story />
                </div>
              </div>
            </div>
          </NotificationProvider>
        </ThemeProvider>
      )
    },
  ],
  tags: ['autodocs'],
} satisfies Meta<typeof VolunteerAdminPage>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const Mobile: Story = {
  parameters: {
    viewport: {
      defaultViewport: 'mobile1',
    },
  },
}

export const Dark: Story = {
  parameters: {
    theme: 'dark',
    backgrounds: { default: 'dark' },
  },
}

export const Empty: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get('/api/trpc/volunteer.admin.list', () =>
          HttpResponse.json({ result: { data: [] } }),
        ),
      ],
    },
  },
}
