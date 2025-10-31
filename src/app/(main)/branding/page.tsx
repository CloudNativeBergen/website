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
  LightBulbIcon,
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
  ExpandableEmailTemplate,
} from '@/components/branding'
import { colorPalette, typography } from '@/lib/branding/data'

import { TalkPromotionCard } from '@/components/TalkPromotionCard'
import { SpeakerPromotionCard } from '@/components/SpeakerPromotionCard'
import { SpeakerShare } from '@/components/SpeakerShare'
import {
  ProposalAcceptTemplate,
  ProposalRejectTemplate,
  BroadcastTemplate,
  BaseEmailTemplate,
  CoSpeakerInvitationTemplate,
  CoSpeakerResponseTemplate,
} from '@/components/email'
import { portableTextToHTML } from '@/lib/email/portableTextToHTML'
import { CallToAction } from '@/components/CallToAction'
import {
  Format,
  Level,
  ProposalExisting,
  Status,
  Language,
  Audience,
} from '@/lib/proposal/types'
import { SpeakerWithTalks } from '@/lib/speaker/types'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'

export const metadata: Metadata = {
  title: 'Brand Guidelines - Cloud Native Day Bergen',
  description: 'Brand guidelines and design system for Cloud Native Day Bergen',
}

export default async function BrandingPage() {
  const { conference, domain } = await getConferenceForCurrentDomain({
    featuredSpeakers: true,
  })

  // Helper to create mock ProposalExisting objects for design examples
  function mockTalk(params: {
    id: string
    title: string
    format: Format
    level?: Level
    description?: string
    speakerNames?: string[]
  }): ProposalExisting {
    const now = new Date().toISOString()
    const speakers = (params.speakerNames || ['Example Speaker']).map(
      (name, idx) => ({
        _id: `sp-${params.id}-${idx}`,
        _rev: '1',
        _createdAt: now,
        _updatedAt: now,
        name,
        email: `${name.toLowerCase().replace(/[^a-z]/g, '')}@example.com`,
        title: 'Engineer',
      }),
    ) as SpeakerWithTalks[]
    return {
      _id: params.id,
      _rev: '1',
      _type: 'proposal',
      _createdAt: now,
      _updatedAt: now,
      status: Status.accepted,
      title: params.title,
      description: params.description
        ? [
            {
              _type: 'block',
              _key: `b-${params.id}`,
              style: 'normal',
              children: [
                {
                  _type: 'span',
                  _key: `s-${params.id}`,
                  text: params.description,
                  marks: [],
                },
              ],
              markDefs: [],
            },
          ]
        : [],
      language: Language.english,
      format: params.format,
      level: params.level || Level.intermediate,
      audiences: [Audience.developer],
      outline: '',
      tos: true,
      speakers,
      conference: { _ref: 'conf-mock', _type: 'reference' as const },
    }
  }

  return (
    <div className="bg-brand-glacier-white dark:bg-gray-900">
      {/* Hero Section */}
      <BrandingHeroSection />

      {/* Navigation Menu */}
      <nav className="sticky top-0 z-50 border-b border-brand-cloud-blue/20 bg-white/95 backdrop-blur-sm dark:border-gray-600/20 dark:bg-gray-800/95">
        <Container>
          <div className="flex items-center justify-center py-4">
            <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-2">
              <a
                href="#brand-story"
                className="font-inter text-sm font-medium text-brand-slate-gray transition-colors hover:text-brand-cloud-blue dark:text-gray-300 dark:hover:text-blue-400"
              >
                Brand Story
              </a>
              <a
                href="#color-palette"
                className="font-inter text-sm font-medium text-brand-slate-gray transition-colors hover:text-brand-cloud-blue dark:text-gray-300 dark:hover:text-blue-400"
              >
                Colors
              </a>
              <a
                href="#typography"
                className="font-inter text-sm font-medium text-brand-slate-gray transition-colors hover:text-brand-cloud-blue dark:text-gray-300 dark:hover:text-blue-400"
              >
                Typography
              </a>
              <a
                href="#icon-library"
                className="font-inter text-sm font-medium text-brand-slate-gray transition-colors hover:text-brand-cloud-blue dark:text-gray-300 dark:hover:text-blue-400"
              >
                Icons
              </a>
              <a
                href="#pattern-system"
                className="font-inter text-sm font-medium text-brand-slate-gray transition-colors hover:text-brand-cloud-blue dark:text-gray-300 dark:hover:text-blue-400"
              >
                Patterns
              </a>
              <a
                href="#buttons-showcase"
                className="font-inter text-sm font-medium text-brand-slate-gray transition-colors hover:text-brand-cloud-blue dark:text-gray-300 dark:hover:text-blue-400"
              >
                Buttons
              </a>
              <a
                href="#hero-examples"
                className="font-inter text-sm font-medium text-brand-slate-gray transition-colors hover:text-brand-cloud-blue dark:text-gray-300 dark:hover:text-blue-400"
              >
                Hero
              </a>
              <a
                href="#speaker-examples"
                className="font-inter text-sm font-medium text-brand-slate-gray transition-colors hover:text-brand-cloud-blue dark:text-gray-300 dark:hover:text-blue-400"
              >
                Speakers
              </a>
              <a
                href="#talk-examples"
                className="font-inter text-sm font-medium text-brand-slate-gray transition-colors hover:text-brand-cloud-blue dark:text-gray-300 dark:hover:text-blue-400"
              >
                Talks
              </a>
              <a
                href="#cta-examples"
                className="font-inter text-sm font-medium text-brand-slate-gray transition-colors hover:text-brand-cloud-blue dark:text-gray-300 dark:hover:text-blue-400"
              >
                Call to Action
              </a>
              <a
                href="#email-templates"
                className="font-inter text-sm font-medium text-brand-slate-gray transition-colors hover:text-brand-cloud-blue dark:text-gray-300 dark:hover:text-blue-400"
              >
                Email Templates
              </a>
            </div>
          </div>
        </Container>
      </nav>

      {/* Brand Story */}
      <section id="brand-story" className="py-20 dark:bg-gray-800">
        <Container>
          <div className="mx-auto max-w-4xl">
            <h2 className="font-space-grotesk mb-8 text-center text-4xl font-bold text-brand-cloud-blue dark:text-blue-400">
              Our Brand Story
            </h2>
            <div className="grid grid-cols-1 items-center gap-12 md:grid-cols-2">
              <div>
                <p className="font-inter mb-6 text-lg leading-relaxed text-brand-slate-gray dark:text-gray-300">
                  Cloud Native Day Bergen embodies the spirit of Norway&apos;s
                  tech community: innovative yet grounded, collaborative yet
                  independent, modern yet respectful of tradition.
                </p>
                <p className="font-inter mb-6 text-lg leading-relaxed text-brand-slate-gray dark:text-gray-300">
                  Our visual identity draws inspiration from Bergen&apos;s
                  dramatic landscapes—the meeting of mountains and sea, the
                  interplay of mist and clarity, the harmony of natural and
                  urban elements.
                </p>
                <p className="font-atkinson text-lg leading-relaxed text-brand-slate-gray dark:text-gray-300">
                  We celebrate the &quot;nerdy and proud&quot; developer culture
                  while maintaining accessibility and inclusivity for all
                  members of our community.
                </p>
              </div>
              <div className="rounded-2xl bg-brand-sky-mist p-8 dark:bg-gray-700">
                <h3 className="font-space-grotesk mb-4 text-2xl font-semibold text-brand-cloud-blue dark:text-blue-400">
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
              <h3 className="font-space-grotesk mb-8 text-center text-3xl font-bold text-brand-cloud-blue dark:text-blue-400">
                Design Principles
              </h3>
              <p className="font-inter mx-auto mb-12 max-w-3xl text-center text-lg text-brand-slate-gray dark:text-gray-300">
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
                    className="rounded-xl bg-white p-6 text-center shadow-sm dark:bg-gray-700"
                  >
                    <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-brand-cloud-blue/10 dark:bg-blue-400/20">
                      <principle.icon className="h-6 w-6 text-brand-cloud-blue dark:text-blue-400" />
                    </div>
                    <h4 className="font-space-grotesk mb-3 text-lg font-semibold text-brand-cloud-blue dark:text-blue-400">
                      {principle.title}
                    </h4>
                    <p className="font-inter text-brand-slate-gray dark:text-gray-300">
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
      <section id="color-palette" className="bg-white py-20 dark:bg-gray-900">
        <Container>
          <div className="mb-16 text-center">
            <h2 className="font-space-grotesk mb-6 text-4xl font-bold text-brand-cloud-blue dark:text-blue-400">
              Color Palette
            </h2>
            <p className="font-inter mx-auto max-w-3xl text-xl text-brand-slate-gray dark:text-gray-300">
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
      <section
        id="typography"
        className="bg-brand-glacier-white py-20 dark:bg-gray-800"
      >
        <Container>
          <div className="mb-16 text-center">
            <h2 className="font-space-grotesk mb-6 text-4xl font-bold text-brand-cloud-blue dark:text-blue-400">
              Typography
            </h2>
            <p className="font-inter mx-auto max-w-3xl text-xl text-brand-slate-gray dark:text-gray-300">
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
      <section id="icon-library" className="bg-white py-20 dark:bg-gray-900">
        <Container>
          <div className="mb-16 text-center">
            <h2 className="font-space-grotesk mb-6 text-4xl font-bold text-brand-cloud-blue dark:text-blue-400">
              Icon Library
            </h2>
            <p className="font-inter mx-auto max-w-3xl text-xl text-brand-slate-gray dark:text-gray-300">
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
            <div className="rounded-2xl bg-brand-glacier-white p-8 dark:border dark:border-gray-600 dark:bg-gray-700">
              <h3 className="font-space-grotesk mb-6 text-2xl font-semibold text-brand-slate-gray dark:text-gray-200">
                Heroicons Usage Guidelines
              </h3>
              <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
                <div>
                  <h4 className="font-space-grotesk mb-3 text-lg font-semibold text-brand-cloud-blue dark:text-blue-400">
                    Sizing & Scale
                  </h4>
                  <div className="space-y-4">
                    <div className="flex items-center space-x-4">
                      <CloudIcon className="h-4 w-4 text-brand-slate-gray dark:text-gray-300" />
                      <span className="font-inter text-sm text-brand-slate-gray dark:text-gray-300">
                        16px (w-4 h-4) - Inline with text
                      </span>
                    </div>
                    <div className="flex items-center space-x-4">
                      <CloudIcon className="h-6 w-6 text-brand-slate-gray dark:text-gray-300" />
                      <span className="font-inter text-sm text-brand-slate-gray dark:text-gray-300">
                        24px (w-6 h-6) - Standard UI elements
                      </span>
                    </div>
                    <div className="flex items-center space-x-4">
                      <CloudIcon className="h-8 w-8 text-brand-slate-gray dark:text-gray-300" />
                      <span className="font-inter text-sm text-brand-slate-gray dark:text-gray-300">
                        32px (w-8 h-8) - Section headers
                      </span>
                    </div>
                    <div className="flex items-center space-x-4">
                      <CloudIcon className="h-12 w-12 text-brand-slate-gray dark:text-gray-300" />
                      <span className="font-inter text-sm text-brand-slate-gray dark:text-gray-300">
                        48px (w-12 h-12) - Hero sections
                      </span>
                    </div>
                  </div>
                </div>
                <div>
                  <h4 className="font-space-grotesk mb-3 text-lg font-semibold text-brand-cloud-blue dark:text-blue-400">
                    Color Application
                  </h4>
                  <div className="space-y-3">
                    <p className="font-inter text-sm text-brand-slate-gray dark:text-gray-300">
                      Heroicons inherit text color and work with our full brand
                      palette:
                    </p>
                    <div className="flex items-center space-x-2">
                      <CloudIcon className="h-5 w-5 text-brand-cloud-blue" />
                      <ServerIcon className="h-5 w-5 text-brand-fresh-green" />
                      <CubeIcon className="h-5 w-5 text-accent-yellow" />
                      <ShieldCheckIcon className="h-5 w-5 text-accent-purple" />
                      <CogIcon className="h-5 w-5 text-brand-slate-gray dark:text-gray-300" />
                    </div>
                    <p className="font-inter text-xs text-gray-600 dark:text-gray-400">
                      Use brand colors to create visual hierarchy and context
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-8">
                <h4 className="font-space-grotesk mb-4 text-lg font-semibold text-brand-cloud-blue dark:text-blue-400">
                  Code Examples
                </h4>
                <div className="space-y-4 rounded-lg bg-gray-100 p-4 dark:bg-gray-800">
                  <div>
                    <p className="font-inter mb-2 text-sm text-gray-700 dark:text-gray-300">
                      Import from Heroicons:
                    </p>
                    <code className="font-jetbrains block rounded bg-white p-3 text-sm text-gray-800 dark:bg-gray-700 dark:text-gray-200">
                      {`import { CloudIcon, ServerIcon } from '@heroicons/react/24/outline'`}
                    </code>
                  </div>
                  <div>
                    <p className="font-inter mb-2 text-sm text-gray-700 dark:text-gray-300">
                      Usage with Tailwind sizing:
                    </p>
                    <code className="font-jetbrains block rounded bg-white p-3 text-sm text-gray-800 dark:bg-gray-700 dark:text-gray-200">
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
      <section id="pattern-system" className="bg-white py-20 dark:bg-gray-800">
        <Container>
          <div className="mb-16 text-center">
            <h2 className="font-space-grotesk mb-6 text-4xl font-bold text-brand-cloud-blue dark:text-blue-400">
              Cloud Native Pattern System
            </h2>
            <p className="font-inter mx-auto max-w-3xl text-xl text-brand-slate-gray dark:text-gray-300">
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
              <h3 className="font-space-grotesk mb-6 text-2xl font-semibold text-brand-slate-gray dark:text-blue-400">
                Interactive Pattern Preview
              </h3>
              <div className="flex-1">
                <InteractivePatternPreview />
              </div>
            </div>

            {/* Configuration Guidelines */}
            <div className="flex flex-col lg:col-span-1">
              <h3 className="font-space-grotesk mb-6 text-2xl font-semibold text-brand-slate-gray dark:text-blue-400">
                Configuration Guidelines
              </h3>
              <div className="flex-1 rounded-lg bg-brand-sky-mist p-6 dark:border dark:border-gray-600 dark:bg-gray-700">
                <div className="mb-6 grid grid-cols-1 gap-6 md:grid-cols-2">
                  <div>
                    <h4 className="font-space-grotesk mb-3 text-sm font-semibold tracking-wide text-brand-slate-gray uppercase dark:text-gray-200">
                      Icon Size
                    </h4>
                    <ul className="font-inter space-y-2 text-sm text-brand-slate-gray dark:text-gray-300">
                      <li className="flex items-start">
                        <span className="mt-1.5 mr-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-brand-fresh-green dark:bg-green-400"></span>
                        Content sections: 15-35px icons
                      </li>
                      <li className="flex items-start">
                        <span className="mt-1.5 mr-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-brand-fresh-green dark:bg-green-400"></span>
                        Hero sections: 25-70px icons
                      </li>
                      <li className="flex items-start">
                        <span className="mt-1.5 mr-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-brand-fresh-green dark:bg-green-400"></span>
                        Background fills: 20-50px icons
                      </li>
                    </ul>
                  </div>
                  <div>
                    <h4 className="font-space-grotesk mb-3 text-sm font-semibold tracking-wide text-brand-slate-gray uppercase dark:text-gray-200">
                      Icon Count
                    </h4>
                    <ul className="font-inter space-y-2 text-sm text-brand-slate-gray dark:text-gray-300">
                      <li className="flex items-start">
                        <span className="mt-1.5 mr-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-brand-cloud-blue dark:bg-blue-400"></span>
                        Subtle: 10-30 icons for content backgrounds
                      </li>
                      <li className="flex items-start">
                        <span className="mt-1.5 mr-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-brand-cloud-blue dark:bg-blue-400"></span>
                        Balanced: 30-60 icons for hero sections
                      </li>
                      <li className="flex items-start">
                        <span className="mt-1.5 mr-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-brand-cloud-blue dark:bg-blue-400"></span>
                        Dense: 60-120 icons for dramatic effects
                      </li>
                    </ul>
                  </div>
                </div>
                <div className="border-t border-brand-frosted-steel pt-4 dark:border-gray-600">
                  <h4 className="font-space-grotesk mb-3 text-sm font-semibold tracking-wide text-brand-slate-gray uppercase dark:text-gray-200">
                    Focus/Diffusion System
                  </h4>
                  <ul className="font-inter mb-4 space-y-2 text-sm text-brand-slate-gray dark:text-gray-300">
                    <li className="flex items-start">
                      <span className="mt-1.5 mr-3 h-2 w-2 flex-shrink-0 rounded-full bg-brand-fresh-green dark:bg-green-400"></span>
                      Small icons (20-30px): High opacity, vibrant colors, sharp
                      focus
                    </li>
                    <li className="flex items-start">
                      <span className="mt-1.5 mr-3 h-2 w-2 flex-shrink-0 rounded-full bg-brand-fresh-green dark:bg-green-400"></span>
                      Medium icons (30-50px): Balanced opacity and slight blur
                    </li>
                    <li className="flex items-start">
                      <span className="mt-1.5 mr-3 h-2 w-2 flex-shrink-0 rounded-full bg-brand-fresh-green dark:bg-green-400"></span>
                      Large icons (50-70px): Lower opacity, subtle colors, soft
                      blur
                    </li>
                  </ul>
                  <ul className="font-inter space-y-2 text-sm text-brand-slate-gray dark:text-gray-300">
                    <li className="flex items-start">
                      <span className="mt-1.5 mr-3 h-2 w-2 flex-shrink-0 rounded-full bg-brand-nordic-purple dark:bg-purple-400"></span>
                      Adjust opacity (0.08-0.15) based on content readability
                    </li>
                    <li className="flex items-start">
                      <span className="mt-1.5 mr-3 h-2 w-2 flex-shrink-0 rounded-full bg-brand-nordic-purple dark:bg-purple-400"></span>
                      Use slow movement animation for engaging backgrounds
                    </li>
                    <li className="flex items-start">
                      <span className="mt-1.5 mr-3 h-2 w-2 flex-shrink-0 rounded-full bg-brand-nordic-purple dark:bg-purple-400"></span>
                      Disable animation for static contexts or better
                      performance
                    </li>
                    <li className="flex items-start">
                      <span className="mt-1.5 mr-3 h-2 w-2 flex-shrink-0 rounded-full bg-brand-nordic-purple dark:bg-purple-400"></span>
                      Combine with gradient backgrounds for optimal contrast
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          {/* Pattern Elements Section - Moved below main grid */}
          <div className="mt-16">
            <h3 className="font-space-grotesk mb-6 text-2xl font-semibold text-brand-slate-gray dark:text-blue-400">
              Pattern Elements
            </h3>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
              <div className="flex flex-col items-center rounded-lg bg-brand-glacier-white p-6 text-center dark:border dark:border-gray-600 dark:bg-gray-700">
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
                <h4 className="font-space-grotesk mb-2 text-lg font-semibold text-brand-slate-gray dark:text-gray-200">
                  Container Orchestration
                </h4>
                <p className="font-inter text-sm text-brand-slate-gray dark:text-gray-300">
                  Kubernetes, containerd, and etcd - the foundation of modern
                  container orchestration.
                </p>
              </div>

              <div className="flex flex-col items-center rounded-lg bg-brand-glacier-white p-6 text-center dark:border dark:border-gray-600 dark:bg-gray-700">
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
                <h4 className="font-space-grotesk mb-2 text-lg font-semibold text-brand-slate-gray dark:text-gray-200">
                  Observability & Monitoring
                </h4>
                <p className="font-inter text-sm text-brand-slate-gray dark:text-gray-300">
                  Prometheus, Jaeger, and Falco for comprehensive system
                  observability and security.
                </p>
              </div>

              <div className="flex flex-col items-center rounded-lg bg-brand-glacier-white p-6 text-center dark:border dark:border-gray-600 dark:bg-gray-700">
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
                <h4 className="font-space-grotesk mb-2 text-lg font-semibold text-brand-slate-gray dark:text-gray-200">
                  Service Mesh & Networking
                </h4>
                <p className="font-inter text-sm text-brand-slate-gray dark:text-gray-300">
                  Istio, Envoy, and Cilium for secure, observable
                  service-to-service communication.
                </p>
              </div>

              <div className="flex flex-col items-center rounded-lg bg-brand-glacier-white p-6 text-center dark:border dark:border-gray-600 dark:bg-gray-700">
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
      <section className="bg-brand-glacier-white py-20 dark:bg-gray-800">
        <Container>
          <div className="mb-12 text-center">
            <h2 className="font-space-grotesk mb-4 text-3xl font-bold text-brand-cloud-blue dark:text-blue-400">
              Configuration Examples
            </h2>
            <p className="font-inter mx-auto max-w-2xl text-lg text-brand-slate-gray dark:text-gray-300">
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
          <div className="mt-12 rounded-xl bg-white p-8 dark:border dark:border-gray-600 dark:bg-gray-700">
            <h4 className="font-space-grotesk mb-6 text-center text-xl font-semibold text-brand-slate-gray dark:text-gray-200">
              Focus/Diffusion Technology
            </h4>
            <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
              <div className="text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-brand-fresh-green/20">
                  <span className="text-2xl font-bold text-brand-fresh-green">
                    S
                  </span>
                </div>
                <h5 className="font-space-grotesk text-md mb-2 font-semibold text-brand-slate-gray dark:text-gray-200">
                  Small Icons (Sharp Focus)
                </h5>
                <p className="font-inter text-sm text-brand-slate-gray dark:text-gray-300">
                  Higher opacity, vibrant colors, no blur. Draw attention as
                  foreground elements.
                </p>
              </div>
              <div className="text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-brand-cloud-blue/20 dark:bg-blue-500/20">
                  <span className="text-2xl font-bold text-brand-cloud-blue dark:text-blue-400">
                    M
                  </span>
                </div>
                <h5 className="font-space-grotesk text-md mb-2 font-semibold text-brand-slate-gray dark:text-gray-200">
                  Medium Icons (Balanced)
                </h5>
                <p className="font-inter text-sm text-brand-slate-gray dark:text-gray-300">
                  Moderate opacity and subtle blur. Provide visual texture
                  without distraction.
                </p>
              </div>
              <div className="text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-brand-frosted-steel/40 dark:bg-gray-600/40">
                  <span className="text-2xl font-bold text-brand-slate-gray dark:text-gray-300">
                    L
                  </span>
                </div>
                <h5 className="font-space-grotesk text-md mb-2 font-semibold text-brand-slate-gray dark:text-gray-200">
                  Large Icons (Soft Diffusion)
                </h5>
                <p className="font-inter text-sm text-brand-slate-gray dark:text-gray-300">
                  Lower opacity, muted colors, soft blur. Create atmospheric
                  background depth.
                </p>
              </div>
            </div>
          </div>
        </Container>
      </section>
      {/* Button Showcase */}
      <section
        id="buttons-showcase"
        className="bg-white py-20 dark:bg-gray-900"
      >
        <Container>
          <div className="mb-16 text-center">
            <h2 className="font-space-grotesk mb-6 text-4xl font-bold text-brand-cloud-blue dark:text-blue-400">
              Button Showcase
            </h2>
            <p className="font-inter mx-auto max-w-3xl text-xl text-brand-slate-gray dark:text-gray-300">
              Our button system provides consistent, accessible interactions
              across all brand applications with clear visual hierarchy.
            </p>
          </div>

          <ButtonShowcase />

          {/* Icon Usage Examples */}
          <div className="mt-16">
            <h3 className="font-space-grotesk mb-6 text-2xl font-semibold text-brand-slate-gray dark:text-blue-400">
              Icons in UI Components
            </h3>
            <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
              {/* Feature Grid Example */}
              <div className="rounded-xl border border-gray-200 bg-white p-8 dark:border-gray-600 dark:bg-gray-800">
                <h4 className="font-space-grotesk mb-6 text-lg font-semibold text-brand-cloud-blue dark:text-blue-400">
                  Platform Features
                </h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center space-x-3">
                    <CloudIcon className="h-6 w-6 text-brand-cloud-blue" />
                    <span className="font-inter text-sm text-brand-slate-gray dark:text-gray-300">
                      Cloud Native
                    </span>
                  </div>
                  <div className="flex items-center space-x-3">
                    <CubeIcon className="h-6 w-6 text-accent-yellow" />
                    <span className="font-inter text-sm text-brand-slate-gray dark:text-gray-300">
                      Containers
                    </span>
                  </div>
                  <div className="flex items-center space-x-3">
                    <ShieldCheckIcon className="h-6 w-6 text-secondary-500" />
                    <span className="font-inter text-sm text-brand-slate-gray dark:text-gray-300">
                      Security
                    </span>
                  </div>
                  <div className="flex items-center space-x-3">
                    <ChartBarIcon className="h-6 w-6 text-brand-cloud-blue" />
                    <span className="font-inter text-sm text-brand-slate-gray dark:text-gray-300">
                      Monitoring
                    </span>
                  </div>
                </div>
              </div>

              {/* Navigation Example */}
              <div className="rounded-xl border border-gray-200 bg-white p-8 dark:border-gray-600 dark:bg-gray-800">
                <h4 className="font-space-grotesk mb-6 text-lg font-semibold text-brand-cloud-blue dark:text-blue-400">
                  Navigation with Icons
                </h4>
                <nav className="space-y-3">
                  <a
                    href="#"
                    className="flex items-center space-x-3 rounded p-2 transition-colors hover:bg-brand-sky-mist dark:hover:bg-gray-700"
                  >
                    <ServerIcon className="h-5 w-5 text-brand-fresh-green" />
                    <span className="font-inter text-brand-slate-gray dark:text-gray-300">
                      Infrastructure
                    </span>
                  </a>
                  <a
                    href="#"
                    className="flex items-center space-x-3 rounded p-2 transition-colors hover:bg-brand-sky-mist dark:hover:bg-gray-700"
                  >
                    <ArrowPathIcon className="h-5 w-5 text-accent-purple" />
                    <span className="font-inter text-brand-slate-gray dark:text-gray-300">
                      CI/CD
                    </span>
                  </a>
                  <a
                    href="#"
                    className="flex items-center space-x-3 rounded p-2 transition-colors hover:bg-brand-sky-mist dark:hover:bg-gray-700"
                  >
                    <CommandLineIcon className="h-5 w-5 text-primary-500" />
                    <span className="font-inter text-brand-slate-gray dark:text-gray-300">
                      Developer Tools
                    </span>
                  </a>
                  <a
                    href="#"
                    className="flex items-center space-x-3 rounded p-2 transition-colors hover:bg-brand-sky-mist dark:hover:bg-gray-700"
                  >
                    <BoltIcon className="h-5 w-5 text-accent-yellow" />
                    <span className="font-inter text-brand-slate-gray dark:text-gray-300">
                      Performance
                    </span>
                  </a>
                </nav>
              </div>
            </div>
          </div>

          {/* Icon Style Comparison */}
          <div>
            <h3 className="font-space-grotesk mb-6 text-2xl font-semibold text-brand-slate-gray dark:text-blue-400">
              Outline vs Solid Icons
            </h3>
            <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
              {/* Outline Style */}
              <div className="rounded-xl border border-gray-200 bg-white p-8 dark:border-gray-600 dark:bg-gray-800">
                <h4 className="font-space-grotesk mb-6 text-lg font-semibold text-brand-cloud-blue dark:text-blue-400">
                  Outline Style (Default)
                </h4>
                <div className="space-y-4">
                  <div className="flex items-center justify-between rounded-lg bg-brand-glacier-white p-3 dark:bg-gray-700">
                    <div className="flex items-center space-x-3">
                      <CloudIcon className="h-6 w-6 text-brand-cloud-blue" />
                      <span className="font-inter dark:text-gray-300">
                        Infrastructure
                      </span>
                    </div>
                    <span className="font-inter text-sm text-gray-500 dark:text-gray-400">
                      Available
                    </span>
                  </div>
                  <div className="flex items-center justify-between rounded-lg bg-brand-glacier-white p-3 dark:bg-gray-700">
                    <div className="flex items-center space-x-3">
                      <ServerIcon className="h-6 w-6 text-brand-fresh-green" />
                      <span className="font-inter dark:text-gray-300">
                        Compute
                      </span>
                    </div>
                    <span className="font-inter text-sm text-gray-500 dark:text-gray-400">
                      Running
                    </span>
                  </div>
                  <div className="flex items-center justify-between rounded-lg bg-brand-glacier-white p-3 dark:bg-gray-700">
                    <div className="flex items-center space-x-3">
                      <ShieldCheckIcon className="h-6 w-6 text-secondary-500" />
                      <span className="font-inter dark:text-gray-300">
                        Security
                      </span>
                    </div>
                    <span className="font-inter text-sm text-gray-500 dark:text-gray-400">
                      Active
                    </span>
                  </div>
                </div>
              </div>

              {/* Solid Style */}
              <div className="rounded-xl border border-gray-200 bg-white p-8 dark:border-gray-600 dark:bg-gray-800">
                <h4 className="font-space-grotesk mb-6 text-lg font-semibold text-brand-cloud-blue dark:text-blue-400">
                  Solid Style (Emphasis)
                </h4>
                <div className="space-y-4">
                  <div className="flex items-center justify-between rounded-lg border border-green-200 bg-green-50 p-3 dark:border-green-800 dark:bg-green-900/30">
                    <div className="flex items-center space-x-3">
                      <CloudIconSolid className="h-6 w-6 text-green-600 dark:text-green-400" />
                      <span className="font-inter font-medium dark:text-gray-200">
                        Infrastructure
                      </span>
                    </div>
                    <span className="font-inter text-sm font-medium text-green-700 dark:text-green-300">
                      Healthy
                    </span>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-900/30">
                    <div className="flex items-center space-x-3">
                      <ServerIconSolid className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                      <span className="font-inter font-medium dark:text-gray-200">
                        Compute
                      </span>
                    </div>
                    <span className="font-inter text-sm font-medium text-blue-700 dark:text-blue-300">
                      Optimized
                    </span>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-purple-200 bg-purple-50 p-3 dark:border-purple-800 dark:bg-purple-900/30">
                    <div className="flex items-center space-x-3">
                      <ShieldCheckIconSolid className="h-6 w-6 text-purple-600 dark:text-purple-400" />
                      <span className="font-inter font-medium dark:text-gray-200">
                        Security
                      </span>
                    </div>
                    <span className="font-inter text-sm font-medium text-purple-700 dark:text-purple-300">
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
      <section
        id="hero-examples"
        className="bg-brand-glacier-white py-20 dark:bg-gray-800"
      >
        <Container>
          <div className="mb-16 text-center">
            <h2 className="font-space-grotesk mb-6 text-4xl font-bold text-brand-cloud-blue dark:text-blue-400">
              Hero Examples
            </h2>
            <p className="font-inter mx-auto max-w-3xl text-xl text-brand-slate-gray dark:text-gray-300">
              Hero sections showcase our brand&apos;s visual impact through
              compelling combinations of typography, color, and cloud native
              patterns.
            </p>
          </div>

          <BrandingExampleHeroSection />
        </Container>
      </section>

      {/* Speaker Examples */}
      <section
        id="speaker-examples"
        className="bg-white py-20 dark:bg-gray-900"
      >
        <Container>
          <div className="mb-16 text-center">
            <h2 className="font-space-grotesk mb-6 text-4xl font-bold text-brand-cloud-blue dark:text-blue-400">
              Speaker Examples
            </h2>
            <p className="font-inter mx-auto max-w-3xl text-xl text-brand-slate-gray dark:text-gray-300">
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
                    <h3 className="font-space-grotesk mb-4 text-2xl font-semibold text-brand-slate-gray dark:text-blue-400">
                      Featured Speaker
                    </h3>
                    <p className="font-inter text-gray-600 dark:text-gray-300">
                      Streamlined presentation for featured speakers with
                      essential information and clean visual design. Perfect for
                      homepage highlights and key announcements.
                    </p>
                  </div>

                  <SpeakerPromotionCard
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
                    <h3 className="font-space-grotesk mb-4 text-2xl font-semibold text-brand-slate-gray dark:text-blue-400">
                      Three Featured Speakers
                    </h3>
                    <p className="font-inter text-gray-600 dark:text-gray-300">
                      Perfect for highlighting key speakers with balanced visual
                      weight. Ideal for homepage features and conference
                      announcements.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                    {conference.featured_speakers.slice(0, 3).map((speaker) => (
                      <SpeakerPromotionCard
                        key={speaker._id}
                        speaker={speaker}
                        variant="default"
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
                    <h3 className="font-space-grotesk mb-4 text-2xl font-semibold text-brand-slate-gray dark:text-blue-400">
                      Compact Speaker List
                    </h3>
                    <p className="font-inter text-gray-600 dark:text-gray-300">
                      Space-efficient format for agenda pages and speaker
                      directories. Shows essential information with talk details
                      prominently featured.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {conference.featured_speakers
                      .slice(0, 6)
                      .map((speaker, index) => (
                        <SpeakerPromotionCard
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

            {/* Speaker Share Component Showcase */}
            {conference?.featured_speakers &&
              conference.featured_speakers.length >= 2 && (
                <div>
                  <div className="mb-8">
                    <h3 className="font-space-grotesk mb-4 text-2xl font-semibold text-brand-slate-gray dark:text-blue-400">
                      Speaker Share Component Showcase
                    </h3>
                    <p className="font-inter text-gray-600 dark:text-gray-300">
                      The SpeakerShare component creates branded social media
                      cards that speakers can use to promote their
                      participation. Features QR codes for easy profile access,
                      responsive design, and optional Cloud Native pattern
                      backgrounds.
                    </p>
                    <div className="mt-4 rounded-lg bg-blue-50 p-4 dark:border dark:border-blue-500/30 dark:bg-blue-900/20">
                      <p className="font-inter text-sm text-blue-800 dark:text-blue-200">
                        <strong className="flex items-center space-x-2 text-brand-cloud-blue dark:text-blue-400">
                          <LightBulbIcon className="h-4 w-4" />
                          <span>Interactive Download Feature!</span>
                        </strong>
                        <br />
                        Click &ldquo;Download as PNG&rdquo; below any speaker
                        card to save high-quality social media images. The
                        download may take a few seconds to process as it waits
                        for all content (including QR codes) to load properly.
                      </p>
                    </div>
                  </div>

                  {/* Full Size Variants - Speaker Share vs Speaker Spotlight */}
                  <div className="mb-16">
                    <h4 className="font-space-grotesk mb-6 text-xl font-semibold text-brand-cloud-blue dark:text-blue-400">
                      Component Variants (Full Size)
                    </h4>
                    <p className="font-inter mb-8 text-gray-600 dark:text-gray-300">
                      Compare the two main variants: speaker-share for speakers
                      to promote themselves, and speaker-spotlight for
                      conference organizers to highlight speakers.
                    </p>

                    <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 xl:gap-16">
                      {/* Speaker Share Variant */}
                      <div className="flex flex-col items-center space-y-4">
                        <div className="text-center">
                          <h5 className="font-space-grotesk text-lg font-semibold text-brand-slate-gray dark:text-gray-200">
                            Speaker Share
                          </h5>
                          <p className="font-inter text-sm text-gray-600 dark:text-gray-400">
                            &ldquo;I&apos;m speaking at&rdquo; message
                          </p>
                        </div>
                        <DownloadSpeakerImage
                          filename={`${conference.featured_speakers[0]?.slug}-speaker-share`}
                        >
                          <SpeakerShare
                            speaker={conference.featured_speakers[0]}
                            variant="speaker-share"
                            eventName="Cloud Native Bergen 2025"
                            className="h-80 w-80"
                          />
                        </DownloadSpeakerImage>
                      </div>

                      {/* Speaker Spotlight Variant */}
                      <div className="flex flex-col items-center space-y-4">
                        <div className="text-center">
                          <h5 className="font-space-grotesk text-lg font-semibold text-brand-slate-gray dark:text-gray-200">
                            Speaker Spotlight
                          </h5>
                          <p className="font-inter text-sm text-gray-600 dark:text-gray-400">
                            &ldquo;Featured Speaker&rdquo; message
                          </p>
                        </div>
                        <DownloadSpeakerImage
                          filename={`${conference.featured_speakers[0]?.slug}-speaker-spotlight`}
                        >
                          <SpeakerShare
                            speaker={conference.featured_speakers[0]}
                            variant="speaker-spotlight"
                            isFeatured={true}
                            eventName="Cloud Native Bergen 2025"
                            className="h-80 w-80"
                            showCloudNativePattern={true}
                          />
                        </DownloadSpeakerImage>
                      </div>
                    </div>
                  </div>

                  {/* Size Variations */}
                  <div className="mb-16">
                    <h4 className="font-space-grotesk mb-6 text-xl font-semibold text-brand-cloud-blue dark:text-blue-400">
                      Size Variations & Responsive Design
                    </h4>
                    <p className="font-inter mb-8 text-gray-600 dark:text-gray-300">
                      The component uses container queries to maintain perfect
                      square proportions and readability across all sizes.
                      Always maintains aspect ratio for optimal social media
                      sharing.
                    </p>

                    {/* Large Grid */}
                    <div className="mb-12">
                      <h5 className="font-space-grotesk mb-4 text-lg font-semibold text-brand-slate-gray dark:text-gray-200">
                        Large (For Feature Sections)
                      </h5>
                      <div className="grid grid-cols-2 gap-6 md:grid-cols-3">
                        <SpeakerShare
                          speaker={conference.featured_speakers[0]}
                          variant="speaker-share"
                          eventName="Cloud Native Bergen 2025"
                          className="aspect-square w-full"
                        />
                        <SpeakerShare
                          speaker={conference.featured_speakers[1]}
                          variant="speaker-spotlight"
                          isFeatured={true}
                          eventName="Cloud Native Bergen 2025"
                          className="aspect-square w-full"
                        />
                        <SpeakerShare
                          speaker={
                            conference.featured_speakers[2] ||
                            conference.featured_speakers[0]
                          }
                          variant="speaker-share"
                          showCloudNativePattern={true}
                          eventName="Cloud Native Bergen 2025"
                          className="aspect-square w-full"
                        />
                      </div>
                    </div>

                    {/* Small Grid */}
                    <div className="mb-12">
                      <h5 className="font-space-grotesk mb-4 text-lg font-semibold text-brand-slate-gray">
                        Small (For Compact Grids)
                      </h5>
                      <div className="grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-6">
                        {conference.featured_speakers
                          .slice(0, 6)
                          .map((speaker, index) => (
                            <SpeakerShare
                              key={speaker._id}
                              speaker={speaker}
                              variant={
                                index % 2 === 0
                                  ? 'speaker-share'
                                  : 'speaker-spotlight'
                              }
                              showCloudNativePattern={index % 3 === 0}
                              isFeatured={index === 0}
                              eventName="Cloud Native Bergen 2025"
                              className="aspect-square w-full"
                            />
                          ))}
                      </div>
                    </div>

                    {/* Extra Small Grid */}
                    <div>
                      <h5 className="font-space-grotesk mb-4 text-lg font-semibold text-brand-slate-gray">
                        Extra Small (Thumbnail Size)
                      </h5>
                      <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10">
                        {conference.featured_speakers
                          .slice(0, 10)
                          .map((speaker, index) => (
                            <SpeakerShare
                              key={speaker._id}
                              speaker={speaker}
                              variant={
                                index % 2 === 0
                                  ? 'speaker-share'
                                  : 'speaker-spotlight'
                              }
                              showCloudNativePattern={index % 4 === 0}
                              isFeatured={false}
                              eventName="CNB 2025"
                              className="aspect-square w-full"
                            />
                          ))}
                      </div>
                    </div>
                  </div>

                  {/* Technical Features */}
                  <div className="rounded-xl bg-brand-sky-mist p-8">
                    <h4 className="font-space-grotesk mb-6 text-xl font-semibold text-brand-cloud-blue">
                      Technical Features & Capabilities
                    </h4>

                    <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
                      <div>
                        <h5 className="font-space-grotesk mb-3 text-lg font-semibold text-brand-slate-gray">
                          QR Code Integration
                        </h5>
                        <ul className="font-inter space-y-2 text-sm text-brand-slate-gray">
                          <li>• Automatically generated for each speaker</li>
                          <li>• Links to speaker profile page</li>
                          <li>• High contrast for reliable scanning</li>
                          <li>• Optimized for mobile cameras</li>
                          <li>• Error correction for damaged prints</li>
                        </ul>
                      </div>

                      <div>
                        <h5 className="font-space-grotesk mb-3 text-lg font-semibold text-brand-slate-gray">
                          Responsive Design
                        </h5>
                        <ul className="font-inter space-y-2 text-sm text-brand-slate-gray">
                          <li>• Container queries for perfect scaling</li>
                          <li>• Fluid typography and spacing</li>
                          <li>• Aspect ratio preservation</li>
                          <li>• Optimized for social media platforms</li>
                          <li>• Works from thumbnails to hero images</li>
                        </ul>
                      </div>

                      <div>
                        <h5 className="font-space-grotesk mb-3 text-lg font-semibold text-brand-slate-gray">
                          Cloud Native Pattern
                        </h5>
                        <ul className="font-inter space-y-2 text-sm text-brand-slate-gray">
                          <li>• 50+ authentic project logos</li>
                          <li>• Intelligent depth layering</li>
                          <li>• Smooth animations and movement</li>
                          <li>• Performance optimized</li>
                          <li>• Works with both variants</li>
                        </ul>
                      </div>
                    </div>

                    <div className="mt-8 rounded-lg bg-white/50 p-6">
                      <h5 className="font-space-grotesk mb-4 text-lg font-semibold text-brand-cloud-blue">
                        Usage Guidelines
                      </h5>
                      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                        <div>
                          <h6 className="font-space-grotesk mb-2 text-sm font-semibold text-brand-slate-gray">
                            Speaker Share Variant
                          </h6>
                          <ul className="font-inter space-y-1 text-sm text-brand-slate-gray">
                            <li>
                              • For speakers to share on their own social media
                            </li>
                            <li>
                              • &ldquo;I&apos;m speaking at&rdquo; messaging
                            </li>
                            <li>• Personal branding focus</li>
                            <li>• Include speaker&apos;s primary talk</li>
                          </ul>
                        </div>
                        <div>
                          <h6 className="font-space-grotesk mb-2 text-sm font-semibold text-brand-slate-gray">
                            Speaker Spotlight Variant
                          </h6>
                          <ul className="font-inter space-y-1 text-sm text-brand-slate-gray">
                            <li>
                              • For conference organizers to promote speakers
                            </li>
                            <li>• &ldquo;Featured Speaker&rdquo; messaging</li>
                            <li>• Conference branding focus</li>
                            <li>• Highlight keynote and featured speakers</li>
                          </ul>
                        </div>
                      </div>
                    </div>

                    <div className="mt-6 rounded-lg bg-brand-cloud-blue/10 p-6">
                      <h5 className="font-space-grotesk mb-4 text-lg font-semibold text-brand-cloud-blue">
                        Development API
                      </h5>
                      <div className="space-y-4">
                        <div>
                          <h6 className="font-inter mb-2 text-sm font-semibold text-brand-slate-gray">
                            Basic Usage
                          </h6>
                          <code className="font-jetbrains block rounded bg-white p-3 text-sm text-gray-800">
                            {`<SpeakerShare
  speaker={speaker}
  variant="speaker-share"
  eventName="Cloud Native Bergen 2025"
/>`}
                          </code>
                        </div>
                        <div>
                          <h6 className="font-inter mb-2 text-sm font-semibold text-brand-slate-gray">
                            With Cloud Native Pattern
                          </h6>
                          <code className="font-jetbrains block rounded bg-white p-3 text-sm text-gray-800">
                            {`<SpeakerShare
  speaker={speaker}
  variant="speaker-spotlight"
  showCloudNativePattern={true}
  isFeatured={true}
  eventName="Cloud Native Bergen 2025"
/>`}
                          </code>
                        </div>
                      </div>
                    </div>
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
                        <SpeakerPromotionCard
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
                      <SpeakerPromotionCard
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
                          <SpeakerPromotionCard
                            key={speaker._id}
                            speaker={speaker}
                            variant="default"
                            ctaText="View Profile"
                          />
                        ))}
                    </div>

                    {/* Compact list for additional speakers */}
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                      {conference.featured_speakers
                        .slice(4, 10)
                        .map((speaker) => (
                          <SpeakerPromotionCard
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
      <section
        id="talk-examples"
        className="bg-brand-glacier-white py-20 dark:bg-gray-800"
      >
        <Container>
          <div className="mb-16 text-center">
            <h2 className="font-space-grotesk mb-6 text-4xl font-bold text-brand-cloud-blue dark:text-blue-400">
              Talk Examples
            </h2>
            <p className="font-inter mx-auto max-w-3xl text-xl text-brand-slate-gray dark:text-gray-300">
              Talk cards and promotions showcase conference presentations with
              format-specific styling and clear visual hierarchy.
            </p>
          </div>

          <div className="space-y-16">
            {/* Talk Card Examples */}
            <div>
              <h3 className="font-space-grotesk mb-6 text-2xl font-semibold text-brand-slate-gray dark:text-blue-400">
                Talk Card Examples
              </h3>
              <p className="font-inter mb-8 text-gray-600 dark:text-gray-300">
                Talk cards showcase conference presentations with
                format-specific styling and branding elements. The
                TalkPromotionCard component features modular architecture with
                guaranteed footer positioning.
              </p>

              <div className="space-y-8">
                {/* Card Variants */}
                <div>
                  <h4 className="font-space-grotesk mb-4 text-lg font-semibold text-brand-cloud-blue dark:text-blue-400">
                    Card Variants
                  </h4>
                  <div className="grid auto-rows-fr grid-cols-1 gap-6 lg:grid-cols-3">
                    <TalkPromotionCard
                      talk={mockTalk({
                        id: 'ex1',
                        title: 'Building Resilient Microservices',
                        format: Format.presentation_45,
                        level: Level.intermediate,
                        description:
                          'Learn how to design fault-tolerant microservices that can handle failures gracefully and maintain system reliability.',
                        speakerNames: ['Dr. Example McDemo'],
                      })}
                      variant="featured"
                    />

                    <TalkPromotionCard
                      talk={mockTalk({
                        id: 'ex2',
                        title: 'Kubernetes Security Best Practices',
                        format: Format.presentation_25,
                        level: Level.advanced,
                        description:
                          'Essential security patterns and practices for running Kubernetes in production environments.',
                        speakerNames: ['Marcus Rodriguez'],
                      })}
                    />

                    <TalkPromotionCard
                      talk={mockTalk({
                        id: 'ex3',
                        title: 'Quick Start with Helm',
                        format: Format.lightning_10,
                        level: Level.beginner,
                        speakerNames: ['Emma Thompson'],
                      })}
                      variant="compact"
                    />
                  </div>
                </div>

                {/* Format Showcase */}
                <div>
                  <h4 className="font-space-grotesk mb-4 text-lg font-semibold text-brand-cloud-blue">
                    Talk Format Showcase
                  </h4>
                  <div className="grid auto-rows-fr grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
                    <TalkPromotionCard
                      talk={mockTalk({
                        id: 'ex4',
                        title: 'CI/CD in 10 Minutes',
                        format: Format.lightning_10,
                        level: Level.beginner,
                        speakerNames: ['Demo Testberg'],
                      })}
                      variant="compact"
                    />

                    <TalkPromotionCard
                      talk={mockTalk({
                        id: 'ex5',
                        title: 'Container Orchestration',
                        format: Format.presentation_20,
                        level: Level.intermediate,
                        speakerNames: ['Jordan Lee'],
                      })}
                      variant="compact"
                    />

                    <TalkPromotionCard
                      talk={mockTalk({
                        id: 'ex6',
                        title: 'Deep Dive: Service Mesh',
                        format: Format.presentation_40,
                        level: Level.advanced,
                        speakerNames: ['Taylor Wong'],
                      })}
                      variant="compact"
                    />

                    <TalkPromotionCard
                      talk={mockTalk({
                        id: 'ex7',
                        title: 'Hands-on GitOps',
                        format: Format.workshop_120,
                        level: Level.intermediate,
                        speakerNames: ['Casey Miller'],
                      })}
                      variant="compact"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Talk Promotion Examples */}
            <div>
              <h3 className="font-space-grotesk mb-6 text-2xl font-semibold text-brand-slate-gray dark:text-blue-400">
                Talk Promotion Examples
              </h3>
              <p className="font-inter mb-8 text-gray-600 dark:text-gray-300">
                Promotional components for highlighting featured talks and
                driving engagement.
              </p>

              <div className="space-y-8">
                {/* Banner Promotion */}
                <div>
                  <h4 className="font-space-grotesk mb-4 text-lg font-semibold text-brand-cloud-blue dark:text-blue-400">
                    Banner Promotion
                  </h4>
                  <TalkPromotionCard
                    talk={mockTalk({
                      id: 'ex8',
                      title: 'The Future of Cloud Native Computing',
                      format: Format.presentation_45,
                      description:
                        'Explore the next generation of cloud native technologies and their impact on modern software development. This keynote will cover emerging trends in container orchestration, serverless computing, and edge computing.',
                      speakerNames: ['Dr. Kubernetes Expert'],
                    })}
                    slot={{
                      date: 'Example Day, 30th Fictionary 2099',
                      time: '14:00 - 14:45',
                      location: 'Main Stage',
                    }}
                    ctaText="Reserve Your Seat"
                    variant="featured"
                  />
                </div>

                {/* Card and Social Promotions */}
                <div>
                  <h4 className="font-space-grotesk mb-4 text-lg font-semibold text-brand-cloud-blue dark:text-blue-400">
                    Card & Social Promotions
                  </h4>
                  <div className="grid auto-rows-fr grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-3">
                    <TalkPromotionCard
                      talk={mockTalk({
                        id: 'ex9',
                        title: 'Workshop: GitOps with ArgoCD',
                        format: Format.workshop_120,
                        description:
                          'Hands-on workshop covering GitOps principles and practical implementation with ArgoCD.',
                        speakerNames: ['DevOps Specialist'],
                      })}
                      slot={{
                        date: 'Demo Day, 31st Examplery 2099',
                        time: '09:00 - 11:00',
                        location: 'Workshop Room A',
                      }}
                      ctaText="Join Workshop"
                    />

                    <TalkPromotionCard
                      talk={mockTalk({
                        id: 'ex10',
                        title: 'Lightning: WebAssembly & Cloud',
                        format: Format.lightning_10,
                        description:
                          'Quick dive into how WebAssembly is changing cloud computing.',
                        speakerNames: ['WASM Enthusiast'],
                      })}
                      slot={{
                        date: 'Sample Day, 1st Testuary 2099',
                        time: '16:30 - 16:40',
                        location: 'Lightning Stage',
                      }}
                      ctaText="Watch Live"
                    />

                    <TalkPromotionCard
                      talk={mockTalk({
                        id: 'ex11',
                        title: 'Observability at Scale',
                        format: Format.presentation_25,
                        description:
                          'Learn to monitor and observe large-scale distributed systems effectively.',
                        speakerNames: ['SRE Lead'],
                      })}
                      slot={{
                        date: 'Mock Day, 15th Demober 2099',
                        location: 'Tech Stage',
                      }}
                      ctaText="Learn More"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Component Features and Migration Guide */}
            <div>
              <h3 className="font-space-grotesk mb-6 text-2xl font-semibold text-brand-slate-gray dark:text-blue-400">
                Component Features & Architecture
              </h3>
              <p className="font-inter mb-8 text-gray-600 dark:text-gray-300">
                The TalkPromotionCard component features a modular
                header-body-footer architecture with guaranteed footer
                positioning using flexbox. This component provides improved
                maintainability and consistent styling across all variants.
              </p>

              <div className="space-y-8">
                {/* Component Features */}
                <div className="rounded-xl bg-white p-8 shadow-sm dark:border dark:border-gray-600 dark:bg-gray-700">
                  <h4 className="font-space-grotesk mb-6 text-xl font-semibold text-brand-cloud-blue dark:text-blue-400">
                    Component Features
                  </h4>
                  <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
                    <div>
                      <h5 className="font-space-grotesk mb-4 text-lg font-semibold text-brand-slate-gray dark:text-gray-200">
                        Architecture Improvements
                      </h5>
                      <ul className="font-inter space-y-3 text-brand-slate-gray dark:text-gray-300">
                        <li className="flex items-start">
                          <span className="mt-1.5 mr-3 h-2 w-2 flex-shrink-0 rounded-full bg-brand-fresh-green dark:bg-green-400"></span>
                          <span>
                            <strong>Modular Structure:</strong> Separated
                            TalkHeader, TalkBody, and TalkFooter components for
                            better maintainability
                          </span>
                        </li>
                        <li className="flex items-start">
                          <span className="mt-1.5 mr-3 h-2 w-2 flex-shrink-0 rounded-full bg-brand-fresh-green dark:bg-green-400"></span>
                          <span>
                            <strong>Guaranteed Footer Positioning:</strong> Uses
                            flexbox with{' '}
                            <code className="font-jetbrains rounded bg-gray-100 px-1 py-0.5 text-sm dark:bg-gray-800 dark:text-gray-200">
                              mt-auto
                            </code>{' '}
                            for perfect footer alignment
                          </span>
                        </li>
                        <li className="flex items-start">
                          <span className="mt-1.5 mr-3 h-2 w-2 flex-shrink-0 rounded-full bg-brand-fresh-green dark:bg-green-400"></span>
                          <span>
                            <strong>Grid Integration:</strong> Works seamlessly
                            with{' '}
                            <code className="font-jetbrains rounded bg-gray-100 px-1 py-0.5 text-sm dark:bg-gray-800 dark:text-gray-200">
                              auto-rows-fr
                            </code>{' '}
                            for equal height cards
                          </span>
                        </li>
                        <li className="flex items-start">
                          <span className="mt-1.5 mr-3 h-2 w-2 flex-shrink-0 rounded-full bg-brand-fresh-green dark:bg-green-400"></span>
                          <span>
                            <strong>TypeScript Support:</strong> Full type
                            safety with comprehensive prop interfaces
                          </span>
                        </li>
                      </ul>
                    </div>
                    <div>
                      <h5 className="font-space-grotesk mb-4 text-lg font-semibold text-brand-slate-gray dark:text-gray-200">
                        Variant System
                      </h5>
                      <ul className="font-inter space-y-3 text-brand-slate-gray dark:text-gray-300">
                        <li className="flex items-start">
                          <span className="mt-1.5 mr-3 h-2 w-2 flex-shrink-0 rounded-full bg-brand-cloud-blue dark:bg-blue-400"></span>
                          <span>
                            <strong>Default:</strong> Balanced presentation with
                            full talk information and description
                          </span>
                        </li>
                        <li className="flex items-start">
                          <span className="mt-1.5 mr-3 h-2 w-2 flex-shrink-0 rounded-full bg-brand-cloud-blue dark:bg-blue-400"></span>
                          <span>
                            <strong>Featured:</strong> Enhanced styling with
                            larger text and prominent visual treatment
                          </span>
                        </li>
                        <li className="flex items-start">
                          <span className="mt-1.5 mr-3 h-2 w-2 flex-shrink-0 rounded-full bg-brand-cloud-blue dark:bg-blue-400"></span>
                          <span>
                            <strong>Compact:</strong> Space-efficient design for
                            listings and dense grids
                          </span>
                        </li>
                        <li className="flex items-start">
                          <span className="mt-1.5 mr-3 h-2 w-2 flex-shrink-0 rounded-full bg-brand-cloud-blue dark:bg-blue-400"></span>
                          <span>
                            <strong>Consistent Styling:</strong> All variants
                            maintain footer alignment and responsive behavior
                          </span>
                        </li>
                      </ul>
                    </div>
                  </div>

                  <div className="mt-8 rounded-lg bg-brand-sky-mist p-6 dark:border dark:border-gray-600 dark:bg-gray-800">
                    <h5 className="font-space-grotesk mb-4 text-lg font-semibold text-brand-cloud-blue dark:text-blue-400">
                      Migration Benefits
                    </h5>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                      <div>
                        <h6 className="font-inter mb-2 text-sm font-semibold text-brand-slate-gray dark:text-gray-200">
                          Better Maintainability
                        </h6>
                        <p className="font-inter text-sm text-brand-slate-gray dark:text-gray-300">
                          Separated concerns make it easier to update styling,
                          add features, and fix bugs
                        </p>
                      </div>
                      <div>
                        <h6 className="font-inter mb-2 text-sm font-semibold text-brand-slate-gray dark:text-gray-200">
                          Consistent Layout
                        </h6>
                        <p className="font-inter text-sm text-brand-slate-gray dark:text-gray-300">
                          Flexbox architecture ensures footers always align
                          properly regardless of content length
                        </p>
                      </div>
                      <div>
                        <h6 className="font-inter mb-2 text-sm font-semibold text-brand-slate-gray dark:text-gray-200">
                          Future-Proof Design
                        </h6>
                        <p className="font-inter text-sm text-brand-slate-gray dark:text-gray-300">
                          Modular structure allows for easy extension and
                          customization as requirements evolve
                        </p>
                      </div>
                    </div>
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
      <section id="cta-examples" className="bg-white py-20 dark:bg-gray-900">
        <Container>
          <div className="mb-16 text-center">
            <h2 className="font-space-grotesk mb-6 text-4xl font-bold text-brand-cloud-blue dark:text-blue-400">
              Call to Action Examples
            </h2>
            <p className="font-inter mx-auto max-w-3xl text-xl text-brand-slate-gray dark:text-gray-300">
              Call to action components drive engagement and conversions across
              the conference website. These reusable components can be
              customized for different contexts while maintaining consistent
              branding and accessibility standards.
            </p>
          </div>

          <div className="space-y-16">
            {/* Standard Call to Action */}
            <div>
              <h3 className="font-space-grotesk mb-6 text-2xl font-semibold text-brand-slate-gray dark:text-blue-400">
                Standard Call to Action
              </h3>
              <p className="font-inter mb-8 text-lg text-brand-slate-gray dark:text-gray-300">
                The default configuration encourages both speaker submissions
                and ticket reservations with balanced messaging.
              </p>
              <div className="rounded-lg border border-gray-200 bg-white p-8 dark:border-gray-600 dark:bg-gray-800">
                <CallToAction conference={conference} />
              </div>
            </div>

            {/* Organizers Context */}
            <div>
              <h3 className="font-space-grotesk mb-6 text-2xl font-semibold text-brand-slate-gray dark:text-blue-400">
                Organizers Context
              </h3>
              <p className="font-inter mb-8 text-lg text-brand-slate-gray dark:text-gray-300">
                When used in organizer-facing contexts, the messaging and button
                styling adapt to focus on community engagement.
              </p>
              <div className="rounded-lg border border-gray-200 bg-white p-8 dark:border-gray-600 dark:bg-gray-800">
                <CallToAction
                  conference={conference}
                  isOrganizers={true}
                  title="Join Our Community"
                  description="Whether you're looking to share your expertise or learn from the best, we'd love to have you at Cloud Native Bergen."
                />
              </div>
            </div>

            {/* Speaker Focus */}
            <div>
              <h3 className="font-space-grotesk mb-6 text-2xl font-semibold text-brand-slate-gray dark:text-blue-400">
                Speaker Submission Focus
              </h3>
              <p className="font-inter mb-8 text-lg text-brand-slate-gray dark:text-gray-300">
                Configuration that emphasizes speaker submissions while hiding
                ticket reservations for CFP-focused pages.
              </p>
              <div className="rounded-lg border border-gray-200 bg-white p-8 dark:border-gray-600 dark:bg-gray-800">
                <CallToAction
                  conference={conference}
                  title="Share Your Expertise"
                  description="Join our community of cloud native experts and share your knowledge with the Bergen tech community."
                  showTicketReservation={false}
                />
              </div>
            </div>

            {/* Ticket Focus */}
            <div>
              <h3 className="font-space-grotesk mb-6 text-2xl font-semibold text-brand-slate-gray dark:text-blue-400">
                Ticket Reservation Focus
              </h3>
              <p className="font-inter mb-8 text-lg text-brand-slate-gray dark:text-gray-300">
                Configuration that focuses solely on ticket sales when the CFP
                period has ended.
              </p>
              <div className="rounded-lg border border-gray-200 bg-white p-8 dark:border-gray-600 dark:bg-gray-800">
                <CallToAction
                  conference={conference}
                  title="Secure Your Spot"
                  description="Don't miss this opportunity to learn from industry experts and connect with the Bergen cloud native community."
                  showSpeakerSubmission={false}
                />
              </div>
            </div>

            {/* Custom Messaging */}
            <div>
              <h3 className="font-space-grotesk mb-6 text-2xl font-semibold text-brand-slate-gray dark:text-blue-400">
                Custom Messaging
              </h3>
              <p className="font-inter mb-8 text-lg text-brand-slate-gray dark:text-gray-300">
                Fully customizable title and description for specific campaigns
                or landing pages.
              </p>
              <div className="rounded-lg border border-gray-200 bg-white p-8 dark:border-gray-600 dark:bg-gray-800">
                <CallToAction
                  conference={conference}
                  title="Early Bird Special"
                  description="Register now and save 40% on your conference ticket. Limited time offer for the Bergen cloud native community."
                />
              </div>
            </div>

            {/* Component Documentation */}
            <div className="rounded-xl bg-brand-glacier-white p-8 dark:border dark:border-gray-600 dark:bg-gray-700">
              <h3 className="font-space-grotesk mb-6 text-2xl font-semibold text-brand-slate-gray dark:text-gray-200">
                Component Features & Usage
              </h3>
              <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
                <div>
                  <h4 className="font-space-grotesk mb-4 text-lg font-semibold text-brand-cloud-blue dark:text-blue-400">
                    Customizable Props
                  </h4>
                  <ul className="font-inter space-y-2 text-brand-slate-gray dark:text-gray-300">
                    <li className="flex items-start">
                      <span className="mt-1.5 mr-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-brand-cloud-blue dark:bg-blue-400"></span>
                      <span>
                        <code className="rounded bg-gray-100 px-1.5 py-0.5 text-sm dark:bg-gray-800 dark:text-gray-200">
                          isOrganizers
                        </code>{' '}
                        - Changes messaging and button styles
                      </span>
                    </li>
                    <li className="flex items-start">
                      <span className="mt-1.5 mr-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-brand-cloud-blue dark:bg-blue-400"></span>
                      <span>
                        <code className="rounded bg-gray-100 px-1.5 py-0.5 text-sm dark:bg-gray-800 dark:text-gray-200">
                          title
                        </code>{' '}
                        - Custom headline text
                      </span>
                    </li>
                    <li className="flex items-start">
                      <span className="mt-1.5 mr-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-brand-cloud-blue dark:bg-blue-400"></span>
                      <span>
                        <code className="rounded bg-gray-100 px-1.5 py-0.5 text-sm dark:bg-gray-800 dark:text-gray-200">
                          description
                        </code>{' '}
                        - Custom description text
                      </span>
                    </li>
                    <li className="flex items-start">
                      <span className="mt-1.5 mr-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-brand-cloud-blue dark:bg-blue-400"></span>
                      <span>
                        <code className="rounded bg-gray-100 px-1.5 py-0.5 text-sm dark:bg-gray-800 dark:text-gray-200">
                          showSpeakerSubmission
                        </code>{' '}
                        - Toggle CFP button
                      </span>
                    </li>
                    <li className="flex items-start">
                      <span className="mt-1.5 mr-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-brand-cloud-blue dark:bg-blue-400"></span>
                      <span>
                        <code className="rounded bg-gray-100 px-1.5 py-0.5 text-sm dark:bg-gray-800 dark:text-gray-200">
                          showTicketReservation
                        </code>{' '}
                        - Toggle ticket button
                      </span>
                    </li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-space-grotesk mb-4 text-lg font-semibold text-brand-cloud-blue dark:text-blue-400">
                    Design Features
                  </h4>
                  <ul className="font-inter space-y-2 text-brand-slate-gray dark:text-gray-300">
                    <li className="flex items-start">
                      <span className="mt-1.5 mr-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-brand-fresh-green dark:bg-green-400"></span>
                      <span>Gradient background with brand colors</span>
                    </li>
                    <li className="flex items-start">
                      <span className="mt-1.5 mr-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-brand-fresh-green dark:bg-green-400"></span>
                      <span>
                        Responsive button layout (stacked to horizontal)
                      </span>
                    </li>
                    <li className="flex items-start">
                      <span className="mt-1.5 mr-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-brand-fresh-green dark:bg-green-400"></span>
                      <span>Accessible ARIA labels and semantic markup</span>
                    </li>
                    <li className="flex items-start">
                      <span className="mt-1.5 mr-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-brand-fresh-green dark:bg-green-400"></span>
                      <span>Icons from Heroicons for visual clarity</span>
                    </li>
                    <li className="flex items-start">
                      <span className="mt-1.5 mr-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-brand-fresh-green dark:bg-green-400"></span>
                      <span>Conditional urgency messaging</span>
                    </li>
                  </ul>
                </div>
              </div>

              <div className="mt-8 rounded-lg bg-white p-6 dark:border dark:border-gray-600 dark:bg-gray-800">
                <h4 className="font-space-grotesk mb-4 text-lg font-semibold text-brand-cloud-blue dark:text-blue-400">
                  Usage Guidelines
                </h4>
                <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                  <div>
                    <h5 className="font-space-grotesk mb-2 text-sm font-semibold text-brand-slate-gray dark:text-gray-200">
                      Placement
                    </h5>
                    <p className="font-inter text-sm text-brand-slate-gray dark:text-gray-300">
                      Use at natural break points in content flow, typically
                      after speaker showcases or information sections.
                    </p>
                  </div>
                  <div>
                    <h5 className="font-space-grotesk mb-2 text-sm font-semibold text-brand-slate-gray dark:text-gray-200">
                      Frequency
                    </h5>
                    <p className="font-inter text-sm text-brand-slate-gray dark:text-gray-300">
                      Limit to 1-2 instances per page to avoid overwhelming
                      users while maintaining conversion opportunities.
                    </p>
                  </div>
                  <div>
                    <h5 className="font-space-grotesk mb-2 text-sm font-semibold text-brand-slate-gray dark:text-gray-200">
                      Context
                    </h5>
                    <p className="font-inter text-sm text-brand-slate-gray dark:text-gray-300">
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
      <section
        id="email-templates"
        className="bg-brand-glacier-white py-20 dark:bg-gray-800"
      >
        <Container>
          <div className="mb-16 text-center">
            <h2 className="font-space-grotesk mb-6 text-4xl font-bold text-brand-cloud-blue dark:text-blue-400">
              Email Templates
            </h2>
            <p className="font-inter mx-auto max-w-3xl text-xl text-brand-slate-gray dark:text-gray-300">
              Professional email templates for all conference communications.
              These templates maintain consistent branding, provide clear
              communication, and ensure accessibility across different email
              clients. Our template system includes automated proposal
              responses, speaker communications, and community updates.
            </p>
          </div>

          {/* Template Architecture Overview */}
          <div className="mb-16">
            <h3 className="font-space-grotesk mb-8 text-center text-3xl font-semibold text-brand-slate-gray dark:text-blue-400">
              Template Architecture
            </h3>
            <div className="rounded-xl bg-white p-8 shadow-lg dark:border dark:border-gray-600 dark:bg-gray-700">
              <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
                <div className="text-center">
                  <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-brand-cloud-blue/20 dark:bg-blue-500/20">
                    <span className="text-2xl font-bold text-brand-cloud-blue dark:text-blue-400">
                      1
                    </span>
                  </div>
                  <h4 className="font-space-grotesk mb-3 text-lg font-semibold text-brand-slate-gray dark:text-gray-200">
                    Base Template
                  </h4>
                  <p className="font-inter text-sm text-brand-slate-gray dark:text-gray-300">
                    Foundation layout with consistent branding, responsive
                    design, and email client compatibility.
                  </p>
                </div>
                <div className="text-center">
                  <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-brand-fresh-green/20 dark:bg-green-500/20">
                    <span className="text-2xl font-bold text-brand-fresh-green dark:text-green-400">
                      2
                    </span>
                  </div>
                  <h4 className="font-space-grotesk mb-3 text-lg font-semibold text-brand-slate-gray dark:text-gray-200">
                    Specialized Templates
                  </h4>
                  <p className="font-inter text-sm text-brand-slate-gray dark:text-gray-300">
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
              <ExpandableEmailTemplate
                title="✅ Proposal Acceptance Email"
                description="Celebratory tone with clear next steps and confirmation requirements."
                className="text-brand-fresh-green"
                previewHeight={600}
                emailFrom={conference.contact_email}
                emailTo="demo.speaker@example-demo.com"
                emailSubject="🎉 Your proposal has been accepted!"
                emailTime="Today 2:30 PM"
              >
                <ProposalAcceptTemplate
                  eventName={conference.title}
                  speakerName="Demo Speaker"
                  proposalTitle="Building Resilient Microservices with Kubernetes"
                  eventLocation="Example City, Fictionaland"
                  eventDate="30th Fictionary 2099"
                  eventUrl={`https://${domain}/`}
                  confirmUrl={`https://${domain}/confirm/abc123`}
                  comment="We were particularly impressed with your hands-on approach and real-world examples. We'd love to have you present in the main auditorium."
                  socialLinks={conference.social_links}
                />
              </ExpandableEmailTemplate>

              {/* Proposal Rejection Email */}
              <ExpandableEmailTemplate
                title="📧 Proposal Rejection Email"
                description="Professional and encouraging tone while maintaining community connection."
                className="text-brand-slate-gray"
                previewHeight={600}
                emailFrom={conference.contact_email}
                emailTo="test.speaker@demo-examples.com"
                emailSubject="Thank you for your proposal submission"
                emailTime="Today 10:15 AM"
              >
                <ProposalRejectTemplate
                  eventName={conference.title}
                  speakerName="Test McExample"
                  proposalTitle="Advanced Container Security Patterns"
                  eventLocation={`${conference.city}, ${conference.country}`}
                  eventDate="June 15, 2025"
                  eventUrl={`https://${domain}/`}
                  comment="Your proposal showed great depth in security practices. While we couldn't include it this year due to similar topics already selected, we encourage you to submit for our next event."
                  socialLinks={conference.social_links}
                />
              </ExpandableEmailTemplate>
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
              <ExpandableEmailTemplate
                title="📩 Speaker Email"
                description="Direct communication with speakers on their proposals, supporting both individual and multi-speaker conversations."
                className="text-brand-cloud-blue"
                previewHeight={600}
                emailFrom={conference.contact_email}
                emailTo="All Speakers"
                emailSubject="Collaboration guidelines for your presentation"
                emailTime="Today 3:20 PM"
              >
                <BaseEmailTemplate
                  eventName={conference.title}
                  eventLocation="Demo City, Sampleland"
                  eventDate="31st Demober 2099"
                  eventUrl={`https://${domain}/`}
                  socialLinks={conference.social_links || []}
                  customContent={{
                    heading: 'Collaboration guidelines for your presentation',
                    body: (
                      <>
                        {/* Rich PortableText Content Example */}
                        <div style={{ marginBottom: '24px' }}>
                          <p
                            style={{
                              fontSize: '16px',
                              lineHeight: '1.6',
                              marginBottom: '16px',
                              marginTop: '0',
                              color: '#334155',
                            }}
                          >
                            Dear Demo Testson, Sample McExample, and Fictitious
                            Speaker,
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
                            Since you&apos;re presenting together, we wanted to
                            share some{' '}
                            <strong style={{ color: '#1D4ED8' }}>
                              important guidelines
                            </strong>{' '}
                            for coordinating your presentation.
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
                            📋 Key Points to Consider
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
                              Please coordinate who will handle which sections
                            </li>
                            <li style={{ marginBottom: '8px' }}>
                              Ensure your combined presentation fits within the
                              allocated{' '}
                              <strong style={{ color: '#1D4ED8' }}>
                                45-minute slot
                              </strong>{' '}
                              including Q&A
                            </li>
                            <li style={{ marginBottom: '8px' }}>
                              Practice smooth transitions between speakers
                            </li>
                          </ul>

                          <p
                            style={{
                              fontSize: '16px',
                              lineHeight: '1.6',
                              marginBottom: '16px',
                              marginTop: '0',
                              color: '#334155',
                            }}
                          >
                            We&apos;ve also arranged for a{' '}
                            <em style={{ color: '#7C3AED' }}>
                              shared rehearsal space
                            </em>{' '}
                            the day before the conference.
                          </p>

                          <h4
                            style={{
                              color: '#1D4ED8',
                              marginTop: '20px',
                              marginBottom: '10px',
                              fontFamily:
                                '"Space Grotesk", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                              fontSize: '16px',
                              fontWeight: '600',
                            }}
                          >
                            ⚙️ Technical Requirements
                          </h4>

                          <ol
                            style={{
                              margin: '0 0 16px 0',
                              paddingLeft: '20px',
                              color: '#334155',
                              fontSize: '16px',
                              lineHeight: '1.6',
                            }}
                          >
                            <li style={{ marginBottom: '8px' }}>
                              Each speaker should test their laptop with our AV
                              equipment
                            </li>
                            <li style={{ marginBottom: '8px' }}>
                              Have backup slides on a USB drive
                            </li>
                            <li style={{ marginBottom: '8px' }}>
                              Consider using a shared slide deck for seamless
                              transitions
                            </li>
                          </ol>

                          <p
                            style={{
                              fontSize: '16px',
                              lineHeight: '1.6',
                              marginBottom: '16px',
                              marginTop: '0',
                              color: '#334155',
                            }}
                          >
                            Looking forward to your presentation!
                          </p>

                          <p
                            style={{
                              fontSize: '16px',
                              lineHeight: '1.6',
                              marginBottom: '0',
                              marginTop: '0',
                              color: '#334155',
                            }}
                          >
                            Best regards,
                            <br />
                            <strong>Conference Team</strong>
                          </p>
                        </div>

                        {/* Proposal Section */}
                        <div
                          style={{
                            backgroundColor: '#F8FAFC',
                            border: '1px solid #E5E7EB',
                            borderRadius: '8px',
                            padding: '16px',
                            marginBottom: '24px',
                          }}
                        >
                          <h4
                            style={{
                              color: '#1D4ED8',
                              fontSize: '16px',
                              fontWeight: '600',
                              margin: '0 0 8px 0',
                              fontFamily:
                                '"Space Grotesk", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                            }}
                          >
                            Your Proposal
                          </h4>
                          <p
                            style={{
                              fontSize: '16px',
                              fontWeight: '600',
                              color: '#334155',
                              margin: '0 0 4px 0',
                            }}
                          >
                            Building Cloud Native Applications with
                            Microservices
                          </p>
                          <p
                            style={{
                              fontSize: '14px',
                              color: '#64748B',
                              margin: '0 0 8px 0',
                            }}
                          >
                            Submitted for {conference.title}
                          </p>
                          <div style={{ marginTop: '8px' }}>
                            <p
                              style={{
                                fontSize: '14px',
                                color: '#64748B',
                                margin: '0 0 4px 0',
                              }}
                            >
                              <strong>All speakers:</strong>
                            </p>
                            <ul
                              style={{
                                margin: '4px 0 0 0',
                                paddingLeft: '16px',
                                color: '#64748B',
                                fontSize: '14px',
                              }}
                            >
                              <li style={{ marginBottom: '2px' }}>
                                Demo Testson
                                (demo.testson@fictional-examples.com)
                              </li>
                              <li style={{ marginBottom: '2px' }}>
                                Sample McExample
                                (sample.mcexample@demo-samples.com)
                              </li>
                              <li style={{ marginBottom: '2px' }}>
                                Fictitious Speaker
                                (fictitious.speaker@example-demo.com)
                              </li>
                            </ul>
                          </div>
                        </div>

                        {/* Action Button */}
                        <div
                          style={{
                            textAlign: 'center',
                            marginTop: '24px',
                            marginBottom: '24px',
                          }}
                        >
                          <a
                            href={`https://${domain}/admin/proposals/456`}
                            style={{
                              backgroundColor: '#1D4ED8',
                              color: 'white',
                              padding: '12px 24px',
                              textDecoration: 'none',
                              borderRadius: '8px',
                              fontWeight: '600',
                              display: 'inline-block',
                              fontSize: '16px',
                            }}
                          >
                            View Your Proposal
                          </a>
                        </div>
                      </>
                    ),
                  }}
                />
              </ExpandableEmailTemplate>

              {/* Speaker Broadcast Email */}
              <ExpandableEmailTemplate
                title="📢 Speaker Broadcast Email"
                description="Rich content broadcasts to all confirmed speakers with conference updates and announcements."
                className="text-brand-fresh-green"
                previewHeight={600}
                emailFrom={conference.contact_email}
                emailTo="All Speakers"
                emailSubject="Speaker Dinner & Conference Updates"
                emailTime="Yesterday 9:00 AM"
              >
                <BroadcastTemplate
                  eventName={conference.title}
                  subject="Speaker Dinner & Conference Updates"
                  eventLocation="Sample City, Testlandia"
                  eventDate="32nd Mockuary 2099"
                  eventUrl={`https://${domain}/`}
                  socialLinks={conference.social_links}
                  content={
                    <div>
                      <div
                        dangerouslySetInnerHTML={{
                          __html: portableTextToHTML([
                            {
                              _type: 'block',
                              _key: 'intro',
                              style: 'normal',
                              children: [
                                {
                                  _type: 'span',
                                  _key: 'intro-text',
                                  text: "We're excited to share some important updates as we approach the conference date! Thank you for being part of what promises to be an incredible event.",
                                },
                              ],
                            },
                            {
                              _type: 'block',
                              _key: 'dinner-heading',
                              style: 'h3',
                              children: [
                                {
                                  _type: 'span',
                                  _key: 'dinner-emoji',
                                  text: '🍽️ Speaker Dinner - June 14th',
                                },
                              ],
                            },
                            {
                              _type: 'block',
                              _key: 'dinner-info',
                              style: 'normal',
                              children: [
                                {
                                  _type: 'span',
                                  _key: 'dinner-text1',
                                  text: 'Join us for an exclusive speaker dinner at ',
                                },
                                {
                                  _type: 'span',
                                  _key: 'dinner-text2',
                                  text: 'Lysverket restaurant',
                                  marks: ['strong'],
                                },
                                {
                                  _type: 'span',
                                  _key: 'dinner-text3',
                                  text: ' at ',
                                },
                                {
                                  _type: 'span',
                                  _key: 'dinner-time',
                                  text: '19:00',
                                  marks: ['strong'],
                                },
                                {
                                  _type: 'span',
                                  _key: 'dinner-text4',
                                  text: '. This is a great opportunity to connect with fellow speakers before the conference.',
                                },
                              ],
                            },
                            {
                              _type: 'block',
                              _key: 'dinner-rsvp',
                              style: 'normal',
                              children: [
                                {
                                  _type: 'span',
                                  _key: 'rsvp-text1',
                                  text: 'Please ',
                                },
                                {
                                  _type: 'span',
                                  _key: 'rsvp-text2',
                                  text: 'confirm your attendance',
                                  marks: ['strong'],
                                },
                                {
                                  _type: 'span',
                                  _key: 'rsvp-text3',
                                  text: ' by replying to this email or contacting us directly.',
                                },
                              ],
                            },
                            {
                              _type: 'block',
                              _key: 'checklist-heading',
                              style: 'h3',
                              children: [
                                {
                                  _type: 'span',
                                  _key: 'checklist-emoji',
                                  text: '📋 Final Checklist',
                                },
                              ],
                            },
                            {
                              _type: 'block',
                              _key: 'checklist-item1',
                              style: 'normal',
                              listItem: 'bullet',
                              level: 1,
                              children: [
                                {
                                  _type: 'span',
                                  _key: 'checklist-item1-text1',
                                  text: 'Test your slides with our ',
                                  marks: [],
                                },
                                {
                                  _type: 'span',
                                  _key: 'checklist-item1-text2',
                                  text: 'AV team',
                                  marks: ['strong'],
                                },
                                {
                                  _type: 'span',
                                  _key: 'checklist-item1-text3',
                                  text: ' (contact details below)',
                                  marks: [],
                                },
                              ],
                              markDefs: [],
                            },
                            {
                              _type: 'block',
                              _key: 'checklist-item2',
                              style: 'normal',
                              listItem: 'bullet',
                              level: 1,
                              children: [
                                {
                                  _type: 'span',
                                  _key: 'checklist-item2-text',
                                  text: 'Review the updated schedule on our website',
                                  marks: [],
                                },
                              ],
                              markDefs: [],
                            },
                            {
                              _type: 'block',
                              _key: 'checklist-item3',
                              style: 'normal',
                              listItem: 'bullet',
                              level: 1,
                              children: [
                                {
                                  _type: 'span',
                                  _key: 'checklist-item3-text1',
                                  text: 'Prepare for the speaker meet & greet (',
                                  marks: [],
                                },
                                {
                                  _type: 'span',
                                  _key: 'checklist-item3-text2',
                                  text: '30 minutes before your talk',
                                  marks: ['em'],
                                },
                                {
                                  _type: 'span',
                                  _key: 'checklist-item3-text3',
                                  text: ')',
                                  marks: [],
                                },
                              ],
                              markDefs: [],
                            },
                            {
                              _type: 'block',
                              _key: 'venue-heading',
                              style: 'h4',
                              children: [
                                {
                                  _type: 'span',
                                  _key: 'venue-emoji',
                                  text: '📍 Venue Information',
                                },
                              ],
                            },
                            {
                              _type: 'block',
                              _key: 'venue-info',
                              style: 'normal',
                              children: [
                                {
                                  _type: 'span',
                                  _key: 'venue-text1',
                                  text: 'The conference will be held at ',
                                  marks: [],
                                },
                                {
                                  _type: 'span',
                                  _key: 'venue-link',
                                  text: 'Example Demo Center',
                                  marks: ['venue-link'],
                                },
                                {
                                  _type: 'span',
                                  _key: 'venue-text2',
                                  text: '. Please arrive ',
                                  marks: [],
                                },
                                {
                                  _type: 'span',
                                  _key: 'venue-time',
                                  text: '30 minutes before your session',
                                  marks: ['strong'],
                                },
                                {
                                  _type: 'span',
                                  _key: 'venue-text3',
                                  text: ' for a technical check.',
                                  marks: [],
                                },
                              ],
                              markDefs: [
                                {
                                  _key: 'venue-link',
                                  _type: 'link',
                                  href: 'https://fictional-venue-demo.example',
                                },
                              ],
                            },
                            {
                              _type: 'block',
                              _key: 'contact-heading',
                              style: 'h4',
                              children: [
                                {
                                  _type: 'span',
                                  _key: 'contact-emoji',
                                  text: '📞 Contact Information',
                                },
                              ],
                            },
                            {
                              _type: 'block',
                              _key: 'contact-info',
                              style: 'normal',
                              children: [
                                {
                                  _type: 'span',
                                  _key: 'contact-text1',
                                  text: 'If you have any questions, please reach out to our ',
                                  marks: [],
                                },
                                {
                                  _type: 'span',
                                  _key: 'contact-text2',
                                  text: 'speaker coordinator',
                                  marks: ['strong'],
                                },
                                {
                                  _type: 'span',
                                  _key: 'contact-text3',
                                  text: ' at ',
                                  marks: [],
                                },
                                {
                                  _type: 'span',
                                  _key: 'contact-email',
                                  text: 'speakers@demo-examples.fictional',
                                  marks: ['contact-email-link'],
                                },
                                {
                                  _type: 'span',
                                  _key: 'contact-text4',
                                  text: '.',
                                  marks: [],
                                },
                              ],
                              markDefs: [
                                {
                                  _key: 'contact-email-link',
                                  _type: 'link',
                                  href: 'mailto:speakers@demo-examples.fictional',
                                },
                              ],
                            },
                            {
                              _type: 'block',
                              _key: 'closing',
                              style: 'normal',
                              children: [
                                {
                                  _type: 'span',
                                  _key: 'closing-text',
                                  text: 'Looking forward to seeing you soon and making this an unforgettable event together!',
                                },
                              ],
                            },
                          ]),
                        }}
                      />
                    </div>
                  }
                />
              </ExpandableEmailTemplate>
            </div>
          </div>

          {/* Co-Speaker Templates */}
          <div className="mb-16">
            <h3 className="font-space-grotesk mb-8 text-center text-3xl font-semibold text-brand-slate-gray">
              🚀 Pair Programming for Presentations
            </h3>
            <p className="font-inter mb-12 text-center text-lg text-brand-slate-gray">
              Just like scaling microservices, great talks scale better with
              collaboration! Our co-speaker invitation system orchestrates
              seamless partnerships between speakers, enabling distributed
              expertise and fault-tolerant presentations. Deploy these templates
              to invite, coordinate, and celebrate speaker collaborations.
            </p>

            <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
              {/* Co-Speaker Invitation Email */}
              <ExpandableEmailTemplate
                title="🎤 Co-Speaker Invitation Email"
                description="Invites potential co-speakers to join presentations with clear next steps and secure token-based verification."
                previewHeight={600}
                emailFrom={conference.contact_email}
                emailTo="potential.cospeaker@example.com"
                emailSubject='You&apos;ve been invited to co-present "Building Resilient Microservices"'
                emailTime="Today 11:30 AM"
              >
                <CoSpeakerInvitationTemplate
                  eventName={conference.title}
                  inviterName="Demo Speaker"
                  inviterEmail="demo.speaker@example.com"
                  inviteeName="Potential CoSpeaker"
                  proposalTitle="Building Resilient Microservices with Kubernetes"
                  proposalAbstract="Learn how to design fault-tolerant microservices that can handle failures gracefully and maintain system reliability in cloud native environments. This talk covers circuit breakers, retry patterns, and monitoring strategies."
                  eventLocation={`${conference.city}, ${conference.country}`}
                  eventDate="June 15, 2025"
                  eventUrl={`https://${domain}/`}
                  invitationUrl={`https://${domain}/invitation/abc123def456ghi789jkl012mno345pqr678stu901vwx234yz`}
                  expiresAt="August 13, 2025"
                  socialLinks={conference.social_links || []}
                />
              </ExpandableEmailTemplate>

              {/* Co-Speaker Response Email - Accepted */}
              <ExpandableEmailTemplate
                title="✅ Co-Speaker Invitation Accepted"
                description="Notifies the original speaker when their co-speaker invitation is accepted with next steps."
                previewHeight={600}
                emailFrom={conference.contact_email}
                emailTo="demo.speaker@example.com"
                emailSubject="Co-speaker invitation accepted: Building Resilient Microservices"
                emailTime="Today 2:15 PM"
              >
                <CoSpeakerResponseTemplate
                  eventName={conference.title}
                  inviterName="Demo Speaker"
                  respondentName="Potential CoSpeaker"
                  respondentEmail="potential.cospeaker@example.com"
                  proposalTitle="Building Resilient Microservices with Kubernetes"
                  proposalUrl={`https://${domain}/cfp/list`}
                  eventLocation={`${conference.city}, ${conference.country}`}
                  eventDate="June 15, 2025"
                  eventUrl={`https://${domain}/`}
                  accepted={true}
                  socialLinks={conference.social_links || []}
                />
              </ExpandableEmailTemplate>

              {/* Co-Speaker Response Declined Example */}
              <ExpandableEmailTemplate
                title="❌ Co-Speaker Invitation Declined"
                description="Professional notification when a co-speaker invitation is declined, maintaining positive relationships."
                previewHeight={600}
                emailFrom={conference.contact_email}
                emailTo="demo.speaker@example.com"
                emailSubject="Co-speaker invitation declined: Building Resilient Microservices"
                emailTime="Yesterday 4:45 PM"
              >
                <CoSpeakerResponseTemplate
                  eventName={conference.title}
                  inviterName="Demo Speaker"
                  respondentName="Busy Developer"
                  respondentEmail="busy.developer@example.com"
                  proposalTitle="Building Resilient Microservices with Kubernetes"
                  proposalUrl={`https://${domain}/cfp/list`}
                  eventLocation={`${conference.city}, ${conference.country}`}
                  eventDate="June 15, 2025"
                  eventUrl={`https://${domain}/`}
                  accepted={false}
                  declineReason="Thank you for thinking of me! Unfortunately, I have a conflict with another commitment during that time period."
                  socialLinks={conference.social_links || []}
                />
              </ExpandableEmailTemplate>
            </div>

            {/* Co-Speaker Template Guidelines */}
            <div className="mt-12 rounded-xl bg-white p-8 shadow-lg dark:border dark:border-gray-600 dark:bg-gray-700">
              <h4 className="font-space-grotesk mb-6 text-xl font-semibold text-brand-cloud-blue dark:text-blue-400">
                Co-Speaker Template Guidelines
              </h4>
              <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
                <div>
                  <h5 className="font-space-grotesk mb-4 text-lg font-semibold text-brand-slate-gray dark:text-gray-200">
                    Security & Token Management
                  </h5>
                  <ul className="font-inter space-y-3 text-brand-slate-gray dark:text-gray-300">
                    <li className="flex items-start">
                      <span className="mt-1.5 mr-3 h-2 w-2 flex-shrink-0 rounded-full bg-brand-cloud-blue dark:bg-blue-400"></span>
                      <span>
                        <strong>Secure Tokens:</strong> HMAC-SHA256 signed
                        tokens with 14-day expiration for invitation security
                      </span>
                    </li>
                    <li className="flex items-start">
                      <span className="mt-1.5 mr-3 h-2 w-2 flex-shrink-0 rounded-full bg-brand-cloud-blue dark:bg-blue-400"></span>
                      <span>
                        <strong>Email Verification:</strong> Case-insensitive
                        email matching ensures invitations reach the correct
                        recipient
                      </span>
                    </li>
                    <li className="flex items-start">
                      <span className="mt-1.5 mr-3 h-2 w-2 flex-shrink-0 rounded-full bg-brand-cloud-blue dark:bg-blue-400"></span>
                      <span>
                        <strong>One-Time Use:</strong> Tokens become invalid
                        after response to prevent replay attacks
                      </span>
                    </li>
                    <li className="flex items-start">
                      <span className="mt-1.5 mr-3 h-2 w-2 flex-shrink-0 rounded-full bg-brand-cloud-blue dark:bg-blue-400"></span>
                      <span>
                        <strong>Test Mode:</strong> Development environment
                        supports testing without sending actual emails
                      </span>
                    </li>
                  </ul>
                </div>

                <div>
                  <h5 className="font-space-grotesk mb-4 text-lg font-semibold text-brand-slate-gray dark:text-gray-200">
                    User Experience Design
                  </h5>
                  <ul className="font-inter space-y-3 text-brand-slate-gray dark:text-gray-300">
                    <li className="flex items-start">
                      <span className="mt-1.5 mr-3 h-2 w-2 flex-shrink-0 rounded-full bg-brand-fresh-green dark:bg-green-400"></span>
                      <span>
                        <strong>Clear Context:</strong> Invitations include full
                        proposal details and inviter information
                      </span>
                    </li>
                    <li className="flex items-start">
                      <span className="mt-1.5 mr-3 h-2 w-2 flex-shrink-0 rounded-full bg-brand-fresh-green dark:bg-green-400"></span>
                      <span>
                        <strong>Expiration Awareness:</strong> Real-time
                        expiration checking with countdown displays
                      </span>
                    </li>
                    <li className="flex items-start">
                      <span className="mt-1.5 mr-3 h-2 w-2 flex-shrink-0 rounded-full bg-brand-fresh-green dark:bg-green-400"></span>
                      <span>
                        <strong>Response Feedback:</strong> Immediate
                        confirmation and next steps for both parties
                      </span>
                    </li>
                    <li className="flex items-start">
                      <span className="mt-1.5 mr-3 h-2 w-2 flex-shrink-0 rounded-full bg-brand-fresh-green dark:bg-green-400"></span>
                      <span>
                        <strong>Mobile Optimized:</strong> Responsive design
                        ensures accessibility across all devices
                      </span>
                    </li>
                  </ul>
                </div>
              </div>

              <div className="mt-8 rounded-lg bg-brand-sky-mist/50 p-6 dark:border dark:border-gray-600 dark:bg-gray-800">
                <h5 className="font-space-grotesk mb-4 text-lg font-semibold text-brand-cloud-blue dark:text-blue-400">
                  Integration with Existing Systems
                </h5>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  <div>
                    <h6 className="font-inter mb-2 text-sm font-semibold text-brand-slate-gray dark:text-gray-200">
                      Authentication
                    </h6>
                    <p className="font-inter text-sm text-brand-slate-gray dark:text-gray-300">
                      Integrates with NextAuth.js for LinkedIn and GitHub OAuth2
                      authentication flows
                    </p>
                  </div>
                  <div>
                    <h6 className="font-inter mb-2 text-sm font-semibold text-brand-slate-gray dark:text-gray-200">
                      Sanity CMS
                    </h6>
                    <p className="font-inter text-sm text-brand-slate-gray dark:text-gray-300">
                      Co-speaker invitations stored as documents with full audit
                      trail and status tracking
                    </p>
                  </div>
                  <div>
                    <h6 className="font-inter mb-2 text-sm font-semibold text-brand-slate-gray dark:text-gray-200">
                      Email Service
                    </h6>
                    <p className="font-inter text-sm text-brand-slate-gray dark:text-gray-300">
                      Powered by Resend with retry logic, rate limiting, and
                      delivery tracking
                    </p>
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
              <ExpandableEmailTemplate
                title="📻 Community Broadcast Email"
                description="General audience communications with rich HTML content and unsubscribe management."
                className="text-accent-purple"
                previewHeight={600}
                emailFrom={conference.contact_email}
                emailTo="Community Member"
                emailSubject="Early Bird Tickets Now Available!"
                emailTime="2 days ago 10:00 AM"
              >
                <BroadcastTemplate
                  eventName={conference.title}
                  subject="Early Bird Tickets Now Available!"
                  eventLocation={`${conference.city}, ${conference.country}`}
                  eventDate={new Date(conference.start_date).toLocaleDateString(
                    'en-US',
                    {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    },
                  )}
                  eventUrl={`https://${conference.domains[0]}`}
                  socialLinks={conference.social_links || []}
                  unsubscribeUrl="https://example.com/unsubscribe" // Example unsubscribe URL for demo
                  content={
                    <div>
                      <p>
                        We&apos;re thrilled to announce that early bird tickets
                        for {conference.title} are now available!
                      </p>

                      <h2
                        style={{
                          color: '#1D4ED8',
                          fontSize: '18px',
                          margin: '24px 0 12px 0',
                        }}
                      >
                        🎟️ Ticket Information
                      </h2>
                      <ul>
                        <li>
                          <strong>Early Bird Price:</strong> 299 NOK (Regular:
                          499 NOK)
                        </li>
                        <li>
                          <strong>Available Until:</strong> March 31st, 2025
                        </li>
                        <li>
                          <strong>Includes:</strong> Full conference access,
                          lunch, and networking reception
                        </li>
                      </ul>

                      <h2
                        style={{
                          color: '#1D4ED8',
                          fontSize: '18px',
                          margin: '24px 0 12px 0',
                        }}
                      >
                        🎤 Confirmed Speakers
                      </h2>
                      <p>
                        We have an amazing lineup including experts from Google,
                        Microsoft, and the Cloud Native Computing Foundation.
                      </p>

                      <div style={{ textAlign: 'center', margin: '32px 0' }}>
                        <a
                          href="https://tickets.demo-examples.fictional"
                          style={{
                            background:
                              'linear-gradient(135deg, #1D4ED8 0%, #3B82F6 100%)',
                            color: 'white',
                            padding: '12px 24px',
                            textDecoration: 'none',
                            borderRadius: '8px',
                            fontWeight: '600',
                            display: 'inline-block',
                          }}
                        >
                          Get Your Ticket
                        </a>
                      </div>
                    </div>
                  }
                />
              </ExpandableEmailTemplate>

              {/* Base Email Template Preview */}
              <ExpandableEmailTemplate
                title="🏗️ Base Email Template"
                description="Foundation template providing consistent structure, branding, and email client compatibility."
                className="text-brand-slate-gray"
                previewHeight={600}
                emailFrom={conference.contact_email}
                emailTo="recipient@example.com"
                emailSubject="Welcome to Cloud Native Bergen"
                emailTime="1 week ago 3:15 PM"
              >
                <BaseEmailTemplate
                  eventName={conference.title}
                  title="Welcome to Cloud Native Bergen"
                  speakerName="Taylor Johnson"
                  proposalTitle="Getting Started with Cloud Native Development"
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
                    Thank you for joining our cloud native community! This is
                    the foundation template that provides consistent branding
                    and structure for all our email communications.
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
                    event details, and accessibility features that work across
                    all major email clients.
                  </p>
                </BaseEmailTemplate>
              </ExpandableEmailTemplate>
            </div>
          </div>

          {/* Template Comparison Grid */}
          <div className="mb-16">
            <h3 className="font-space-grotesk mb-8 text-center text-3xl font-semibold text-brand-slate-gray dark:text-blue-400">
              Template Feature Comparison
            </h3>

            <div className="overflow-x-auto">
              <table className="w-full rounded-lg bg-white shadow-lg dark:border dark:border-gray-600 dark:bg-gray-800">
                <thead>
                  <tr className="bg-brand-sky-mist dark:bg-gray-700">
                    <th className="px-6 py-4 text-left">
                      <span className="font-space-grotesk text-lg font-semibold text-brand-slate-gray dark:text-gray-200">
                        Template
                      </span>
                    </th>
                    <th className="px-6 py-4 text-left">
                      <span className="font-space-grotesk text-lg font-semibold text-brand-slate-gray dark:text-gray-200">
                        Purpose
                      </span>
                    </th>
                    <th className="px-6 py-4 text-left">
                      <span className="font-space-grotesk text-lg font-semibold text-brand-slate-gray dark:text-gray-200">
                        Key Features
                      </span>
                    </th>
                    <th className="px-6 py-4 text-left">
                      <span className="font-space-grotesk text-lg font-semibold text-brand-slate-gray dark:text-gray-200">
                        Automation
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-600">
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
                      <span className="inline-flex rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-800 dark:bg-gray-700 dark:text-gray-200">
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
                  <tr className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <span className="font-space-grotesk font-semibold text-brand-fresh-green">
                        Co-Speaker Invitation
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="font-inter text-brand-slate-gray">
                        Invite speakers to collaborate
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <ul className="font-inter list-inside list-disc space-y-1 text-sm text-brand-slate-gray">
                        <li>Secure token system</li>
                        <li>Talk context details</li>
                        <li>Accept/decline options</li>
                        <li>Professional tone</li>
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
                        Co-Speaker Response
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="font-inter text-brand-slate-gray">
                        Notify of invitation response
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <ul className="font-inter list-inside list-disc space-y-1 text-sm text-brand-slate-gray">
                        <li>Accept/decline status</li>
                        <li>Professional language</li>
                        <li>Next steps guidance</li>
                        <li>Relationship preservation</li>
                      </ul>
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-800">
                        Automated
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Technical Implementation */}
          <div className="rounded-xl bg-white p-8 shadow-lg dark:border dark:border-gray-600 dark:bg-gray-700">
            <h3 className="font-space-grotesk mb-6 text-2xl font-semibold text-brand-slate-gray dark:text-blue-400">
              Technical Implementation
            </h3>
            <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
              <div>
                <h4 className="font-space-grotesk mb-4 text-lg font-semibold text-brand-cloud-blue dark:text-blue-400">
                  Email Service Integration
                </h4>
                <ul className="font-inter space-y-2 text-brand-slate-gray dark:text-gray-300">
                  <li>• Resend service for reliable delivery</li>
                  <li>• Rate limiting and retry logic</li>
                  <li>• Audience management and segmentation</li>
                  <li>• Bounce and unsubscribe handling</li>
                  <li>• Template validation and testing</li>
                </ul>
              </div>
              <div>
                <h4 className="font-space-grotesk mb-4 text-lg font-semibold text-brand-cloud-blue dark:text-blue-400">
                  Design Standards
                </h4>
                <ul className="font-inter space-y-2 text-brand-slate-gray dark:text-gray-300">
                  <li>• Responsive table-based layouts</li>
                  <li>• Email client compatibility testing</li>
                  <li>• Accessible color contrast ratios</li>
                  <li>• Consistent typography hierarchy</li>
                  <li>• Brand-aligned visual elements</li>
                </ul>
              </div>
            </div>

            <div className="mt-8 rounded-lg bg-brand-sky-mist p-6 dark:border dark:border-gray-600 dark:bg-gray-800">
              <h4 className="font-space-grotesk mb-4 text-lg font-semibold text-brand-cloud-blue dark:text-blue-400">
                Development Guidelines
              </h4>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div>
                  <h5 className="font-space-grotesk mb-2 text-sm font-semibold text-brand-slate-gray dark:text-gray-200">
                    Component Architecture
                  </h5>
                  <p className="font-inter text-sm text-brand-slate-gray dark:text-gray-300">
                    Modular React components with TypeScript props for type
                    safety and reusability across different email contexts.
                  </p>
                </div>
                <div>
                  <h5 className="font-space-grotesk mb-2 text-sm font-semibold text-brand-slate-gray dark:text-gray-200">
                    Testing Strategy
                  </h5>
                  <p className="font-inter text-sm text-brand-slate-gray dark:text-gray-300">
                    Comprehensive testing across email clients, accessibility
                    validation, and content rendering verification.
                  </p>
                </div>
                <div>
                  <h5 className="font-space-grotesk mb-2 text-sm font-semibold text-brand-slate-gray dark:text-gray-200">
                    Maintenance
                  </h5>
                  <p className="font-inter text-sm text-brand-slate-gray dark:text-gray-300">
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
