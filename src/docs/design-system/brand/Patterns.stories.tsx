import type { Meta, StoryObj } from '@storybook/nextjs-vite'

const meta = {
  title: 'Design System/Brand/Cloud Native Patterns',
  parameters: {
    layout: 'fullscreen',
    options: {
      showPanel: false,
    },
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const CloudNativePatterns: Story = {
  render: () => (
    <div className="min-h-screen bg-white p-8 dark:bg-gray-900">
      <div className="mx-auto max-w-5xl">
        <h1 className="font-space-grotesk mb-4 text-4xl font-bold text-brand-cloud-blue dark:text-blue-400">
          Cloud Native Pattern System
        </h1>
        <p className="font-inter mb-12 text-lg text-brand-slate-gray dark:text-gray-300">
          Animated background patterns incorporating authentic cloud native
          project logos with intelligent focus/diffusion effects.
        </p>

        {/* Pattern Overview */}
        <section className="mb-16">
          <h2 className="font-space-grotesk mb-6 text-2xl font-semibold text-brand-slate-gray dark:text-white">
            Pattern Overview
          </h2>
          <div className="grid gap-6 md:grid-cols-3">
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-6 dark:border-gray-700 dark:bg-gray-800">
              <div className="relative mb-4 flex h-32 items-center justify-center overflow-hidden rounded-lg bg-linear-to-br from-slate-900 to-blue-900">
                <span className="font-inter text-xs text-white/60">
                  Dark pattern preview
                </span>
              </div>
              <h3 className="font-space-grotesk mb-2 font-semibold text-brand-slate-gray dark:text-white">
                Dark Variant
              </h3>
              <p className="font-inter text-sm text-gray-600 dark:text-gray-400">
                White icons on dark gradient background. Best for hero sections
                and dramatic headers.
              </p>
            </div>

            <div className="rounded-xl border border-gray-200 bg-gray-50 p-6 dark:border-gray-700 dark:bg-gray-800">
              <div className="relative mb-4 flex h-32 items-center justify-center overflow-hidden rounded-lg border-2 border-brand-frosted-steel bg-white">
                <span className="font-inter text-xs text-gray-400">
                  Light pattern preview
                </span>
              </div>
              <h3 className="font-space-grotesk mb-2 font-semibold text-brand-slate-gray dark:text-white">
                Light Variant
              </h3>
              <p className="font-inter text-sm text-gray-600 dark:text-gray-400">
                Colored icons on light background. Perfect for content sections
                and cards.
              </p>
            </div>

            <div className="rounded-xl border border-gray-200 bg-gray-50 p-6 dark:border-gray-700 dark:bg-gray-800">
              <div className="relative mb-4 flex h-32 items-center justify-center overflow-hidden rounded-lg bg-brand-gradient">
                <span className="font-inter text-xs text-white/60">
                  Brand pattern preview
                </span>
              </div>
              <h3 className="font-space-grotesk mb-2 font-semibold text-brand-slate-gray dark:text-white">
                Brand Variant
              </h3>
              <p className="font-inter text-sm text-gray-600 dark:text-gray-400">
                White icons on brand gradient. Ideal for premium sections and
                CTAs.
              </p>
            </div>
          </div>
        </section>

        {/* Focus/Diffusion Technology */}
        <section className="mb-16">
          <h2 className="font-space-grotesk mb-6 text-2xl font-semibold text-brand-slate-gray dark:text-white">
            Focus/Diffusion Technology
          </h2>
          <div className="rounded-xl border border-brand-cloud-blue/20 bg-brand-sky-mist p-6 dark:border-blue-500/20 dark:bg-gray-800">
            <div className="grid gap-6 md:grid-cols-3">
              <div>
                <h3 className="font-space-grotesk mb-3 font-semibold text-brand-cloud-blue dark:text-blue-400">
                  Small Icons (Sharp Focus)
                </h3>
                <ul className="font-inter space-y-2 text-sm text-brand-slate-gray dark:text-gray-300">
                  <li>• Higher opacity</li>
                  <li>• Vibrant colors</li>
                  <li>• No blur effect</li>
                  <li>• Foreground attention</li>
                </ul>
              </div>
              <div>
                <h3 className="font-space-grotesk mb-3 font-semibold text-brand-fresh-green dark:text-green-400">
                  Medium Icons (Balanced)
                </h3>
                <ul className="font-inter space-y-2 text-sm text-brand-slate-gray dark:text-gray-300">
                  <li>• Moderate opacity</li>
                  <li>• Subtle blur</li>
                  <li>• Visual texture</li>
                  <li>• Non-distracting</li>
                </ul>
              </div>
              <div>
                <h3 className="font-space-grotesk mb-3 font-semibold text-brand-nordic-purple dark:text-purple-400">
                  Large Icons (Soft Diffusion)
                </h3>
                <ul className="font-inter space-y-2 text-sm text-brand-slate-gray dark:text-gray-300">
                  <li>• Lower opacity</li>
                  <li>• Muted colors</li>
                  <li>• Soft blur</li>
                  <li>• Background depth</li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* Configuration Options */}
        <section className="mb-16">
          <h2 className="font-space-grotesk mb-6 text-2xl font-semibold text-brand-slate-gray dark:text-white">
            Configuration Presets
          </h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
              <div>
                <h3 className="font-space-grotesk font-semibold text-brand-slate-gray dark:text-white">
                  Content Background
                </h3>
                <p className="font-inter text-sm text-gray-600 dark:text-gray-400">
                  Subtle pattern for content sections and cards
                </p>
              </div>
              <code className="font-jetbrains rounded bg-gray-100 px-3 py-1 text-xs text-gray-700 dark:bg-gray-700 dark:text-gray-300">
                opacity: 0.06 • baseSize: 25 • iconCount: 18
              </code>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
              <div>
                <h3 className="font-space-grotesk font-semibold text-brand-slate-gray dark:text-white">
                  Hero Section
                </h3>
                <p className="font-inter text-sm text-gray-600 dark:text-gray-400">
                  Perfect balance for wide hero sections
                </p>
              </div>
              <code className="font-jetbrains rounded bg-gray-100 px-3 py-1 text-xs text-gray-700 dark:bg-gray-700 dark:text-gray-300">
                opacity: 0.15 • baseSize: 52 • iconCount: 38
              </code>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
              <div>
                <h3 className="font-space-grotesk font-semibold text-brand-slate-gray dark:text-white">
                  Dramatic Background
                </h3>
                <p className="font-inter text-sm text-gray-600 dark:text-gray-400">
                  Dense, dramatic effect for special sections
                </p>
              </div>
              <code className="font-jetbrains rounded bg-gray-100 px-3 py-1 text-xs text-gray-700 dark:bg-gray-700 dark:text-gray-300">
                opacity: 0.20 • baseSize: 58 • iconCount: 55
              </code>
            </div>
          </div>
        </section>

        {/* Available Project Icons */}
        <section className="mb-16">
          <h2 className="font-space-grotesk mb-6 text-2xl font-semibold text-brand-slate-gray dark:text-white">
            Available CNCF Project Icons
          </h2>
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-6 dark:border-gray-700 dark:bg-gray-800">
            <div className="grid gap-6 md:grid-cols-3">
              <div>
                <h3 className="font-space-grotesk mb-3 text-sm font-semibold text-brand-slate-gray dark:text-white">
                  Container Orchestration
                </h3>
                <ul className="font-inter space-y-1 text-sm text-gray-600 dark:text-gray-400">
                  <li>Kubernetes</li>
                  <li>containerd</li>
                  <li>etcd</li>
                </ul>
              </div>
              <div>
                <h3 className="font-space-grotesk mb-3 text-sm font-semibold text-brand-slate-gray dark:text-white">
                  Observability &amp; Monitoring
                </h3>
                <ul className="font-inter space-y-1 text-sm text-gray-600 dark:text-gray-400">
                  <li>Prometheus</li>
                  <li>Jaeger</li>
                  <li>Falco</li>
                </ul>
              </div>
              <div>
                <h3 className="font-space-grotesk mb-3 text-sm font-semibold text-brand-slate-gray dark:text-white">
                  Service Mesh &amp; Networking
                </h3>
                <ul className="font-inter space-y-1 text-sm text-gray-600 dark:text-gray-400">
                  <li>Istio</li>
                  <li>Envoy</li>
                  <li>Cilium</li>
                </ul>
              </div>
              <div>
                <h3 className="font-space-grotesk mb-3 text-sm font-semibold text-brand-slate-gray dark:text-white">
                  Packaging &amp; GitOps
                </h3>
                <ul className="font-inter space-y-1 text-sm text-gray-600 dark:text-gray-400">
                  <li>Helm</li>
                  <li>Argo</li>
                  <li>Crossplane</li>
                </ul>
              </div>
              <div>
                <h3 className="font-space-grotesk mb-3 text-sm font-semibold text-brand-slate-gray dark:text-white">
                  Storage &amp; Data
                </h3>
                <ul className="font-inter space-y-1 text-sm text-gray-600 dark:text-gray-400">
                  <li>CloudNativePG</li>
                  <li>Harbor</li>
                  <li>Vitess</li>
                </ul>
              </div>
              <div>
                <h3 className="font-space-grotesk mb-3 text-sm font-semibold text-brand-slate-gray dark:text-white">
                  Other Projects
                </h3>
                <ul className="font-inter space-y-1 text-sm text-gray-600 dark:text-gray-400">
                  <li>gRPC, Backstage</li>
                  <li>KubeVirt, OpenFeature</li>
                  <li>WasmEdge, Shipwright</li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* Live Pattern Demo */}
        <section className="mb-16">
          <h2 className="font-space-grotesk mb-6 text-2xl font-semibold text-brand-slate-gray dark:text-white">
            Live Pattern Demo
          </h2>
          <p className="font-inter mb-6 text-gray-600 dark:text-gray-400">
            The CloudNativePattern component renders animated CNCF project
            icons. View the live pattern on the{' '}
            <a
              href="/branding#pattern-system"
              className="text-brand-cloud-blue hover:underline"
            >
              branding page
            </a>
            .
          </p>

          {/* Full Width Demo */}
          <div className="mb-8 overflow-hidden rounded-xl">
            <div className="relative flex h-64 items-center justify-center bg-linear-to-br from-slate-900 via-blue-900 to-slate-800">
              <div className="text-center">
                <h3 className="font-space-grotesk text-3xl font-bold text-white">
                  Cloud Native Days
                </h3>
                <p className="font-inter mt-2 text-lg text-brand-frosted-steel">
                  Hero Section Example
                </p>
                <p className="font-inter mt-4 text-xs text-white/40">
                  (Pattern renders with animated CNCF icons in production)
                </p>
              </div>
            </div>
          </div>

          {/* Side by Side Comparison */}
          <div className="grid gap-6 md:grid-cols-2">
            <div className="overflow-hidden rounded-xl">
              <div className="relative flex h-48 items-center justify-center border-2 border-brand-frosted-steel bg-white">
                <div className="rounded-lg bg-white/80 px-6 py-4 text-center backdrop-blur-sm">
                  <h4 className="font-space-grotesk text-lg font-semibold text-brand-slate-gray">
                    Light Variant
                  </h4>
                  <p className="font-inter mt-1 text-sm text-gray-600">
                    Great for cards &amp; content sections
                  </p>
                </div>
              </div>
            </div>

            <div className="overflow-hidden rounded-xl">
              <div className="relative flex h-48 items-center justify-center bg-brand-gradient">
                <div className="rounded-lg bg-black/20 px-6 py-4 text-center backdrop-blur-sm">
                  <h4 className="font-space-grotesk text-lg font-semibold text-white">
                    Brand Variant
                  </h4>
                  <p className="font-inter mt-1 text-sm text-white/80">
                    Perfect for CTAs &amp; premium sections
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Usage Example */}
        <section>
          <h2 className="font-space-grotesk mb-6 text-2xl font-semibold text-brand-slate-gray dark:text-white">
            Usage Example
          </h2>
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-6 dark:border-gray-700 dark:bg-gray-800">
            <pre className="font-jetbrains overflow-x-auto text-sm text-brand-slate-gray dark:text-gray-200">
              {`import { CloudNativePattern } from '@/components/CloudNativePattern'

<div className="relative overflow-hidden rounded-xl bg-brand-gradient">
  <CloudNativePattern
    className="z-0"
    opacity={0.15}
    animated={true}
    variant="brand"
    baseSize={52}
    iconCount={38}
  />
  <div className="relative z-10">
    {/* Your content here */}
  </div>
</div>`}
            </pre>
          </div>
        </section>
      </div>
    </div>
  ),
}
