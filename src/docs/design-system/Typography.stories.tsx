import type { Meta, StoryObj } from '@storybook/nextjs-vite'

const meta = {
  title: 'Design System/Foundation/Typography',
  parameters: {
    layout: 'fullscreen',
    options: {
      showPanel: false,
    },
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const FontSample = ({
  name,
  className,
  description,
  usage,
}: {
  name: string
  className: string
  description: string
  usage: string
}) => (
  <div className="rounded-xl border border-gray-200 bg-gray-50 p-6 dark:border-gray-700 dark:bg-gray-800">
    <div className="mb-4 flex items-center justify-between">
      <span className="font-inter text-sm font-semibold text-brand-slate-gray dark:text-gray-400">
        {name}
      </span>
      <code className="rounded bg-gray-200 px-2 py-1 font-jetbrains text-xs text-gray-600 dark:bg-gray-700 dark:text-gray-400">
        {className}
      </code>
    </div>
    <p className={`mb-4 text-3xl text-brand-cloud-blue dark:text-blue-400 ${className}`}>
      Cloud Native Days Norway
    </p>
    <p className="mb-2 font-inter text-sm text-brand-slate-gray dark:text-gray-300">
      {description}
    </p>
    <p className="font-inter text-xs text-gray-500 dark:text-gray-500">
      <strong>Usage:</strong> {usage}
    </p>
  </div>
)

export const Typography: Story = {
  render: () => (
    <div className="min-h-screen bg-white p-8 dark:bg-gray-900">
      <div className="mx-auto max-w-5xl">
        <h1 className="mb-4 font-space-grotesk text-4xl font-bold text-brand-cloud-blue dark:text-blue-400">
          Typography
        </h1>
        <p className="mb-12 font-inter text-lg text-brand-slate-gray dark:text-gray-300">
          Font families and type scale designed for developer-focused content.
        </p>

        {/* Display Fonts */}
        <section className="mb-16">
          <h2 className="mb-6 font-space-grotesk text-2xl font-semibold text-brand-slate-gray dark:text-white">
            Display Fonts
          </h2>
          <div className="space-y-6">
            <FontSample
              name="JetBrains Mono"
              className="font-jetbrains"
              description="Monospaced font with a developer-focused design. Perfect for code snippets, technical headers, and creating that terminal aesthetic."
              usage="Hero text, code blocks, technical headings"
            />
            <FontSample
              name="Space Grotesk"
              className="font-space-grotesk"
              description="Clean, geometric sans-serif with personality. Balances professionalism with a friendly, approachable feel."
              usage="Section headers, card titles, navigation"
            />
            <FontSample
              name="Bricolage Grotesque"
              className="font-bricolage"
              description="Expressive grotesque with rebellious energy. Adds visual interest while maintaining readability."
              usage="Special headings, speaker names, emphasis"
            />
          </div>
        </section>

        {/* Body Fonts */}
        <section className="mb-16">
          <h2 className="mb-6 font-space-grotesk text-2xl font-semibold text-brand-slate-gray dark:text-white">
            Body Fonts
          </h2>
          <div className="space-y-6">
            <FontSample
              name="Inter"
              className="font-inter"
              description="Highly legible variable font designed for screens. Excellent for body text and UI elements."
              usage="Body text, descriptions, form labels"
            />
            <FontSample
              name="IBM Plex Sans"
              className="font-ibm-plex-sans"
              description="Technical heritage with excellent readability. Great alternative for body text in technical contexts."
              usage="Documentation, technical descriptions"
            />
            <FontSample
              name="Atkinson Hyperlegible"
              className="font-atkinson"
              description="Designed specifically for maximum readability. Strong accessibility signal for inclusive design."
              usage="Accessible content, important notices"
            />
          </div>
        </section>

        {/* Type Scale */}
        <section className="mb-16">
          <h2 className="mb-6 font-space-grotesk text-2xl font-semibold text-brand-slate-gray dark:text-white">
            Type Scale
          </h2>
          <div className="space-y-4 rounded-xl border border-gray-200 bg-gray-50 p-6 dark:border-gray-700 dark:bg-gray-800">
            <div className="flex items-baseline justify-between border-b border-gray-200 pb-3 dark:border-gray-700">
              <span className="font-space-grotesk text-5xl text-brand-slate-gray dark:text-white">
                Heading 1
              </span>
              <code className="font-jetbrains text-xs text-gray-500">text-5xl</code>
            </div>
            <div className="flex items-baseline justify-between border-b border-gray-200 pb-3 dark:border-gray-700">
              <span className="font-space-grotesk text-4xl text-brand-slate-gray dark:text-white">
                Heading 2
              </span>
              <code className="font-jetbrains text-xs text-gray-500">text-4xl</code>
            </div>
            <div className="flex items-baseline justify-between border-b border-gray-200 pb-3 dark:border-gray-700">
              <span className="font-space-grotesk text-3xl text-brand-slate-gray dark:text-white">
                Heading 3
              </span>
              <code className="font-jetbrains text-xs text-gray-500">text-3xl</code>
            </div>
            <div className="flex items-baseline justify-between border-b border-gray-200 pb-3 dark:border-gray-700">
              <span className="font-space-grotesk text-2xl text-brand-slate-gray dark:text-white">
                Heading 4
              </span>
              <code className="font-jetbrains text-xs text-gray-500">text-2xl</code>
            </div>
            <div className="flex items-baseline justify-between border-b border-gray-200 pb-3 dark:border-gray-700">
              <span className="font-inter text-lg text-brand-slate-gray dark:text-white">
                Body Large
              </span>
              <code className="font-jetbrains text-xs text-gray-500">text-lg</code>
            </div>
            <div className="flex items-baseline justify-between border-b border-gray-200 pb-3 dark:border-gray-700">
              <span className="font-inter text-base text-brand-slate-gray dark:text-white">
                Body
              </span>
              <code className="font-jetbrains text-xs text-gray-500">text-base</code>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="font-inter text-sm text-brand-slate-gray dark:text-white">
                Small
              </span>
              <code className="font-jetbrains text-xs text-gray-500">text-sm</code>
            </div>
          </div>
        </section>

        {/* Font Pairings */}
        <section>
          <h2 className="mb-6 font-space-grotesk text-2xl font-semibold text-brand-slate-gray dark:text-white">
            Recommended Pairings
          </h2>
          <div className="grid gap-6 md:grid-cols-3">
            <div className="rounded-xl border border-brand-cloud-blue/20 bg-brand-sky-mist p-6 dark:border-blue-500/20 dark:bg-gray-800">
              <span className="mb-2 inline-block rounded bg-brand-cloud-blue px-2 py-1 font-inter text-xs text-white">
                Primary
              </span>
              <h3 className="mb-1 font-jetbrains text-xl text-brand-cloud-blue dark:text-blue-400">
                JetBrains Mono
              </h3>
              <p className="font-inter text-sm text-brand-slate-gray dark:text-gray-300">
                + Inter
              </p>
              <p className="mt-3 font-inter text-xs text-gray-500 dark:text-gray-500">
                Dev terminal meets clean UI
              </p>
            </div>

            <div className="rounded-xl border border-brand-fresh-green/20 bg-brand-fresh-green/10 p-6 dark:border-green-500/20 dark:bg-gray-800">
              <span className="mb-2 inline-block rounded bg-brand-fresh-green px-2 py-1 font-inter text-xs text-white">
                Modern
              </span>
              <h3 className="mb-1 font-space-grotesk text-xl text-brand-fresh-green dark:text-green-400">
                Space Grotesk
              </h3>
              <p className="font-ibm-plex-sans text-sm text-brand-slate-gray dark:text-gray-300">
                + IBM Plex Sans
              </p>
              <p className="mt-3 font-inter text-xs text-gray-500 dark:text-gray-500">
                Playful headings with structured body
              </p>
            </div>

            <div className="rounded-xl border border-brand-nordic-purple/20 bg-brand-nordic-purple/10 p-6 dark:border-purple-500/20 dark:bg-gray-800">
              <span className="mb-2 inline-block rounded bg-brand-nordic-purple px-2 py-1 font-inter text-xs text-white">
                Accessible
              </span>
              <h3 className="mb-1 font-bricolage text-xl text-brand-nordic-purple dark:text-purple-400">
                Bricolage Grotesque
              </h3>
              <p className="font-atkinson text-sm text-brand-slate-gray dark:text-gray-300">
                + Atkinson Hyperlegible
              </p>
              <p className="mt-3 font-inter text-xs text-gray-500 dark:text-gray-500">
                Edgy but accessible
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  ),
}
