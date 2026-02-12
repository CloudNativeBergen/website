import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { ErrorDisplay } from './ErrorDisplay'

const meta = {
  title: 'Components/Feedback/ErrorDisplay',
  component: ErrorDisplay,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'A full-page error display component with customizable title, message, and navigation links. Used for error states in admin pages.',
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof ErrorDisplay>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    title: 'Something went wrong',
    message: 'An unexpected error occurred. Please try again later.',
  },
}

export const NotFound: Story = {
  args: {
    title: 'Proposal not found',
    message:
      'The proposal you are looking for does not exist or has been deleted.',
    backLink: {
      href: '/admin/proposals',
      label: 'Back to Proposals',
    },
  },
}

export const Unauthorized: Story = {
  args: {
    title: 'Access denied',
    message: 'You do not have permission to view this page.',
    backLink: {
      href: '/admin',
      label: 'Back to Dashboard',
    },
  },
}

export const WithoutHomeLink: Story = {
  args: {
    title: 'Conference not found',
    message: 'No conference is configured for this domain.',
    homeLink: false,
  },
}

export const CustomBackLink: Story = {
  args: {
    title: 'Speaker not found',
    message: 'The speaker profile could not be loaded.',
    backLink: {
      href: '/admin/speakers',
      label: 'View all speakers',
    },
  },
}

export const ServerError: Story = {
  args: {
    title: 'Server Error',
    message:
      'We encountered an internal server error. Our team has been notified and is working on a fix.',
    backLink: {
      href: '/admin',
      label: 'Return to Dashboard',
    },
  },
}
