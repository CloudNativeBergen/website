import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { fn } from 'storybook/test'
import { ConfirmationModal } from './ConfirmationModal'

const meta = {
  title: 'Components/Feedback/ConfirmationModal',
  component: ConfirmationModal,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'A reusable confirmation dialog with support for danger, warning, and info variants. Used throughout the admin interface for destructive actions.',
      },
    },
  },
  tags: ['autodocs'],
  args: {
    onClose: fn(),
    onConfirm: fn(),
  },
} satisfies Meta<typeof ConfirmationModal>

export default meta
type Story = StoryObj<typeof meta>

export const Danger: Story = {
  args: {
    isOpen: true,
    title: 'Delete proposal?',
    message:
      'This action cannot be undone. The proposal and all associated reviews will be permanently deleted.',
    confirmButtonText: 'Delete',
    variant: 'danger',
  },
}

export const DashboardReset: Story = {
  args: {
    isOpen: true,
    title: 'Reset dashboard layout?',
    message:
      'This replaces your current widgets and layout with the default planning preset. This cannot be undone.',
    confirmButtonText: 'Reset layout',
    variant: 'danger',
  },
  parameters: {
    docs: {
      description: {
        story:
          'Confirmation shown by the admin dashboard before the Reset control replaces the whole layout with the planning preset (a destructive, persisted action).',
      },
    },
  },
}

export const Warning: Story = {
  args: {
    isOpen: true,
    title: 'Reject proposal?',
    message:
      'This will send a rejection notification to the speaker. You can change the decision later if needed.',
    confirmButtonText: 'Reject',
    variant: 'warning',
  },
}

export const Info: Story = {
  args: {
    isOpen: true,
    title: 'Accept proposal?',
    message:
      'This will send an acceptance notification to the speaker and add the talk to the schedule.',
    confirmButtonText: 'Accept',
    variant: 'info',
  },
}

export const Loading: Story = {
  args: {
    isOpen: true,
    title: 'Processing...',
    message: 'Please wait while we process your request.',
    confirmButtonText: 'Confirm',
    variant: 'info',
    isLoading: true,
  },
}

export const CustomButtons: Story = {
  args: {
    isOpen: true,
    title: 'Withdraw talk?',
    message: 'Are you sure you want to withdraw this talk from the conference?',
    confirmButtonText: 'Yes, withdraw',
    cancelButtonText: 'No, keep it',
    variant: 'warning',
  },
}

export const WithdrawReasonRequired: Story = {
  args: {
    isOpen: true,
    title: 'Withdraw proposal?',
    message:
      'This will withdraw your proposal from the conference. This action cannot be undone.',
    confirmButtonText: 'Withdraw',
    variant: 'danger',
    // A mandatory reason keeps the confirm button disabled until it is filled in.
    confirmDisabled: true,
    children: (
      <div>
        <label
          htmlFor="withdraw-reason"
          className="font-inter block text-sm font-medium text-brand-slate-gray dark:text-gray-300"
        >
          Reason for withdrawal
          <span className="text-red-600 dark:text-red-400"> *</span>
        </label>
        <textarea
          id="withdraw-reason"
          rows={3}
          placeholder="Let the organizers know why you are withdrawing…"
          className="font-inter mt-1 block w-full rounded-lg border border-brand-frosted-steel bg-white px-3 py-2 text-sm text-brand-slate-gray shadow-xs dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
        />
      </div>
    ),
  },
  parameters: {
    docs: {
      description: {
        story:
          'Withdrawal flow (#212): a mandatory reason is collected via the modal children, and the confirm button stays disabled until a reason is provided.',
      },
    },
  },
}

/**
 * The bulk speaker-ticket sweep on `/admin/speakers`. The numbers come from a
 * dry run of the sweep itself, so what the organizer confirms here is what the
 * send does — the conference, who gets an email, and who is skipped.
 */
export const TicketInvitations: Story = {
  args: {
    isOpen: true,
    title: 'Send ticket invitations',
    message:
      '12 speakers at Cloud Native Day 2026 will be emailed a ticket invitation now. 23 already invited and will be skipped.',
    confirmButtonText: 'Send invitations',
    variant: 'warning',
  },
}

/**
 * The same sweep on a conference with no `speakerRegistrationLink`. Nothing is
 * sent: without the link our email has no call to action and can only point at
 * the provider's own invitation — which in production was accepted and never
 * delivered, leaving 35 speakers with a message and nothing to act on. Send is
 * refused, and the panel names the setting that fixes it.
 */
export const TicketInvitationsWithoutLink: Story = {
  args: {
    ...TicketInvitations.args,
    message: 'No ticket invitations will be sent.',
    confirmDisabled: true,
    children: (
      <p className="font-inter rounded-lg bg-yellow-50 p-3 text-sm text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300">
        This conference has no speaker invite link. Without it the email carries
        no claim link and can only point at the ticket provider&apos;s own
        invitation, which speakers have not received. Add the link under{' '}
        <a
          href="/admin/settings"
          className="font-semibold underline underline-offset-2"
        >
          Settings
        </a>{' '}
        and open this again.
      </p>
    ),
  },
}

/**
 * Issuance cannot run at all — no ticketing binding, no credentials, or the
 * provider could not be read. Deliberately NOT phrased as "nobody is waiting":
 * during an outage that would read as nobody left to chase.
 */
export const TicketInvitationsBlocked: Story = {
  args: {
    isOpen: true,
    title: 'Send ticket invitations',
    message:
      'Ticket invitations cannot be issued for this conference right now. Check the ticketing configuration, and that an invitation-only speaker ticket type exists.',
    confirmButtonText: 'Send invitations',
    variant: 'warning',
    confirmDisabled: true,
  },
}

/** Nothing to send: the confirm button is refused rather than run for show. */
export const TicketInvitationsNothingToSend: Story = {
  args: {
    isOpen: true,
    title: 'Send ticket invitations',
    message:
      'No speakers at Cloud Native Day 2026 are waiting for a ticket invitation. 35 already have one.',
    confirmButtonText: 'Send invitations',
    variant: 'warning',
    confirmDisabled: true,
  },
}
