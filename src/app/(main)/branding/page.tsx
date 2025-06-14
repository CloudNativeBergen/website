import { Metadata } from 'next'
import { Container } from '@/components/Container'
import { Button } from '@/components/Button'
import { DiamondIcon } from '@/components/DiamondIcon'
import { SpeakerCard } from '@/components/SpeakerCard'
import Image from 'next/image'

// Import cloud native icons for the pattern examples
import KubernetesIcon from '@/images/icons/kubernetes-icon-white.svg'
import PrometheusIcon from '@/images/icons/prometheus-icon-white.svg'
import IstioIcon from '@/images/icons/istio-icon-white.svg'
import HelmIcon from '@/images/icons/helm-icon-white.svg'

import {
  CloudIcon,
  ServerIcon,
  CubeIcon,
  CircleStackIcon,
  CommandLineIcon,
  ShieldCheckIcon,
  ChartBarIcon,
  CogIcon,
  BoltIcon,
  GlobeAltIcon,
  LinkIcon,
  ArrowPathIcon,
  QueueListIcon,
  WrenchScrewdriverIcon,
  EyeIcon,
  RocketLaunchIcon,
} from '@heroicons/react/24/outline'
import {
  CloudIcon as CloudIconSolid,
  ServerIcon as ServerIconSolid,
  ShieldCheckIcon as ShieldCheckIconSolid,
} from '@heroicons/react/24/solid'

// Import branding components and data
import {
  ColorSwatch,
  TypographyShowcase,
  IconShowcase,
  InteractivePatternPreview,
  BrandingHeroSection,
  BrandingExampleHeroSection,
  PatternExample,
} from '@/components/branding'
import { colorPalette, typography } from '@/lib/branding/data'

export const metadata: Metadata = {
  title: 'Brand Guidelines - Cloud Native Day Bergen',
  description: 'Brand guidelines and design system for Cloud Native Day Bergen',
}

export default function BrandingPage() {

  return (
    <div className="bg-brand-glacier-white">
      {/* Hero Section */}
      <BrandingHeroSection />

      {/* Navigation Menu */}
      <nav className="sticky top-0 z-50 border-b border-brand-cloud-blue/20 bg-white/95 backdrop-blur-sm">
        <Container>
          <div className="flex items-center justify-center py-4">
            <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-2">
              <a
                href="#brand-story"
                className="font-inter text-sm font-medium text-brand-slate-gray transition-colors hover:text-brand-cloud-blue"
              >
                Brand Story
              </a>
              <a
                href="#color-palette"
                className="font-inter text-sm font-medium text-brand-slate-gray transition-colors hover:text-brand-cloud-blue"
              >
                Colors
              </a>
              <a
                href="#typography"
                className="font-inter text-sm font-medium text-brand-slate-gray transition-colors hover:text-brand-cloud-blue"
              >
                Typography
              </a>
              <a
                href="#icon-library"
                className="font-inter text-sm font-medium text-brand-slate-gray transition-colors hover:text-brand-cloud-blue"
              >
                Icons
              </a>
              <a
                href="#brand-in-action"
                className="font-inter text-sm font-medium text-brand-slate-gray transition-colors hover:text-brand-cloud-blue"
              >
                In Action
              </a>
              <a
                href="#background-utilities"
                className="font-inter text-sm font-medium text-brand-slate-gray transition-colors hover:text-brand-cloud-blue"
              >
                Backgrounds
              </a>
              <a
                href="#pattern-system"
                className="font-inter text-sm font-medium text-brand-slate-gray transition-colors hover:text-brand-cloud-blue"
              >
                Patterns
              </a>
              <a
                href="#design-principles"
                className="font-inter text-sm font-medium text-brand-slate-gray transition-colors hover:text-brand-cloud-blue"
              >
                Principles
              </a>
              <a
                href="#brand-resources"
                className="font-inter text-sm font-medium text-brand-slate-gray transition-colors hover:text-brand-cloud-blue"
              >
                Resources
              </a>
            </div>
          </div>
        </Container>
      </nav>

      {/* Brand Story */}
      <section id="brand-story" className="py-20">
        <Container>
          <div className="mx-auto max-w-4xl">
            <h2 className="font-space-grotesk mb-8 text-center text-4xl font-bold text-brand-cloud-blue">
              Our Brand Story
            </h2>
            <div className="grid grid-cols-1 items-center gap-12 md:grid-cols-2">
              <div>
                <p className="font-inter mb-6 text-lg leading-relaxed text-brand-slate-gray">
                  Cloud Native Day Bergen embodies the spirit of Norway&apos;s
                  tech community: innovative yet grounded, collaborative yet
                  independent, modern yet respectful of tradition.
                </p>
                <p className="font-inter mb-6 text-lg leading-relaxed text-brand-slate-gray">
                  Our visual identity draws inspiration from Bergen&apos;s
                  dramatic landscapes—the meeting of mountains and sea, the
                  interplay of mist and clarity, the harmony of natural and
                  urban elements.
                </p>
                <p className="font-atkinson text-lg leading-relaxed text-brand-slate-gray">
                  We celebrate the &quot;nerdy and proud&quot; developer culture
                  while maintaining accessibility and inclusivity for all
                  members of our community.
                </p>
              </div>
              <div className="rounded-2xl bg-brand-sky-mist p-8">
                <h3 className="font-space-grotesk mb-4 text-2xl font-semibold text-brand-cloud-blue">
                  Brand Values
                </h3>
                <ul className="space-y-3">
                  <li className="flex items-center">
                    <DiamondIcon className="mr-3 h-5 w-5 flex-shrink-0 text-brand-fresh-green" />
                    <span className="font-inter text-brand-slate-gray">
                      Open Source Spirit
                    </span>
                  </li>
                  <li className="flex items-center">
                    <DiamondIcon className="mr-3 h-5 w-5 flex-shrink-0 text-brand-fresh-green" />
                    <span className="font-inter text-brand-slate-gray">
                      Technical Excellence
                    </span>
                  </li>
                  <li className="flex items-center">
                    <DiamondIcon className="mr-3 h-5 w-5 flex-shrink-0 text-brand-fresh-green" />
                    <span className="font-inter text-brand-slate-gray">
                      Community First
                    </span>
                  </li>
                  <li className="flex items-center">
                    <DiamondIcon className="mr-3 h-5 w-5 flex-shrink-0 text-brand-fresh-green" />
                    <span className="font-inter text-brand-slate-gray">
                      Accessibility & Inclusion
                    </span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </Container>
      </section>

      {/* Color Palette */}
      <section id="color-palette" className="bg-white py-20">
        <Container>
          <div className="mb-16 text-center">
            <h2 className="font-space-grotesk mb-6 text-4xl font-bold text-brand-cloud-blue">
              Color Palette
            </h2>
            <p className="font-inter mx-auto max-w-3xl text-xl text-brand-slate-gray">
              Our colors reflect Bergen&apos;s natural beauty—from the deep
              blues of Norwegian fjords to the fresh greens of nordic forests,
              balanced with modern tech-inspired accents.
            </p>
          </div>

          {Object.entries(colorPalette).map(([category, colors]) => (
            <div key={category} className="mb-16">
              <h3 className="font-space-grotesk mb-8 text-2xl font-semibold text-brand-slate-gray capitalize">
                {category} Colors
              </h3>
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                {colors.map((color) => (
                  <ColorSwatch key={color.name} color={color} />
                ))}
              </div>
            </div>
          ))}
        </Container>
      </section>

      {/* Typography */}
      <section id="typography" className="bg-brand-glacier-white py-20">
        <Container>
          <div className="mb-16 text-center">
            <h2 className="font-space-grotesk mb-6 text-4xl font-bold text-brand-cloud-blue">
              Typography
            </h2>
            <p className="font-inter mx-auto max-w-3xl text-xl text-brand-slate-gray">
              Our typography system balances developer-friendly monospace fonts
              with clean, readable sans-serifs to create a distinctive yet
              accessible visual voice.
            </p>
          </div>

          <div className="mb-16">
            <h3 className="font-space-grotesk mb-8 text-2xl font-semibold text-brand-slate-gray">
              Primary Fonts (Headings & Branding)
            </h3>
            <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
              {typography.primary.map((font) => (
                <TypographyShowcase key={font.name} font={font} />
              ))}
            </div>
          </div>

          <div>
            <h3 className="font-space-grotesk mb-8 text-2xl font-semibold text-brand-slate-gray">
              Secondary Fonts (Body & UI Text)
            </h3>
            <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
              {typography.secondary.map((font) => (
                <TypographyShowcase key={font.name} font={font} />
              ))}
            </div>
          </div>
        </Container>
      </section>

      {/* Icon Library */}
      <section id="icon-library" className="bg-white py-20">
        <Container>
          <div className="mb-16 text-center">
            <h2 className="font-space-grotesk mb-6 text-4xl font-bold text-brand-cloud-blue">
              Icon Library
            </h2>
            <p className="font-inter mx-auto max-w-3xl text-xl text-brand-slate-gray">
              A comprehensive set of cloud native and Kubernetes-inspired icons
              designed to align with our brand principles and represent key
              technology concepts.
            </p>
          </div>

          <div className="space-y-16">
            {/* Platform Icons */}
            <div>
              <h3 className="font-space-grotesk mb-8 text-2xl font-semibold text-brand-slate-gray">
                Platform Icons
              </h3>
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
                <IconShowcase
                  name="Cloud Infrastructure"
                  description="Cloud computing platform representing scalable, distributed infrastructure"
                  component={
                    <CloudIcon className="h-12 w-12 text-brand-cloud-blue" />
                  }
                  usage="Cloud sections, infrastructure topics, platform overviews"
                />
                <IconShowcase
                  name="Server & Compute"
                  description="Server infrastructure representing compute resources and workload execution"
                  component={
                    <ServerIcon className="h-12 w-12 text-brand-fresh-green" />
                  }
                  usage="Compute sections, server management, infrastructure diagrams"
                />
                <IconShowcase
                  name="Container & Packaging"
                  description="Container technology representing application packaging and isolation"
                  component={
                    <CubeIcon className="h-12 w-12 text-accent-yellow" />
                  }
                  usage="Containerization topics, Docker sections, packaging concepts"
                />
                <IconShowcase
                  name="Queue & Lists"
                  description="Task queues and ordered processing for distributed workloads"
                  component={
                    <QueueListIcon className="h-12 w-12 text-accent-purple" />
                  }
                  usage="Queue management, task processing, workflow systems"
                />
              </div>
            </div>

            {/* Data & Storage Icons */}
            <div>
              <h3 className="font-space-grotesk mb-8 text-2xl font-semibold text-brand-slate-gray">
                Data & Storage Icons
              </h3>
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
                <IconShowcase
                  name="Database & Storage"
                  description="Data storage and database systems for persistent application state"
                  component={
                    <CircleStackIcon className="h-12 w-12 text-accent-purple" />
                  }
                  usage="Database sections, storage topics, persistence patterns"
                />
                <IconShowcase
                  name="Command Line & CLI"
                  description="Developer tools and command-line interfaces for system interaction"
                  component={
                    <CommandLineIcon className="h-12 w-12 text-primary-500" />
                  }
                  usage="Developer tools, CLI sections, terminal operations"
                />
                <IconShowcase
                  name="Configuration & Settings"
                  description="System configuration and operational settings management"
                  component={
                    <CogIcon className="h-12 w-12 text-neutral-slate" />
                  }
                  usage="Configuration topics, settings panels, system management"
                />
                <IconShowcase
                  name="Tools & Utilities"
                  description="Development and operational tools for system maintenance"
                  component={
                    <WrenchScrewdriverIcon className="h-12 w-12 text-brand-fresh-green" />
                  }
                  usage="DevTools, utilities, maintenance, system operations"
                />
              </div>
            </div>

            {/* Operations Icons */}
            <div>
              <h3 className="font-space-grotesk mb-8 text-2xl font-semibold text-brand-slate-gray">
                Operations Icons
              </h3>
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
                <IconShowcase
                  name="Security & Protection"
                  description="Security measures and protection mechanisms for cloud native applications"
                  component={
                    <ShieldCheckIcon className="h-12 w-12 text-secondary-500" />
                  }
                  usage="Security sections, compliance topics, trust and safety"
                />
                <IconShowcase
                  name="Monitoring & Analytics"
                  description="Observability dashboards with metrics, monitoring, and analytics"
                  component={
                    <ChartBarIcon className="h-12 w-12 text-brand-cloud-blue" />
                  }
                  usage="Observability topics, monitoring sections, analytics dashboards"
                />
                <IconShowcase
                  name="Performance & Speed"
                  description="High-performance computing and rapid deployment capabilities"
                  component={
                    <BoltIcon className="h-12 w-12 text-accent-yellow" />
                  }
                  usage="Performance topics, speed optimization, rapid deployment"
                />
                <IconShowcase
                  name="Observability & Insights"
                  description="System visibility and monitoring for operational awareness"
                  component={
                    <EyeIcon className="h-12 w-12 text-accent-purple" />
                  }
                  usage="Observability, monitoring, system insights, visibility"
                />
              </div>
            </div>

            {/* Network & Connectivity Icons */}
            <div>
              <h3 className="font-space-grotesk mb-8 text-2xl font-semibold text-brand-slate-gray">
                Network & Connectivity Icons
              </h3>
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
                <IconShowcase
                  name="Global Distribution"
                  description="Global network distribution and multi-region deployment strategies"
                  component={
                    <GlobeAltIcon className="h-12 w-12 text-brand-cloud-blue" />
                  }
                  usage="Global topics, multi-region, international deployment"
                />
                <IconShowcase
                  name="Service Mesh & Links"
                  description="Service interconnection and communication patterns in microservices"
                  component={
                    <LinkIcon className="h-12 w-12 text-accent-purple" />
                  }
                  usage="Service mesh, microservices communication, API connections"
                />
                <IconShowcase
                  name="CI/CD & Automation"
                  description="Continuous integration and deployment with automated workflows"
                  component={
                    <ArrowPathIcon className="h-12 w-12 text-brand-fresh-green" />
                  }
                  usage="CI/CD sections, automation topics, workflow management"
                />
                <IconShowcase
                  name="Deployment & Launch"
                  description="Application deployment and launch processes"
                  component={
                    <RocketLaunchIcon className="h-12 w-12 text-accent-yellow" />
                  }
                  usage="Deployment topics, launch processes, go-live activities"
                />
              </div>
            </div>

            {/* Icon Styles & Usage */}
            <div>
              <h3 className="font-space-grotesk mb-8 text-2xl font-semibold text-brand-slate-gray">
                Icon Styles & Usage
              </h3>
              <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
                <IconShowcase
                  name="Outline Style"
                  description="Clean, stroke-based icons perfect for most UI elements and content sections"
                  component={
                    <div className="flex space-x-4">
                      <CloudIcon className="h-8 w-8 text-brand-cloud-blue" />
                      <ServerIcon className="h-8 w-8 text-brand-fresh-green" />
                      <ShieldCheckIcon className="h-8 w-8 text-secondary-500" />
                    </div>
                  }
                  usage="General UI, content sections, navigation, feature lists"
                />
                <IconShowcase
                  name="Solid Style"
                  description="Filled icons for emphasis, status indicators, and important highlights"
                  component={
                    <div className="flex space-x-4">
                      <CloudIconSolid className="h-8 w-8 text-brand-cloud-blue" />
                      <ServerIconSolid className="h-8 w-8 text-brand-fresh-green" />
                      <ShieldCheckIconSolid className="h-8 w-8 text-secondary-500" />
                    </div>
                  }
                  usage="Status indicators, CTAs, highlights, success states"
                />
              </div>
            </div>

            {/* Usage Guidelines */}
            <div className="rounded-2xl bg-brand-glacier-white p-8">
              <h3 className="font-space-grotesk mb-6 text-2xl font-semibold text-brand-slate-gray">
                Heroicons Usage Guidelines
              </h3>
              <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
                <div>
                  <h4 className="font-space-grotesk mb-3 text-lg font-semibold text-brand-cloud-blue">
                    Sizing & Scale
                  </h4>
                  <div className="space-y-4">
                    <div className="flex items-center space-x-4">
                      <CloudIcon className="h-4 w-4 text-brand-slate-gray" />
                      <span className="font-inter text-sm text-brand-slate-gray">
                        16px (w-4 h-4) - Inline with text
                      </span>
                    </div>
                    <div className="flex items-center space-x-4">
                      <CloudIcon className="h-6 w-6 text-brand-slate-gray" />
                      <span className="font-inter text-sm text-brand-slate-gray">
                        24px (w-6 h-6) - Standard UI elements
                      </span>
                    </div>
                    <div className="flex items-center space-x-4">
                      <CloudIcon className="h-8 w-8 text-brand-slate-gray" />
                      <span className="font-inter text-sm text-brand-slate-gray">
                        32px (w-8 h-8) - Section headers
                      </span>
                    </div>
                    <div className="flex items-center space-x-4">
                      <CloudIcon className="h-12 w-12 text-brand-slate-gray" />
                      <span className="font-inter text-sm text-brand-slate-gray">
                        48px (w-12 h-12) - Hero sections
                      </span>
                    </div>
                  </div>
                </div>
                <div>
                  <h4 className="font-space-grotesk mb-3 text-lg font-semibold text-brand-cloud-blue">
                    Color Application
                  </h4>
                  <div className="space-y-3">
                    <p className="font-inter text-sm text-brand-slate-gray">
                      Heroicons inherit text color and work with our full brand
                      palette:
                    </p>
                    <div className="flex items-center space-x-2">
                      <CloudIcon className="h-5 w-5 text-brand-cloud-blue" />
                      <ServerIcon className="h-5 w-5 text-brand-fresh-green" />
                      <CubeIcon className="h-5 w-5 text-accent-yellow" />
                      <ShieldCheckIcon className="h-5 w-5 text-accent-purple" />
                      <CogIcon className="h-5 w-5 text-brand-slate-gray" />
                    </div>
                    <p className="font-inter text-xs text-gray-600">
                      Use brand colors to create visual hierarchy and context
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-8">
                <h4 className="font-space-grotesk mb-4 text-lg font-semibold text-brand-cloud-blue">
                  Code Examples
                </h4>
                <div className="space-y-4 rounded-lg bg-gray-100 p-4">
                  <div>
                    <p className="font-inter mb-2 text-sm text-gray-700">
                      Import from Heroicons:
                    </p>
                    <code className="font-jetbrains block rounded bg-white p-3 text-sm text-gray-800">
                      {`import { CloudIcon, ServerIcon } from '@heroicons/react/24/outline'`}
                    </code>
                  </div>
                  <div>
                    <p className="font-inter mb-2 text-sm text-gray-700">
                      Usage with Tailwind sizing:
                    </p>
                    <code className="font-jetbrains block rounded bg-white p-3 text-sm text-gray-800">
                      {`<CloudIcon className="w-6 h-6 text-brand-cloud-blue" />`}
                    </code>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Container>
      </section>

      {/* Usage Examples */}
      <section id="brand-in-action" className="bg-white py-20">
        <Container>
          <div className="mb-16 text-center">
            <h2 className="font-space-grotesk mb-6 text-4xl font-bold text-brand-cloud-blue">
              Brand in Action
            </h2>
            <p className="font-inter mx-auto max-w-3xl text-xl text-brand-slate-gray">
              See how our brand elements work together to create compelling,
              accessible experiences across different use cases.
            </p>
          </div>

          <div className="space-y-16">
            {/* Heroicons in Practice */}
            <div>
              <h3 className="font-space-grotesk mb-6 text-2xl font-semibold text-brand-slate-gray">
                Heroicons in Practice
              </h3>
              <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
                {/* Feature Grid Example */}
                <div className="rounded-xl border border-gray-200 bg-white p-8">
                  <h4 className="font-space-grotesk mb-6 text-lg font-semibold text-brand-cloud-blue">
                    Platform Features
                  </h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex items-center space-x-3">
                      <CloudIcon className="h-6 w-6 text-brand-cloud-blue" />
                      <span className="font-inter text-sm text-brand-slate-gray">
                        Cloud Native
                      </span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <CubeIcon className="h-6 w-6 text-accent-yellow" />
                      <span className="font-inter text-sm text-brand-slate-gray">
                        Containers
                      </span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <ShieldCheckIcon className="h-6 w-6 text-secondary-500" />
                      <span className="font-inter text-sm text-brand-slate-gray">
                        Security
                      </span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <ChartBarIcon className="h-6 w-6 text-brand-cloud-blue" />
                      <span className="font-inter text-sm text-brand-slate-gray">
                        Monitoring
                      </span>
                    </div>
                  </div>
                </div>

                {/* Navigation Example */}
                <div className="rounded-xl border border-gray-200 bg-white p-8">
                  <h4 className="font-space-grotesk mb-6 text-lg font-semibold text-brand-cloud-blue">
                    Navigation with Icons
                  </h4>
                  <nav className="space-y-3">
                    <a
                      href="#"
                      className="flex items-center space-x-3 rounded p-2 transition-colors hover:bg-brand-sky-mist"
                    >
                      <ServerIcon className="h-5 w-5 text-brand-fresh-green" />
                      <span className="font-inter text-brand-slate-gray">
                        Infrastructure
                      </span>
                    </a>
                    <a
                      href="#"
                      className="flex items-center space-x-3 rounded p-2 transition-colors hover:bg-brand-sky-mist"
                    >
                      <ArrowPathIcon className="h-5 w-5 text-accent-purple" />
                      <span className="font-inter text-brand-slate-gray">
                        CI/CD
                      </span>
                    </a>
                    <a
                      href="#"
                      className="flex items-center space-x-3 rounded p-2 transition-colors hover:bg-brand-sky-mist"
                    >
                      <CommandLineIcon className="h-5 w-5 text-primary-500" />
                      <span className="font-inter text-brand-slate-gray">
                        Developer Tools
                      </span>
                    </a>
                    <a
                      href="#"
                      className="flex items-center space-x-3 rounded p-2 transition-colors hover:bg-brand-sky-mist"
                    >
                      <BoltIcon className="h-5 w-5 text-accent-yellow" />
                      <span className="font-inter text-brand-slate-gray">
                        Performance
                      </span>
                    </a>
                  </nav>
                </div>
              </div>
            </div>

            {/* Icon Style Comparison */}
            <div>
              <h3 className="font-space-grotesk mb-6 text-2xl font-semibold text-brand-slate-gray">
                Outline vs Solid Icons
              </h3>
              <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
                {/* Outline Style */}
                <div className="rounded-xl border border-gray-200 bg-white p-8">
                  <h4 className="font-space-grotesk mb-6 text-lg font-semibold text-brand-cloud-blue">
                    Outline Style (Default)
                  </h4>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between rounded-lg bg-brand-glacier-white p-3">
                      <div className="flex items-center space-x-3">
                        <CloudIcon className="h-6 w-6 text-brand-cloud-blue" />
                        <span className="font-inter">Infrastructure</span>
                      </div>
                      <span className="font-inter text-sm text-gray-500">
                        Available
                      </span>
                    </div>
                    <div className="flex items-center justify-between rounded-lg bg-brand-glacier-white p-3">
                      <div className="flex items-center space-x-3">
                        <ServerIcon className="h-6 w-6 text-brand-fresh-green" />
                        <span className="font-inter">Compute</span>
                      </div>
                      <span className="font-inter text-sm text-gray-500">
                        Running
                      </span>
                    </div>
                    <div className="flex items-center justify-between rounded-lg bg-brand-glacier-white p-3">
                      <div className="flex items-center space-x-3">
                        <ShieldCheckIcon className="h-6 w-6 text-secondary-500" />
                        <span className="font-inter">Security</span>
                      </div>
                      <span className="font-inter text-sm text-gray-500">
                        Active
                      </span>
                    </div>
                  </div>
                </div>

                {/* Solid Style */}
                <div className="rounded-xl border border-gray-200 bg-white p-8">
                  <h4 className="font-space-grotesk mb-6 text-lg font-semibold text-brand-cloud-blue">
                    Solid Style (Emphasis)
                  </h4>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between rounded-lg border border-green-200 bg-green-50 p-3">
                      <div className="flex items-center space-x-3">
                        <CloudIconSolid className="h-6 w-6 text-green-600" />
                        <span className="font-inter font-medium">
                          Infrastructure
                        </span>
                      </div>
                      <span className="font-inter text-sm font-medium text-green-700">
                        Healthy
                      </span>
                    </div>
                    <div className="flex items-center justify-between rounded-lg border border-blue-200 bg-blue-50 p-3">
                      <div className="flex items-center space-x-3">
                        <ServerIconSolid className="h-6 w-6 text-blue-600" />
                        <span className="font-inter font-medium">Compute</span>
                      </div>
                      <span className="font-inter text-sm font-medium text-blue-700">
                        Optimized
                      </span>
                    </div>
                    <div className="flex items-center justify-between rounded-lg border border-purple-200 bg-purple-50 p-3">
                      <div className="flex items-center space-x-3">
                        <ShieldCheckIconSolid className="h-6 w-6 text-purple-600" />
                        <span className="font-inter font-medium">Security</span>
                      </div>
                      <span className="font-inter text-sm font-medium text-purple-700">
                        Protected
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Hero Example */}
            <div>
              <h3 className="font-space-grotesk mb-6 text-2xl font-semibold text-brand-slate-gray">
                Hero Section Example
              </h3>
              <BrandingExampleHeroSection />
            </div>

            {/* Speaker Card Examples */}
            <div>
              <h3 className="font-space-grotesk mb-6 text-2xl font-semibold text-brand-slate-gray">
                Speaker Card Examples
              </h3>
              <p className="font-inter mb-8 text-gray-600">
                Three different speaker card styles: Keynote (largest), Regular
                (medium), and Compact (smallest).
              </p>
              <div className="flex flex-wrap items-start justify-center gap-4">
                <SpeakerCard
                  speaker={{
                    name: 'Dr. Alex Cloudsmith',
                    title: 'Principal Engineer',
                    company: 'CloudNative Labs',
                    imageUrl:
                      'https://images.unsplash.com/photo-1502685104226-ee32379fefbe?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=facearea&facepad=8&w=1024&h=1024&q=80',
                    topic: 'Security & Compliance',
                    bio: 'Leading expert in cloud native security with 15+ years of experience in distributed systems and Kubernetes orchestration.',
                    gradient: 'brand',
                    topicVariant: 'security',
                    socialLinks: {
                      linkedin: '#',
                      bluesky: '#',
                      github: '#',
                    },
                  }}
                  options={{
                    showAsKeynote: true,
                  }}
                />

                <SpeakerCard
                  speaker={{
                    name: 'Jordan Kubernetes',
                    title: 'DevOps Engineer',
                    company: 'ContainerCorp',
                    imageUrl:
                      'https://images.unsplash.com/photo-1463453091185-61582044d556?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=facearea&facepad=8&w=1024&h=1024&q=80',
                    topic: 'CI/CD & DevOps',
                    bio: 'Expert in GitOps and continuous deployment strategies for cloud native applications.',
                    gradient: 'blue-purple',
                    topicVariant: 'devops',
                    socialLinks: {
                      linkedin: '#',
                      github: '#',
                    },
                  }}
                />

                <SpeakerCard
                  speaker={{
                    name: 'Taylor Prometheus',
                    title: 'SRE Lead',
                    company: 'ObservaTech',
                    imageUrl:
                      'https://images.unsplash.com/photo-1509783236416-c9ad59bae472?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=facearea&facepad=8&w=1024&h=1024&q=80',
                    topic: 'Observability',
                    bio: 'Specializes in large-scale monitoring and reliability engineering for microservices.',
                    gradient: 'green-yellow',
                    topicVariant: 'observability',
                    socialLinks: {
                      linkedin: '#',
                      bluesky: '#',
                    },
                  }}
                  options={{ showAsCompact: true }}
                />
              </div>
            </div>

            {/* Layout Example: Keynote + 2x2 Compact */}
            <div>
              <h3 className="font-space-grotesk mb-6 text-2xl font-semibold text-brand-slate-gray">
                Layout Example: Keynote + 2x2 Compact Grid
              </h3>
              <p className="font-inter mb-8 text-gray-600">
                Example layout showing how a keynote speaker can be paired with
                a 2x2 grid of compact speaker cards.
              </p>

              <div className="flex flex-col items-start gap-8 lg:flex-row">
                {/* Keynote Speaker */}
                <div className="flex-shrink-0">
                  <SpeakerCard
                    speaker={{
                      name: 'Dr. Sarah Mitchell',
                      title: 'CTO',
                      company: 'CloudNative Inc.',
                      imageUrl:
                        'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=facearea&facepad=8&w=1024&h=1024&q=80',
                      topic: 'Cloud Native Future',
                      bio: 'Visionary leader in cloud native technologies with 15+ years of experience building distributed systems.',
                      isKeynote: true,
                      gradient: 'brand',
                      socialLinks: {
                        linkedin: '#',
                        bluesky: '#',
                      },
                    }}
                  />
                </div>

                {/* 2x2 Compact Grid */}
                <div className="grid flex-1 grid-cols-1 gap-4 md:grid-cols-2">
                  <SpeakerCard
                    speaker={{
                      name: 'Tom Wilson',
                      title: 'Sr. Developer',
                      company: 'MicroTech',
                      imageUrl:
                        'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=facearea&facepad=8&w=1024&h=1024&q=80',
                      topic: 'Microservices',
                      bio: 'Expert in distributed systems architecture.',
                      topicVariant: 'security',
                      socialLinks: { github: '#' },
                    }}
                    options={{
                      showAsCompact: true,
                      compactFillContainer: true,
                    }}
                  />

                  <SpeakerCard
                    speaker={{
                      name: 'Emma Rodriguez',
                      title: 'Site Reliability Engineer',
                      company: 'ReliableCorp',
                      imageUrl:
                        'https://images.unsplash.com/photo-1517365830460-955ce3ccd263?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=facearea&facepad=8&w=1024&h=1024&q=80',
                      topic: 'SRE',
                      bio: 'Building reliable cloud infrastructure.',
                      topicVariant: 'observability',
                      socialLinks: { linkedin: '#' },
                    }}
                    options={{
                      showAsCompact: true,
                      compactFillContainer: true,
                    }}
                  />

                  <SpeakerCard
                    speaker={{
                      name: 'Ryan Park',
                      title: 'Cloud Architect',
                      company: 'ArchitectCo',
                      imageUrl:
                        'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=facearea&facepad=8&w=1024&h=1024&q=80',
                      topic: 'Architecture',
                      bio: 'Designing scalable cloud solutions.',
                      topicVariant: 'platform',
                      socialLinks: { linkedin: '#', github: '#' },
                    }}
                    options={{
                      showAsCompact: true,
                      compactFillContainer: true,
                    }}
                  />

                  <SpeakerCard
                    speaker={{
                      name: 'Anna Kowalski',
                      title: 'DevOps Engineer',
                      company: 'AutomationHub',
                      imageUrl:
                        'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=facearea&facepad=8&w=1024&h=1024&q=80',
                      topic: 'Automation',
                      bio: 'Streamlining development workflows.',
                      topicVariant: 'devops',
                      socialLinks: { bluesky: '#' },
                    }}
                    options={{
                      showAsCompact: true,
                      compactFillContainer: true,
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Alert Example */}
            <div>
              <h3 className="font-space-grotesk mb-6 text-2xl font-semibold text-brand-slate-gray">
                Alert/Notice Example
              </h3>
              <div className="bg-opacity-20 rounded-lg border border-accent-yellow bg-brand-sunbeam-yellow p-6">
                <div className="flex items-start">
                  <DiamondIcon className="mt-1 mr-3 h-6 w-6 flex-shrink-0 text-brand-sunbeam-yellow" />
                  <div>
                    <h4 className="font-space-grotesk mb-2 text-lg font-semibold text-brand-slate-gray">
                      Early Bird Special Ending Soon!
                    </h4>
                    <p className="font-atkinson text-brand-slate-gray">
                      Register before January 31st to secure your spot at 40%
                      off the regular price. Limited seats available for this
                      community-driven event.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Container>
      </section>

      {/* Background Utilities Showcase */}
      <section id="background-utilities" className="bg-white py-20">
        <Container>
          <div className="mb-16 text-center">
            <h2 className="font-space-grotesk mb-6 text-4xl font-bold text-brand-cloud-blue">
              Background Utilities
            </h2>
            <p className="font-inter mx-auto max-w-3xl text-xl text-brand-slate-gray">
              Our background system includes solid colors and gradients that
              work seamlessly across all brand applications and maintain proper
              contrast ratios.
            </p>
          </div>

          {/* Gradient Backgrounds */}
          <div className="mb-16">
            <h3 className="font-space-grotesk mb-8 text-2xl font-semibold text-brand-slate-gray">
              Gradient Backgrounds
            </h3>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              <div className="relative flex min-h-[200px] items-center justify-center rounded-xl bg-aqua-gradient p-8 text-center">
                <div className="absolute inset-0 rounded-xl bg-black/20"></div>
                <div className="relative z-10">
                  <h4 className="font-space-grotesk mb-2 text-xl font-semibold text-white">
                    Aqua Gradient
                  </h4>
                  <p className="font-inter mb-3 text-sm text-white/90">
                    Primary hero gradient
                  </p>
                  <code className="font-jetbrains rounded bg-black/30 px-3 py-1 text-xs text-white">
                    bg-aqua-gradient
                  </code>
                </div>
              </div>

              <div className="relative flex min-h-[200px] items-center justify-center rounded-xl bg-brand-gradient p-8 text-center">
                <div className="absolute inset-0 rounded-xl bg-black/20"></div>
                <div className="relative z-10">
                  <h4 className="font-space-grotesk mb-2 text-xl font-semibold text-white">
                    Brand Gradient
                  </h4>
                  <p className="font-inter mb-3 text-sm text-white/90">
                    Enhanced brand gradient
                  </p>
                  <code className="font-jetbrains rounded bg-black/30 px-3 py-1 text-xs text-white">
                    bg-brand-gradient
                  </code>
                </div>
              </div>

              <div className="relative flex min-h-[200px] items-center justify-center rounded-xl bg-nordic-gradient p-8 text-center">
                <div className="absolute inset-0 rounded-xl bg-black/20"></div>
                <div className="relative z-10">
                  <h4 className="font-space-grotesk mb-2 text-xl font-semibold text-white">
                    Nordic Gradient
                  </h4>
                  <p className="font-inter mb-3 text-sm text-white/90">
                    Accent gradient
                  </p>
                  <code className="font-jetbrains rounded bg-black/30 px-3 py-1 text-xs text-white">
                    bg-nordic-gradient
                  </code>
                </div>
              </div>
            </div>
          </div>

          {/* Solid Color Backgrounds */}
          <div>
            <h3 className="font-space-grotesk mb-8 text-2xl font-semibold text-brand-slate-gray">
              Solid Color Backgrounds
            </h3>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              {/* Primary Colors */}
              <div className="rounded-lg bg-brand-cloud-blue p-6 text-center">
                <div className="mx-auto mb-3 h-12 w-12 rounded-full bg-white/20"></div>
                <h4 className="font-space-grotesk mb-1 text-sm font-semibold text-white">
                  Cloud Blue
                </h4>
                <code className="font-jetbrains text-xs text-white/80">
                  bg-brand-cloud-blue
                </code>
              </div>

              <div className="rounded-lg bg-brand-fresh-green p-6 text-center">
                <div className="mx-auto mb-3 h-12 w-12 rounded-full bg-white/20"></div>
                <h4 className="font-space-grotesk mb-1 text-sm font-semibold text-white">
                  Fresh Green
                </h4>
                <code className="font-jetbrains text-xs text-white/80">
                  bg-brand-fresh-green
                </code>
              </div>

              <div className="rounded-lg bg-brand-nordic-purple p-6 text-center">
                <div className="mx-auto mb-3 h-12 w-12 rounded-full bg-white/20"></div>
                <h4 className="font-space-grotesk mb-1 text-sm font-semibold text-white">
                  Nordic Purple
                </h4>
                <code className="font-jetbrains text-xs text-white/80">
                  bg-brand-nordic-purple
                </code>
              </div>

              <div className="rounded-lg bg-brand-sunbeam-yellow p-6 text-center">
                <div className="mx-auto mb-3 h-12 w-12 rounded-full bg-black/20"></div>
                <h4 className="font-space-grotesk mb-1 text-sm font-semibold text-black">
                  Sunbeam Yellow
                </h4>
                <code className="font-jetbrains text-xs text-black/70">
                  bg-brand-sunbeam-yellow
                </code>
              </div>

              {/* Neutral Colors */}
              <div className="rounded-lg border border-brand-frosted-steel bg-brand-sky-mist p-6 text-center">
                <div className="mx-auto mb-3 h-12 w-12 rounded-full bg-brand-cloud-blue/20"></div>
                <h4 className="font-space-grotesk mb-1 text-sm font-semibold text-brand-slate-gray">
                  Sky Mist
                </h4>
                <code className="font-jetbrains text-xs text-brand-slate-gray">
                  bg-brand-sky-mist
                </code>
              </div>

              <div className="rounded-lg border border-brand-frosted-steel bg-brand-glacier-white p-6 text-center">
                <div className="mx-auto mb-3 h-12 w-12 rounded-full bg-brand-cloud-blue/20"></div>
                <h4 className="font-space-grotesk mb-1 text-sm font-semibold text-brand-slate-gray">
                  Glacier White
                </h4>
                <code className="font-jetbrains text-xs text-brand-slate-gray">
                  bg-brand-glacier-white
                </code>
              </div>

              <div className="rounded-lg bg-brand-slate-gray p-6 text-center">
                <div className="mx-auto mb-3 h-12 w-12 rounded-full bg-white/20"></div>
                <h4 className="font-space-grotesk mb-1 text-sm font-semibold text-white">
                  Slate Gray
                </h4>
                <code className="font-jetbrains text-xs text-white/80">
                  bg-brand-slate-gray
                </code>
              </div>

              <div className="rounded-lg bg-brand-frosted-steel p-6 text-center">
                <div className="mx-auto mb-3 h-12 w-12 rounded-full bg-brand-slate-gray/20"></div>
                <h4 className="font-space-grotesk mb-1 text-sm font-semibold text-brand-slate-gray">
                  Frosted Steel
                </h4>
                <code className="font-jetbrains text-xs text-brand-slate-gray">
                  bg-brand-frosted-steel
                </code>
              </div>
            </div>
          </div>

          {/* Usage Guidelines */}
          <div className="mt-16 rounded-xl bg-brand-glacier-white p-8">
            <h3 className="font-space-grotesk mb-6 text-xl font-semibold text-brand-cloud-blue">
              Background Usage Guidelines
            </h3>
            <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
              <div>
                <h4 className="font-space-grotesk mb-3 text-lg font-semibold text-brand-slate-gray">
                  When to Use Gradients
                </h4>
                <ul className="font-inter space-y-2 text-brand-slate-gray">
                  <li className="flex items-start">
                    <span className="mt-2 mr-3 h-2 w-2 flex-shrink-0 rounded-full bg-brand-fresh-green"></span>
                    Hero sections and primary call-to-actions
                  </li>
                  <li className="flex items-start">
                    <span className="mt-2 mr-3 h-2 w-2 flex-shrink-0 rounded-full bg-brand-fresh-green"></span>
                    Section dividers and visual breaks
                  </li>
                  <li className="flex items-start">
                    <span className="mt-2 mr-3 h-2 w-2 flex-shrink-0 rounded-full bg-brand-fresh-green"></span>
                    Digital badges and highlighting
                  </li>
                </ul>
              </div>
              <div>
                <h4 className="font-space-grotesk mb-3 text-lg font-semibold text-brand-slate-gray">
                  When to Use Solid Colors
                </h4>
                <ul className="font-inter space-y-2 text-brand-slate-gray">
                  <li className="flex items-start">
                    <span className="mt-2 mr-3 h-2 w-2 flex-shrink-0 rounded-full bg-brand-cloud-blue"></span>
                    Content sections and cards
                  </li>
                  <li className="flex items-start">
                    <span className="mt-2 mr-3 h-2 w-2 flex-shrink-0 rounded-full bg-brand-cloud-blue"></span>
                    UI components and interactive elements
                  </li>
                  <li className="flex items-start">
                    <span className="mt-2 mr-3 h-2 w-2 flex-shrink-0 rounded-full bg-brand-cloud-blue"></span>
                    Status indicators and alerts
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </Container>
      </section>

      {/* Cloud Native Pattern System */}
      <section id="pattern-system" className="bg-white py-20">
        <Container>
          <div className="mb-16 text-center">
            <h2 className="font-space-grotesk mb-6 text-4xl font-bold text-brand-cloud-blue">
              Cloud Native Pattern System
            </h2>
            <p className="font-inter mx-auto max-w-3xl text-xl text-brand-slate-gray">
              Our animated background patterns incorporate authentic cloud
              native project logos with intelligent focus/diffusion effects.
              Smaller icons appear sharp and vibrant (in focus), while larger
              icons become more diffuse and subtle, creating natural visual
              depth that enhances readability and engagement.
            </p>
          </div>

          <div className="grid grid-cols-1 items-start gap-12 lg:grid-cols-2">
            {/* Interactive Pattern Preview */}
            <div>
              <InteractivePatternPreview />
            </div>

            {/* Pattern Elements */}
            <div>
              <h3 className="font-space-grotesk mb-6 text-2xl font-semibold text-brand-slate-gray">
                Pattern Elements
              </h3>
              <div className="space-y-4">
                <div className="flex items-start space-x-4">
                  <div className="relative mt-1 h-8 w-8">
                    <Image
                      src={KubernetesIcon}
                      alt="Kubernetes"
                      width={32}
                      height={32}
                      className="h-full w-full object-contain"
                      style={{
                        filter:
                          'brightness(0) saturate(100%) invert(27%) sepia(51%) saturate(2878%) hue-rotate(346deg) brightness(104%) contrast(97%)',
                      }}
                    />
                  </div>
                  <div>
                    <h4 className="font-space-grotesk text-lg font-semibold text-brand-slate-gray">
                      Container Orchestration
                    </h4>
                    <p className="font-inter text-brand-slate-gray">
                      Kubernetes, containerd, and etcd - the foundation of
                      modern container orchestration.
                    </p>
                  </div>
                </div>

                <div className="flex items-start space-x-4">
                  <div className="relative mt-1 h-8 w-8">
                    <Image
                      src={PrometheusIcon}
                      alt="Prometheus"
                      width={32}
                      height={32}
                      className="h-full w-full object-contain"
                      style={{
                        filter:
                          'brightness(0) saturate(100%) invert(25%) sepia(15%) saturate(4478%) hue-rotate(202deg) brightness(100%) contrast(92%)',
                      }}
                    />
                  </div>
                  <div>
                    <h4 className="font-space-grotesk text-lg font-semibold text-brand-slate-gray">
                      Observability & Monitoring
                    </h4>
                    <p className="font-inter text-brand-slate-gray">
                      Prometheus, Jaeger, and Falco for comprehensive system
                      observability and security.
                    </p>
                  </div>
                </div>

                <div className="flex items-start space-x-4">
                  <div className="relative mt-1 h-8 w-8">
                    <Image
                      src={IstioIcon}
                      alt="Istio"
                      width={32}
                      height={32}
                      className="h-full w-full object-contain"
                      style={{
                        filter:
                          'brightness(0) saturate(100%) invert(47%) sepia(61%) saturate(558%) hue-rotate(101deg) brightness(94%) contrast(86%)',
                      }}
                    />
                  </div>
                  <div>
                    <h4 className="font-space-grotesk text-lg font-semibold text-brand-slate-gray">
                      Service Mesh & Networking
                    </h4>
                    <p className="font-inter text-brand-slate-gray">
                      Istio, Envoy, and Cilium for secure, observable
                      service-to-service communication.
                    </p>
                  </div>
                </div>

                <div className="flex items-start space-x-4">
                  <div className="relative mt-1 h-8 w-8">
                    <Image
                      src={HelmIcon}
                      alt="Helm"
                      width={32}
                      height={32}
                      className="h-full w-full object-contain"
                      style={{
                        filter:
                          'brightness(0) saturate(100%) invert(75%) sepia(32%) saturate(1207%) hue-rotate(357deg) brightness(98%) contrast(84%)',
                      }}
                    />
                  </div>
                  <div>
                    <h4 className="font-space-grotesk text-lg font-semibold text-brand-slate-gray">
                      Package Management & GitOps
                    </h4>
                    <p className="font-inter text-brand-slate-gray">
                      Helm, Argo, and Crossplane for application packaging and
                      deployment automation.
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-8 rounded-lg bg-brand-sky-mist p-6">
                <h4 className="font-space-grotesk mb-3 text-lg font-semibold text-brand-slate-gray">
                  Configuration Guidelines
                </h4>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <h5 className="font-space-grotesk mb-2 text-sm font-semibold tracking-wide text-brand-slate-gray uppercase">
                      Size Configuration
                    </h5>
                    <ul className="font-inter space-y-1 text-sm text-brand-slate-gray">
                      <li className="flex items-start">
                        <span className="mt-1.5 mr-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-brand-fresh-green"></span>
                        Content sections: 15-35px icons
                      </li>
                      <li className="flex items-start">
                        <span className="mt-1.5 mr-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-brand-fresh-green"></span>
                        Hero sections: 25-70px icons
                      </li>
                      <li className="flex items-start">
                        <span className="mt-1.5 mr-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-brand-fresh-green"></span>
                        Background fills: 20-50px icons
                      </li>
                    </ul>
                  </div>
                  <div>
                    <h5 className="font-space-grotesk mb-2 text-sm font-semibold tracking-wide text-brand-slate-gray uppercase">
                      Density Configuration
                    </h5>
                    <ul className="font-inter space-y-1 text-sm text-brand-slate-gray">
                      <li className="flex items-start">
                        <span className="mt-1.5 mr-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-brand-cloud-blue"></span>
                        Low: 20-40 icons for subtle backgrounds
                      </li>
                      <li className="flex items-start">
                        <span className="mt-1.5 mr-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-brand-cloud-blue"></span>
                        Medium: 30-60 icons for balanced patterns
                      </li>
                      <li className="flex items-start">
                        <span className="mt-1.5 mr-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-brand-cloud-blue"></span>
                        High: 40-100 icons for dramatic effects
                      </li>
                    </ul>
                  </div>
                </div>
                <div className="mt-4 border-t border-brand-frosted-steel pt-4">
                  <h5 className="font-space-grotesk mb-2 text-sm font-semibold tracking-wide text-brand-slate-gray uppercase">
                    Focus/Diffusion System
                  </h5>
                  <ul className="font-inter mb-4 space-y-2 text-sm text-brand-slate-gray">
                    <li className="flex items-start">
                      <span className="mt-1.5 mr-3 h-2 w-2 flex-shrink-0 rounded-full bg-brand-fresh-green"></span>
                      Small icons (20-30px): High opacity, vibrant colors, sharp
                      focus
                    </li>
                    <li className="flex items-start">
                      <span className="mt-1.5 mr-3 h-2 w-2 flex-shrink-0 rounded-full bg-brand-fresh-green"></span>
                      Medium icons (30-50px): Balanced opacity and slight blur
                    </li>
                    <li className="flex items-start">
                      <span className="mt-1.5 mr-3 h-2 w-2 flex-shrink-0 rounded-full bg-brand-fresh-green"></span>
                      Large icons (50-70px): Lower opacity, subtle colors, soft
                      blur
                    </li>
                  </ul>
                  <ul className="font-inter space-y-2 text-sm text-brand-slate-gray">
                    <li className="flex items-start">
                      <span className="mt-1.5 mr-3 h-2 w-2 flex-shrink-0 rounded-full bg-brand-nordic-purple"></span>
                      Adjust opacity (0.08-0.15) based on content readability
                    </li>
                    <li className="flex items-start">
                      <span className="mt-1.5 mr-3 h-2 w-2 flex-shrink-0 rounded-full bg-brand-nordic-purple"></span>
                      Use slow movement animation for engaging backgrounds
                    </li>
                    <li className="flex items-start">
                      <span className="mt-1.5 mr-3 h-2 w-2 flex-shrink-0 rounded-full bg-brand-nordic-purple"></span>
                      Disable animation for static contexts or better
                      performance
                    </li>
                    <li className="flex items-start">
                      <span className="mt-1.5 mr-3 h-2 w-2 flex-shrink-0 rounded-full bg-brand-nordic-purple"></span>
                      Combine with gradient backgrounds for optimal contrast
                    </li>
                  </ul>
                </div>
              </div>

              {/* Configuration Examples moved to separate section */}
              <div className="mt-8">
                <p className="font-inter text-brand-slate-gray">
                  Explore different pattern configurations in the examples
                  below.
                </p>
              </div>
            </div>
          </div>
        </Container>
      </section>

      {/* Configuration Examples Section */}
      <section className="bg-brand-glacier-white py-20">
        <Container>
          <div className="mb-12 text-center">
            <h2 className="font-space-grotesk mb-4 text-3xl font-bold text-brand-cloud-blue">
              Configuration Examples
            </h2>
            <p className="font-inter mx-auto max-w-2xl text-lg text-brand-slate-gray">
              See how different settings create unique visual effects for
              various use cases
            </p>
          </div>

          <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
            {/* Light variant with custom sizing */}
            <PatternExample
              title="Content Background"
              description="Subtle pattern for content sections and cards"
              opacity={0.06}
              variant="light"
              density="low"
              minSize={18}
              maxSize={32}
              minCount={12}
              maxCount={25}
              animated={true}
            />

            {/* Default hero pattern - improved with larger icons */}
            <PatternExample
              title="Hero Section (Default)"
              description="Perfect balance for wide hero sections"
              opacity={0.15}
              variant="brand"
              density="medium"
              minSize={30}
              maxSize={75}
              minCount={25}
              maxCount={50}
              animated={true}
            />

            {/* Dense dramatic pattern */}
            <PatternExample
              title="Dramatic Background"
              description="Dense, dramatic effect for special sections"
              opacity={0.2}
              variant="dark"
              density="high"
              minSize={25}
              maxSize={90}
              minCount={35}
              maxCount={75}
              animated={true}
            />
          </div>

          {/* Technical Details */}
          <div className="mt-12 rounded-xl bg-white p-8">
            <h4 className="font-space-grotesk mb-6 text-center text-xl font-semibold text-brand-slate-gray">
              Focus/Diffusion Technology
            </h4>
            <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
              <div className="text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-brand-fresh-green/20">
                  <span className="text-2xl font-bold text-brand-fresh-green">
                    S
                  </span>
                </div>
                <h5 className="font-space-grotesk text-md mb-2 font-semibold text-brand-slate-gray">
                  Small Icons (Sharp Focus)
                </h5>
                <p className="font-inter text-sm text-brand-slate-gray">
                  Higher opacity, vibrant colors, no blur. Draw attention as
                  foreground elements.
                </p>
              </div>
              <div className="text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-brand-cloud-blue/20">
                  <span className="text-2xl font-bold text-brand-cloud-blue">
                    M
                  </span>
                </div>
                <h5 className="font-space-grotesk text-md mb-2 font-semibold text-brand-slate-gray">
                  Medium Icons (Balanced)
                </h5>
                <p className="font-inter text-sm text-brand-slate-gray">
                  Moderate opacity and subtle blur. Provide visual texture
                  without distraction.
                </p>
              </div>
              <div className="text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-brand-frosted-steel/40">
                  <span className="text-2xl font-bold text-brand-slate-gray">
                    L
                  </span>
                </div>
                <h5 className="font-space-grotesk text-md mb-2 font-semibold text-brand-slate-gray">
                  Large Icons (Soft Diffusion)
                </h5>
                <p className="font-inter text-sm text-brand-slate-gray">
                  Lower opacity, muted colors, soft blur. Create atmospheric
                  background depth.
                </p>
              </div>
            </div>
          </div>
        </Container>
      </section>

      {/* Design Principles */}
      <section id="design-principles" className="bg-brand-sky-mist py-20">
        <Container>
          <div className="mb-16 text-center">
            <h2 className="font-space-grotesk mb-6 text-4xl font-bold text-brand-cloud-blue">
              Design Principles
            </h2>
            <p className="font-inter mx-auto max-w-3xl text-xl text-brand-slate-gray">
              These principles guide every design decision and ensure our brand
              remains consistent, accessible, and true to our community values.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-4">
            {[
              {
                title: 'Developer-First',
                description:
                  'Every design choice considers the developer experience and technical audience.',
                icon: CommandLineIcon,
              },
              {
                title: 'Accessible by Design',
                description:
                  'We prioritize accessibility and inclusive design in all brand applications.',
                icon: EyeIcon,
              },
              {
                title: 'Nordic Minimalism',
                description:
                  'Clean, functional design that lets content shine without unnecessary complexity.',
                icon: BoltIcon,
              },
              {
                title: 'Community Driven',
                description:
                  'Our brand reflects the collaborative spirit of the open source community.',
                icon: GlobeAltIcon,
              },
            ].map((principle) => (
              <div
                key={principle.title}
                className="rounded-xl bg-white p-6 text-center"
              >
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-brand-cloud-blue/10">
                  <principle.icon className="h-6 w-6 text-brand-cloud-blue" />
                </div>
                <h3 className="font-space-grotesk mb-3 text-lg font-semibold text-brand-cloud-blue">
                  {principle.title}
                </h3>
                <p className="font-inter text-brand-slate-gray">
                  {principle.description}
                </p>
              </div>
            ))}
          </div>
        </Container>
      </section>

      {/* Resources & Downloads */}
      <section id="brand-resources" className="bg-white py-20">
        <Container>
          <div className="mb-16 text-center">
            <h2 className="font-space-grotesk mb-6 text-4xl font-bold text-brand-cloud-blue">
              Brand Resources
            </h2>
            <p className="font-inter mx-auto max-w-3xl text-xl text-brand-slate-gray">
              Download logo files, access color codes, and get implementation
              guidelines for using the Cloud Native Day Bergen brand.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
            <div className="rounded-xl bg-brand-glacier-white p-8 text-center">
              <h3 className="font-space-grotesk mb-4 text-xl font-semibold text-brand-slate-gray">
                Logo Package
              </h3>
              <p className="font-inter mb-6 text-brand-slate-gray">
                SVG, PNG, and PDF versions in various sizes and orientations.
              </p>
              <Button className="font-space-grotesk border-2 border-brand-cloud-blue bg-transparent text-brand-cloud-blue hover:bg-brand-cloud-blue hover:text-white">
                Download Logos
              </Button>
            </div>

            <div className="rounded-xl bg-brand-glacier-white p-8 text-center">
              <h3 className="font-space-grotesk mb-4 text-xl font-semibold text-brand-slate-gray">
                Color Palette
              </h3>
              <p className="font-inter mb-6 text-brand-slate-gray">
                Hex codes, RGB values, and Pantone colors for print and digital
                use.
              </p>
              <Button className="font-space-grotesk border-2 border-brand-cloud-blue bg-transparent text-brand-cloud-blue hover:bg-brand-cloud-blue hover:text-white">
                Get Color Codes
              </Button>
            </div>

            <div className="rounded-xl bg-brand-glacier-white p-8 text-center">
              <h3 className="font-space-grotesk mb-4 text-xl font-semibold text-brand-slate-gray">
                Usage Guidelines
              </h3>
              <p className="font-inter mb-6 text-brand-slate-gray">
                Detailed guidelines for proper logo usage, spacing, and
                applications.
              </p>
              <Button className="font-space-grotesk border-2 border-brand-cloud-blue bg-transparent text-brand-cloud-blue hover:bg-brand-cloud-blue hover:text-white">
                View Guidelines
              </Button>
            </div>
          </div>
        </Container>
      </section>
    </div>
  )
}
