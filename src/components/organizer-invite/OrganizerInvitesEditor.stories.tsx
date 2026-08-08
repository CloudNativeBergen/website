import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { http, HttpResponse } from 'msw'
import { ThemeProvider } from 'next-themes'
import { OrganizerInvitesEditor } from './OrganizerInvitesEditor'
import { NotificationProvider } from '@/components/admin/NotificationProvider'
import type { OrganizerInvitationMinimal } from '@/lib/organizer-invite/types'

/**
 * Dates are fixed so the "Expires …" line never thrashes visual diffs.
 */
const invitations: OrganizerInvitationMinimal[] = [
  {
    _id: 'inv-1',
    invitedEmail: 'ada@example.com',
    invitedName: 'Ada Lovelace',
    status: 'pending',
    expiresAt: '2026-09-01T09:00:00.000Z',
    createdAt: '2026-08-18T09:00:00.000Z',
    invitedByName: 'Hanna Sørensen',
  },
  {
    _id: 'inv-2',
    invitedEmail: 'grace@example.com',
    status: 'accepted',
    expiresAt: '2026-08-20T09:00:00.000Z',
    createdAt: '2026-08-06T09:00:00.000Z',
    respondedAt: '2026-08-07T09:00:00.000Z',
    invitedByName: 'Hanna Sørensen',
  },
  {
    _id: 'inv-3',
    invitedEmail: 'alan@example.com',
    status: 'expired',
    expiresAt: '2026-07-20T09:00:00.000Z',
    createdAt: '2026-07-06T09:00:00.000Z',
    invitedByName: 'Mikael Berg',
  },
  {
    _id: 'inv-4',
    invitedEmail: 'edsger@example.com',
    status: 'revoked',
    expiresAt: '2026-08-30T09:00:00.000Z',
    createdAt: '2026-08-16T09:00:00.000Z',
    respondedAt: '2026-08-17T09:00:00.000Z',
    invitedByName: 'Mikael Berg',
  },
]

const handlers = [
  http.get('/api/trpc/organizerInvite.list', () =>
    HttpResponse.json({ result: { data: invitations } }),
  ),
  http.post('/api/trpc/organizerInvite.invite', () =>
    HttpResponse.json({
      result: { data: { _id: 'inv-9', invitedEmail: 'new@example.com' } },
    }),
  ),
  http.post('/api/trpc/organizerInvite.revoke', () =>
    HttpResponse.json({
      result: { data: { _id: 'inv-1', status: 'revoked' } },
    }),
  ),
]

const meta = {
  title: 'Systems/Settings/Admin/OrganizerInvitesEditor',
  component: OrganizerInvitesEditor,
  parameters: {
    layout: 'fullscreen',
    msw: { handlers },
    docs: {
      description: {
        component:
          'platform#49 — invite a co-organizer by EMAIL. The sibling OrganizersEditor can only pick an existing speaker document from a corpus of this conference’s confirmed speakers plus its current organizers, which on a fresh tenant is exactly the founder. Nothing here can remove a sitting organizer, so the `min(1)` floor on `organizers[]` is untouchable from this modal.',
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
} satisfies Meta<typeof OrganizerInvitesEditor>

export default meta
type Story = StoryObj<typeof meta>

/** Every status the list can render, so the badges are all inspectable. */
export const Default: Story = {
  args: { defaultOpen: true, initialInvitations: invitations },
}

/** A fresh tenant: nobody has been invited yet. */
export const Empty: Story = {
  args: { defaultOpen: true, initialInvitations: [] },
}

export const Dark: Story = {
  args: { defaultOpen: true, initialInvitations: invitations },
  parameters: { theme: 'dark', backgrounds: { default: 'dark' } },
}
