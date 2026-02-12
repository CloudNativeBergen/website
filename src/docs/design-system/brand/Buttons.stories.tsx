import type { Meta, StoryObj } from '@storybook/nextjs-vite'
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

export const Buttons: Story = {
  render: () => (
    <div className="min-h-screen bg-white p-8 dark:bg-gray-900">
      <div className="mx-auto max-w-5xl">
        <h1 className="font-space-grotesk mb-4 text-4xl font-bold text-brand-cloud-blue dark:text-blue-400">
          Button System
        </h1>
        <p className="font-inter mb-12 text-lg text-brand-slate-gray dark:text-gray-300">
          Consistent, accessible button system with clear visual hierarchy and
          brand-aligned colors.
        </p>

        <ButtonShowcase />
      </div>
    </div>
  ),
}
