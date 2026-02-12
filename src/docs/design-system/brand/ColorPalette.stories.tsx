import type { Meta, StoryObj } from '@storybook/react'
import { colorPalette } from '@/docs/design-system/data'
import { ColorSwatch } from '@/docs/components/ColorSwatch'

const meta = {
  title: 'Design System/Brand/Color Palette',
  parameters: {
    layout: 'fullscreen',
    options: {
      showPanel: false,
    },
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const ColorPalette: Story = {
  render: () => (
    <div className="min-h-screen bg-white p-8 dark:bg-gray-900">
      <div className="mx-auto max-w-6xl">
        <h1 className="mb-4 font-space-grotesk text-4xl font-bold text-brand-cloud-blue dark:text-blue-400">
          Color Palette
        </h1>
        <p className="mb-12 font-inter text-lg text-brand-slate-gray dark:text-gray-300">
          Complete color system with usage guidelines and Tailwind class references.
        </p>

        {/* Primary Colors */}
        <section className="mb-16">
          <h2 className="mb-6 font-space-grotesk text-2xl font-semibold text-brand-slate-gray dark:text-white">
            Primary Colors
          </h2>
          <p className="mb-6 font-inter text-brand-slate-gray dark:text-gray-400">
            Core brand colors used for headlines, CTAs, and key UI elements.
          </p>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {colorPalette.primary.map((color) => (
              <ColorSwatch key={color.name} color={color} />
            ))}
          </div>
        </section>

        {/* Secondary Colors */}
        <section className="mb-16">
          <h2 className="mb-6 font-space-grotesk text-2xl font-semibold text-brand-slate-gray dark:text-white">
            Secondary Colors
          </h2>
          <p className="mb-6 font-inter text-brand-slate-gray dark:text-gray-400">
            Supporting colors for backgrounds, cards, and subtle UI accents.
          </p>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {colorPalette.secondary.map((color) => (
              <ColorSwatch key={color.name} color={color} />
            ))}
          </div>
        </section>

        {/* Accent Colors */}
        <section className="mb-16">
          <h2 className="mb-6 font-space-grotesk text-2xl font-semibold text-brand-slate-gray dark:text-white">
            Accent Colors
          </h2>
          <p className="mb-6 font-inter text-brand-slate-gray dark:text-gray-400">
            Highlights for emphasis, alerts, and special call-to-actions.
          </p>
          <div className="grid gap-6 sm:grid-cols-2">
            {colorPalette.accent.map((color) => (
              <ColorSwatch key={color.name} color={color} />
            ))}
          </div>
        </section>

        {/* Neutral Colors */}
        <section className="mb-16">
          <h2 className="mb-6 font-space-grotesk text-2xl font-semibold text-brand-slate-gray dark:text-white">
            Neutral Colors
          </h2>
          <p className="mb-6 font-inter text-brand-slate-gray dark:text-gray-400">
            Text, borders, and background colors for body content.
          </p>
          <div className="grid gap-6 sm:grid-cols-2">
            {colorPalette.neutral.map((color) => (
              <ColorSwatch key={color.name} color={color} />
            ))}
          </div>
        </section>

        {/* Quick Reference */}
        <section>
          <h2 className="mb-6 font-space-grotesk text-2xl font-semibold text-brand-slate-gray dark:text-white">
            Quick Reference
          </h2>
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-6 dark:border-gray-700 dark:bg-gray-800">
            <div className="grid gap-6 md:grid-cols-2">
              <div>
                <h3 className="mb-4 font-space-grotesk text-lg font-semibold text-brand-slate-gray dark:text-white">
                  Background Colors
                </h3>
                <div className="space-y-2 font-jetbrains text-sm">
                  <div className="flex items-center gap-3">
                    <div className="h-6 w-6 rounded bg-brand-cloud-blue" />
                    <code className="text-gray-600 dark:text-gray-400">bg-brand-cloud-blue</code>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="h-6 w-6 rounded bg-brand-fresh-green" />
                    <code className="text-gray-600 dark:text-gray-400">bg-brand-fresh-green</code>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="h-6 w-6 rounded bg-brand-nordic-purple" />
                    <code className="text-gray-600 dark:text-gray-400">bg-brand-nordic-purple</code>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="h-6 w-6 rounded bg-brand-sunbeam-yellow" />
                    <code className="text-gray-600 dark:text-gray-400">bg-brand-sunbeam-yellow</code>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="h-6 w-6 rounded bg-brand-sky-mist" />
                    <code className="text-gray-600 dark:text-gray-400">bg-brand-sky-mist</code>
                  </div>
                </div>
              </div>
              <div>
                <h3 className="mb-4 font-space-grotesk text-lg font-semibold text-brand-slate-gray dark:text-white">
                  Gradient Backgrounds
                </h3>
                <div className="space-y-2 font-jetbrains text-sm">
                  <div className="flex items-center gap-3">
                    <div className="h-6 w-6 rounded bg-aqua-gradient" />
                    <code className="text-gray-600 dark:text-gray-400">bg-aqua-gradient</code>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="h-6 w-6 rounded bg-brand-gradient" />
                    <code className="text-gray-600 dark:text-gray-400">bg-brand-gradient</code>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="h-6 w-6 rounded bg-nordic-gradient" />
                    <code className="text-gray-600 dark:text-gray-400">bg-nordic-gradient</code>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  ),
}
