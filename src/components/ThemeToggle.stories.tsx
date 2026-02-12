import type { Meta, StoryObj } from '@storybook/react'
import { ThemeToggle } from './ThemeToggle'

const meta = {
  title: 'Components/ThemeToggle',
  component: ThemeToggle,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="p-8">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ThemeToggle>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const InContext: Story = {
  render: () => (
    <div className="flex items-center gap-4 rounded-lg bg-gray-100 px-6 py-4 dark:bg-gray-800">
      <span className="text-sm text-gray-600 dark:text-gray-400">
        Toggle theme:
      </span>
      <ThemeToggle />
    </div>
  ),
}

export const InHeader: Story = {
  render: () => (
    <div className="flex w-full max-w-4xl items-center justify-between rounded-lg bg-white px-6 py-4 shadow-md dark:bg-gray-900">
      <div className="flex items-center gap-2">
        <div className="h-8 w-8 rounded bg-linear-to-br from-blue-500 to-green-500" />
        <span className="font-semibold text-gray-900 dark:text-white">
          Cloud Native Days
        </span>
      </div>
      <nav className="hidden items-center gap-6 md:flex">
        <a
          href="#"
          className="text-sm text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
        >
          Schedule
        </a>
        <a
          href="#"
          className="text-sm text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
        >
          Speakers
        </a>
        <a
          href="#"
          className="text-sm text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
        >
          Tickets
        </a>
        <ThemeToggle />
      </nav>
    </div>
  ),
}

export const Documentation: Story = {
  render: () => (
    <div className="max-w-2xl space-y-6 p-6">
      <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
        ThemeToggle Component
      </h2>
      <p className="text-gray-600 dark:text-gray-400">
        A button component for switching between light and dark themes. Uses
        next-themes for theme management and handles hydration properly.
      </p>

      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          Features
        </h3>
        <ul className="list-inside list-disc space-y-2 text-gray-600 dark:text-gray-400">
          <li>
            <strong>Hydration safe:</strong> Shows placeholder until mounted to
            avoid flash
          </li>
          <li>
            <strong>Accessible:</strong> Proper ARIA labels describe current and
            target state
          </li>
          <li>
            <strong>System theme aware:</strong> Uses resolvedTheme to handle
            system preference
          </li>
          <li>
            <strong>Visual feedback:</strong> Sun/Moon icons with hover states
          </li>
        </ul>
      </div>

      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          Interactive Demo
        </h3>
        <div className="flex items-center justify-center rounded-lg border border-gray-200 p-8 dark:border-gray-700">
          <ThemeToggle />
        </div>
        <p className="text-center text-sm text-gray-500 dark:text-gray-400">
          Click the toggle to switch themes
        </p>
      </div>

      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          Styling
        </h3>
        <p className="text-gray-600 dark:text-gray-400">
          The toggle uses a pill shape with subtle shadow and backdrop blur for
          a modern, cohesive look that works well in both light and dark themes.
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-lg bg-white p-6 shadow">
            <p className="mb-4 text-xs text-gray-500">Light Theme</p>
            <div className="flex justify-center">
              <ThemeToggle />
            </div>
          </div>
          <div className="rounded-lg bg-gray-900 p-6 shadow">
            <p className="mb-4 text-xs text-gray-400">Dark Theme</p>
            <div className="flex justify-center">
              <ThemeToggle />
            </div>
          </div>
        </div>
      </div>
    </div>
  ),
}
