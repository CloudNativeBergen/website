import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { http, HttpResponse, delay } from 'msw'
import CLILoginClient from './cli-login-client'

const meta = {
  title: 'Systems/Auth/CLILoginClient',
  component: CLILoginClient,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Client component for the CLI authentication flow. Fetches a CLI token and either redirects to a local CLI callback server or displays the token for manual copy-paste.',
      },
    },
  },
  tags: ['autodocs'],
  args: {
    userName: 'Jane Doe',
    userEmail: 'jane@example.com',
    conferenceId: 'conf-123',
  },
} satisfies Meta<typeof CLILoginClient>

export default meta
type Story = StoryObj<typeof meta>

const mockToken =
  'eyJhbGciOiJkaXIiLCJlbmMiOiJBMjU2R0NNIn0..dGVzdC1ub25jZQ.dGVzdC1jaXBoZXJ0ZXh0.dGVzdC10YWc'

/**
 * Token displayed for manual copy when no port/state params are provided (fallback flow).
 */
export const DisplayToken: Story = {
  parameters: {
    msw: {
      handlers: [
        http.post('/api/auth/cli/token', () => {
          return HttpResponse.json({
            token: mockToken,
            expiresAt: '2026-05-04T00:00:00.000Z',
          })
        }),
      ],
    },
  },
}

/**
 * Loading state while the token is being generated.
 */
export const Loading: Story = {
  parameters: {
    msw: {
      handlers: [
        http.post('/api/auth/cli/token', async () => {
          await delay('infinite')
          return HttpResponse.json({})
        }),
      ],
    },
  },
}

/**
 * Redirect state shown briefly before navigating to the CLI callback server.
 * In Storybook the redirect won&apos;t actually navigate.
 */
export const Redirecting: Story = {
  args: {
    port: '9876',
    state: 'abc123',
  },
  parameters: {
    msw: {
      handlers: [
        http.post('/api/auth/cli/token', () => {
          return HttpResponse.json({
            token: mockToken,
            expiresAt: '2026-05-04T00:00:00.000Z',
          })
        }),
      ],
    },
  },
}

/**
 * Error when the user is not authenticated (401 from token endpoint).
 */
export const Unauthorized: Story = {
  parameters: {
    msw: {
      handlers: [
        http.post('/api/auth/cli/token', () => {
          return HttpResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }),
      ],
    },
  },
}

/**
 * Error when an invalid port number is provided.
 */
export const InvalidPort: Story = {
  args: {
    port: '80',
    state: 'abc123',
  },
}

/**
 * Error when port is provided without a state parameter.
 */
export const MissingState: Story = {
  args: {
    port: '8080',
  },
}
