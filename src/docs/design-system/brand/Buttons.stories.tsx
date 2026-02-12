import type { Meta, StoryObj } from '@storybook/react'
import { ButtonShowcase } from '@/docs/components/ButtonShowcase'

const meta = {
  title: 'Design System/Brand/Buttons',
  parameters: {
    layout: 'fullscreen',
    options: {
      showPanel: false,
    },
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const ButtonSystem: Story = {
  render: () => (
    <div className="min-h-screen bg-white p-8 dark:bg-gray-900">
      <div className="mx-auto max-w-5xl">
        <h1 className="mb-4 font-space-grotesk text-4xl font-bold text-brand-cloud-blue dark:text-blue-400">
          Button System
        </h1>
        <p className="mb-12 font-inter text-lg text-brand-slate-gray dark:text-gray-300">
          Consistent, accessible button system with clear visual hierarchy and
          brand-aligned colors.
        </p>

        <ButtonShowcase />
      </div>
    </div>
  ),
}
