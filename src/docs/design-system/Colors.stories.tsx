import type { Meta, StoryObj } from '@storybook/nextjs-vite'

const meta = {
  title: 'Design System/Foundation/Colors',
  parameters: {
    layout: 'fullscreen',
    options: {
      showPanel: false,
    },
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const ColorSwatch = ({
  name,
  value,
  className,
  textClassName = 'text-brand-slate-gray dark:text-white',
}: {
  name: string
  value: string
  className: string
  textClassName?: string
}) => (
  <div className="overflow-hidden rounded-lg shadow-md">
    <div className={`h-24 ${className}`} />
    <div className="bg-white p-3 dark:bg-gray-800">
      <h3
        className={`font-space-grotesk mb-1 text-sm font-semibold ${textClassName}`}
      >
        {name}
      </h3>
      <p className="font-jetbrains text-xs text-gray-500 dark:text-gray-400">
        {value}
      </p>
      <code className="font-jetbrains mt-1 block text-xs text-gray-400 dark:text-gray-500">
        {className.replace('bg-', '')}
      </code>
    </div>
  </div>
)

export const Colors: Story = {
  render: () => (
    <div className="min-h-screen bg-white p-8 dark:bg-gray-900">
      <div className="mx-auto max-w-6xl">
        <h1 className="font-space-grotesk mb-4 text-4xl font-bold text-brand-cloud-blue dark:text-blue-400">
          Colors
        </h1>
        <p className="font-inter mb-12 text-lg text-brand-slate-gray dark:text-gray-300">
          Brand color palette designed for cloud native and Nordic aesthetics.
        </p>

        {/* Primary Colors */}
        <section className="mb-16">
          <h2 className="font-space-grotesk mb-6 text-2xl font-semibold text-brand-slate-gray dark:text-white">
            Primary Colors
          </h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <ColorSwatch
              name="Cloud Blue"
              value="#1D4ED8"
              className="bg-brand-cloud-blue"
            />
            <ColorSwatch
              name="Aqua Gradient"
              value="#3B82F6 → #06B6D4"
              className="bg-aqua-gradient"
            />
            <ColorSwatch
              name="Brand Gradient"
              value="#1D4ED8 → #06B6D4"
              className="bg-brand-gradient"
            />
            <ColorSwatch
              name="Nordic Gradient"
              value="#6366F1 → #1D4ED8"
              className="bg-nordic-gradient"
            />
          </div>
        </section>

        {/* Secondary Colors */}
        <section className="mb-16">
          <h2 className="font-space-grotesk mb-6 text-2xl font-semibold text-brand-slate-gray dark:text-white">
            Secondary Colors
          </h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <ColorSwatch
              name="Sky Mist"
              value="#E0F2FE"
              className="bg-brand-sky-mist"
            />
            <ColorSwatch
              name="Fresh Green"
              value="#10B981"
              className="bg-brand-fresh-green"
            />
            <ColorSwatch
              name="Glacier White"
              value="#F9FAFB"
              className="bg-brand-glacier-white dark:bg-gray-700"
            />
          </div>
        </section>

        {/* Accent Colors */}
        <section className="mb-16">
          <h2 className="font-space-grotesk mb-6 text-2xl font-semibold text-brand-slate-gray dark:text-white">
            Accent Colors
          </h2>
          <div className="grid gap-6 sm:grid-cols-2">
            <ColorSwatch
              name="Nordic Purple"
              value="#6366F1"
              className="bg-brand-nordic-purple"
            />
            <ColorSwatch
              name="Sunbeam Yellow"
              value="#FACC15"
              className="bg-brand-sunbeam-yellow"
            />
          </div>
        </section>

        {/* Neutral Colors */}
        <section className="mb-16">
          <h2 className="font-space-grotesk mb-6 text-2xl font-semibold text-brand-slate-gray dark:text-white">
            Neutral Colors
          </h2>
          <div className="grid gap-6 sm:grid-cols-2">
            <ColorSwatch
              name="Slate Gray"
              value="#334155"
              className="bg-brand-slate-gray"
            />
            <ColorSwatch
              name="Frosted Steel"
              value="#CBD5E1"
              className="bg-brand-frosted-steel"
            />
          </div>
        </section>

        {/* Status Colors */}
        <section>
          <h2 className="font-space-grotesk mb-6 text-2xl font-semibold text-brand-slate-gray dark:text-white">
            Status Colors
          </h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <ColorSwatch
              name="Success"
              value="#10B981"
              className="bg-green-500"
            />
            <ColorSwatch
              name="Warning"
              value="#F59E0B"
              className="bg-amber-500"
            />
            <ColorSwatch name="Error" value="#EF4444" className="bg-red-500" />
            <ColorSwatch name="Info" value="#3B82F6" className="bg-blue-500" />
          </div>
        </section>
      </div>
    </div>
  ),
}
