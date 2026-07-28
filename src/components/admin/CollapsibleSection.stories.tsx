import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, userEvent, within } from 'storybook/test'
import { CollapsibleSection } from './CollapsibleSection'

const meta = {
  title: 'Components/Data Display/CollapsibleSection',
  component: CollapsibleSection,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'An expandable/collapsible section with a header and toggle button. Used to organize content in admin pages.',
      },
    },
  },
  tags: ['autodocs'],
  decorators: [
    (Story: React.ComponentType) => (
      <div className="max-w-2xl">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof CollapsibleSection>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    title: 'Speaker Details',
    children: (
      <div className="space-y-4 p-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Name
          </label>
          <p className="mt-1 text-gray-900 dark:text-white">Jane Doe</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Email
          </label>
          <p className="mt-1 text-gray-900 dark:text-white">jane@example.com</p>
        </div>
      </div>
    ),
  },
}

export const DefaultOpen: Story = {
  args: {
    title: 'Proposal Information',
    defaultOpen: true,
    children: (
      <div className="p-6">
        <p className="text-gray-600 dark:text-gray-400">
          This section is expanded by default and contains additional details
          about the proposal.
        </p>
      </div>
    ),
  },
}

export const WithLongContent: Story = {
  args: {
    title: 'Review History',
    defaultOpen: true,
    children: (
      <div className="divide-y divide-gray-200 dark:divide-gray-700">
        {['Review 1', 'Review 2', 'Review 3', 'Review 4'].map((review, i) => (
          <div key={i} className="p-4">
            <h4 className="font-medium text-gray-900 dark:text-white">
              {review}
            </h4>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Lorem ipsum dolor sit amet, consectetur adipiscing elit.
            </p>
          </div>
        ))}
      </div>
    ),
  },
}

export const MultipleSections: Story = {
  args: {
    title: 'Multiple Sections Example',
    children: null,
  },
  render: () => (
    <div className="space-y-4">
      <CollapsibleSection title="Basic Information" defaultOpen={true}>
        <div className="p-6">
          <p className="text-gray-600 dark:text-gray-400">
            Basic speaker information and contact details.
          </p>
        </div>
      </CollapsibleSection>
      <CollapsibleSection title="Talk History">
        <div className="p-6">
          <p className="text-gray-600 dark:text-gray-400">
            Previous talks and conference appearances.
          </p>
        </div>
      </CollapsibleSection>
      <CollapsibleSection title="Admin Notes">
        <div className="p-6">
          <p className="text-gray-600 dark:text-gray-400">
            Internal notes and organizer comments.
          </p>
        </div>
      </CollapsibleSection>
    </div>
  ),
}

/**
 * Regression net for the Hide/Show toggle: an open section collapses on click
 * (body content leaves the DOM, `aria-expanded` flips to false, the label
 * reads "Show") and re-expands on a second click.
 */
export const TogglesOpenAndClosed: Story = {
  args: {
    title: 'Collapsible',
    defaultOpen: true,
    children: (
      <div className="p-6">
        <p className="text-gray-600 dark:text-gray-400">Collapsible body.</p>
      </div>
    ),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const toggle = canvas.getByRole('button', { name: /collapsible/i })
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')
    await expect(canvas.getByText('Collapsible body.')).toBeVisible()

    await userEvent.click(toggle)
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await expect(canvas.queryByText('Collapsible body.')).toBeNull()

    await userEvent.click(toggle)
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')
    await expect(canvas.getByText('Collapsible body.')).toBeVisible()
  },
}
