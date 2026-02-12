import type { Meta, StoryObj } from '@storybook/react'

const meta = {
  title: 'Design System/Foundation/Shadows',
  parameters: {
    layout: 'fullscreen',
    options: {
      showPanel: false,
    },
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const ShadowCard = ({
  name,
  className,
  code,
}: {
  name: string
  className: string
  code: string
}) => (
  <div className="text-center">
    <div
      className={`mx-auto mb-4 h-24 w-24 rounded-lg bg-white dark:bg-gray-800 ${className}`}
    />
    <h3 className="mb-1 font-space-grotesk text-sm font-semibold text-brand-slate-gray dark:text-white">
      {name}
    </h3>
    <code className="font-jetbrains text-xs text-gray-500 dark:text-gray-400">
      {code}
    </code>
  </div>
)

export const Shadows: Story = {
  render: () => (
    <div className="min-h-screen bg-gray-100 p-8 dark:bg-gray-900">
      <div className="mx-auto max-w-5xl">
        <h1 className="mb-4 font-space-grotesk text-4xl font-bold text-brand-cloud-blue dark:text-blue-400">
          Shadows
        </h1>
        <p className="mb-12 font-inter text-lg text-brand-slate-gray dark:text-gray-300">
          Elevation system for creating visual hierarchy and depth.
        </p>

        {/* Box Shadows */}
        <section className="mb-16">
          <h2 className="mb-8 font-space-grotesk text-2xl font-semibold text-brand-slate-gray dark:text-white">
            Box Shadows
          </h2>
          <div className="grid grid-cols-2 gap-8 md:grid-cols-4 lg:grid-cols-6">
            <ShadowCard name="None" className="" code="shadow-none" />
            <ShadowCard name="Small" className="shadow-sm" code="shadow-sm" />
            <ShadowCard name="Default" className="shadow" code="shadow" />
            <ShadowCard name="Medium" className="shadow-md" code="shadow-md" />
            <ShadowCard name="Large" className="shadow-lg" code="shadow-lg" />
            <ShadowCard name="XL" className="shadow-xl" code="shadow-xl" />
          </div>
        </section>

        {/* Usage Guidelines */}
        <section className="mb-16">
          <h2 className="mb-6 font-space-grotesk text-2xl font-semibold text-brand-slate-gray dark:text-white">
            Usage Guidelines
          </h2>
          <div className="grid gap-6 md:grid-cols-2">
            <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
              <h3 className="mb-3 font-space-grotesk text-lg font-semibold text-brand-slate-gray dark:text-white">
                Elevation Levels
              </h3>
              <ul className="space-y-2 font-inter text-sm text-gray-600 dark:text-gray-400">
                <li>
                  <code className="text-brand-cloud-blue">shadow-sm</code> — Cards
                  at rest, subtle separation
                </li>
                <li>
                  <code className="text-brand-cloud-blue">shadow</code> — Default
                  card elevation
                </li>
                <li>
                  <code className="text-brand-cloud-blue">shadow-md</code> — Hover
                  states, dropdowns
                </li>
                <li>
                  <code className="text-brand-cloud-blue">shadow-lg</code> —
                  Modals, popovers
                </li>
                <li>
                  <code className="text-brand-cloud-blue">shadow-xl</code> —
                  Important overlays
                </li>
              </ul>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
              <h3 className="mb-3 font-space-grotesk text-lg font-semibold text-brand-slate-gray dark:text-white">
                Interactive Shadows
              </h3>
              <p className="mb-4 font-inter text-sm text-gray-600 dark:text-gray-400">
                Use transition utilities for smooth hover effects:
              </p>
              <code className="block rounded bg-gray-100 p-3 font-jetbrains text-xs text-brand-slate-gray dark:bg-gray-700 dark:text-gray-200">
                hover:shadow-lg transition-shadow
              </code>
            </div>
          </div>
        </section>

        {/* Interactive Example */}
        <section>
          <h2 className="mb-6 font-space-grotesk text-2xl font-semibold text-brand-slate-gray dark:text-white">
            Interactive Example
          </h2>
          <div className="grid gap-6 md:grid-cols-3">
            <div className="cursor-pointer rounded-xl border border-gray-200 bg-white p-6 shadow-sm transition-all hover:shadow-lg dark:border-gray-700 dark:bg-gray-800">
              <h3 className="mb-2 font-space-grotesk font-semibold text-brand-slate-gray dark:text-white">
                Card Hover
              </h3>
              <p className="font-inter text-sm text-gray-600 dark:text-gray-400">
                Hover over this card to see the shadow transition
              </p>
            </div>

            <div className="cursor-pointer rounded-xl border border-gray-200 bg-white p-6 shadow-sm transition-all hover:-translate-y-1 hover:shadow-xl dark:border-gray-700 dark:bg-gray-800">
              <h3 className="mb-2 font-space-grotesk font-semibold text-brand-slate-gray dark:text-white">
                Lift Effect
              </h3>
              <p className="font-inter text-sm text-gray-600 dark:text-gray-400">
                Combined with translate for lift effect
              </p>
            </div>

            <div className="cursor-pointer rounded-xl border border-gray-200 bg-white p-6 shadow-sm transition-all hover:border-brand-cloud-blue hover:shadow-brand-cloud-blue/20 hover:shadow-lg dark:border-gray-700 dark:bg-gray-800">
              <h3 className="mb-2 font-space-grotesk font-semibold text-brand-slate-gray dark:text-white">
                Colored Shadow
              </h3>
              <p className="font-inter text-sm text-gray-600 dark:text-gray-400">
                Brand-colored shadow on hover
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  ),
}
