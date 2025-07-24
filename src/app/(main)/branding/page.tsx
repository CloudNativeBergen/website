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
  DownloadSpeakerImage,
} from '@/components/branding'
import { colorPalette, typography } from '@/lib/branding/data'

import { TalkPromotion } from '@/components/TalkPromotion'
import { SpeakerPromotion } from '@/components/SpeakerPromotion'
import {
  ProposalAcceptTemplate,
  ProposalRejectTemplate,
  SpeakerBroadcastTemplate,
  SpeakerEmailTemplate,
  BroadcastEmailTemplate,
  BaseEmailTemplate,
} from '@/components/email'
import { CallToAction } from '@/components/CallToAction'
import { Format } from '@/lib/proposal/types'
import { getConferenceForCurrentDomain } from '../../../lib/conference/sanity'

export const metadata: Metadata = {
  title: 'Brand Guidelines - Cloud Native Day Bergen',
  description: 'Brand guidelines and design system for Cloud Native Day Bergen',
}

export default async function BrandingPage() {
  const { conference, domain } = await getConferenceForCurrentDomain({
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
              <a
                href="#cta-examples"
                className="font-inter text-sm font-medium text-brand-slate-gray transition-colors hover:text-brand-cloud-blue"
              >
                Call to Action
              </a>
              <a
                href="#email-templates"
                className="font-inter text-sm font-medium text-brand-slate-gray transition-colors hover:text-brand-cloud-blue"
              >
                Email Templates
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

            {/* Social Image for Speaker Sharing */}
            {conference?.featured_speakers &&
              conference.featured_speakers.length >= 2 && (
                <div>
                  <div className="mb-8">
                    <h3 className="font-space-grotesk mb-4 text-2xl font-semibold text-brand-slate-gray">
                      Speaker Share Images
                    </h3>
                    <p className="font-inter text-gray-600">
                      Branded images speakers can share on their own social
                      media with &ldquo;I&rsquo;m speaking at [event]&rdquo;
                      message. Includes QR code linking to their speaker profile
                      and talk details.
                    </p>
                    <div className="mt-4 rounded-lg bg-blue-50 p-4">
                      <p className="font-inter text-sm text-blue-800">
                        <strong className="text-brand-cloud-blue">
                          💡 Try the Download Feature!
                        </strong>
                        <br />
                        Click &ldquo;Download as PNG&rdquo; below the first
                        speaker card to save a high-quality image. The download
                        may take a few seconds to process as it waits for all
                        content (including QR codes) to load properly.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
                    {/* First speaker with download functionality */}
                    <DownloadSpeakerImage
                      filename={`${
                        conference.featured_speakers[0]?.slug
                      }-share`}
                    >
                      <SpeakerPromotion
                        speaker={conference.featured_speakers[0]}
                        variant="speaker-share"
                        eventName={conference.title || 'Cloud Native Bergen'}
                        ctaText="View Profile"
                      />
                    </DownloadSpeakerImage>

                    {/* Remaining speakers without download */}
                    {conference.featured_speakers.slice(1, 3).map((speaker) => (
                      <SpeakerPromotion
                        key={speaker._id}
                        speaker={speaker}
                        variant="speaker-share"
                        eventName={conference.title || 'Cloud Native Bergen'}
                        ctaText="View Profile"
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
                        <strong>Speaker Share Images:</strong> Branded 4:5 ratio
                        images for speakers to share &ldquo;I&rsquo;m speaking
                        at [event]&rdquo; with QR codes
                      </span>
                    </li>
                    <li className="flex items-start">
                      <span className="mt-1.5 mr-3 h-2 w-2 flex-shrink-0 rounded-full bg-brand-cloud-blue"></span>
                      <span>
                        <strong>Speaker Spotlight Images:</strong>{' '}
                        Conference-branded 4:5 ratio promotional images with QR
                        codes for speaker promotion
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

              <div className="mt-8 rounded-lg bg-brand-sky-mist/50 p-6">
                <h4 className="font-inter mb-3 text-lg font-semibold text-brand-cloud-blue">
                  QR Code Integration
                </h4>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <ul className="font-inter space-y-2 text-sm text-brand-slate-gray">
                    <li>• Automatically generated for social image variants</li>
                    <li>• Links to full speaker profile and talk details</li>
                    <li>• High contrast design for reliable scanning</li>
                    <li>• Optimized size for mobile camera scanning</li>
                  </ul>
                  <ul className="font-inter space-y-2 text-sm text-brand-slate-gray">
                    <li>• White background with dark QR pattern</li>
                    <li>• Rounded corners to match design language</li>
                    <li>• Positioned for easy access without UI overlap</li>
                    <li>
                      • Error correction level ensures scanning reliability
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

      {/* Call to Action Examples */}
      <section id="cta-examples" className="bg-white py-20">
        <Container>
          <div className="mb-16 text-center">
            <h2 className="font-space-grotesk mb-6 text-4xl font-bold text-brand-cloud-blue">
              Call to Action Examples
            </h2>
            <p className="font-inter mx-auto max-w-3xl text-xl text-brand-slate-gray">
              Call to action components drive engagement and conversions across
              the conference website. These reusable components can be
              customized for different contexts while maintaining consistent
              branding and accessibility standards.
            </p>
          </div>

          <div className="space-y-16">
            {/* Standard Call to Action */}
            <div>
              <h3 className="font-space-grotesk mb-6 text-2xl font-semibold text-brand-slate-gray">
                Standard Call to Action
              </h3>
              <p className="font-inter mb-8 text-lg text-brand-slate-gray">
                The default configuration encourages both speaker submissions
                and ticket reservations with balanced messaging.
              </p>
              <div className="rounded-lg border border-gray-200 bg-white p-8">
                <CallToAction />
              </div>
            </div>

            {/* Organizers Context */}
            <div>
              <h3 className="font-space-grotesk mb-6 text-2xl font-semibold text-brand-slate-gray">
                Organizers Context
              </h3>
              <p className="font-inter mb-8 text-lg text-brand-slate-gray">
                When used in organizer-facing contexts, the messaging and button
                styling adapt to focus on community engagement.
              </p>
              <div className="rounded-lg border border-gray-200 bg-white p-8">
                <CallToAction
                  isOrganizers={true}
                  title="Join Our Community"
                  description="Whether you're looking to share your expertise or learn from the best, we'd love to have you at Cloud Native Bergen."
                />
              </div>
            </div>

            {/* Speaker Focus */}
            <div>
              <h3 className="font-space-grotesk mb-6 text-2xl font-semibold text-brand-slate-gray">
                Speaker Submission Focus
              </h3>
              <p className="font-inter mb-8 text-lg text-brand-slate-gray">
                Configuration that emphasizes speaker submissions while hiding
                ticket reservations for CFP-focused pages.
              </p>
              <div className="rounded-lg border border-gray-200 bg-white p-8">
                <CallToAction
                  title="Share Your Expertise"
                  description="Join our community of cloud native experts and share your knowledge with the Bergen tech community."
                  showTicketReservation={false}
                />
              </div>
            </div>

            {/* Ticket Focus */}
            <div>
              <h3 className="font-space-grotesk mb-6 text-2xl font-semibold text-brand-slate-gray">
                Ticket Reservation Focus
              </h3>
              <p className="font-inter mb-8 text-lg text-brand-slate-gray">
                Configuration that focuses solely on ticket sales when the CFP
                period has ended.
              </p>
              <div className="rounded-lg border border-gray-200 bg-white p-8">
                <CallToAction
                  title="Secure Your Spot"
                  description="Don't miss this opportunity to learn from industry experts and connect with the Bergen cloud native community."
                  showSpeakerSubmission={false}
                />
              </div>
            </div>

            {/* Custom Messaging */}
            <div>
              <h3 className="font-space-grotesk mb-6 text-2xl font-semibold text-brand-slate-gray">
                Custom Messaging
              </h3>
              <p className="font-inter mb-8 text-lg text-brand-slate-gray">
                Fully customizable title and description for specific campaigns
                or landing pages.
              </p>
              <div className="rounded-lg border border-gray-200 bg-white p-8">
                <CallToAction
                  title="Early Bird Special"
                  description="Register now and save 40% on your conference ticket. Limited time offer for the Bergen cloud native community."
                />
              </div>
            </div>

            {/* Component Documentation */}
            <div className="rounded-xl bg-brand-glacier-white p-8">
              <h3 className="font-space-grotesk mb-6 text-2xl font-semibold text-brand-slate-gray">
                Component Features & Usage
              </h3>
              <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
                <div>
                  <h4 className="font-space-grotesk mb-4 text-lg font-semibold text-brand-cloud-blue">
                    Customizable Props
                  </h4>
                  <ul className="font-inter space-y-2 text-brand-slate-gray">
                    <li className="flex items-start">
                      <span className="mt-1.5 mr-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-brand-cloud-blue"></span>
                      <span>
                        <code className="rounded bg-gray-100 px-1.5 py-0.5 text-sm">
                          isOrganizers
                        </code>{' '}
                        - Changes messaging and button styles
                      </span>
                    </li>
                    <li className="flex items-start">
                      <span className="mt-1.5 mr-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-brand-cloud-blue"></span>
                      <span>
                        <code className="rounded bg-gray-100 px-1.5 py-0.5 text-sm">
                          title
                        </code>{' '}
                        - Custom headline text
                      </span>
                    </li>
                    <li className="flex items-start">
                      <span className="mt-1.5 mr-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-brand-cloud-blue"></span>
                      <span>
                        <code className="rounded bg-gray-100 px-1.5 py-0.5 text-sm">
                          description
                        </code>{' '}
                        - Custom description text
                      </span>
                    </li>
                    <li className="flex items-start">
                      <span className="mt-1.5 mr-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-brand-cloud-blue"></span>
                      <span>
                        <code className="rounded bg-gray-100 px-1.5 py-0.5 text-sm">
                          showSpeakerSubmission
                        </code>{' '}
                        - Toggle CFP button
                      </span>
                    </li>
                    <li className="flex items-start">
                      <span className="mt-1.5 mr-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-brand-cloud-blue"></span>
                      <span>
                        <code className="rounded bg-gray-100 px-1.5 py-0.5 text-sm">
                          showTicketReservation
                        </code>{' '}
                        - Toggle ticket button
                      </span>
                    </li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-space-grotesk mb-4 text-lg font-semibold text-brand-cloud-blue">
                    Design Features
                  </h4>
                  <ul className="font-inter space-y-2 text-brand-slate-gray">
                    <li className="flex items-start">
                      <span className="mt-1.5 mr-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-brand-fresh-green"></span>
                      <span>Gradient background with brand colors</span>
                    </li>
                    <li className="flex items-start">
                      <span className="mt-1.5 mr-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-brand-fresh-green"></span>
                      <span>
                        Responsive button layout (stacked to horizontal)
                      </span>
                    </li>
                    <li className="flex items-start">
                      <span className="mt-1.5 mr-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-brand-fresh-green"></span>
                      <span>Accessible ARIA labels and semantic markup</span>
                    </li>
                    <li className="flex items-start">
                      <span className="mt-1.5 mr-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-brand-fresh-green"></span>
                      <span>Icons from Heroicons for visual clarity</span>
                    </li>
                    <li className="flex items-start">
                      <span className="mt-1.5 mr-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-brand-fresh-green"></span>
                      <span>Conditional urgency messaging</span>
                    </li>
                  </ul>
                </div>
              </div>

              <div className="mt-8 rounded-lg bg-white p-6">
                <h4 className="font-space-grotesk mb-4 text-lg font-semibold text-brand-cloud-blue">
                  Usage Guidelines
                </h4>
                <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                  <div>
                    <h5 className="font-space-grotesk mb-2 text-sm font-semibold text-brand-slate-gray">
                      Placement
                    </h5>
                    <p className="font-inter text-sm text-brand-slate-gray">
                      Use at natural break points in content flow, typically
                      after speaker showcases or information sections.
                    </p>
                  </div>
                  <div>
                    <h5 className="font-space-grotesk mb-2 text-sm font-semibold text-brand-slate-gray">
                      Frequency
                    </h5>
                    <p className="font-inter text-sm text-brand-slate-gray">
                      Limit to 1-2 instances per page to avoid overwhelming
                      users while maintaining conversion opportunities.
                    </p>
                  </div>
                  <div>
                    <h5 className="font-space-grotesk mb-2 text-sm font-semibold text-brand-slate-gray">
                      Context
                    </h5>
                    <p className="font-inter text-sm text-brand-slate-gray">
                      Adapt button visibility and messaging based on page
                      purpose (CFP pages vs. general conference info).
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Container>
      </section>

      {/* Email Templates */}
      <section id="email-templates" className="bg-brand-glacier-white py-20">
        <Container>
          <div className="mb-16 text-center">
            <h2 className="font-space-grotesk mb-6 text-4xl font-bold text-brand-cloud-blue">
              Email Templates
            </h2>
            <p className="font-inter mx-auto max-w-3xl text-xl text-brand-slate-gray">
              Professional email templates for all conference communications.
              These templates maintain consistent branding, provide clear
              communication, and ensure accessibility across different email
              clients. Our template system includes automated proposal
              responses, speaker communications, and community updates.
            </p>
          </div>

          {/* Template Architecture Overview */}
          <div className="mb-16">
            <h3 className="font-space-grotesk mb-8 text-center text-3xl font-semibold text-brand-slate-gray">
              Template Architecture
            </h3>
            <div className="rounded-xl bg-white p-8 shadow-lg">
              <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
                <div className="text-center">
                  <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-brand-cloud-blue/20">
                    <span className="text-2xl font-bold text-brand-cloud-blue">
                      1
                    </span>
                  </div>
                  <h4 className="font-space-grotesk mb-3 text-lg font-semibold text-brand-slate-gray">
                    Base Template
                  </h4>
                  <p className="font-inter text-sm text-brand-slate-gray">
                    Foundation layout with consistent branding, responsive
                    design, and email client compatibility.
                  </p>
                </div>
                <div className="text-center">
                  <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-brand-fresh-green/20">
                    <span className="text-2xl font-bold text-brand-fresh-green">
                      2
                    </span>
                  </div>
                  <h4 className="font-space-grotesk mb-3 text-lg font-semibold text-brand-slate-gray">
                    Specialized Templates
                  </h4>
                  <p className="font-inter text-sm text-brand-slate-gray">
                    Purpose-built templates for proposals, speaker
                    communications, and community broadcasts.
                  </p>
                </div>
                <div className="text-center">
                  <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-accent-purple/20">
                    <span className="text-2xl font-bold text-accent-purple">
                      3
                    </span>
                  </div>
                  <h4 className="font-space-grotesk mb-3 text-lg font-semibold text-brand-slate-gray">
                    Automated System
                  </h4>
                  <p className="font-inter text-sm text-brand-slate-gray">
                    Integrated with Resend service for reliable delivery, rate
                    limiting, and audience management.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Proposal Response Templates */}
          <div className="mb-16">
            <h3 className="font-space-grotesk mb-8 text-center text-3xl font-semibold text-brand-slate-gray">
              Proposal Response Templates
            </h3>
            <p className="font-inter mb-12 text-center text-lg text-brand-slate-gray">
              Automated responses for Call for Papers submissions with
              appropriate tone and clear next steps for both accepted and
              rejected proposals.
            </p>

            <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
              {/* Proposal Acceptance Email */}
              <div>
                <h4 className="font-space-grotesk mb-4 text-xl font-semibold text-brand-fresh-green">
                  ✅ Proposal Acceptance Email
                </h4>
                <p className="font-inter mb-6 text-sm text-brand-slate-gray">
                  Celebratory tone with clear next steps and confirmation
                  requirements.
                </p>

                {/* Email Client Frame */}
                <div className="rounded-xl bg-gray-100 shadow-2xl">
                  {/* Email Client Header */}
                  <div className="rounded-t-lg bg-gray-200 px-4 py-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <div className="h-3 w-3 rounded-full bg-red-500"></div>
                        <div className="h-3 w-3 rounded-full bg-yellow-500"></div>
                        <div className="h-3 w-3 rounded-full bg-green-500"></div>
                      </div>
                      <div className="font-inter text-sm font-medium text-gray-600">
                        Mail
                      </div>
                      <div className="w-16"></div>
                    </div>
                  </div>

                  {/* Email Header Bar */}
                  <div className="border-b border-gray-200 bg-white px-4 py-3">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center space-x-4">
                        <span className="font-semibold text-gray-900">
                          From:
                        </span>
                        <span className="text-gray-600">
                          {conference.contact_email}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500">Today 2:30 PM</div>
                    </div>
                    <div className="mt-1 flex items-center space-x-4 text-sm">
                      <span className="font-semibold text-gray-900">To:</span>
                      <span className="text-gray-600">
                        alex.johnson@example.com
                      </span>
                    </div>
                    <div className="mt-2">
                      <h5 className="font-semibold text-gray-900">
                        🎉 Your proposal has been accepted!
                      </h5>
                    </div>
                  </div>

                  {/* Email Content */}
                  <div className="rounded-b-lg bg-white p-6">
                    <ProposalAcceptTemplate
                      speakerName="Alex Johnson"
                      proposalTitle="Building Resilient Microservices with Kubernetes"
                      eventName={conference.title}
                      eventLocation={`${conference.city}, ${conference.country}`}
                      eventDate="June 15, 2025"
                      eventUrl={`https://${domain}/`}
                      confirmUrl={`https://${domain}/confirm/abc123`}
                      comment="We were particularly impressed with your hands-on approach and real-world examples. We'd love to have you present in the main auditorium."
                      socialLinks={conference.social_links}
                    />
                  </div>
                </div>
              </div>

              {/* Proposal Rejection Email */}
              <div>
                <h4 className="font-space-grotesk mb-4 text-xl font-semibold text-brand-slate-gray">
                  📧 Proposal Rejection Email
                </h4>
                <p className="font-inter mb-6 text-sm text-brand-slate-gray">
                  Professional and encouraging tone while maintaining community
                  connection.
                </p>

                {/* Email Client Frame */}
                <div className="rounded-xl bg-gray-100 shadow-2xl">
                  {/* Email Client Header */}
                  <div className="rounded-t-lg bg-gray-200 px-4 py-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <div className="h-3 w-3 rounded-full bg-red-500"></div>
                        <div className="h-3 w-3 rounded-full bg-yellow-500"></div>
                        <div className="h-3 w-3 rounded-full bg-green-500"></div>
                      </div>
                      <div className="font-inter text-sm font-medium text-gray-600">
                        Mail
                      </div>
                      <div className="w-16"></div>
                    </div>
                  </div>

                  {/* Email Header Bar */}
                  <div className="border-b border-gray-200 bg-white px-4 py-3">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center space-x-4">
                        <span className="font-semibold text-gray-900">
                          From:
                        </span>
                        <span className="text-gray-600">
                          {conference.contact_email}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500">
                        Today 10:15 AM
                      </div>
                    </div>
                    <div className="mt-1 flex items-center space-x-4 text-sm">
                      <span className="font-semibold text-gray-900">To:</span>
                      <span className="text-gray-600">
                        sarah.chen@example.com
                      </span>
                    </div>
                    <div className="mt-2">
                      <h5 className="font-semibold text-gray-900">
                        Thank you for your proposal submission
                      </h5>
                    </div>
                  </div>

                  {/* Email Content */}
                  <div className="rounded-b-lg bg-white p-6">
                    <ProposalRejectTemplate
                      speakerName="Sarah Chen"
                      proposalTitle="Advanced Container Security Patterns"
                      eventName={conference.title}
                      eventLocation={`${conference.city}, ${conference.country}`}
                      eventDate="June 15, 2025"
                      eventUrl={`https://${domain}/`}
                      comment="Your proposal showed great depth in security practices. While we couldn't include it this year due to similar topics already selected, we encourage you to submit for our next event."
                      socialLinks={conference.social_links}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Speaker Communication Templates */}
          <div className="mb-16">
            <h3 className="font-space-grotesk mb-8 text-center text-3xl font-semibold text-brand-slate-gray">
              Speaker Communication Templates
            </h3>
            <p className="font-inter mb-12 text-center text-lg text-brand-slate-gray">
              Direct communication templates for speaker outreach and
              speaker-specific broadcasts with rich content support.
            </p>

            <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
              {/* Speaker Email */}
              <div>
                <h4 className="font-space-grotesk mb-4 text-xl font-semibold text-brand-cloud-blue">
                  📩 Speaker Email
                </h4>
                <p className="font-inter mb-6 text-sm text-brand-slate-gray">
                  Direct communication with speakers on their proposals,
                  supporting both individual and multi-speaker conversations.
                </p>

                <div className="rounded-xl bg-gray-100 shadow-2xl">
                  <div className="rounded-t-lg bg-gray-200 px-4 py-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <div className="h-3 w-3 rounded-full bg-red-500"></div>
                        <div className="h-3 w-3 rounded-full bg-yellow-500"></div>
                        <div className="h-3 w-3 rounded-full bg-green-500"></div>
                      </div>
                      <div className="font-inter text-sm font-medium text-gray-600">
                        Mail
                      </div>
                      <div className="w-16"></div>
                    </div>
                  </div>

                  <div className="border-b border-gray-200 bg-white px-4 py-3">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center space-x-4">
                        <span className="font-semibold text-gray-900">
                          From:
                        </span>
                        <span className="text-gray-600">
                          {conference.contact_email}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500">Today 3:20 PM</div>
                    </div>
                    <div className="mt-1 flex items-center space-x-4 text-sm">
                      <span className="font-semibold text-gray-900">To:</span>
                      <span className="text-gray-600">All Speakers</span>
                    </div>
                    <div className="mt-2">
                      <h5 className="font-semibold text-gray-900">
                        Collaboration guidelines for your presentation
                      </h5>
                    </div>
                  </div>

                  <div className="rounded-b-lg bg-white p-6">
                    <SpeakerEmailTemplate
                      speakers={[
                        { name: 'Alex Chen', email: 'alex.chen@example.com' },
                        { name: 'Jordan Kim', email: 'jordan.kim@example.com' },
                        { name: 'Sam Taylor', email: 'sam.taylor@example.com' },
                      ]}
                      proposalTitle="Building Cloud Native Applications with Microservices"
                      proposalUrl={`https://${domain}/admin/proposals/456`}
                      eventName={conference.title}
                      eventLocation={`${conference.city}, ${conference.country}`}
                      eventDate="June 15, 2025"
                      eventUrl={`https://${domain}/`}
                      subject="Collaboration guidelines for your presentation"
                      message="Dear Alex Chen, Jordan Kim, and Sam Taylor,\n\nSince you're presenting together, we wanted to share some guidelines for coordinating your presentation.\n\nPlease coordinate who will handle which sections and ensure your combined presentation fits within the allocated 45-minute slot including Q&A.\n\nWe've also arranged for a shared rehearsal space the day before the conference."
                      senderName="Conference Team"
                      socialLinks={conference.social_links || []}
                    />
                  </div>
                </div>
              </div>

              {/* Speaker Broadcast Email */}
              <div>
                <h4 className="font-space-grotesk mb-4 text-xl font-semibold text-brand-fresh-green">
                  📢 Speaker Broadcast Email
                </h4>
                <p className="font-inter mb-6 text-sm text-brand-slate-gray">
                  Rich content broadcasts to all confirmed speakers with
                  conference updates and announcements.
                </p>

                <div className="rounded-xl bg-gray-100 shadow-2xl">
                  <div className="rounded-t-lg bg-gray-200 px-4 py-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <div className="h-3 w-3 rounded-full bg-red-500"></div>
                        <div className="h-3 w-3 rounded-full bg-yellow-500"></div>
                        <div className="h-3 w-3 rounded-full bg-green-500"></div>
                      </div>
                      <div className="font-inter text-sm font-medium text-gray-600">
                        Mail
                      </div>
                      <div className="w-16"></div>
                    </div>
                  </div>

                  <div className="border-b border-gray-200 bg-white px-4 py-3">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center space-x-4">
                        <span className="font-semibold text-gray-900">
                          From:
                        </span>
                        <span className="text-gray-600">
                          {conference.contact_email}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500">
                        Yesterday 9:00 AM
                      </div>
                    </div>
                    <div className="mt-1 flex items-center space-x-4 text-sm">
                      <span className="font-semibold text-gray-900">To:</span>
                      <span className="text-gray-600">All Speakers</span>
                    </div>
                    <div className="mt-2">
                      <h5 className="font-semibold text-gray-900">
                        Speaker Dinner & Conference Updates
                      </h5>
                    </div>
                  </div>

                  <div className="rounded-b-lg bg-white p-6">
                    <SpeakerBroadcastTemplate
                      subject="Speaker Dinner & Conference Updates"
                      speakerName="Fellow Speaker"
                      eventName={conference.title}
                      eventLocation={`${conference.city}, ${conference.country}`}
                      eventDate="June 15, 2025"
                      eventUrl={`https://${domain}/`}
                      socialLinks={conference.social_links}
                      content={
                        <div>
                          <p
                            style={{
                              fontSize: '16px',
                              lineHeight: '1.6',
                              marginBottom: '16px',
                              marginTop: '0',
                              color: '#334155',
                            }}
                          >
                            We&apos;re excited to share some important updates
                            as we approach the conference date!
                          </p>

                          <h3
                            style={{
                              color: '#1D4ED8',
                              marginTop: '24px',
                              marginBottom: '12px',
                              fontFamily:
                                '"Space Grotesk", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                              fontSize: '18px',
                              fontWeight: '600',
                            }}
                          >
                            🍽️ Speaker Dinner - June 14th
                          </h3>
                          <p
                            style={{
                              fontSize: '16px',
                              lineHeight: '1.6',
                              marginBottom: '16px',
                              marginTop: '0',
                              color: '#334155',
                            }}
                          >
                            Join us for an exclusive speaker dinner at Lysverket
                            restaurant (19:00). This is a great opportunity to
                            connect with fellow speakers before the conference.
                            Please confirm your attendance by replying to this
                            email.
                          </p>

                          <h3
                            style={{
                              color: '#1D4ED8',
                              marginTop: '24px',
                              marginBottom: '12px',
                              fontFamily:
                                '"Space Grotesk", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                              fontSize: '18px',
                              fontWeight: '600',
                            }}
                          >
                            📋 Final Checklist
                          </h3>
                          <ul
                            style={{
                              margin: '0 0 16px 0',
                              paddingLeft: '20px',
                              color: '#334155',
                              fontSize: '16px',
                              lineHeight: '1.6',
                            }}
                          >
                            <li style={{ marginBottom: '8px' }}>
                              Test your slides with our AV team (contact details
                              below)
                            </li>
                            <li style={{ marginBottom: '8px' }}>
                              Review the updated schedule on our website
                            </li>
                            <li style={{ marginBottom: '8px' }}>
                              Prepare for the speaker meet & greet (30 min
                              before your talk)
                            </li>
                          </ul>
                        </div>
                      }
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* General Communication Templates */}
          <div className="mb-16">
            <h3 className="font-space-grotesk mb-8 text-center text-3xl font-semibold text-brand-slate-gray">
              General Communication Templates
            </h3>
            <p className="font-inter mb-12 text-center text-lg text-brand-slate-gray">
              Flexible templates for community announcements and general
              broadcasts with customizable content and unsubscribe management.
            </p>

            <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
              {/* Broadcast Email Template */}
              <div>
                <h4 className="font-space-grotesk mb-4 text-xl font-semibold text-accent-purple">
                  📻 Community Broadcast Email
                </h4>
                <p className="font-inter mb-6 text-sm text-brand-slate-gray">
                  General audience communications with rich HTML content and
                  unsubscribe management.
                </p>

                <div className="rounded-xl bg-gray-100 shadow-2xl">
                  <div className="rounded-t-lg bg-gray-200 px-4 py-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <div className="h-3 w-3 rounded-full bg-red-500"></div>
                        <div className="h-3 w-3 rounded-full bg-yellow-500"></div>
                        <div className="h-3 w-3 rounded-full bg-green-500"></div>
                      </div>
                      <div className="font-inter text-sm font-medium text-gray-600">
                        Mail
                      </div>
                      <div className="w-16"></div>
                    </div>
                  </div>

                  <div className="border-b border-gray-200 bg-white px-4 py-3">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center space-x-4">
                        <span className="font-semibold text-gray-900">
                          From:
                        </span>
                        <span className="text-gray-600">
                          {conference.contact_email}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500">
                        2 days ago 10:00 AM
                      </div>
                    </div>
                    <div className="mt-1 flex items-center space-x-4 text-sm">
                      <span className="font-semibold text-gray-900">To:</span>
                      <span className="text-gray-600">Community Member</span>
                    </div>
                    <div className="mt-2">
                      <h5 className="font-semibold text-gray-900">
                        Early Bird Tickets Now Available!
                      </h5>
                    </div>
                  </div>

                  <div className="rounded-b-lg bg-white p-6">
                    <BroadcastEmailTemplate
                      subject="Early Bird Tickets Now Available!"
                      recipientName="Community Member"
                      eventName={conference.title}
                      eventLocation={`${conference.city}, ${conference.country}`}
                      eventDate={new Date(
                        conference.start_date,
                      ).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      })}
                      eventUrl={`https://${conference.domains[0]}`}
                      socialLinks={conference.social_links || []}
                      unsubscribeUrl="https://example.com/unsubscribe" // Example unsubscribe URL for demo
                      content={`
                        <p>We're thrilled to announce that early bird tickets for ${conference.title} are now available!</p>

                        <h2 style="color: #1D4ED8; font-size: 18px; margin: 24px 0 12px 0;">🎟️ Ticket Information</h2>
                        <ul>
                          <li><strong>Early Bird Price:</strong> 299 NOK (Regular: 499 NOK)</li>
                          <li><strong>Available Until:</strong> March 31st, 2025</li>
                          <li><strong>Includes:</strong> Full conference access, lunch, and networking reception</li>
                        </ul>

                        <h2 style="color: #1D4ED8; font-size: 18px; margin: 24px 0 12px 0;">🎤 Confirmed Speakers</h2>
                        <p>We have an amazing lineup including experts from Google, Microsoft, and the Cloud Native Computing Foundation.</p>

                        <div style="text-align: center; margin: 32px 0;">
                          <a href="https://tickets.cloudnativebergen.dev" style="background: linear-gradient(135deg, #1D4ED8 0%, #3B82F6 100%); color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block;">Get Your Ticket</a>
                        </div>
                      `}
                    />
                  </div>
                </div>
              </div>

              {/* Base Email Template Preview */}
              <div>
                <h4 className="font-space-grotesk mb-4 text-xl font-semibold text-brand-slate-gray">
                  🏗️ Base Email Template
                </h4>
                <p className="font-inter mb-6 text-sm text-brand-slate-gray">
                  Foundation template providing consistent structure, branding,
                  and email client compatibility.
                </p>

                <div className="rounded-xl bg-gray-100 shadow-2xl">
                  <div className="rounded-t-lg bg-gray-200 px-4 py-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <div className="h-3 w-3 rounded-full bg-red-500"></div>
                        <div className="h-3 w-3 rounded-full bg-yellow-500"></div>
                        <div className="h-3 w-3 rounded-full bg-green-500"></div>
                      </div>
                      <div className="font-inter text-sm font-medium text-gray-600">
                        Mail
                      </div>
                      <div className="w-16"></div>
                    </div>
                  </div>

                  <div className="border-b border-gray-200 bg-white px-4 py-3">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center space-x-4">
                        <span className="font-semibold text-gray-900">
                          From:
                        </span>
                        <span className="text-gray-600">
                          {conference.contact_email}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500">
                        1 week ago 3:15 PM
                      </div>
                    </div>
                    <div className="mt-1 flex items-center space-x-4 text-sm">
                      <span className="font-semibold text-gray-900">To:</span>
                      <span className="text-gray-600">
                        recipient@example.com
                      </span>
                    </div>
                    <div className="mt-2">
                      <h5 className="font-semibold text-gray-900">
                        Welcome to Cloud Native Bergen
                      </h5>
                    </div>
                  </div>

                  <div className="rounded-b-lg bg-white p-6">
                    <BaseEmailTemplate
                      title="Welcome to Cloud Native Bergen"
                      speakerName="Taylor Johnson"
                      proposalTitle="Getting Started with Cloud Native Development"
                      eventName={conference.title}
                      eventLocation={`${conference.city}, ${conference.country}`}
                      eventDate="June 15, 2025"
                      eventUrl={`https://${domain}/`}
                      socialLinks={conference.social_links || []}
                    >
                      <p
                        style={{
                          fontSize: '16px',
                          lineHeight: '1.6',
                          marginBottom: '16px',
                          marginTop: '0',
                          color: '#334155',
                        }}
                      >
                        Thank you for joining our cloud native community! This
                        is the foundation template that provides consistent
                        branding and structure for all our email communications.
                      </p>
                      <p
                        style={{
                          fontSize: '16px',
                          lineHeight: '1.6',
                          marginBottom: '16px',
                          marginTop: '0',
                          color: '#334155',
                        }}
                      >
                        This template includes responsive design, social links,
                        event details, and accessibility features that work
                        across all major email clients.
                      </p>
                    </BaseEmailTemplate>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Template Comparison Grid */}
          <div className="mb-16">
            <h3 className="font-space-grotesk mb-8 text-center text-3xl font-semibold text-brand-slate-gray">
              Template Feature Comparison
            </h3>

            <div className="overflow-x-auto">
              <table className="w-full rounded-lg bg-white shadow-lg">
                <thead>
                  <tr className="bg-brand-sky-mist">
                    <th className="px-6 py-4 text-left">
                      <span className="font-space-grotesk text-lg font-semibold text-brand-slate-gray">
                        Template
                      </span>
                    </th>
                    <th className="px-6 py-4 text-left">
                      <span className="font-space-grotesk text-lg font-semibold text-brand-slate-gray">
                        Purpose
                      </span>
                    </th>
                    <th className="px-6 py-4 text-left">
                      <span className="font-space-grotesk text-lg font-semibold text-brand-slate-gray">
                        Key Features
                      </span>
                    </th>
                    <th className="px-6 py-4 text-left">
                      <span className="font-space-grotesk text-lg font-semibold text-brand-slate-gray">
                        Automation
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  <tr className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <span className="font-space-grotesk font-semibold text-brand-cloud-blue">
                        Base Template
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="font-inter text-brand-slate-gray">
                        Foundation for all emails
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <ul className="font-inter list-inside list-disc space-y-1 text-sm text-brand-slate-gray">
                        <li>Responsive layout</li>
                        <li>Brand consistency</li>
                        <li>Social links</li>
                        <li>Event details</li>
                      </ul>
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-800">
                        Manual
                      </span>
                    </td>
                  </tr>
                  <tr className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <span className="font-space-grotesk font-semibold text-brand-fresh-green">
                        Proposal Accept
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="font-inter text-brand-slate-gray">
                        CFP acceptance notifications
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <ul className="font-inter list-inside list-disc space-y-1 text-sm text-brand-slate-gray">
                        <li>Celebration tone</li>
                        <li>Confirmation button</li>
                        <li>Next steps</li>
                        <li>Organizer comments</li>
                      </ul>
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-800">
                        Automated
                      </span>
                    </td>
                  </tr>
                  <tr className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <span className="font-space-grotesk font-semibold text-brand-slate-gray">
                        Proposal Reject
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="font-inter text-brand-slate-gray">
                        CFP rejection notifications
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <ul className="font-inter list-inside list-disc space-y-1 text-sm text-brand-slate-gray">
                        <li>Professional tone</li>
                        <li>Constructive feedback</li>
                        <li>Future opportunities</li>
                        <li>Community connection</li>
                      </ul>
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-800">
                        Automated
                      </span>
                    </td>
                  </tr>
                  <tr className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <span className="font-space-grotesk font-semibold text-brand-cloud-blue">
                        Single Speaker
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="font-inter text-brand-slate-gray">
                        Individual speaker outreach
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <ul className="font-inter list-inside list-disc space-y-1 text-sm text-brand-slate-gray">
                        <li>Personal messaging</li>
                        <li>Proposal context</li>
                        <li>Direct communication</li>
                        <li>Action buttons</li>
                      </ul>
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex rounded-full bg-blue-100 px-2 py-1 text-xs font-medium text-blue-800">
                        Admin Tool
                      </span>
                    </td>
                  </tr>
                  <tr className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <span className="font-space-grotesk font-semibold text-accent-purple">
                        Multi-Speaker
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="font-inter text-brand-slate-gray">
                        CC all speakers on proposal
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <ul className="font-inter list-inside list-disc space-y-1 text-sm text-brand-slate-gray">
                        <li>CC all participants</li>
                        <li>Shared context</li>
                        <li>Collaboration focused</li>
                        <li>Speaker list display</li>
                      </ul>
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex rounded-full bg-blue-100 px-2 py-1 text-xs font-medium text-blue-800">
                        Admin Tool
                      </span>
                    </td>
                  </tr>
                  <tr className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <span className="font-space-grotesk font-semibold text-brand-fresh-green">
                        Speaker Broadcast
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="font-inter text-brand-slate-gray">
                        Speaker group communications
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <ul className="font-inter list-inside list-disc space-y-1 text-sm text-brand-slate-gray">
                        <li>Rich content support</li>
                        <li>Group messaging</li>
                        <li>Speaker-specific info</li>
                        <li>Event updates</li>
                      </ul>
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex rounded-full bg-blue-100 px-2 py-1 text-xs font-medium text-blue-800">
                        Admin Tool
                      </span>
                    </td>
                  </tr>
                  <tr className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <span className="font-space-grotesk font-semibold text-accent-purple">
                        General Broadcast
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="font-inter text-brand-slate-gray">
                        Community announcements
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <ul className="font-inter list-inside list-disc space-y-1 text-sm text-brand-slate-gray">
                        <li>HTML content support</li>
                        <li>Unsubscribe management</li>
                        <li>General audience</li>
                        <li>Marketing campaigns</li>
                      </ul>
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex rounded-full bg-blue-100 px-2 py-1 text-xs font-medium text-blue-800">
                        Admin Tool
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Technical Implementation */}
          <div className="rounded-xl bg-white p-8 shadow-lg">
            <h3 className="font-space-grotesk mb-6 text-2xl font-semibold text-brand-slate-gray">
              Technical Implementation
            </h3>
            <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
              <div>
                <h4 className="font-space-grotesk mb-4 text-lg font-semibold text-brand-cloud-blue">
                  Email Service Integration
                </h4>
                <ul className="font-inter space-y-2 text-brand-slate-gray">
                  <li>• Resend service for reliable delivery</li>
                  <li>• Rate limiting and retry logic</li>
                  <li>• Audience management and segmentation</li>
                  <li>• Bounce and unsubscribe handling</li>
                  <li>• Template validation and testing</li>
                </ul>
              </div>
              <div>
                <h4 className="font-space-grotesk mb-4 text-lg font-semibold text-brand-cloud-blue">
                  Design Standards
                </h4>
                <ul className="font-inter space-y-2 text-brand-slate-gray">
                  <li>• Responsive table-based layouts</li>
                  <li>• Email client compatibility testing</li>
                  <li>• Accessible color contrast ratios</li>
                  <li>• Consistent typography hierarchy</li>
                  <li>• Brand-aligned visual elements</li>
                </ul>
              </div>
            </div>

            <div className="mt-8 rounded-lg bg-brand-sky-mist p-6">
              <h4 className="font-space-grotesk mb-4 text-lg font-semibold text-brand-cloud-blue">
                Development Guidelines
              </h4>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div>
                  <h5 className="font-space-grotesk mb-2 text-sm font-semibold text-brand-slate-gray">
                    Component Architecture
                  </h5>
                  <p className="font-inter text-sm text-brand-slate-gray">
                    Modular React components with TypeScript props for type
                    safety and reusability across different email contexts.
                  </p>
                </div>
                <div>
                  <h5 className="font-space-grotesk mb-2 text-sm font-semibold text-brand-slate-gray">
                    Testing Strategy
                  </h5>
                  <p className="font-inter text-sm text-brand-slate-gray">
                    Comprehensive testing across email clients, accessibility
                    validation, and content rendering verification.
                  </p>
                </div>
                <div>
                  <h5 className="font-space-grotesk mb-2 text-sm font-semibold text-brand-slate-gray">
                    Maintenance
                  </h5>
                  <p className="font-inter text-sm text-brand-slate-gray">
                    Centralized configuration, shared components, and
                    documentation for consistent updates and brand evolution.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </Container>
      </section>
    </div>
  )
}
