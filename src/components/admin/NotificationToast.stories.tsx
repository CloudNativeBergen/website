import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { fn } from 'storybook/test'
import { NotificationToast, type NotificationData } from './NotificationToast'

const meta = {
  title: 'Components/Feedback/NotificationToast',
  component: NotificationToast,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Brand-styled toast notification with icon, title, optional message, dismiss button, and duplicate count badge. Supports success, error, warning, and info types with gradient backgrounds. Extracted from NotificationProvider for independent use and testing.',
      },
    },
  },
  args: {
    onDismiss: fn(),
  },
} satisfies Meta<typeof NotificationToast>

export default meta
type Story = StoryObj<typeof meta>

export const Success: Story = {
  args: {
    notification: {
      id: '1',
      type: 'success',
      title: 'Changes saved',
      message: 'Your proposal has been updated successfully.',
    },
  },
}

export const Error: Story = {
  args: {
    notification: {
      id: '2',
      type: 'error',
      title: 'Failed to save',
      message:
        'There was an error saving your changes. Please try again later.',
    },
  },
}

export const Warning: Story = {
  args: {
    notification: {
      id: '3',
      type: 'warning',
      title: 'Unsaved changes',
      message:
        'You have unsaved changes that will be lost if you leave this page.',
    },
  },
}

export const Info: Story = {
  args: {
    notification: {
      id: '4',
      type: 'info',
      title: 'New submission',
      message: 'A new speaker proposal has been submitted for review.',
    },
  },
}

export const TitleOnly: Story = {
  args: {
    notification: {
      id: '5',
      type: 'success',
      title: 'Proposal accepted',
    },
  },
  parameters: {
    docs: {
      description: {
        story: 'Toast with only a title, no message body.',
      },
    },
  },
}

export const WithCountBadge: Story = {
  args: {
    notification: {
      id: '6',
      type: 'info',
      title: 'New notification',
      message: 'You have received multiple identical notifications.',
      count: 3,
    },
  },
  parameters: {
    docs: {
      description: {
        story:
          'When duplicate notifications are triggered, a count badge appears on the icon instead of stacking duplicates.',
      },
    },
  },
}

export const AllTypes: Story = {
  args: {
    notification: {
      id: 'placeholder',
      type: 'info',
      title: 'Placeholder',
    },
  },
  render: (args) => (
    <div className="space-y-4">
      {(
        [
          {
            id: 's',
            type: 'success',
            title: 'Success',
            message: 'Operation completed.',
          },
          {
            id: 'e',
            type: 'error',
            title: 'Error',
            message: 'Something went wrong.',
          },
          {
            id: 'w',
            type: 'warning',
            title: 'Warning',
            message: 'Proceed with caution.',
          },
          {
            id: 'i',
            type: 'info',
            title: 'Info',
            message: 'Here is some information.',
          },
        ] as NotificationData[]
      ).map((notification) => (
        <NotificationToast
          key={notification.id}
          notification={notification}
          onDismiss={args.onDismiss}
        />
      ))}
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: 'All four notification types displayed together for comparison.',
      },
    },
  },
}
