import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { fn } from 'storybook/test'
import {
  ErrorDisplay,
  ErrorBoundaryFallback,
  NetworkErrorDisplay,
  ValidationErrorSummary,
} from './ErrorComponents'

const meta = {
  title: 'Systems/Speakers/TravelSupport/ErrorComponents',
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Error display components for the travel support system. Includes dismissible error/warning alerts, an error boundary fallback, a network error display, and a validation error summary.',
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const ErrorVariant: Story = {
  render: () => (
    <ErrorDisplay
      title="Failed to load expenses"
      message="There was an error loading your travel expenses. Please try again later."
      onDismiss={fn()}
    />
  ),
}

export const WarningVariant: Story = {
  render: () => (
    <ErrorDisplay
      title="Budget limit approaching"
      message="Your submitted expenses are nearing the approved travel support budget."
      variant="warning"
      onDismiss={fn()}
    />
  ),
}

export const NonDismissible: Story = {
  render: () => (
    <ErrorDisplay
      title="Submission deadline passed"
      message="Travel support requests are no longer accepted for this conference."
    />
  ),
  parameters: {
    docs: {
      description: {
        story: 'Without `onDismiss`, the close button is not rendered.',
      },
    },
  },
}

export const BoundaryFallback: Story = {
  render: () => (
    <ErrorBoundaryFallback
      error={
        new Error('Cannot read properties of undefined (reading "expenses")')
      }
      onRetry={fn()}
    />
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Rendered when an error boundary catches an exception. Shows a retry button and error details in development mode.',
      },
    },
  },
}

export const NetworkError: Story = {
  render: () => <NetworkErrorDisplay onRetry={fn()} />,
  parameters: {
    docs: {
      description: {
        story: 'Displayed when the client cannot connect to the server.',
      },
    },
  },
}

export const ValidationErrors: Story = {
  render: () => (
    <ValidationErrorSummary
      errors={{
        beneficiaryName: 'Beneficiary name is required',
        swiftCode: 'SWIFT/BIC code must be 8-11 characters',
        consent: 'You must consent to financial data processing',
      }}
    />
  ),
  parameters: {
    docs: {
      description: {
        story: 'Summary bar showing the count of form validation errors.',
      },
    },
  },
}

export const NoValidationErrors: Story = {
  render: () => <ValidationErrorSummary errors={{}} />,
  parameters: {
    docs: {
      description: {
        story: 'When there are no errors, the component renders nothing.',
      },
    },
  },
}
