import { Metadata } from 'next'
import { Container } from '@/components/Container'
import { DiamondIcon } from '@/components/DiamondIcon'
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
  ButtonShowcase,
} from '@/components/branding'
import { colorPalette, typography } from '@/lib/branding/data'

import { TalkPromotion } from '@/components/TalkPromotion'
import { SpeakerPromotion } from '@/components/SpeakerPromotion'
import { Format } from '@/lib/proposal/types'
import { getConferenceForCurrentDomain } from '../../../lib/conference/sanity'

export const metadata: Metadata = {
  title: 'Brand Guidelines - Cloud Native Day Bergen',
  description: 'Brand guidelines and design system for Cloud Native Day Bergen',
}

export default async function BrandingPage() {
  const { conference } = await getConferenceForCurrentDomain({
    featuredSpeakers: true,
  })

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
                href="#pattern-system"
                className="font-inter text-sm font-medium text-brand-slate-gray transition-colors hover:text-brand-cloud-blue"
              >
                Patterns
              </a>
              <a
                href="#buttons-showcase"
                className="font-inter text-sm font-medium text-brand-slate-gray transition-colors hover:text-brand-cloud-blue"
              >
                Buttons
              </a>
              <a
                href="#hero-examples"
                className="font-inter text-sm font-medium text-brand-slate-gray transition-colors hover:text-brand-cloud-blue"
              >
                Hero
              </a>
              <a
                href="#speaker-examples"
                className="font-inter text-sm font-medium text-brand-slate-gray transition-colors hover:text-brand-cloud-blue"
              >
                Speakers
              </a>
              <a
                href="#talk-examples"
                className="font-inter text-sm font-medium text-brand-slate-gray transition-colors hover:text-brand-cloud-blue"
              >
                Talks
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

            {/* Design Principles */}
            <div className="mt-20">
              <h3 className="font-space-grotesk mb-8 text-center text-3xl font-bold text-brand-cloud-blue">
                Design Principles
              </h3>
              <p className="font-inter mx-auto mb-12 max-w-3xl text-center text-lg text-brand-slate-gray">
                These principles guide every design decision and ensure our
                brand remains consistent, accessible, and true to our community
                values.
              </p>

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
                    className="rounded-xl bg-white p-6 text-center shadow-sm"
                  >
                    <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-brand-cloud-blue/10">
                      <principle.icon className="h-6 w-6 text-brand-cloud-blue" />
                    </div>
                    <h4 className="font-space-grotesk mb-3 text-lg font-semibold text-brand-cloud-blue">
                      {principle.title}
                    </h4>
                    <p className="font-inter text-brand-slate-gray">
                      {principle.description}
                    </p>
                  </div>
                ))}
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

          {/* Background Utilities */}
          <div className="mt-20">
            <h3 className="font-space-grotesk mb-8 text-center text-3xl font-bold text-brand-cloud-blue">
              Background Utilities
            </h3>
            <p className="font-inter mx-auto mb-12 max-w-3xl text-center text-lg text-brand-slate-gray">
              Our background system includes solid colors and gradients that
              work seamlessly across all brand applications and maintain proper
              contrast ratios.
            </p>

            {/* Gradient Backgrounds */}
            <div className="mb-16">
              <h4 className="font-space-grotesk mb-8 text-2xl font-semibold text-brand-slate-gray">
                Gradient Backgrounds
              </h4>
              <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                <div className="relative flex min-h-[200px] items-center justify-center rounded-xl bg-aqua-gradient p-8 text-center">
                  <div className="absolute inset-0 rounded-xl bg-black/20"></div>
                  <div className="relative z-10">
                    <h5 className="font-space-grotesk mb-2 text-xl font-semibold text-white">
                      Aqua Gradient
                    </h5>
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
                    <h5 className="font-space-grotesk mb-2 text-xl font-semibold text-white">
                      Brand Gradient
                    </h5>
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
                    <h5 className="font-space-grotesk mb-2 text-xl font-semibold text-white">
                      Nordic Gradient
                    </h5>
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
            <div className="mb-16">
              <h4 className="font-space-grotesk mb-8 text-2xl font-semibold text-brand-slate-gray">
                Solid Color Backgrounds
              </h4>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                {/* Primary Colors */}
                <div className="rounded-lg bg-brand-cloud-blue p-6 text-center">
                  <div className="mx-auto mb-3 h-12 w-12 rounded-full bg-white/20"></div>
                  <h5 className="font-space-grotesk mb-1 text-sm font-semibold text-white">
                    Cloud Blue
                  </h5>
                  <code className="font-jetbrains text-xs text-white/80">
                    bg-brand-cloud-blue
                  </code>
                </div>

                <div className="rounded-lg bg-brand-fresh-green p-6 text-center">
                  <div className="mx-auto mb-3 h-12 w-12 rounded-full bg-white/20"></div>
                  <h5 className="font-space-grotesk mb-1 text-sm font-semibold text-white">
                    Fresh Green
                  </h5>
                  <code className="font-jetbrains text-xs text-white/80">
                    bg-brand-fresh-green
                  </code>
                </div>

                <div className="rounded-lg bg-brand-nordic-purple p-6 text-center">
                  <div className="mx-auto mb-3 h-12 w-12 rounded-full bg-white/20"></div>
                  <h5 className="font-space-grotesk mb-1 text-sm font-semibold text-white">
                    Nordic Purple
                  </h5>
                  <code className="font-jetbrains text-xs text-white/80">
                    bg-brand-nordic-purple
                  </code>
                </div>

                <div className="rounded-lg bg-brand-sunbeam-yellow p-6 text-center">
                  <div className="mx-auto mb-3 h-12 w-12 rounded-full bg-black/20"></div>
                  <h5 className="font-space-grotesk mb-1 text-sm font-semibold text-black">
                    Sunbeam Yellow
                  </h5>
                  <code className="font-jetbrains text-xs text-black/70">
                    bg-brand-sunbeam-yellow
                  </code>
                </div>

                {/* Neutral Colors */}
                <div className="rounded-lg border border-brand-frosted-steel bg-brand-sky-mist p-6 text-center">
                  <div className="mx-auto mb-3 h-12 w-12 rounded-full bg-brand-cloud-blue/20"></div>
                  <h5 className="font-space-grotesk mb-1 text-sm font-semibold text-brand-slate-gray">
                    Sky Mist
                  </h5>
                  <code className="font-jetbrains text-xs text-brand-slate-gray">
                    bg-brand-sky-mist
                  </code>
                </div>

                <div className="rounded-lg border border-brand-frosted-steel bg-brand-glacier-white p-6 text-center">
                  <div className="mx-auto mb-3 h-12 w-12 rounded-full bg-brand-cloud-blue/20"></div>
                  <h5 className="font-space-grotesk mb-1 text-sm font-semibold text-brand-slate-gray">
                    Glacier White
                  </h5>
                  <code className="font-jetbrains text-xs text-brand-slate-gray">
                    bg-brand-glacier-white
                  </code>
                </div>

                <div className="rounded-lg bg-brand-slate-gray p-6 text-center">
                  <div className="mx-auto mb-3 h-12 w-12 rounded-full bg-white/20"></div>
                  <h5 className="font-space-grotesk mb-1 text-sm font-semibold text-white">
                    Slate Gray
                  </h5>
                  <code className="font-jetbrains text-xs text-white/80">
                    bg-brand-slate-gray
                  </code>
                </div>

                <div className="rounded-lg bg-brand-frosted-steel p-6 text-center">
                  <div className="mx-auto mb-3 h-12 w-12 rounded-full bg-brand-slate-gray/20"></div>
                  <h5 className="font-space-grotesk mb-1 text-sm font-semibold text-brand-slate-gray">
                    Frosted Steel
                  </h5>
                  <code className="font-jetbrains text-xs text-brand-slate-gray">
                    bg-brand-frosted-steel
                  </code>
                </div>
              </div>
            </div>

            {/* Usage Guidelines */}
            <div className="rounded-xl bg-brand-glacier-white p-8">
              <h4 className="font-space-grotesk mb-6 text-xl font-semibold text-brand-cloud-blue">
                Background Usage Guidelines
              </h4>
              <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
                <div>
                  <h5 className="font-space-grotesk mb-3 text-lg font-semibold text-brand-slate-gray">
                    When to Use Gradients
                  </h5>
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
                  <h5 className="font-space-grotesk mb-3 text-lg font-semibold text-brand-slate-gray">
                    When to Use Solid Colors
                  </h5>
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
          </div>
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

          <div className="grid grid-cols-1 gap-12 lg:grid-cols-3">
            {/* Interactive Pattern Preview - Pattern Controls */}
            <div className="flex flex-col lg:col-span-2">
              <h3 className="font-space-grotesk mb-6 text-2xl font-semibold text-brand-slate-gray">
                Interactive Pattern Preview
              </h3>
              <div className="flex-1">
                <InteractivePatternPreview />
              </div>
            </div>

            {/* Configuration Guidelines */}
            <div className="flex flex-col lg:col-span-1">
              <h3 className="font-space-grotesk mb-6 text-2xl font-semibold text-brand-slate-gray">
                Configuration Guidelines
              </h3>
              <div className="flex-1 rounded-lg bg-brand-sky-mist p-6">
                <div className="mb-6 grid grid-cols-1 gap-6 md:grid-cols-2">
                  <div>
                    <h4 className="font-space-grotesk mb-3 text-sm font-semibold tracking-wide text-brand-slate-gray uppercase">
                      Icon Size
                    </h4>
                    <ul className="font-inter space-y-2 text-sm text-brand-slate-gray">
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
                    <h4 className="font-space-grotesk mb-3 text-sm font-semibold tracking-wide text-brand-slate-gray uppercase">
                      Icon Count
                    </h4>
                    <ul className="font-inter space-y-2 text-sm text-brand-slate-gray">
                      <li className="flex items-start">
                        <span className="mt-1.5 mr-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-brand-cloud-blue"></span>
                        Subtle: 10-30 icons for content backgrounds
                      </li>
                      <li className="flex items-start">
                        <span className="mt-1.5 mr-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-brand-cloud-blue"></span>
                        Balanced: 30-60 icons for hero sections
                      </li>
                      <li className="flex items-start">
                        <span className="mt-1.5 mr-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-brand-cloud-blue"></span>
                        Dense: 60-120 icons for dramatic effects
                      </li>
                    </ul>
                  </div>
                </div>
                <div className="border-t border-brand-frosted-steel pt-4">
                  <h4 className="font-space-grotesk mb-3 text-sm font-semibold tracking-wide text-brand-slate-gray uppercase">
                    Focus/Diffusion System
                  </h4>
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
            </div>
          </div>

          {/* Pattern Elements Section - Moved below main grid */}
          <div className="mt-16">
            <h3 className="font-space-grotesk mb-6 text-2xl font-semibold text-brand-slate-gray">
              Pattern Elements
            </h3>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
              <div className="flex flex-col items-center rounded-lg bg-brand-glacier-white p-6 text-center">
                <div className="relative mb-4 h-12 w-12">
                  <Image
                    src={KubernetesIcon}
                    alt="Kubernetes"
                    width={48}
                    height={48}
                    className="h-full w-full object-contain"
                    style={{
                      filter:
                        'brightness(0) saturate(100%) invert(27%) sepia(51%) saturate(2878%) hue-rotate(346deg) brightness(104%) contrast(97%)',
                    }}
                  />
                </div>
                <h4 className="font-space-grotesk mb-2 text-lg font-semibold text-brand-slate-gray">
                  Container Orchestration
                </h4>
                <p className="font-inter text-sm text-brand-slate-gray">
                  Kubernetes, containerd, and etcd - the foundation of modern
                  container orchestration.
                </p>
              </div>

              <div className="flex flex-col items-center rounded-lg bg-brand-glacier-white p-6 text-center">
                <div className="relative mb-4 h-12 w-12">
                  <Image
                    src={PrometheusIcon}
                    alt="Prometheus"
                    width={48}
                    height={48}
                    className="h-full w-full object-contain"
                    style={{
                      filter:
                        'brightness(0) saturate(100%) invert(25%) sepia(15%) saturate(4478%) hue-rotate(202deg) brightness(100%) contrast(92%)',
                    }}
                  />
                </div>
                <h4 className="font-space-grotesk mb-2 text-lg font-semibold text-brand-slate-gray">
                  Observability & Monitoring
                </h4>
                <p className="font-inter text-sm text-brand-slate-gray">
                  Prometheus, Jaeger, and Falco for comprehensive system
                  observability and security.
                </p>
              </div>

              <div className="flex flex-col items-center rounded-lg bg-brand-glacier-white p-6 text-center">
                <div className="relative mb-4 h-12 w-12">
                  <Image
                    src={IstioIcon}
                    alt="Istio"
                    width={48}
                    height={48}
                    className="h-full w-full object-contain"
                    style={{
                      filter:
                        'brightness(0) saturate(100%) invert(47%) sepia(61%) saturate(558%) hue-rotate(101deg) brightness(94%) contrast(86%)',
                    }}
                  />
                </div>
                <h4 className="font-space-grotesk mb-2 text-lg font-semibold text-brand-slate-gray">
                  Service Mesh & Networking
                </h4>
                <p className="font-inter text-sm text-brand-slate-gray">
                  Istio, Envoy, and Cilium for secure, observable
                  service-to-service communication.
                </p>
              </div>

              <div className="flex flex-col items-center rounded-lg bg-brand-glacier-white p-6 text-center">
                <div className="relative mb-4 h-12 w-12">
                  <Image
                    src={HelmIcon}
                    alt="Helm"
                    width={48}
                    height={48}
                    className="h-full w-full object-contain"
                    style={{
                      filter:
                        'brightness(0) saturate(100%) invert(75%) sepia(32%) saturate(1207%) hue-rotate(357deg) brightness(98%) contrast(84%)',
                    }}
                  />
                </div>
                <h4 className="font-space-grotesk mb-2 text-lg font-semibold text-brand-slate-gray">
                  Packaging & GitOps
                </h4>
                <p className="font-inter text-sm text-brand-slate-gray">
                  Helm, Argo, and Crossplane for application packaging and
                  deployment automation.
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
              baseSize={25}
              iconCount={18}
              animated={true}
            />

            {/* Default hero pattern - improved with larger icons */}
            <PatternExample
              title="Hero Section (Default)"
              description="Perfect balance for wide hero sections"
              opacity={0.15}
              variant="brand"
              baseSize={52}
              iconCount={38}
              animated={true}
            />

            {/* Dense dramatic pattern */}
            <PatternExample
              title="Dramatic Background"
              description="Dense, dramatic effect for special sections"
              opacity={0.2}
              variant="dark"
              baseSize={58}
              iconCount={55}
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
      {/* Button Showcase */}
      <section id="buttons-showcase" className="bg-white py-20">
        <Container>
          <div className="mb-16 text-center">
            <h2 className="font-space-grotesk mb-6 text-4xl font-bold text-brand-cloud-blue">
              Button Showcase
            </h2>
            <p className="font-inter mx-auto max-w-3xl text-xl text-brand-slate-gray">
              Our button system provides consistent, accessible interactions
              across all brand applications with clear visual hierarchy.
            </p>
          </div>

          <ButtonShowcase />

          {/* Icon Usage Examples */}
          <div className="mt-16">
            <h3 className="font-space-grotesk mb-6 text-2xl font-semibold text-brand-slate-gray">
              Icons in UI Components
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
        </Container>
      </section>

      {/* Hero Examples */}
      <section id="hero-examples" className="bg-brand-glacier-white py-20">
        <Container>
          <div className="mb-16 text-center">
            <h2 className="font-space-grotesk mb-6 text-4xl font-bold text-brand-cloud-blue">
              Hero Examples
            </h2>
            <p className="font-inter mx-auto max-w-3xl text-xl text-brand-slate-gray">
              Hero sections showcase our brand&apos;s visual impact through
              compelling combinations of typography, color, and cloud native
              patterns.
            </p>
          </div>

          <BrandingExampleHeroSection />
        </Container>
      </section>

      {/* Speaker Examples */}
      <section id="speaker-examples" className="bg-white py-20">
        <Container>
          <div className="mb-16 text-center">
            <h2 className="font-space-grotesk mb-6 text-4xl font-bold text-brand-cloud-blue">
              Speaker Examples
            </h2>
            <p className="font-inter mx-auto max-w-3xl text-xl text-brand-slate-gray">
              Showcase conference speakers with flexible, brand-consistent
              layouts. From keynote heroes to compact grids, these examples
              demonstrate various ways to highlight our community experts using
              real conference data.
            </p>
          </div>

          <div className="space-y-20">
            {/* Featured Speaker */}
            {conference?.featured_speakers &&
              conference.featured_speakers.length > 0 && (
                <div>
                  <div className="mb-8">
                    <h3 className="font-space-grotesk mb-4 text-2xl font-semibold text-brand-slate-gray">
                      Featured Speaker
                    </h3>
                    <p className="font-inter text-gray-600">
                      Streamlined presentation for featured speakers with
                      essential information and clean visual design. Perfect for
                      homepage highlights and key announcements.
                    </p>
                  </div>

                  <SpeakerPromotion
                    speaker={conference.featured_speakers[0]}
                    isFeatured={true}
                    variant="featured"
                    ctaText="View Speaker"
                  />
                </div>
              )}

            {/* Three Featured Speakers */}
            {conference?.featured_speakers &&
              conference.featured_speakers.length >= 3 && (
                <div>
                  <div className="mb-8">
                    <h3 className="font-space-grotesk mb-4 text-2xl font-semibold text-brand-slate-gray">
                      Three Featured Speakers
                    </h3>
                    <p className="font-inter text-gray-600">
                      Perfect for highlighting key speakers with balanced visual
                      weight. Ideal for homepage features and conference
                      announcements.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                    {conference.featured_speakers.slice(0, 3).map((speaker) => (
                      <SpeakerPromotion
                        key={speaker._id}
                        speaker={speaker}
                        variant="card"
                        ctaText="View Profile"
                      />
                    ))}
                  </div>
                </div>
              )}

            {/* Six Speaker Grid */}
            {conference?.featured_speakers &&
              conference.featured_speakers.length >= 6 && (
                <div>
                  <div className="mb-8">
                    <h3 className="font-space-grotesk mb-4 text-2xl font-semibold text-brand-slate-gray">
                      Six Speaker Grid
                    </h3>
                    <p className="font-inter text-gray-600">
                      Comprehensive speaker showcase for full conference
                      lineups. Maintains visual consistency while showing
                      diversity of expertise.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                    {conference.featured_speakers.slice(0, 6).map((speaker) => (
                      <SpeakerPromotion
                        key={speaker._id}
                        speaker={speaker}
                        variant="card"
                        ctaText="Learn More"
                      />
                    ))}
                  </div>
                </div>
              )}

            {/* Compact Speaker List */}
            {conference?.featured_speakers &&
              conference.featured_speakers.length >= 4 && (
                <div>
                  <div className="mb-8">
                    <h3 className="font-space-grotesk mb-4 text-2xl font-semibold text-brand-slate-gray">
                      Compact Speaker List
                    </h3>
                    <p className="font-inter text-gray-600">
                      Space-efficient format for agenda pages and speaker
                      directories. Shows essential information with talk details
                      prominently featured.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {conference.featured_speakers
                      .slice(0, 6)
                      .map((speaker, index) => (
                        <SpeakerPromotion
                          key={speaker._id}
                          speaker={speaker}
                          isFeatured={index === 0}
                          variant="compact"
                          ctaText="View Details"
                        />
                      ))}
                  </div>
                </div>
              )}

            {/* Social Media Cards */}
            {conference?.featured_speakers &&
              conference.featured_speakers.length >= 4 && (
                <div>
                  <div className="mb-8">
                    <h3 className="font-space-grotesk mb-4 text-2xl font-semibold text-brand-slate-gray">
                      Social Media Cards
                    </h3>
                    <p className="font-inter text-gray-600">
                      Optimized for social sharing and promotional content.
                      Perfect for LinkedIn posts, Twitter announcements, and
                      conference marketing.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                    {conference.featured_speakers
                      .slice(0, 4)
                      .map((speaker, index) => (
                        <SpeakerPromotion
                          key={speaker._id}
                          speaker={speaker}
                          isFeatured={index === 0}
                          variant="social"
                          ctaText="Follow"
                        />
                      ))}
                  </div>
                </div>
              )}

            {/* Speaker Directory */}
            {conference?.featured_speakers &&
              conference.featured_speakers.length >= 8 && (
                <div>
                  <div className="mb-8">
                    <h3 className="font-space-grotesk mb-4 text-2xl font-semibold text-brand-slate-gray">
                      Speaker Directory
                    </h3>
                    <p className="font-inter text-gray-600">
                      Comprehensive speaker listing for conference programs and
                      attendee guides. Maximizes information density while
                      maintaining readability.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                    {conference.featured_speakers
                      .slice(0, 10)
                      .map((speaker) => (
                        <SpeakerPromotion
                          key={speaker._id}
                          speaker={speaker}
                          variant="compact"
                          ctaText="View"
                        />
                      ))}
                  </div>
                </div>
              )}

            {/* Mixed Layout Example */}
            {conference?.featured_speakers &&
              conference.featured_speakers.length >= 6 && (
                <div>
                  <div className="mb-8">
                    <h3 className="font-space-grotesk mb-4 text-2xl font-semibold text-brand-slate-gray">
                      Mixed Layout
                    </h3>
                    <p className="font-inter text-gray-600">
                      Combines different speaker presentation styles for
                      dynamic, engaging layouts. Perfect for conference websites
                      that need visual variety and clear hierarchy.
                    </p>
                  </div>

                  <div className="space-y-8">
                    {/* Featured speaker at top */}
                    <div className="mb-8">
                      <SpeakerPromotion
                        speaker={conference.featured_speakers[0]}
                        isFeatured={true}
                        variant="featured"
                        ctaText="View Speaker"
                      />
                    </div>

                    {/* Three card speakers */}
                    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                      {conference.featured_speakers
                        .slice(1, 4)
                        .map((speaker) => (
                          <SpeakerPromotion
                            key={speaker._id}
                            speaker={speaker}
                            variant="card"
                            ctaText="View Profile"
                          />
                        ))}
                    </div>

                    {/* Compact list for additional speakers */}
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                      {conference.featured_speakers
                        .slice(4, 10)
                        .map((speaker) => (
                          <SpeakerPromotion
                            key={speaker._id}
                            speaker={speaker}
                            variant="compact"
                            ctaText="View Details"
                          />
                        ))}
                    </div>
                  </div>
                </div>
              )}

            {/* Design Guidelines */}
            <div className="rounded-xl bg-brand-sky-mist p-8">
              <h3 className="font-space-grotesk mb-6 text-2xl font-semibold text-brand-cloud-blue">
                Speaker Display Guidelines
              </h3>

              <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
                <div>
                  <h4 className="font-inter mb-4 text-lg font-semibold text-brand-slate-gray">
                    Layout Recommendations
                  </h4>
                  <ul className="font-inter space-y-3 text-brand-slate-gray">
                    <li className="flex items-start">
                      <span className="mt-1.5 mr-3 h-2 w-2 flex-shrink-0 rounded-full bg-brand-cloud-blue"></span>
                      <span>
                        <strong>Featured Layout:</strong> Compact yet impactful
                        design for keynote speakers and main announcements
                      </span>
                    </li>
                    <li className="flex items-start">
                      <span className="mt-1.5 mr-3 h-2 w-2 flex-shrink-0 rounded-full bg-brand-cloud-blue"></span>
                      <span>
                        <strong>3-Speaker Grid:</strong> Perfect for homepage
                        highlights and featured speaker sections
                      </span>
                    </li>
                    <li className="flex items-start">
                      <span className="mt-1.5 mr-3 h-2 w-2 flex-shrink-0 rounded-full bg-brand-cloud-blue"></span>
                      <span>
                        <strong>6-Speaker Grid:</strong> Ideal for complete
                        conference lineups and speaker pages
                      </span>
                    </li>
                    <li className="flex items-start">
                      <span className="mt-1.5 mr-3 h-2 w-2 flex-shrink-0 rounded-full bg-brand-cloud-blue"></span>
                      <span>
                        <strong>Compact Format:</strong> Use for agenda pages
                        and speaker directories
                      </span>
                    </li>
                    <li className="flex items-start">
                      <span className="mt-1.5 mr-3 h-2 w-2 flex-shrink-0 rounded-full bg-brand-cloud-blue"></span>
                      <span>
                        <strong>Social Cards:</strong> Optimized for social
                        media sharing and promotion
                      </span>
                    </li>
                  </ul>
                </div>

                <div>
                  <h4 className="font-inter mb-4 text-lg font-semibold text-brand-slate-gray">
                    Content Hierarchy
                  </h4>
                  <ul className="font-inter space-y-3 text-brand-slate-gray">
                    <li className="flex items-start">
                      <span className="mt-1.5 mr-3 h-2 w-2 flex-shrink-0 rounded-full bg-brand-fresh-green"></span>
                      <span>
                        <strong>Name:</strong> Primary focus with largest text
                        size
                      </span>
                    </li>
                    <li className="flex items-start">
                      <span className="mt-1.5 mr-3 h-2 w-2 flex-shrink-0 rounded-full bg-brand-fresh-green"></span>
                      <span>
                        <strong>Title & Company:</strong> Secondary information
                        for context
                      </span>
                    </li>
                    <li className="flex items-start">
                      <span className="mt-1.5 mr-3 h-2 w-2 flex-shrink-0 rounded-full bg-brand-fresh-green"></span>
                      <span>
                        <strong>Talk Information:</strong> Shows format badges
                        and talk titles when available
                      </span>
                    </li>
                    <li className="flex items-start">
                      <span className="mt-1.5 mr-3 h-2 w-2 flex-shrink-0 rounded-full bg-brand-fresh-green"></span>
                      <span>
                        <strong>Biography:</strong> Included in featured and
                        card layouts for depth
                      </span>
                    </li>
                    <li className="flex items-start">
                      <span className="mt-1.5 mr-3 h-2 w-2 flex-shrink-0 rounded-full bg-brand-fresh-green"></span>
                      <span>
                        <strong>Keynote Badge:</strong> Special highlighting for
                        keynote speakers
                      </span>
                    </li>
                  </ul>
                </div>
              </div>

              <div className="mt-8 rounded-lg bg-white/50 p-6">
                <h4 className="font-inter mb-3 text-lg font-semibold text-brand-slate-gray">
                  Accessibility & Performance
                </h4>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <ul className="font-inter space-y-2 text-sm text-brand-slate-gray">
                    <li>• High contrast ratios for all text elements</li>
                    <li>• Keyboard navigation support throughout</li>
                    <li>• Screen reader optimized alt text and labels</li>
                    <li>• Focus indicators on all interactive elements</li>
                  </ul>
                  <ul className="font-inter space-y-2 text-sm text-brand-slate-gray">
                    <li>• Optimized images with proper sizing</li>
                    <li>• Lazy loading for large speaker grids</li>
                    <li>• Responsive layouts for all screen sizes</li>
                    <li>• Progressive enhancement for slower connections</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </Container>
      </section>

      {/* Talk Examples */}
      <section id="talk-examples" className="bg-brand-glacier-white py-20">
        <Container>
          <div className="mb-16 text-center">
            <h2 className="font-space-grotesk mb-6 text-4xl font-bold text-brand-cloud-blue">
              Talk Examples
            </h2>
            <p className="font-inter mx-auto max-w-3xl text-xl text-brand-slate-gray">
              Talk cards and promotions showcase conference presentations with
              format-specific styling and clear visual hierarchy.
            </p>
          </div>

          <div className="space-y-16">
            {/* Talk Card Examples */}
            <div>
              <h3 className="font-space-grotesk mb-6 text-2xl font-semibold text-brand-slate-gray">
                Talk Card Examples
              </h3>
              <p className="font-inter mb-8 text-gray-600">
                Talk cards showcase conference presentations with
                format-specific styling and branding elements.
              </p>

              <div className="space-y-8">
                {/* Card Variants */}
                <div>
                  <h4 className="font-space-grotesk mb-4 text-lg font-semibold text-brand-cloud-blue">
                    Card Variants
                  </h4>
                  <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                    <TalkPromotion
                      title="Building Resilient Microservices"
                      speaker="Dr. Sarah Chen"
                      format={Format.presentation_45}
                      level="intermediate"
                      topic="Architecture"
                      description="Learn how to design fault-tolerant microservices that can handle failures gracefully and maintain system reliability."
                      variant="featured"
                    />

                    <TalkPromotion
                      title="Kubernetes Security Best Practices"
                      speaker="Marcus Rodriguez"
                      format={Format.presentation_25}
                      level="advanced"
                      topic="Security"
                      description="Essential security patterns and practices for running Kubernetes in production environments."
                    />

                    <TalkPromotion
                      title="Quick Start with Helm"
                      speaker="Emma Thompson"
                      format={Format.lightning_10}
                      level="beginner"
                      topic="Tools"
                      variant="compact"
                    />
                  </div>
                </div>

                {/* Format Showcase */}
                <div>
                  <h4 className="font-space-grotesk mb-4 text-lg font-semibold text-brand-cloud-blue">
                    Talk Format Showcase
                  </h4>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
                    <TalkPromotion
                      title="CI/CD in 10 Minutes"
                      speaker="Alex Kim"
                      format={Format.lightning_10}
                      level="beginner"
                      variant="compact"
                    />

                    <TalkPromotion
                      title="Container Orchestration"
                      speaker="Jordan Lee"
                      format={Format.presentation_20}
                      level="intermediate"
                      variant="compact"
                    />

                    <TalkPromotion
                      title="Deep Dive: Service Mesh"
                      speaker="Taylor Wong"
                      format={Format.presentation_40}
                      level="advanced"
                      variant="compact"
                    />

                    <TalkPromotion
                      title="Hands-on GitOps"
                      speaker="Casey Miller"
                      format={Format.workshop_120}
                      level="intermediate"
                      variant="compact"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Talk Promotion Examples */}
            <div>
              <h3 className="font-space-grotesk mb-6 text-2xl font-semibold text-brand-slate-gray">
                Talk Promotion Examples
              </h3>
              <p className="font-inter mb-8 text-gray-600">
                Promotional components for highlighting featured talks and
                driving engagement.
              </p>

              <div className="space-y-8">
                {/* Banner Promotion */}
                <div>
                  <h4 className="font-space-grotesk mb-4 text-lg font-semibold text-brand-cloud-blue">
                    Banner Promotion
                  </h4>
                  <TalkPromotion
                    title="The Future of Cloud Native Computing"
                    speaker="Dr. Kubernetes Expert"
                    format={Format.presentation_45}
                    date="March 15, 2025"
                    time="14:00 - 14:45"
                    location="Main Stage"
                    description="Explore the next generation of cloud native technologies and their impact on modern software development. This keynote will cover emerging trends in container orchestration, serverless computing, and edge computing."
                    ctaText="Reserve Your Seat"
                    variant="banner"
                  />
                </div>

                {/* Card and Social Promotions */}
                <div>
                  <h4 className="font-space-grotesk mb-4 text-lg font-semibold text-brand-cloud-blue">
                    Card & Social Promotions
                  </h4>
                  <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-3">
                    <TalkPromotion
                      title="Workshop: GitOps with ArgoCD"
                      speaker="DevOps Specialist"
                      format={Format.workshop_120}
                      date="March 16, 2025"
                      time="09:00 - 11:00"
                      location="Workshop Room A"
                      description="Hands-on workshop covering GitOps principles and practical implementation with ArgoCD."
                      ctaText="Join Workshop"
                    />

                    <TalkPromotion
                      title="Lightning: WebAssembly & Cloud"
                      speaker="WASM Enthusiast"
                      format={Format.lightning_10}
                      date="March 15, 2025"
                      time="16:30 - 16:40"
                      location="Lightning Stage"
                      description="Quick dive into how WebAssembly is changing cloud computing."
                      ctaText="Watch Live"
                    />

                    <TalkPromotion
                      title="Observability at Scale"
                      speaker="SRE Lead"
                      format={Format.presentation_25}
                      date="March 15, 2025"
                      location="Tech Stage"
                      description="Learn to monitor and observe large-scale distributed systems effectively."
                      variant="social"
                      ctaText="Learn More"
                    />
                  </div>
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
    </div>
  )
}
