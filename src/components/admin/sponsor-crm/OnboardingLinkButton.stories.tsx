import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { OnboardingLinkButton } from './OnboardingLinkButton'
import { http, HttpResponse } from 'msw'

const meta: Meta<typeof OnboardingLinkButton> = {
  title: 'Admin/Sponsors/Pipeline/OnboardingLinkButton',
  component: OnboardingLinkButton,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'Generates and displays unique onboarding portal links for sponsors. Uses tRPC mutation to create secure tokens that allow sponsors to access their self-service onboarding portal. Shows different states: not onboarded, existing token, or onboarding complete with timestamp.',
      },
    },
  },
  decorators: [
    (Story) => (
      <div className="p-8">
        <Story />
      </div>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof OnboardingLinkButton>

export const Interactive: Story = {
  args: {
    sponsorForConferenceId: 'sfc-123',
    onboardingComplete: false,
  },
  parameters: {
    msw: {
      handlers: [
        http.get(
          'http://localhost:6006/api/trpc/onboarding.generateToken',
          () => {
            return HttpResponse.json({
              result: {
                data: {
                  url: 'http://localhost:3000/sponsor/onboarding/tok_abc123xyz',
                  token: 'tok_abc123xyz',
                },
              },
            })
          },
        ),
      ],
    },
  },
}

export const NotOnboarded: Story = {
  args: {
    sponsorForConferenceId: 'sfc-123',
    onboardingComplete: false,
  },
  parameters: {
    msw: {
      handlers: [
        http.get(
          'http://localhost:6006/api/trpc/onboarding.generateToken',
          () => {
            return HttpResponse.json({
              result: {
                data: {
                  url: 'http://localhost:3000/sponsor/onboarding/tok_abc123xyz',
                  token: 'tok_abc123xyz',
                },
              },
            })
          },
        ),
      ],
    },
  },
}

export const WithExistingToken: Story = {
  args: {
    sponsorForConferenceId: 'sfc-123',
    existingToken: 'tok_existing123',
    onboardingComplete: false,
  },
  parameters: {
    msw: {
      handlers: [
        http.get(
          'http://localhost:6006/api/trpc/onboarding.generateToken',
          () => {
            return HttpResponse.json({
              result: {
                data: {
                  url: 'http://localhost:3000/sponsor/onboarding/tok_abc123xyz',
                  token: 'tok_abc123xyz',
                },
              },
            })
          },
        ),
      ],
    },
  },
}

export const OnboardingComplete: Story = {
  args: {
    sponsorForConferenceId: 'sfc-123',
    onboardingComplete: true,
  },
  parameters: {
    msw: {
      handlers: [
        http.get(
          'http://localhost:6006/api/trpc/onboarding.generateToken',
          () => {
            return HttpResponse.json({
              result: {
                data: {
                  url: 'http://localhost:3000/sponsor/onboarding/tok_abc123xyz',
                  token: 'tok_abc123xyz',
                },
              },
            })
          },
        ),
      ],
    },
  },
}
