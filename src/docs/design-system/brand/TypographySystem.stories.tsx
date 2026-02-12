import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { typography } from '@/docs/design-system/data'
import { TypographyShowcase } from '@/docs/components/TypographyShowcase'

const meta = {
  title: 'Design System/Brand/Typography',
  parameters: {
    layout: 'fullscreen',
    options: {
      showPanel: false,
    },
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const TypographySystem: Story = {
  render: () => (
    <div className="min-h-screen bg-white p-8 dark:bg-gray-900">
      <div className="mx-auto max-w-5xl">
        <h1 className="font-space-grotesk mb-4 text-4xl font-bold text-brand-cloud-blue dark:text-blue-400">
          Typography System
        </h1>
        <p className="font-inter mb-12 text-lg text-brand-slate-gray dark:text-gray-300">
          Font families carefully selected for developer-focused content with
          personality and readability.
        </p>

        {/* Primary Fonts */}
        <section className="mb-16">
          <h2 className="font-space-grotesk mb-6 text-2xl font-semibold text-brand-slate-gray dark:text-white">
            Primary Fonts (Headings &amp; Branding)
          </h2>
          <p className="font-inter mb-8 text-brand-slate-gray dark:text-gray-400">
            Display fonts with personality for headlines, hero text, and brand
            moments.
          </p>
          <div className="space-y-6">
            {typography.primary.map((font) => (
              <TypographyShowcase key={font.name} font={font} />
            ))}
          </div>
        </section>

        {/* Secondary Fonts */}
        <section className="mb-16">
          <h2 className="font-space-grotesk mb-6 text-2xl font-semibold text-brand-slate-gray dark:text-white">
            Secondary Fonts (Body &amp; UI)
          </h2>
          <p className="font-inter mb-8 text-brand-slate-gray dark:text-gray-400">
            Highly legible fonts optimized for body text, descriptions, and
            interface elements.
          </p>
          <div className="space-y-6">
            {typography.secondary.map((font) => (
              <TypographyShowcase key={font.name} font={font} />
            ))}
          </div>
        </section>

        {/* Font Pairings */}
        <section className="mb-16">
          <h2 className="font-space-grotesk mb-6 text-2xl font-semibold text-brand-slate-gray dark:text-white">
            Recommended Font Pairings
          </h2>
          <div className="grid gap-6 md:grid-cols-3">
            <div className="rounded-xl border border-brand-cloud-blue/20 bg-brand-sky-mist p-6 dark:border-blue-500/20 dark:bg-gray-800">
              <span className="font-inter mb-3 inline-block rounded bg-brand-cloud-blue px-2 py-1 text-xs text-white">
                Primary
              </span>
              <p className="font-jetbrains text-2xl text-brand-cloud-blue dark:text-blue-400">
                JetBrains Mono
              </p>
              <p className="font-inter mt-2 text-brand-slate-gray dark:text-gray-300">
                + Inter
              </p>
              <p className="font-inter mt-4 text-sm text-gray-500 dark:text-gray-500">
                &ldquo;Dev terminal meets clean UI&rdquo;
              </p>
            </div>

            <div className="rounded-xl border border-brand-fresh-green/20 bg-brand-fresh-green/10 p-6 dark:border-green-500/20 dark:bg-gray-800">
              <span className="font-inter mb-3 inline-block rounded bg-brand-fresh-green px-2 py-1 text-xs text-white">
                Modern
              </span>
              <p className="font-space-grotesk text-2xl text-brand-fresh-green dark:text-green-400">
                Space Grotesk
              </p>
              <p className="font-ibm-plex-sans mt-2 text-brand-slate-gray dark:text-gray-300">
                + IBM Plex Sans
              </p>
              <p className="font-inter mt-4 text-sm text-gray-500 dark:text-gray-500">
                &ldquo;Playful headings with structured body&rdquo;
              </p>
            </div>

            <div className="rounded-xl border border-brand-nordic-purple/20 bg-brand-nordic-purple/10 p-6 dark:border-purple-500/20 dark:bg-gray-800">
              <span className="font-inter mb-3 inline-block rounded bg-brand-nordic-purple px-2 py-1 text-xs text-white">
                Accessible
              </span>
              <p className="font-bricolage text-2xl text-brand-nordic-purple dark:text-purple-400">
                Bricolage Grotesque
              </p>
              <p className="font-atkinson mt-2 text-brand-slate-gray dark:text-gray-300">
                + Atkinson Hyperlegible
              </p>
              <p className="font-inter mt-4 text-sm text-gray-500 dark:text-gray-500">
                &ldquo;Edgy but accessible&rdquo;
              </p>
            </div>
          </div>
        </section>

        {/* Type Scale */}
        <section className="mb-16">
          <h2 className="font-space-grotesk mb-6 text-2xl font-semibold text-brand-slate-gray dark:text-white">
            Type Scale
          </h2>
          <div className="space-y-4 rounded-xl border border-gray-200 bg-gray-50 p-6 dark:border-gray-700 dark:bg-gray-800">
            {[
              {
                label: 'Display',
                size: 'text-5xl',
                font: 'font-space-grotesk',
              },
              { label: 'H1', size: 'text-4xl', font: 'font-space-grotesk' },
              { label: 'H2', size: 'text-3xl', font: 'font-space-grotesk' },
              { label: 'H3', size: 'text-2xl', font: 'font-space-grotesk' },
              { label: 'H4', size: 'text-xl', font: 'font-space-grotesk' },
              { label: 'Body Large', size: 'text-lg', font: 'font-inter' },
              { label: 'Body', size: 'text-base', font: 'font-inter' },
              { label: 'Small', size: 'text-sm', font: 'font-inter' },
              { label: 'Caption', size: 'text-xs', font: 'font-inter' },
            ].map((item, i) => (
              <div
                key={i}
                className="flex items-baseline justify-between border-b border-gray-200 pb-3 last:border-0 last:pb-0 dark:border-gray-700"
              >
                <span
                  className={`${item.size} ${item.font} text-brand-slate-gray dark:text-white`}
                >
                  {item.label}
                </span>
                <code className="font-jetbrains text-xs text-gray-500">
                  {item.size} {item.font}
                </code>
              </div>
            ))}
          </div>
        </section>

        {/* Usage Guidelines */}
        <section>
          <h2 className="font-space-grotesk mb-6 text-2xl font-semibold text-brand-slate-gray dark:text-white">
            Usage Guidelines
          </h2>
          <div className="grid gap-6 md:grid-cols-2">
            <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
              <h3 className="font-space-grotesk mb-4 text-lg font-semibold text-brand-slate-gray dark:text-white">
                When to Use Each Font
              </h3>
              <ul className="font-inter space-y-2 text-sm text-gray-600 dark:text-gray-400">
                <li>
                  <strong className="text-brand-cloud-blue">
                    JetBrains Mono
                  </strong>{' '}
                  — Hero text, code blocks, technical headings
                </li>
                <li>
                  <strong className="text-brand-fresh-green">
                    Space Grotesk
                  </strong>{' '}
                  — Section headers, card titles, navigation
                </li>
                <li>
                  <strong className="text-brand-nordic-purple">
                    Bricolage Grotesque
                  </strong>{' '}
                  — Special headings, speaker names
                </li>
                <li>
                  <strong className="text-brand-slate-gray dark:text-gray-300">
                    Inter
                  </strong>{' '}
                  — Body text, descriptions, form labels
                </li>
                <li>
                  <strong className="text-brand-slate-gray dark:text-gray-300">
                    IBM Plex Sans
                  </strong>{' '}
                  — Technical documentation
                </li>
                <li>
                  <strong className="text-brand-slate-gray dark:text-gray-300">
                    Atkinson
                  </strong>{' '}
                  — Accessibility-focused content
                </li>
              </ul>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
              <h3 className="font-space-grotesk mb-4 text-lg font-semibold text-brand-slate-gray dark:text-white">
                Best Practices
              </h3>
              <ul className="font-inter space-y-2 text-sm text-gray-600 dark:text-gray-400">
                <li>✓ Limit to 2-3 fonts per page for cohesion</li>
                <li>✓ Use font weights for hierarchy, not just size</li>
                <li>✓ Maintain consistent line heights (1.5-1.75 for body)</li>
                <li>✓ Test readability on both light and dark themes</li>
                <li>✓ Consider mobile reading experience</li>
                <li>✓ Use semantic HTML elements with appropriate fonts</li>
              </ul>
            </div>
          </div>
        </section>
      </div>
    </div>
  ),
}
