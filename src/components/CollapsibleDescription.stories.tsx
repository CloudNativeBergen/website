import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { CollapsibleDescription } from './CollapsibleDescription'

const meta = {
  title: 'Components/CollapsibleDescription',
  component: CollapsibleDescription,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  argTypes: {
    paragraphs: {
      control: 'object',
      description: 'Array of paragraph strings to display',
    },
  },
} satisfies Meta<typeof CollapsibleDescription>

export default meta
type Story = StoryObj<typeof meta>

export const SingleParagraph: Story = {
  args: {
    paragraphs: [
      'Cloud Native Days Norway is a premier conference for the cloud native community in the Nordic region. We bring together developers, operators, and business leaders to share knowledge and best practices.',
    ],
  },
}

export const TwoParagraphs: Story = {
  args: {
    paragraphs: [
      'Cloud Native Days Norway is a premier conference for the cloud native community in the Nordic region.',
      'Join us for two days of inspiring talks, hands-on workshops, and networking opportunities with industry experts.',
    ],
  },
}

export const MultipleParagraphs: Story = {
  args: {
    paragraphs: [
      'Cloud Native Days Norway is a premier conference for the cloud native community in the Nordic region. We bring together developers, operators, and business leaders to share knowledge and best practices.',
      'Our conference features world-class speakers from leading technology companies, sharing insights on Kubernetes, containers, serverless, and more.',
      'Whether you are just getting started with cloud native technologies or you are a seasoned expert, there is something for everyone at Cloud Native Days Norway.',
      'Join us and be part of the movement that is transforming how we build and deploy software across the globe.',
    ],
  },
}

export const Documentation: Story = {
  args: {
    paragraphs: ['Demo paragraph'],
  },
  render: () => (
    <div className="max-w-2xl space-y-6 p-6">
      <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
        CollapsibleDescription Component
      </h2>
      <p className="text-gray-600 dark:text-gray-400">
        A responsive description component that shows only the first paragraph
        on mobile with a &quot;Show more&quot; button. On desktop, all
        paragraphs are visible by default.
      </p>

      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          Responsive Behavior
        </h3>
        <ul className="list-inside list-disc space-y-2 text-gray-600 dark:text-gray-400">
          <li>
            <strong>Mobile:</strong> Shows first paragraph, others hidden behind
            &quot;Show more&quot;
          </li>
          <li>
            <strong>Desktop (sm+):</strong> All paragraphs visible, no toggle
            needed
          </li>
          <li>
            <strong>Single paragraph:</strong> No toggle shown, content always
            visible
          </li>
        </ul>
      </div>

      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          Example - Single Paragraph
        </h3>
        <div className="rounded-lg bg-gray-100 p-4 dark:bg-gray-800">
          <CollapsibleDescription
            paragraphs={['This is a single paragraph with no toggle button.']}
          />
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          Example - Multiple Paragraphs
        </h3>
        <div className="rounded-lg bg-gray-100 p-4 dark:bg-gray-800">
          <CollapsibleDescription
            paragraphs={[
              'First paragraph is always visible on all screen sizes.',
              'Second paragraph is hidden on mobile, visible on desktop.',
              'Third paragraph follows the same pattern as the second.',
            ]}
          />
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Resize your browser to see the mobile &quot;Show more&quot; button
          appear.
        </p>
      </div>
    </div>
  ),
}
