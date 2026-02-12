import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { Container } from './Container'

const meta = {
  title: 'Components/Container',
  component: Container,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'A responsive container component that centers content and applies consistent horizontal padding. Uses max-w-7xl (1280px) with responsive padding.',
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof Container>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    children: (
      <div className="rounded-lg bg-brand-sky-mist p-8 dark:bg-gray-800">
        <p className="text-center text-brand-slate-gray dark:text-white">
          Content is centered with max-w-7xl and responsive padding
        </p>
      </div>
    ),
  },
}

export const WithMultipleSections: Story = {
  args: {
    children: (
      <div className="space-y-4">
        <div className="rounded-lg bg-brand-cloud-blue/10 p-4">Section 1</div>
        <div className="rounded-lg bg-brand-fresh-green/10 p-4">Section 2</div>
        <div className="rounded-lg bg-brand-nordic-purple/10 p-4">
          Section 3
        </div>
      </div>
    ),
  },
}

export const FullWidthBackground: Story = {
  render: () => (
    <div className="bg-brand-gradient py-12">
      <Container>
        <div className="rounded-lg bg-white/90 p-8 text-center">
          <h2 className="text-xl font-semibold text-brand-slate-gray">
            Container constrains content while background extends full-width
          </h2>
        </div>
      </Container>
    </div>
  ),
}
