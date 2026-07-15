import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, screen, userEvent, waitFor, within } from 'storybook/test'
import { UserMenu } from './UserMenu'
import type { Speaker } from '@/lib/speaker/types'
import type { Account } from 'next-auth'

const baseSpeaker: Speaker = {
  _id: 'spk-1',
  _rev: 'rev-1',
  _createdAt: '2026-01-01T00:00:00Z',
  _updatedAt: '2026-01-01T00:00:00Z',
  name: 'Jane Doe',
  email: 'jane@example.com',
  slug: 'jane-doe',
  isOrganizer: false,
}

const githubAccount: Account = {
  provider: 'github',
  providerAccountId: '12345',
  type: 'oauth',
}

const linkedinAccount: Account = {
  provider: 'linkedin',
  providerAccountId: '67890',
  type: 'oauth',
}

const meta = {
  title: 'Components/Layout/UserMenu',
  component: UserMenu,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Role-aware dropdown anchored on the signed-in speaker avatar in the header. Every speaker sees their CfP links; organizers additionally get a gated Admin section (shown only when `speaker.isOrganizer`). The footer shows the current sign-in provider, an optional "Install app" action (wired to the shared PWA install capability), and Sign Out. Stories open the menu via a play function so its contents are visible.',
      },
    },
  },
  // The menu is anchored to the right edge of its trigger; give the canvas room
  // so the portaled panel is not clipped in the docs frame.
  decorators: [
    (Story) => (
      <div className="flex min-h-72 justify-end p-8">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof UserMenu>

export default meta
type Story = StoryObj<typeof meta>

async function openMenu(canvasElement: HTMLElement) {
  const canvas = within(canvasElement)
  await userEvent.click(canvas.getByRole('button'))
  // The panel mounts and animates in via a portal; wait for it to settle so
  // assertions don't race the open transition.
  await waitFor(() => expect(screen.getByText('My Dashboard')).toBeVisible())
}

export const SignedInSpeaker: Story = {
  args: {
    name: 'Jane Doe',
    picture: 'https://placehold.co/40x40/4f46e5/fff/png?text=JD',
    speaker: baseSpeaker,
    account: githubAccount,
  },
  parameters: {
    docs: {
      description: {
        story:
          'A signed-in non-organizer speaker: CfP links plus "View public profile", the GitHub sign-in indicator, and Sign Out. No Admin section.',
      },
    },
  },
  play: async ({ canvasElement }) => {
    await openMenu(canvasElement)
    await expect(screen.getByText('My Dashboard')).toBeVisible()
    await expect(screen.getByText('View public profile')).toBeVisible()
    await expect(screen.getByText('Signed in with GitHub')).toBeVisible()
    await expect(screen.getByText('Sign Out')).toBeVisible()
    // Admin section is hidden for non-organizers.
    await expect(screen.queryByText('Admin')).not.toBeInTheDocument()
  },
}

export const Organizer: Story = {
  args: {
    name: 'Ada Organizer',
    picture: 'https://placehold.co/40x40/16a34a/fff/png?text=AO',
    speaker: { ...baseSpeaker, name: 'Ada Organizer', isOrganizer: true },
    account: linkedinAccount,
  },
  parameters: {
    docs: {
      description: {
        story:
          'An organizer: the same speaker links plus a dedicated, gated Admin section (Dashboard, Proposals, Speakers, Sponsors, Schedule, Tickets). The LinkedIn sign-in indicator is shown.',
      },
    },
  },
  play: async ({ canvasElement }) => {
    await openMenu(canvasElement)
    await expect(screen.getByText('Admin')).toBeVisible()
    await expect(screen.getByText('Admin Dashboard')).toBeVisible()
    await expect(screen.getByText('Speakers')).toBeVisible()
    await expect(screen.getByText('Signed in with LinkedIn')).toBeVisible()
  },
}
