import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { Button } from '@/components/Button'

const meta = {
  title: 'Design System/Examples/Hero Sections',
  parameters: {
    layout: 'fullscreen',
    options: {
      showPanel: false,
    },
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const HeroSections: Story = {
  render: () => (
    <div className="min-h-screen bg-white p-8 dark:bg-gray-900">
      <div className="mx-auto max-w-5xl">
        <h1 className="font-space-grotesk mb-4 text-4xl font-bold text-brand-cloud-blue dark:text-blue-400">
          Hero Section Examples
        </h1>
        <p className="font-inter mb-12 text-lg text-brand-slate-gray dark:text-gray-300">
          Hero sections are the primary visual impact points for conference
          pages. They combine brand gradients, typography, and optional cloud
          native patterns.
        </p>

        {/* Brand Gradient Hero */}
        <section className="mb-16">
          <h2 className="font-space-grotesk mb-6 text-2xl font-semibold text-brand-slate-gray dark:text-white">
            Brand Gradient Hero
          </h2>
          <div className="relative overflow-hidden rounded-xl bg-brand-gradient p-12 text-center">
            <div className="absolute inset-0 z-10 rounded-xl bg-black/30" />
            <div className="relative z-20">
              <h1 className="font-jetbrains mb-4 text-4xl font-bold text-white">
                Cloud Native Days Norway
              </h1>
              <p className="font-space-grotesk mb-8 text-xl text-white/90">
                June 15-16, 2026 &bull; Oslo, Norway
              </p>
              <p className="font-inter mx-auto mb-8 max-w-2xl text-lg text-white/95">
                Join the Nordic cloud native community for a day of cutting-edge
                talks, hands-on workshops, and meaningful connections.
              </p>
              <div className="flex flex-col justify-center gap-4 sm:flex-row">
                <Button variant="primary" className="font-space-grotesk">
                  Register Now
                </Button>
                <Button className="font-space-grotesk bg-transparent text-white shadow-[inset_0_0_0_2px_white] transition-colors duration-200 hover:bg-white hover:text-brand-cloud-blue hover:shadow-[inset_0_0_0_2px_white]">
                  Submit a Talk
                </Button>
              </div>
            </div>
          </div>
          <div className="mt-4 rounded-lg bg-gray-50 p-4 dark:bg-gray-800">
            <pre className="font-jetbrains overflow-x-auto text-sm text-gray-700 dark:text-gray-300">
              {`<div className="relative overflow-hidden rounded-xl bg-brand-gradient p-12 text-center">
  <div className="absolute inset-0 z-10 bg-black/30" />
  <div className="relative z-20">
    <h1 className="font-jetbrains text-4xl font-bold text-white">...</h1>
    <p className="font-space-grotesk text-xl text-white/90">...</p>
    <Button variant="primary">Register Now</Button>
  </div>
</div>`}
            </pre>
          </div>
        </section>

        {/* Dark Slate Hero */}
        <section className="mb-16">
          <h2 className="font-space-grotesk mb-6 text-2xl font-semibold text-brand-slate-gray dark:text-white">
            Dark Slate Hero
          </h2>
          <div className="relative overflow-hidden rounded-xl bg-linear-to-br from-slate-900 via-slate-800 to-blue-900 p-12 text-center">
            <div className="relative z-20">
              <h1 className="font-jetbrains mb-4 text-4xl font-bold text-white">
                CFP Now Open
              </h1>
              <p className="font-space-grotesk mb-8 text-xl text-brand-sky-mist">
                Share your expertise with the community
              </p>
              <p className="font-inter mx-auto mb-8 max-w-2xl text-lg text-gray-300">
                We&apos;re looking for talks on Kubernetes, observability, cloud
                native security, and emerging technologies.
              </p>
              <Button variant="primary" className="font-space-grotesk">
                Submit Your Talk
              </Button>
            </div>
          </div>
          <div className="mt-4 rounded-lg bg-gray-50 p-4 dark:bg-gray-800">
            <pre className="font-jetbrains overflow-x-auto text-sm text-gray-700 dark:text-gray-300">
              {`<div className="bg-linear-to-br from-slate-900 via-slate-800 to-blue-900 p-12">
  <h1 className="font-jetbrains text-4xl font-bold text-white">...</h1>
  <p className="font-space-grotesk text-xl text-brand-sky-mist">...</p>
</div>`}
            </pre>
          </div>
        </section>

        {/* Light Hero with Border */}
        <section className="mb-16">
          <h2 className="font-space-grotesk mb-6 text-2xl font-semibold text-brand-slate-gray dark:text-white">
            Light Hero with Border
          </h2>
          <div className="rounded-xl border-2 border-brand-cloud-blue/20 bg-brand-sky-mist p-12 text-center">
            <h1 className="font-jetbrains mb-4 text-4xl font-bold text-brand-cloud-blue">
              Speaker Applications
            </h1>
            <p className="font-space-grotesk mb-8 text-xl text-brand-slate-gray">
              Join our lineup of amazing speakers
            </p>
            <p className="font-inter mx-auto mb-8 max-w-2xl text-lg text-gray-600">
              We welcome speakers of all experience levels. First-time speakers
              receive mentorship and support.
            </p>
            <Button variant="primary" className="font-space-grotesk">
              Apply Now
            </Button>
          </div>
          <div className="mt-4 rounded-lg bg-gray-50 p-4 dark:bg-gray-800">
            <pre className="font-jetbrains overflow-x-auto text-sm text-gray-700 dark:text-gray-300">
              {`<div className="rounded-xl border-2 border-brand-cloud-blue/20 bg-brand-sky-mist p-12">
  <h1 className="font-jetbrains text-4xl font-bold text-brand-cloud-blue">...</h1>
  <p className="font-space-grotesk text-xl text-brand-slate-gray">...</p>
</div>`}
            </pre>
          </div>
        </section>

        {/* Hero Guidelines */}
        <section className="mb-16">
          <h2 className="font-space-grotesk mb-6 text-2xl font-semibold text-brand-slate-gray dark:text-white">
            Hero Design Guidelines
          </h2>
          <div className="grid gap-6 md:grid-cols-2">
            <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
              <h3 className="font-space-grotesk mb-4 text-lg font-semibold text-brand-cloud-blue">
                Typography Hierarchy
              </h3>
              <ul className="font-inter space-y-2 text-sm text-gray-600 dark:text-gray-300">
                <li>
                  • <strong>Title:</strong> JetBrains Mono, 3xl-4xl, bold
                </li>
                <li>
                  • <strong>Subtitle:</strong> Space Grotesk, xl-2xl, regular
                </li>
                <li>
                  • <strong>Body:</strong> Inter, base-lg, regular
                </li>
                <li>
                  • <strong>Buttons:</strong> Space Grotesk, semibold
                </li>
              </ul>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
              <h3 className="font-space-grotesk mb-4 text-lg font-semibold text-brand-fresh-green">
                Background Options
              </h3>
              <ul className="font-inter space-y-2 text-sm text-gray-600 dark:text-gray-300">
                <li>
                  •{' '}
                  <code className="rounded bg-gray-100 px-1 text-xs dark:bg-gray-700">
                    bg-brand-gradient
                  </code>{' '}
                  - Primary brand gradient
                </li>
                <li>
                  •{' '}
                  <code className="rounded bg-gray-100 px-1 text-xs dark:bg-gray-700">
                    from-slate-900 to-blue-900
                  </code>{' '}
                  - Dark dramatic
                </li>
                <li>
                  •{' '}
                  <code className="rounded bg-gray-100 px-1 text-xs dark:bg-gray-700">
                    bg-brand-sky-mist
                  </code>{' '}
                  - Light subtle
                </li>
                <li>
                  •{' '}
                  <code className="rounded bg-gray-100 px-1 text-xs dark:bg-gray-700">
                    bg-white + border
                  </code>{' '}
                  - Clean minimal
                </li>
              </ul>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
              <h3 className="font-space-grotesk mb-4 text-lg font-semibold text-brand-nordic-purple">
                Cloud Native Pattern
              </h3>
              <ul className="font-inter space-y-2 text-sm text-gray-600 dark:text-gray-300">
                <li>• Add animated CNCF project icons as background</li>
                <li>• Use opacity 0.10-0.20 for subtle effect</li>
                <li>• Choose variant: dark, light, or brand</li>
                <li>
                  • Position with z-index: pattern z-0, overlay z-10, content
                  z-20
                </li>
              </ul>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
              <h3 className="font-space-grotesk mb-4 text-lg font-semibold text-accent-yellow">
                Best Practices
              </h3>
              <ul className="font-inter space-y-2 text-sm text-gray-600 dark:text-gray-300">
                <li>
                  • Always add overlay on gradient backgrounds for text
                  readability
                </li>
                <li>• Use max-w-2xl on body text for optimal line length</li>
                <li>• Center text and stack buttons on mobile</li>
                <li>• Include clear primary CTA with high contrast</li>
              </ul>
            </div>
          </div>
        </section>

        {/* With Cloud Native Pattern Note */}
        <section>
          <div className="rounded-xl border border-brand-cloud-blue/20 bg-brand-sky-mist p-6">
            <h3 className="font-space-grotesk mb-3 text-lg font-semibold text-brand-cloud-blue">
              Adding Cloud Native Patterns
            </h3>
            <p className="font-inter mb-4 text-sm text-brand-slate-gray">
              To add animated CNCF project icons to hero sections, use the{' '}
              <code className="rounded bg-white px-1 text-xs">
                CloudNativePattern
              </code>{' '}
              component:
            </p>
            <pre className="font-jetbrains overflow-x-auto rounded-lg bg-white p-4 text-sm text-gray-700">
              {`import { CloudNativePattern } from '@/components/CloudNativePattern'

<div className="relative overflow-hidden bg-brand-gradient">
  <CloudNativePattern
    className="z-0"
    opacity={0.15}
    animated={true}
    variant="brand"
    baseSize={52}
    iconCount={38}
  />
  <div className="absolute inset-0 z-10 bg-black/30" />
  <div className="relative z-20">
    {/* Content */}
  </div>
</div>`}
            </pre>
          </div>
        </section>
      </div>
    </div>
  ),
}
