import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { SponsorLogo } from './SponsorLogo'

const meta = {
  title: 'Systems/Sponsors/Components/SponsorLogo',
  component: SponsorLogo,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Responsive sponsor logo display with automatic dark mode support. Uses inline SVG logos with optional bright variant for dark backgrounds. Supports multiple sizes and maintains aspect ratio. Used in both admin CRM interface and public sponsor showcase.',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    name: {
      control: 'text',
      description: 'Sponsor name (used for alt text)',
    },
    logo: {
      control: 'text',
      description: 'SVG logo markup (default variant)',
    },
    logoBright: {
      control: 'text',
      description: 'SVG logo markup (bright variant for dark mode)',
    },
  },
} satisfies Meta<typeof SponsorLogo>

export default meta
type Story = StoryObj<typeof meta>

const sampleSVG = `<svg viewBox="0 0 200 60" xmlns="http://www.w3.org/2000/svg">
  <rect width="200" height="60" fill="#4F46E5"/>
  <text x="100" y="35" font-family="Arial" font-size="24" fill="white" text-anchor="middle">ACME Corp</text>
</svg>`

const brightSVG = `<svg viewBox="0 0 200 60" xmlns="http://www.w3.org/2000/svg">
  <rect width="200" height="60" fill="#FFFFFF"/>
  <text x="100" y="35" font-family="Arial" font-size="24" fill="#4F46E5" text-anchor="middle">ACME Corp</text>
</svg>`

export const Default: Story = {
  args: {
    name: 'Acme Corporation',
    logo: sampleSVG,
  },
}

export const WithBrightVariant: Story = {
  args: {
    name: 'Acme Corporation',
    logo: sampleSVG,
    logoBright: brightSVG,
  },
  decorators: [
    (Story) => (
      <div className="rounded-lg border border-gray-700 bg-gray-900 p-4">
        <Story />
      </div>
    ),
  ],
}

export const Small: Story = {
  args: {
    name: 'Acme Corporation',
    logo: sampleSVG,
  },
  decorators: [
    (Story) => (
      <div className="w-48">
        <Story />
      </div>
    ),
  ],
}

export const Medium: Story = {
  args: {
    name: 'Acme Corporation',
    logo: sampleSVG,
  },
  decorators: [
    (Story) => (
      <div className="w-64">
        <Story />
      </div>
    ),
  ],
}

export const Large: Story = {
  args: {
    name: 'Acme Corporation',
    logo: sampleSVG,
  },
  decorators: [
    (Story) => (
      <div className="w-96">
        <Story />
      </div>
    ),
  ],
}
