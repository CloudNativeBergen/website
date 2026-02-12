import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { TypewriterEffect } from './TypewriterEffect'

const meta = {
  title: 'Components/Data Display/TypewriterEffect',
  component: TypewriterEffect,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
  },
  decorators: [
    (Story) => (
      <div className="p-8 text-2xl font-bold text-gray-900 dark:text-white">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof TypewriterEffect>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    prefix: 'We love ',
    words: ['Kubernetes.', 'Cloud Native.', 'Open Source.', 'Community.'],
    typingSpeed: 100,
    deletingSpeed: 50,
    pauseDuration: 2000,
  },
}

export const FastTyping: Story = {
  args: {
    prefix: 'Build with ',
    words: ['containers.', 'microservices.', 'observability.'],
    typingSpeed: 40,
    deletingSpeed: 20,
    pauseDuration: 1000,
  },
}

export const AnimationDisabled: Story = {
  args: {
    prefix: 'We love ',
    words: ['Kubernetes.', 'Cloud Native.', 'Open Source.'],
    animation: false,
  },
}
