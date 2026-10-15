import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { http, HttpResponse } from 'msw'
import { VolunteerConfirmClient } from './VolunteerConfirmClient'

const meta = {
  title: 'Systems/Volunteers/VolunteerConfirmClient',
  component: VolunteerConfirmClient,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof VolunteerConfirmClient>

export default meta
type Story = StoryObj<typeof meta>

export const ReadyToConfirm: Story = {
  args: {
    initialState: 'ready',
    token: 'sample-token',
    volunteerName: 'Ingrid Solberg',
    conferenceTitle: 'Cloud Native Days Norway 2026',
    registrationUrl: 'https://tickets.example.com/volunteer',
    slackInviteUrl: 'https://slack.example.com/invite',
    contactEmail: 'organizers@cloudnativedays.no',
  },
  parameters: {
    msw: {
      handlers: [
        http.post('*/api/trpc/volunteer.confirmAttendance*', () =>
          HttpResponse.json({
            result: {
              data: {
                status: 'confirmed',
                confirmedAt: '2026-09-01T12:00:00Z',
                volunteerName: 'Ingrid Solberg',
                conferenceTitle: 'Cloud Native Days Norway 2026',
                registrationUrl: 'https://tickets.example.com/volunteer',
                slackInviteUrl: 'https://slack.example.com/invite',
              },
            },
          }),
        ),
      ],
    },
  },
}

export const ConfirmedWithLinks: Story = {
  args: {
    initialState: 'confirmed',
    volunteerName: 'Ingrid Solberg',
    conferenceTitle: 'Cloud Native Days Norway 2026',
    confirmedAt: '2026-09-01T12:00:00Z',
    registrationUrl: 'https://tickets.example.com/volunteer',
    slackInviteUrl: 'https://slack.example.com/invite',
    contactEmail: 'organizers@cloudnativedays.no',
  },
}

export const InvalidLink: Story = {
  args: {
    initialState: 'invalid',
    conferenceTitle: 'Cloud Native Days Norway 2026',
    contactEmail: 'organizers@cloudnativedays.no',
  },
}
