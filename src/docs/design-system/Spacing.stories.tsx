import type { Meta, StoryObj } from '@storybook/nextjs-vite'

const meta = {
  title: 'Design System/Foundation/Spacing',
  parameters: {
    layout: 'fullscreen',
    options: {
      showPanel: false,
    },
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const SpacingBlock = ({ size, pixels }: { size: string; pixels: string }) => (
  <div className="flex items-center gap-4">
    <code className="font-jetbrains w-12 text-sm text-gray-500">{size}</code>
    <div
      className="h-6 rounded bg-brand-cloud-blue"
      style={{ width: pixels }}
    />
    <span className="font-inter text-sm text-brand-slate-gray dark:text-gray-400">
      {pixels}
    </span>
  </div>
)

export const Spacing: Story = {
  render: () => (
    <div className="min-h-screen bg-white p-8 dark:bg-gray-900">
      <div className="mx-auto max-w-4xl">
        <h1 className="font-space-grotesk mb-4 text-4xl font-bold text-brand-cloud-blue dark:text-blue-400">
          Spacing
        </h1>
        <p className="font-inter mb-12 text-lg text-brand-slate-gray dark:text-gray-300">
          Consistent spacing scale based on Tailwind CSS defaults for harmonious
          layouts.
        </p>

        {/* Base Scale */}
        <section className="mb-16">
          <h2 className="font-space-grotesk mb-6 text-2xl font-semibold text-brand-slate-gray dark:text-white">
            Base Scale
          </h2>
          <div className="space-y-4 rounded-xl border border-gray-200 bg-gray-50 p-6 dark:border-gray-700 dark:bg-gray-800">
            <SpacingBlock size="0" pixels="0px" />
            <SpacingBlock size="0.5" pixels="2px" />
            <SpacingBlock size="1" pixels="4px" />
            <SpacingBlock size="2" pixels="8px" />
            <SpacingBlock size="3" pixels="12px" />
            <SpacingBlock size="4" pixels="16px" />
            <SpacingBlock size="6" pixels="24px" />
            <SpacingBlock size="8" pixels="32px" />
            <SpacingBlock size="12" pixels="48px" />
            <SpacingBlock size="16" pixels="64px" />
            <SpacingBlock size="24" pixels="96px" />
          </div>
        </section>

        {/* Common Patterns */}
        <section className="mb-16">
          <h2 className="font-space-grotesk mb-6 text-2xl font-semibold text-brand-slate-gray dark:text-white">
            Common Patterns
          </h2>
          <div className="grid gap-6 md:grid-cols-2">
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-6 dark:border-gray-700 dark:bg-gray-800">
              <h3 className="font-space-grotesk mb-4 text-lg font-semibold text-brand-slate-gray dark:text-white">
                Component Padding
              </h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-inter text-sm text-gray-600 dark:text-gray-400">
                    Small buttons
                  </span>
                  <code className="font-jetbrains text-xs text-brand-cloud-blue">
                    px-3 py-1.5
                  </code>
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-inter text-sm text-gray-600 dark:text-gray-400">
                    Medium buttons
                  </span>
                  <code className="font-jetbrains text-xs text-brand-cloud-blue">
                    px-4 py-2
                  </code>
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-inter text-sm text-gray-600 dark:text-gray-400">
                    Large buttons
                  </span>
                  <code className="font-jetbrains text-xs text-brand-cloud-blue">
                    px-6 py-3
                  </code>
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-inter text-sm text-gray-600 dark:text-gray-400">
                    Cards
                  </span>
                  <code className="font-jetbrains text-xs text-brand-cloud-blue">
                    p-6
                  </code>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 bg-gray-50 p-6 dark:border-gray-700 dark:bg-gray-800">
              <h3 className="font-space-grotesk mb-4 text-lg font-semibold text-brand-slate-gray dark:text-white">
                Layout Gaps
              </h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-inter text-sm text-gray-600 dark:text-gray-400">
                    Inline elements
                  </span>
                  <code className="font-jetbrains text-xs text-brand-cloud-blue">
                    gap-2
                  </code>
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-inter text-sm text-gray-600 dark:text-gray-400">
                    Form fields
                  </span>
                  <code className="font-jetbrains text-xs text-brand-cloud-blue">
                    gap-4
                  </code>
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-inter text-sm text-gray-600 dark:text-gray-400">
                    Card grids
                  </span>
                  <code className="font-jetbrains text-xs text-brand-cloud-blue">
                    gap-6
                  </code>
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-inter text-sm text-gray-600 dark:text-gray-400">
                    Page sections
                  </span>
                  <code className="font-jetbrains text-xs text-brand-cloud-blue">
                    gap-16
                  </code>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Breakpoints */}
        <section>
          <h2 className="font-space-grotesk mb-6 text-2xl font-semibold text-brand-slate-gray dark:text-white">
            Breakpoints
          </h2>
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-6 dark:border-gray-700 dark:bg-gray-800">
            <div className="space-y-4">
              {[
                { name: 'sm', value: '640px', usage: 'Small tablets' },
                { name: 'md', value: '768px', usage: 'Tablets' },
                { name: 'lg', value: '1024px', usage: 'Small laptops' },
                { name: 'xl', value: '1280px', usage: 'Desktops' },
                { name: '2xl', value: '1536px', usage: 'Large screens' },
              ].map((bp) => (
                <div
                  key={bp.name}
                  className="flex items-center justify-between border-b border-gray-200 pb-3 last:border-0 last:pb-0 dark:border-gray-700"
                >
                  <div className="flex items-center gap-4">
                    <code className="font-jetbrains rounded bg-brand-cloud-blue/10 px-2 py-1 text-sm text-brand-cloud-blue dark:bg-blue-900/30 dark:text-blue-400">
                      {bp.name}:
                    </code>
                    <span className="font-inter text-sm text-brand-slate-gray dark:text-gray-300">
                      {bp.value}
                    </span>
                  </div>
                  <span className="font-inter text-sm text-gray-500 dark:text-gray-500">
                    {bp.usage}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  ),
}
