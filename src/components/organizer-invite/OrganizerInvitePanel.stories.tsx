import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { http, HttpResponse } from 'msw'
import { ThemeProvider } from 'next-themes'
import { OrganizerInvitePanel } from './OrganizerInvitePanel'

const meta = {
  title: 'Systems/OrganizerInvite/AcceptPanel',
  component: OrganizerInvitePanel,
  parameters: {
    layout: 'fullscreen',
    // The accept button drives the REAL mutation hook — stubbing it with a prop
    // would have meant shipping a story-only branch in the production component.
    msw: {
      handlers: [
        http.post('/api/trpc/organizerInvite.accept', () =>
          HttpResponse.json({
            result: { data: { _id: 'inv-1', status: 'accepted' } },
          }),
        ),
      ],
    },
    docs: {
      description: {
        component:
          'platform#49 — the accept surface at `/organizer-invitation/accept`. The invitation token is NOT ownership proof (invitation mail is forwarded); the only accepted proof is an email magic-link sign-in to the invited address, which is why the `wrong-identity` state exists and masks the address it names.',
      },
    },
  },
  decorators: [
    (Story, ctx) => {
      const dark = ctx.parameters.theme === 'dark'
      // `SessionProvider` and the tRPC provider come from the GLOBAL preview
      // decorators (`.storybook/preview.tsx`); nesting a second one here would
      // shadow them.
      return (
        <ThemeProvider
          attribute="class"
          forcedTheme={dark ? 'dark' : 'light'}
          enableSystem={false}
        >
          <div className={dark ? 'dark' : ''}>
            <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
              <Story />
            </div>
          </div>
        </ThemeProvider>
      )
    },
  ],
  tags: ['autodocs'],
} satisfies Meta<typeof OrganizerInvitePanel>

export default meta
type Story = StoryObj<typeof meta>

/** Ownership already proved — the accept button is live. */
export const Ready: Story = {
  args: {
    state: {
      kind: 'ready',
      token: 'story-token',
      conferenceName: 'Cloud Native Days Bergen 2026',
      inviterName: 'Hanna Sørensen',
      invitedEmail: 'ada@example.com',
      expiresAt: '1 September 2026',
    },
  },
}

/**
 * The state a forwarded link lands in. The invited address is MASKED — this
 * branch is reachable by anyone holding the link, and the full address is not
 * theirs to see.
 */
export const WrongIdentity: Story = {
  args: {
    state: {
      kind: 'wrong-identity',
      maskedEmail: 'a•••@example.com',
      currentEmail: 'someone.else@example.com',
      signInHref: '/signin?callbackUrl=%2Forganizer-invitation%2Faccept',
    },
  },
}

export const Expired: Story = {
  args: { state: { kind: 'expired' } },
}

export const AlreadyAccepted: Story = {
  args: { state: { kind: 'inactive', status: 'accepted' } },
}

export const Revoked: Story = {
  args: { state: { kind: 'inactive', status: 'revoked' } },
}

export const Invalid: Story = {
  args: { state: { kind: 'invalid' } },
}

export const ReadyDark: Story = {
  args: {
    state: {
      kind: 'ready',
      token: 'story-token',
      conferenceName: 'Cloud Native Days Bergen 2026',
      inviterName: 'Hanna Sørensen',
      invitedEmail: 'ada@example.com',
      expiresAt: '1 September 2026',
    },
  },
  parameters: { theme: 'dark', backgrounds: { default: 'dark' } },
}
