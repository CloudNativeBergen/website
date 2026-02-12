import type { Meta, StoryObj } from '@storybook/react'
import { MissingAvatar } from './MissingAvatar'

const meta = {
  title: 'Components/MissingAvatar',
  component: MissingAvatar,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    name: {
      control: 'text',
      description: 'Name to generate initials from',
    },
    size: {
      control: { type: 'range', min: 24, max: 200, step: 8 },
      description: 'Size of the avatar in pixels',
    },
    className: {
      control: 'text',
      description: 'Additional CSS classes',
    },
    textSizeClass: {
      control: 'text',
      description: 'Override text size class (e.g., text-xs, text-sm)',
    },
  },
} satisfies Meta<typeof MissingAvatar>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    name: 'John Doe',
    size: 64,
  },
}

export const SingleName: Story = {
  args: {
    name: 'Alice',
    size: 64,
  },
}

export const SingleLetter: Story = {
  args: {
    name: 'X',
    size: 64,
  },
}

export const EmptyName: Story = {
  args: {
    name: '',
    size: 64,
  },
}

export const DifferentSizes: Story = {
  args: { name: 'Demo', size: 64 },
  render: () => (
    <div className="flex items-end gap-4">
      <MissingAvatar name="Small" size={32} />
      <MissingAvatar name="Medium" size={48} />
      <MissingAvatar name="Large" size={64} />
      <MissingAvatar name="X-Large" size={96} />
      <MissingAvatar name="Huge" size={128} />
    </div>
  ),
}

export const ColorVariations: Story = {
  args: { name: 'Demo', size: 48 },
  render: () => (
    <div className="flex flex-wrap gap-4">
      {[
        'Alice Brown',
        'Bob Clark',
        'Carol Davis',
        'David Evans',
        'Eva Fisher',
        'Frank Garcia',
        'Grace Hall',
        'Henry Ivy',
        'Iris Jones',
        'Jack King',
        'Karen Lee',
        'Leo Martin',
        'Mary Nelson',
        'Nick Owen',
        'Olivia Price',
        'Paul Quinn',
        'Quinn Ross',
      ].map((name) => (
        <div key={name} className="flex flex-col items-center gap-1">
          <MissingAvatar name={name} size={48} />
          <span className="text-xs text-gray-500">{name.split(' ')[0]}</span>
        </div>
      ))}
    </div>
  ),
}

export const WithRoundedClass: Story = {
  args: {
    name: 'Jane Smith',
    size: 64,
    className: 'rounded-full',
  },
}

export const WithSquareClass: Story = {
  args: {
    name: 'Jane Smith',
    size: 64,
    className: 'rounded-lg',
  },
}

export const Documentation: Story = {
  args: { name: 'Demo', size: 64 },
  render: () => (
    <div className="max-w-2xl space-y-6 p-6">
      <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
        MissingAvatar Component
      </h2>
      <p className="text-gray-600 dark:text-gray-400">
        A placeholder avatar component that displays initials when no image is
        available. The background color is deterministically generated based on
        the first letter of the name.
      </p>

      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          Features
        </h3>
        <ul className="list-inside list-disc space-y-2 text-gray-600 dark:text-gray-400">
          <li>
            <strong>Automatic initials:</strong> Generates up to 2-letter
            initials from the name
          </li>
          <li>
            <strong>Consistent colors:</strong> Same name always produces the
            same background color
          </li>
          <li>
            <strong>Responsive text:</strong> Text size automatically scales
            with avatar size
          </li>
          <li>
            <strong>Fallback handling:</strong> Shows &quot;?&quot; for empty or
            invalid names
          </li>
        </ul>
      </div>

      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          Initials Logic
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-lg bg-gray-100 p-4 dark:bg-gray-800">
            <p className="mb-2 font-medium text-gray-900 dark:text-white">
              Multi-word name
            </p>
            <div className="flex items-center gap-2">
              <MissingAvatar name="John Doe" size={40} />
              <span className="text-sm text-gray-600 dark:text-gray-400">
                &quot;John Doe&quot; → JD
              </span>
            </div>
          </div>
          <div className="rounded-lg bg-gray-100 p-4 dark:bg-gray-800">
            <p className="mb-2 font-medium text-gray-900 dark:text-white">
              Single word name
            </p>
            <div className="flex items-center gap-2">
              <MissingAvatar name="Alice" size={40} />
              <span className="text-sm text-gray-600 dark:text-gray-400">
                &quot;Alice&quot; → AL
              </span>
            </div>
          </div>
          <div className="rounded-lg bg-gray-100 p-4 dark:bg-gray-800">
            <p className="mb-2 font-medium text-gray-900 dark:text-white">
              Single letter
            </p>
            <div className="flex items-center gap-2">
              <MissingAvatar name="X" size={40} />
              <span className="text-sm text-gray-600 dark:text-gray-400">
                &quot;X&quot; → X
              </span>
            </div>
          </div>
          <div className="rounded-lg bg-gray-100 p-4 dark:bg-gray-800">
            <p className="mb-2 font-medium text-gray-900 dark:text-white">
              Empty name
            </p>
            <div className="flex items-center gap-2">
              <MissingAvatar name="" size={40} />
              <span className="text-sm text-gray-600 dark:text-gray-400">
                &quot;&quot; → ?
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  ),
}
