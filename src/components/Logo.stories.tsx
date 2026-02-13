import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { Logo, Logomark } from './Logo'

const logoMeta = {
  title: 'Components/Layout/Logo',
  component: Logo,
  parameters: {
    layout: 'centered',
    backgrounds: {
      default: 'light',
      values: [
        { name: 'light', value: '#ffffff' },
        { name: 'dark', value: '#1a1a2e' },
      ],
    },
  },
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'radio',
      options: ['gradient', 'monochrome'],
      description: 'Logo color variant',
    },
    className: {
      control: 'text',
      description: 'Additional CSS classes',
    },
  },
} satisfies Meta<typeof Logo>

export default logoMeta
type LogoStory = StoryObj<typeof logoMeta>

export const GradientLogo: LogoStory = {
  args: {
    variant: 'gradient',
    className: 'w-96',
  },
}

export const MonochromeLogo: LogoStory = {
  args: {
    variant: 'monochrome',
    className: 'w-96',
  },
}

export const LogoSizes: LogoStory = {
  args: { variant: 'gradient', className: 'w-96' },
  render: () => (
    <div className="flex flex-col gap-8">
      <div>
        <p className="mb-2 text-sm text-gray-500">Small (w-48)</p>
        <Logo variant="gradient" className="w-48" />
      </div>
      <div>
        <p className="mb-2 text-sm text-gray-500">Medium (w-72)</p>
        <Logo variant="gradient" className="w-72" />
      </div>
      <div>
        <p className="mb-2 text-sm text-gray-500">Large (w-96)</p>
        <Logo variant="gradient" className="w-96" />
      </div>
    </div>
  ),
}

export const LogomarkDefault: LogoStory = {
  args: { variant: 'gradient', className: 'w-96' },
  render: () => (
    <div className="flex items-center gap-8">
      <div className="text-center">
        <Logomark variant="gradient" className="h-24 w-24" />
        <p className="mt-2 text-sm text-gray-500">Gradient</p>
      </div>
      <div className="text-center">
        <Logomark variant="monochrome" className="h-24 w-24" />
        <p className="mt-2 text-sm text-gray-500">Monochrome</p>
      </div>
    </div>
  ),
}

export const LogomarkSizes: LogoStory = {
  args: { variant: 'gradient', className: 'w-96' },
  render: () => (
    <div className="flex items-end gap-8">
      <div className="text-center">
        <Logomark variant="gradient" className="h-8 w-8" />
        <p className="mt-2 text-xs text-gray-500">32px</p>
      </div>
      <div className="text-center">
        <Logomark variant="gradient" className="h-12 w-12" />
        <p className="mt-2 text-xs text-gray-500">48px</p>
      </div>
      <div className="text-center">
        <Logomark variant="gradient" className="h-16 w-16" />
        <p className="mt-2 text-xs text-gray-500">64px</p>
      </div>
      <div className="text-center">
        <Logomark variant="gradient" className="h-24 w-24" />
        <p className="mt-2 text-xs text-gray-500">96px</p>
      </div>
    </div>
  ),
}

export const Documentation: LogoStory = {
  args: { variant: 'gradient', className: 'w-96' },
  render: () => (
    <div className="max-w-3xl space-y-8 p-6">
      <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
        Logo Components
      </h2>
      <p className="text-gray-600 dark:text-gray-400">
        The Cloud Native Days logo system includes both the full logo (Logo) and
        a compact mark (Logomark) for various use cases.
      </p>

      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          Full Logo
        </h3>
        <p className="text-gray-600 dark:text-gray-400">
          Use the full logo in headers, hero sections, and contexts where brand
          recognition is important.
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-lg bg-white p-6 shadow">
            <p className="mb-4 text-xs text-gray-500">Gradient on Light</p>
            <Logo variant="gradient" className="w-full max-w-sm" />
          </div>
          <div className="rounded-lg bg-gray-900 p-6 shadow">
            <p className="mb-4 text-xs text-gray-400">Monochrome on Dark</p>
            <Logo variant="monochrome" className="w-full max-w-sm text-white" />
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          Logomark
        </h3>
        <p className="text-gray-600 dark:text-gray-400">
          Use the logomark in compact spaces like navigation icons, favicons,
          and social media avatars.
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-lg bg-white p-6 shadow">
            <p className="mb-4 text-xs text-gray-500">Gradient on Light</p>
            <div className="flex justify-center">
              <Logomark variant="gradient" className="h-20 w-20" />
            </div>
          </div>
          <div className="rounded-lg bg-gray-900 p-6 shadow">
            <p className="mb-4 text-xs text-gray-400">Monochrome on Dark</p>
            <div className="flex justify-center">
              <Logomark variant="monochrome" className="h-20 w-20 text-white" />
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          Usage Guidelines
        </h3>
        <ul className="list-inside list-disc space-y-2 text-gray-600 dark:text-gray-400">
          <li>
            Use <code className="text-sm">variant=&quot;gradient&quot;</code>{' '}
            for primary branding contexts
          </li>
          <li>
            Use <code className="text-sm">variant=&quot;monochrome&quot;</code>{' '}
            for dark backgrounds or monochrome designs
          </li>
          <li>Maintain minimum clear space around the logo</li>
          <li>
            Do not stretch, rotate, or modify the logo&apos;s aspect ratio
          </li>
        </ul>
      </div>
    </div>
  ),
}
