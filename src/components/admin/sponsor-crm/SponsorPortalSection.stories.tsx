import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { http, HttpResponse } from 'msw'
import { SponsorPortalSection } from './SponsorPortalSection'

const meta = {
  title: 'Systems/Sponsors/Admin/Pipeline/SponsorPortalSection',
  component: SponsorPortalSection,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Self-service registration section for sponsors. Allows organizers to send a registration email or generate a portal link that sponsors use to submit their company details, contacts, billing information, and logo. Shows different states: initial (send email / copy link), link generated (with copy and send buttons), email sent confirmation, and registration complete.',
      },
    },
  },
  decorators: [
    (Story) => (
      <div className="max-w-lg">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SponsorPortalSection>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    sponsorForConferenceId: 'sfc-123',
  },
  parameters: {
    msw: {
      handlers: [
        http.post('/api/trpc/onboarding.sendPortalInvite', () => {
          return HttpResponse.json({
            result: {
              data: { url: 'https://example.com/sponsor/portal/abc-123' },
            },
          })
        }),
        http.post('/api/trpc/onboarding.generateToken', () => {
          return HttpResponse.json({
            result: {
              data: { url: 'https://example.com/sponsor/portal/abc-123' },
            },
          })
        }),
      ],
    },
  },
}

export const WithExistingToken: Story = {
  args: {
    sponsorForConferenceId: 'sfc-123',
    existingToken: 'existing-token-xyz',
  },
  parameters: {
    msw: {
      handlers: [
        http.post('/api/trpc/onboarding.sendPortalInvite', () => {
          return HttpResponse.json({
            result: {
              data: {
                url: 'https://example.com/sponsor/portal/existing-token-xyz',
              },
            },
          })
        }),
      ],
    },
  },
}

export const PortalComplete: Story = {
  args: {
    sponsorForConferenceId: 'sfc-123',
    portalComplete: true,
  },
}
