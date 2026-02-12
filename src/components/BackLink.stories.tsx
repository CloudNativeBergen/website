import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { BackLink } from './BackButton'

const meta = {
  title: 'Components/BackLink',
  component: BackLink,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'A smart back navigation component that uses browser history when available, with a fallback URL. Available in link and button variants.',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['link', 'button'],
      description: 'Visual style - link (minimal) or button (prominent)',
    },
    fallbackUrl: {
      control: 'text',
      description: 'URL to navigate to if no browser history exists',
    },
    children: {
      control: 'text',
      description: 'Button text content',
    },
  },
} satisfies Meta<typeof BackLink>

export default meta
type Story = StoryObj<typeof meta>

export const Link: Story = {
  args: {
    variant: 'link',
    children: 'Back',
    fallbackUrl: '/',
  },
}

export const Button: Story = {
  args: {
    variant: 'button',
    children: 'Back',
    fallbackUrl: '/',
  },
}

export const CustomText: Story = {
  args: {
    variant: 'link',
    children: 'Return to speakers',
    fallbackUrl: '/speakers',
  },
}

export const InContext: Story = {
  render: () => (
    <div className="space-y-8">
      <div className="rounded-lg border border-gray-200 p-6 dark:border-gray-700">
        <BackLink variant="link" fallbackUrl="/speakers">
          Back to speakers
        </BackLink>
        <h1 className="mt-4 text-2xl font-bold text-brand-slate-gray dark:text-white">
          Speaker Detail Page
        </h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          The back link navigates using browser history when available.
        </p>
      </div>

      <div className="rounded-lg border border-gray-200 p-6 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-brand-slate-gray dark:text-white">
            Form Page
          </h1>
          <BackLink variant="button" fallbackUrl="/">
            Cancel
          </BackLink>
        </div>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          Button variant is more prominent for actions like cancel.
        </p>
      </div>
    </div>
  ),
}
