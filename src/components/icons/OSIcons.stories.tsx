import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import {
  ExperienceLevelIcon,
  AppleIcon,
  WindowsIcon,
  LinuxIcon,
} from './OSIcons'

const meta = {
  title: 'Components/Icons/OSIcons',
  component: ExperienceLevelIcon,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof ExperienceLevelIcon>

export default meta
type Story = StoryObj<typeof meta>

export const ExperienceLevels: Story = {
  args: { level: 'beginner' },
  render: () => (
    <div className="flex items-center gap-8">
      <div className="flex flex-col items-center gap-2">
        <ExperienceLevelIcon level="beginner" className="h-8 w-8" />
        <span className="text-sm text-gray-600 dark:text-gray-400">
          Beginner
        </span>
      </div>
      <div className="flex flex-col items-center gap-2">
        <ExperienceLevelIcon level="intermediate" className="h-8 w-8" />
        <span className="text-sm text-gray-600 dark:text-gray-400">
          Intermediate
        </span>
      </div>
      <div className="flex flex-col items-center gap-2">
        <ExperienceLevelIcon level="advanced" className="h-8 w-8" />
        <span className="text-sm text-gray-600 dark:text-gray-400">
          Advanced
        </span>
      </div>
    </div>
  ),
}

export const Beginner: Story = {
  args: {
    level: 'beginner',
    className: 'h-8 w-8',
  },
}

export const Intermediate: Story = {
  args: {
    level: 'intermediate',
    className: 'h-8 w-8',
  },
}

export const Advanced: Story = {
  args: {
    level: 'advanced',
    className: 'h-8 w-8',
  },
}

export const OSLogos: Story = {
  args: { level: 'beginner' },
  render: () => (
    <div className="flex items-center gap-8">
      <div className="flex flex-col items-center gap-2">
        <AppleIcon className="h-10 w-10 text-gray-700 dark:text-gray-300" />
        <span className="text-sm text-gray-600 dark:text-gray-400">macOS</span>
      </div>
      <div className="flex flex-col items-center gap-2">
        <WindowsIcon className="h-10 w-10 text-gray-700 dark:text-gray-300" />
        <span className="text-sm text-gray-600 dark:text-gray-400">
          Windows
        </span>
      </div>
      <div className="flex flex-col items-center gap-2">
        <LinuxIcon className="h-10 w-10 text-gray-700 dark:text-gray-300" />
        <span className="text-sm text-gray-600 dark:text-gray-400">Linux</span>
      </div>
    </div>
  ),
}

export const IconSizes: Story = {
  args: { level: 'beginner' },
  render: () => (
    <div className="space-y-8">
      <div>
        <p className="mb-4 text-sm font-medium text-gray-600 dark:text-gray-400">
          Experience Level Icons - Different Sizes
        </p>
        <div className="flex items-end gap-6">
          <ExperienceLevelIcon level="advanced" className="h-4 w-4" />
          <ExperienceLevelIcon level="advanced" className="h-6 w-6" />
          <ExperienceLevelIcon level="advanced" className="h-8 w-8" />
          <ExperienceLevelIcon level="advanced" className="h-12 w-12" />
        </div>
      </div>
      <div>
        <p className="mb-4 text-sm font-medium text-gray-600 dark:text-gray-400">
          OS Icons - Different Sizes
        </p>
        <div className="flex items-end gap-6">
          <AppleIcon className="h-4 w-4 text-gray-700 dark:text-gray-300" />
          <AppleIcon className="h-6 w-6 text-gray-700 dark:text-gray-300" />
          <AppleIcon className="h-8 w-8 text-gray-700 dark:text-gray-300" />
          <AppleIcon className="h-12 w-12 text-gray-700 dark:text-gray-300" />
        </div>
      </div>
    </div>
  ),
}

export const Documentation: Story = {
  args: { level: 'beginner' },
  render: () => (
    <div className="max-w-2xl space-y-6 p-6">
      <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
        OS & Experience Level Icons
      </h2>
      <p className="text-gray-600 dark:text-gray-400">
        A collection of SVG icons for operating systems and experience levels.
        These are used in workshop listings and speaker profiles.
      </p>

      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          Experience Level Icon
        </h3>
        <p className="text-gray-600 dark:text-gray-400">
          A bar chart icon that visually represents difficulty levels. Colors
          are semantic: green for beginner, yellow for intermediate, red for
          advanced.
        </p>
        <div className="flex gap-8 rounded-lg bg-gray-100 p-6 dark:bg-gray-800">
          <div className="flex items-center gap-3">
            <ExperienceLevelIcon level="beginner" className="h-6 w-6" />
            <span className="text-sm text-gray-600 dark:text-gray-400">
              1 bar = Beginner
            </span>
          </div>
          <div className="flex items-center gap-3">
            <ExperienceLevelIcon level="intermediate" className="h-6 w-6" />
            <span className="text-sm text-gray-600 dark:text-gray-400">
              2 bars = Intermediate
            </span>
          </div>
          <div className="flex items-center gap-3">
            <ExperienceLevelIcon level="advanced" className="h-6 w-6" />
            <span className="text-sm text-gray-600 dark:text-gray-400">
              3 bars = Advanced
            </span>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          Operating System Icons
        </h3>
        <p className="text-gray-600 dark:text-gray-400">
          Standard monochrome icons for major operating systems. Use with
          text-gray-* classes for appropriate coloring.
        </p>
        <div className="flex gap-8 rounded-lg bg-gray-100 p-6 dark:bg-gray-800">
          <div className="flex items-center gap-3">
            <AppleIcon className="h-6 w-6 text-gray-700 dark:text-gray-300" />
            <span className="text-sm text-gray-600 dark:text-gray-400">
              AppleIcon
            </span>
          </div>
          <div className="flex items-center gap-3">
            <WindowsIcon className="h-6 w-6 text-gray-700 dark:text-gray-300" />
            <span className="text-sm text-gray-600 dark:text-gray-400">
              WindowsIcon
            </span>
          </div>
          <div className="flex items-center gap-3">
            <LinuxIcon className="h-6 w-6 text-gray-700 dark:text-gray-300" />
            <span className="text-sm text-gray-600 dark:text-gray-400">
              LinuxIcon
            </span>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          Usage
        </h3>
        <pre className="overflow-x-auto rounded-lg bg-gray-900 p-4 text-sm text-gray-100">
          {`import { ExperienceLevelIcon, AppleIcon } from '@/components/icons/OSIcons'

// Experience level (beginner | intermediate | advanced)
<ExperienceLevelIcon level="intermediate" className="h-6 w-6" />

// OS icons - use text color classes
<AppleIcon className="h-6 w-6 text-gray-700" />`}
        </pre>
      </div>
    </div>
  ),
}
