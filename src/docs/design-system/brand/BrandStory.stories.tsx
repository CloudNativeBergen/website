import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import {
  CloudIcon,
  SparklesIcon,
  HeartIcon,
  UsersIcon,
} from '@heroicons/react/24/outline'

const meta = {
  title: 'Design System/Brand/Brand Story',
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    options: {
      showPanel: false,
    },
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const BrandStory: Story = {
  render: () => (
    <div className="min-h-screen bg-white dark:bg-gray-900">
      {/* Hero */}
      <div className="bg-linear-to-br from-brand-cloud-blue via-brand-nordic-purple to-brand-cloud-blue px-8 py-20">
        <div className="mx-auto max-w-4xl text-center">
          <h1 className="font-space-grotesk text-5xl font-bold text-white">
            Brand Story &amp; Design Principles
          </h1>
          <p className="font-inter mt-6 text-xl text-white/90">
            Cloud Native Days Norway embodies the spirit of Norway&apos;s tech
            community: innovative yet grounded, collaborative yet independent,
            modern yet respectful of tradition.
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-8 py-16">
        {/* Inspiration */}
        <section className="mb-16">
          <h2 className="font-space-grotesk mb-6 text-3xl font-semibold text-brand-cloud-blue dark:text-blue-400">
            Visual Inspiration
          </h2>
          <p className="font-inter mb-8 text-lg text-brand-slate-gray dark:text-gray-300">
            Our visual identity draws inspiration from Bergen&apos;s dramatic
            landscapes—the meeting of mountains and sea, the interplay of mist
            and clarity, the harmony of natural and urban elements.
          </p>
          <div className="grid gap-6 md:grid-cols-2">
            <div className="rounded-xl border border-brand-cloud-blue/20 bg-brand-sky-mist p-6 dark:border-blue-500/20 dark:bg-gray-800">
              <h3 className="font-space-grotesk mb-3 text-lg font-semibold text-brand-cloud-blue dark:text-blue-400">
                Nordic Minimalism
              </h3>
              <p className="font-inter text-brand-slate-gray dark:text-gray-300">
                Clean, functional design that lets content shine without
                unnecessary complexity. Every element serves a purpose.
              </p>
            </div>
            <div className="rounded-xl border border-brand-fresh-green/20 bg-brand-fresh-green/10 p-6 dark:border-green-500/20 dark:bg-gray-800">
              <h3 className="font-space-grotesk mb-3 text-lg font-semibold text-brand-fresh-green dark:text-green-400">
                Developer-First
              </h3>
              <p className="font-inter text-brand-slate-gray dark:text-gray-300">
                Every design choice considers the developer experience and
                technical audience. We speak their language visually and
                verbally.
              </p>
            </div>
          </div>
        </section>

        {/* Design Principles */}
        <section className="mb-16">
          <h2 className="font-space-grotesk mb-8 text-3xl font-semibold text-brand-cloud-blue dark:text-blue-400">
            Design Principles
          </h2>
          <div className="grid gap-6 md:grid-cols-2">
            <div className="flex gap-4 rounded-xl border border-gray-200 bg-gray-50 p-6 dark:border-gray-700 dark:bg-gray-800">
              <CloudIcon className="h-10 w-10 shrink-0 text-brand-cloud-blue" />
              <div>
                <h3 className="font-space-grotesk mb-2 text-lg font-semibold text-brand-slate-gray dark:text-white">
                  Developer-First
                </h3>
                <p className="font-inter text-sm text-gray-600 dark:text-gray-400">
                  Every design choice considers the developer experience and
                  technical audience.
                </p>
              </div>
            </div>

            <div className="flex gap-4 rounded-xl border border-gray-200 bg-gray-50 p-6 dark:border-gray-700 dark:bg-gray-800">
              <HeartIcon className="h-10 w-10 shrink-0 text-brand-fresh-green" />
              <div>
                <h3 className="font-space-grotesk mb-2 text-lg font-semibold text-brand-slate-gray dark:text-white">
                  Accessible by Design
                </h3>
                <p className="font-inter text-sm text-gray-600 dark:text-gray-400">
                  We prioritize accessibility and inclusive design in all brand
                  applications.
                </p>
              </div>
            </div>

            <div className="flex gap-4 rounded-xl border border-gray-200 bg-gray-50 p-6 dark:border-gray-700 dark:bg-gray-800">
              <SparklesIcon className="h-10 w-10 shrink-0 text-brand-nordic-purple" />
              <div>
                <h3 className="font-space-grotesk mb-2 text-lg font-semibold text-brand-slate-gray dark:text-white">
                  Nordic Minimalism
                </h3>
                <p className="font-inter text-sm text-gray-600 dark:text-gray-400">
                  Clean, functional design that lets content shine without
                  unnecessary complexity.
                </p>
              </div>
            </div>

            <div className="flex gap-4 rounded-xl border border-gray-200 bg-gray-50 p-6 dark:border-gray-700 dark:bg-gray-800">
              <UsersIcon className="h-10 w-10 shrink-0 text-brand-sunbeam-yellow" />
              <div>
                <h3 className="font-space-grotesk mb-2 text-lg font-semibold text-brand-slate-gray dark:text-white">
                  Community Driven
                </h3>
                <p className="font-inter text-sm text-gray-600 dark:text-gray-400">
                  Our brand reflects the collaborative spirit of the open source
                  community.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Voice & Tone */}
        <section className="mb-16">
          <h2 className="font-space-grotesk mb-6 text-3xl font-semibold text-brand-cloud-blue dark:text-blue-400">
            Voice &amp; Tone
          </h2>
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-8 dark:border-gray-700 dark:bg-gray-800">
            <div className="grid gap-8 md:grid-cols-3">
              <div>
                <h3 className="font-space-grotesk mb-3 text-lg font-semibold text-brand-slate-gray dark:text-white">
                  We Are
                </h3>
                <ul className="font-inter space-y-2 text-sm text-gray-600 dark:text-gray-400">
                  <li>✓ Technical but approachable</li>
                  <li>✓ Professional but friendly</li>
                  <li>✓ Confident but humble</li>
                  <li>✓ Inclusive and welcoming</li>
                </ul>
              </div>
              <div>
                <h3 className="font-space-grotesk mb-3 text-lg font-semibold text-brand-slate-gray dark:text-white">
                  We Avoid
                </h3>
                <ul className="font-inter space-y-2 text-sm text-gray-600 dark:text-gray-400">
                  <li>✗ Jargon without context</li>
                  <li>✗ Overly formal language</li>
                  <li>✗ Exclusive terminology</li>
                  <li>✗ Marketing speak</li>
                </ul>
              </div>
              <div>
                <h3 className="font-space-grotesk mb-3 text-lg font-semibold text-brand-slate-gray dark:text-white">
                  Our Promise
                </h3>
                <p className="font-inter text-sm text-gray-600 dark:text-gray-400">
                  We create an inclusive, educational environment where cloud
                  native enthusiasts can learn, share, and grow together.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Accessibility */}
        <section>
          <h2 className="font-space-grotesk mb-6 text-3xl font-semibold text-brand-cloud-blue dark:text-blue-400">
            Accessibility Standards
          </h2>
          <div className="rounded-xl bg-brand-sky-mist p-6 dark:bg-gray-800">
            <ul className="font-inter grid gap-4 text-brand-slate-gray md:grid-cols-2 dark:text-gray-300">
              <li className="flex items-start gap-2">
                <span className="mt-1 text-brand-fresh-green">✓</span>
                All components meet WCAG 2.1 AA compliance
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1 text-brand-fresh-green">✓</span>
                Color contrast ratios meet accessibility requirements
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1 text-brand-fresh-green">✓</span>
                Focus states are clearly visible and consistent
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1 text-brand-fresh-green">✓</span>
                Alt text provided for all images and icons
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1 text-brand-fresh-green">✓</span>
                Semantic HTML structure for screen readers
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1 text-brand-fresh-green">✓</span>
                Keyboard navigation fully supported
              </li>
            </ul>
          </div>
        </section>
      </div>
    </div>
  ),
}
