import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { fn } from 'storybook/test'
import { EmailModal } from './EmailModal'
import { NotificationProvider } from './NotificationProvider'

const meta = {
  title: 'Systems/Sponsors/Admin/Email/EmailModal',
  component: EmailModal,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Generic email composition modal used as the base for all email sending flows. Features a rich text editor (PortableText), auto-save drafts to localStorage, email preview, template selector slot, and configurable fields. Used by SponsorIndividualEmailModal and SponsorDiscountEmailModal.',
      },
    },
  },
  decorators: [
    (Story: React.ComponentType) => (
      <NotificationProvider>
        <Story />
      </NotificationProvider>
    ),
  ],
  args: {
    isOpen: true,
    onClose: fn(),
    onSend: fn(),
    title: 'Compose Email',
    recipientInfo: 'maria@example.com',
    fromAddress: 'conference@cloudnativebergen.no',
    submitButtonText: 'Send Email',
  },
} satisfies Meta<typeof EmailModal>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  parameters: {
    docs: {
      description: {
        story:
          'Basic email modal with To, From, Subject fields and a rich text editor.',
      },
    },
  },
}

export const WithContext: Story = {
  args: {
    title: 'Send Sponsor Email',
    recipientInfo: (
      <div className="flex flex-wrap gap-2">
        <span className="rounded-full bg-blue-50 px-3 py-1 text-sm text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
          Maria Jensen &lt;maria@techgiant.com&gt;
        </span>
        <span className="rounded-full bg-blue-50 px-3 py-1 text-sm text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
          Erik Olsen &lt;erik@techgiant.com&gt;
        </span>
      </div>
    ),
    contextInfo: 'Sponsor: TechGiant Corp • Gold tier',
    helpText:
      'Templates: {{{SPONSOR_NAME}}}, {{{CONTACT_NAME}}}, {{{EVENT_NAME}}}',
  },
  parameters: {
    docs: {
      description: {
        story:
          'With multiple recipients displayed as badges, context info, and help text showing available template variables.',
      },
    },
  },
}

export const WithTicketUrl: Story = {
  args: {
    title: 'Send Discount Code Email',
    contextInfo: 'Discount code: SPONSOR2025 • Gold tier',
    ticketUrl: 'https://cloudnativebergen.no/tickets',
    onTicketUrlChange: fn(),
    initialValues: {
      subject: 'Your Cloud Native Days Sponsor Discount Code',
    },
  },
  parameters: {
    docs: {
      description: {
        story:
          'When ticketUrl and onTicketUrlChange are provided, an additional Tickets field appears for the ticket registration URL.',
      },
    },
  },
}

export const WithInitialValues: Story = {
  args: {
    title: 'Follow Up Email',
    initialValues: {
      subject: 'Following up: Sponsorship for Cloud Native Days Bergen 2025',
      message:
        'Dear TechGiant team,\n\nThank you for your interest in sponsoring our event.\n\nBest regards,\nThe Conference Team',
    },
  },
  parameters: {
    docs: {
      description: {
        story: 'Pre-populated subject and message body from initialValues.',
      },
    },
  },
}
