import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { http, HttpResponse, delay } from 'msw'
import VolunteerForm from './VolunteerForm'

const successHandler = http.post('/api/trpc/volunteer.create', async () => {
  await delay(500)
  return HttpResponse.json({
    result: {
      data: {
        volunteer: { _id: 'vol-1', name: 'Test Volunteer' },
      },
    },
  })
})

const errorHandler = http.post('/api/trpc/volunteer.create', async () => {
  await delay(300)
  return HttpResponse.json(
    {
      error: {
        message: 'A volunteer with this email already exists',
        code: -32603,
        data: { code: 'CONFLICT' },
      },
    },
    { status: 409 },
  )
})

const meta: Meta<typeof VolunteerForm> = {
  title: 'Systems/Proposals/VolunteerForm',
  component: VolunteerForm,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'Form for volunteering at Cloud Native Days conferences. Collects personal information, availability, preferred tasks, and GDPR consent. Uses tRPC mutation for submission with proper validation and error handling.',
      },
    },
    msw: {
      handlers: [successHandler],
    },
  },
  decorators: [
    (Story) => (
      <div className="max-w-2xl p-4">
        <Story />
      </div>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof VolunteerForm>

export const Default: Story = {
  args: {
    conferenceId: 'conf-2025',
  },
}

export const SubmissionError: Story = {
  args: {
    conferenceId: 'conf-2025',
  },
  parameters: {
    msw: {
      handlers: [errorHandler],
    },
  },
}
