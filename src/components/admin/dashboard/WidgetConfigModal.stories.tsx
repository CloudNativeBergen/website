import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { fn } from 'storybook/test'
import { WidgetConfigModal } from './WidgetConfigModal'

const meta = {
  title: 'Systems/Proposals/Admin/Dashboard/WidgetConfigModal',
  component: WidgetConfigModal,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Configuration modal for dashboard widgets. Dynamically renders form fields based on a widget&apos;s config schema from the widget registry. Supports number, boolean, select, and text field types with Zod validation.',
      },
    },
  },
  args: {
    isOpen: true,
    onClose: fn(),
    onSave: fn(),
  },
} satisfies Meta<typeof WidgetConfigModal>

export default meta
type Story = StoryObj<typeof meta>

export const WithConfig: Story = {
  args: {
    widgetType: 'review-progress',
    widgetDisplayName: 'Review Progress',
    currentConfig: {
      targetReviewsPerDay: 5,
    },
  },
}

export const NoConfig: Story = {
  args: {
    widgetType: 'unknown-widget-type',
    widgetDisplayName: 'Unknown Widget',
  },
  parameters: {
    docs: {
      description: {
        story:
          'When a widget type has no configSchema, a "No Configuration Available" message is shown.',
      },
    },
  },
}

export const DefaultValues: Story = {
  args: {
    widgetType: 'review-progress',
    widgetDisplayName: 'Review Progress',
    currentConfig: {},
  },
  parameters: {
    docs: {
      description: {
        story:
          'When no currentConfig is provided, the form fields are populated with default values from the config schema.',
      },
    },
  },
}
