import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import Link from 'next/link'
import { Button } from '@/components/Button'
import {
  SpeakerAvatars,
  SpeakerAvatarsWithNames,
} from '@/components/SpeakerAvatars'
import { ClickableSpeakerNames } from '@/components/ClickableSpeakerNames'
import {
  ClockIcon,
  UserGroupIcon,
  MicrophoneIcon,
  WrenchScrewdriverIcon,
  BuildingOfficeIcon,
} from '@heroicons/react/24/outline'
import { Speaker, Flags } from '@/lib/speaker/types'

const meta = {
  title: 'Design System/Examples/Conference Landing Page',
  parameters: {
    layout: 'fullscreen',
    options: {
      showPanel: false,
    },
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const mockSpeakers: Speaker[] = [
  {
    _id: 'speaker-1',
    _rev: '1',
    _createdAt: '2024-01-01T00:00:00Z',
    _updatedAt: '2024-01-01T00:00:00Z',
    name: 'Kelsey Hightower',
    email: 'kelsey@example.com',
    slug: 'kelsey-hightower',
    title: 'Staff Developer Advocate at Google',
    bio: 'Kelsey is a strong advocate for open source and the CNCF community.',
    flags: [],
  },
  {
    _id: 'speaker-2',
    _rev: '1',
    _createdAt: '2024-01-01T00:00:00Z',
    _updatedAt: '2024-01-01T00:00:00Z',
    name: 'Liz Rice',
    email: 'liz@example.com',
    slug: 'liz-rice',
    title: 'Chief Open Source Officer at Isovalent',
    bio: 'Liz is an expert in container security and eBPF.',
    flags: [],
  },
  {
    _id: 'speaker-3',
    _rev: '1',
    _createdAt: '2024-01-01T00:00:00Z',
    _updatedAt: '2024-01-01T00:00:00Z',
    name: 'Viktor Farcic',
    email: 'viktor@example.com',
    slug: 'viktor-farcic',
    title: 'Developer Advocate at Upbound',
    bio: 'Viktor is a DevOps practitioner and author of several books.',
    flags: [Flags.localSpeaker],
  },
  {
    _id: 'speaker-4',
    _rev: '1',
    _createdAt: '2024-01-01T00:00:00Z',
    _updatedAt: '2024-01-01T00:00:00Z',
    name: 'Ana Medina',
    email: 'ana@example.com',
    slug: 'ana-medina',
    title: 'Principal Chaos Engineer at Gremlin',
    bio: 'Ana specializes in chaos engineering and reliability.',
    flags: [Flags.firstTimeSpeaker],
  },
  {
    _id: 'speaker-5',
    _rev: '1',
    _createdAt: '2024-01-01T00:00:00Z',
    _updatedAt: '2024-01-01T00:00:00Z',
    name: 'Tim Hockin',
    email: 'tim@example.com',
    slug: 'tim-hockin',
    title: 'Principal Software Engineer at Google',
    bio: 'Tim is a co-founder of Kubernetes.',
    flags: [],
  },
  {
    _id: 'speaker-6',
    _rev: '1',
    _createdAt: '2024-01-01T00:00:00Z',
    _updatedAt: '2024-01-01T00:00:00Z',
    name: 'Emily Freeman',
    email: 'emily@example.com',
    slug: 'emily-freeman',
    title: 'Head of Community at AWS',
    bio: 'Emily focuses on developer experience and community building.',
    flags: [Flags.diverseSpeaker],
  },
]

const mockTalks = [
  {
    id: '1',
    title: 'The Future of Kubernetes: What&apos;s Coming in 2026',
    speakers: [mockSpeakers[4]],
    format: 'Keynote',
    duration: 45,
    track: 'Main Stage',
    time: '09:00',
    level: 'All levels',
    description:
      'A deep dive into upcoming Kubernetes features and the roadmap ahead.',
  },
  {
    id: '2',
    title: 'eBPF: The Swiss Army Knife for Cloud Native Observability',
    speakers: [mockSpeakers[1]],
    format: 'Talk',
    duration: 30,
    track: 'Track A',
    time: '10:00',
    level: 'Intermediate',
    description:
      'Learn how eBPF is revolutionizing observability and security.',
  },
  {
    id: '3',
    title: 'GitOps at Scale: Lessons from the Trenches',
    speakers: [mockSpeakers[2]],
    format: 'Talk',
    duration: 30,
    track: 'Track B',
    time: '10:00',
    level: 'Advanced',
    description: 'Real-world GitOps patterns for large organizations.',
  },
  {
    id: '4',
    title: 'Chaos Engineering for Kubernetes',
    speakers: [mockSpeakers[3]],
    format: 'Lightning Talk',
    duration: 15,
    track: 'Track A',
    time: '11:00',
    level: 'Intermediate',
    description:
      'Practical chaos engineering experiments for your Kubernetes clusters.',
  },
]

const mockWorkshops = [
  {
    id: '1',
    title: 'Kubernetes Security Fundamentals',
    speakers: [mockSpeakers[1]],
    duration: 180,
    capacity: 30,
    registered: 24,
    level: 'Beginner',
    description:
      'Hands-on workshop covering Pod Security Standards, RBAC, and network policies.',
  },
  {
    id: '2',
    title: 'Building Platform Engineering with Crossplane',
    speakers: [mockSpeakers[2]],
    duration: 240,
    capacity: 25,
    registered: 25,
    level: 'Advanced',
    description:
      'Build your own internal developer platform using Crossplane and Kubernetes.',
  },
]

const mockSponsors = {
  platinum: [
    { name: 'Google Cloud', color: '#4285F4' },
    { name: 'Microsoft Azure', color: '#0078D4' },
  ],
  gold: [
    { name: 'Datadog', color: '#632CA6' },
    { name: 'Elastic', color: '#00BFB3' },
    { name: 'HashiCorp', color: '#000000' },
  ],
  silver: [
    { name: 'Grafana Labs', color: '#F46800' },
    { name: 'Confluent', color: '#0000FF' },
    { name: 'Snyk', color: '#4C4A73' },
    { name: 'CircleCI', color: '#343434' },
  ],
}

function SpeakerCard({
  speaker,
  featured = false,
}: {
  speaker: Speaker
  featured?: boolean
}) {
  return (
    <div
      className={`rounded-xl border bg-white p-6 transition-shadow hover:shadow-lg dark:border-gray-700 dark:bg-gray-800 ${featured ? 'border-brand-cloud-blue/30 ring-2 ring-brand-cloud-blue/20' : 'border-gray-200'}`}
    >
      <div className="flex items-start gap-4">
        <div
          className={`flex items-center justify-center rounded-full bg-brand-gradient text-white ${featured ? 'h-16 w-16 text-xl' : 'h-12 w-12'}`}
        >
          {speaker.name
            .split(' ')
            .map((n) => n[0])
            .join('')}
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3
              className={`font-space-grotesk font-semibold text-brand-slate-gray dark:text-white ${featured ? 'text-lg' : 'text-base'}`}
            >
              {speaker.name}
            </h3>
            {featured && (
              <span className="rounded bg-brand-cloud-blue/10 px-2 py-0.5 text-xs font-medium text-brand-cloud-blue">
                Keynote
              </span>
            )}
          </div>
          <p className="font-inter text-sm text-gray-500 dark:text-gray-400">
            {speaker.title}
          </p>
          {speaker.bio && featured && (
            <p className="font-inter mt-2 line-clamp-2 text-sm text-gray-600 dark:text-gray-300">
              {speaker.bio}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

function TalkCard({
  talk,
}: {
  talk: {
    id: string
    title: string
    speakers: Speaker[]
    format: string
    duration: number
    track: string
    time: string
    level: string
    description: string
  }
}) {
  const formatColors: Record<string, string> = {
    Keynote: 'bg-brand-nordic-purple text-white',
    Talk: 'bg-brand-cloud-blue text-white',
    'Lightning Talk': 'bg-brand-fresh-green text-white',
    Workshop: 'bg-accent-yellow text-gray-900',
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 transition-shadow hover:shadow-md dark:border-gray-700 dark:bg-gray-800">
      <div className="mb-3 flex items-center justify-between">
        <span
          className={`rounded-full px-3 py-1 text-xs font-medium ${formatColors[talk.format] || 'bg-gray-100 text-gray-700'}`}
        >
          {talk.format}
        </span>
        <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
          <ClockIcon className="h-4 w-4" />
          {talk.time} · {talk.duration}min
        </div>
      </div>

      <h4 className="font-space-grotesk mb-2 text-lg font-semibold text-brand-slate-gray dark:text-white">
        {talk.title}
      </h4>

      <p className="font-inter mb-3 line-clamp-2 text-sm text-gray-600 dark:text-gray-300">
        {talk.description}
      </p>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <SpeakerAvatars speakers={talk.speakers} size="sm" maxVisible={3} />
          <span className="text-sm text-gray-600 dark:text-gray-400">
            <ClickableSpeakerNames
              speakers={talk.speakers}
              linkClassName="text-brand-cloud-blue hover:underline"
              showFirstNameOnly={true}
            />
          </span>
        </div>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {talk.track}
        </span>
      </div>
    </div>
  )
}

function WorkshopCard({
  workshop,
}: {
  workshop: {
    id: string
    title: string
    speakers: Speaker[]
    duration: number
    capacity: number
    registered: number
    level: string
    description: string
  }
}) {
  const isFull = workshop.registered >= workshop.capacity
  const spotsLeft = workshop.capacity - workshop.registered

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
      <div className="mb-3 flex items-center justify-between">
        <span className="rounded-full bg-accent-yellow px-3 py-1 text-xs font-medium text-gray-900">
          Workshop
        </span>
        <span
          className={`text-sm font-medium ${isFull ? 'text-red-600' : 'text-brand-fresh-green'}`}
        >
          {isFull ? 'Sold Out' : `${spotsLeft} spots left`}
        </span>
      </div>

      <h4 className="font-space-grotesk mb-2 text-lg font-semibold text-brand-slate-gray dark:text-white">
        {workshop.title}
      </h4>

      <p className="font-inter mb-4 text-sm text-gray-600 dark:text-gray-300">
        {workshop.description}
      </p>

      <div className="grid grid-cols-2 gap-3 text-sm text-gray-500 dark:text-gray-400">
        <div className="flex items-center gap-1">
          <ClockIcon className="h-4 w-4" />
          {workshop.duration / 60}h
        </div>
        <div className="flex items-center gap-1">
          <UserGroupIcon className="h-4 w-4" />
          {workshop.registered}/{workshop.capacity}
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2 border-t border-gray-100 pt-4 dark:border-gray-700">
        <SpeakerAvatars speakers={workshop.speakers} size="sm" maxVisible={2} />
        <span className="text-sm text-gray-600 dark:text-gray-400">
          <ClickableSpeakerNames
            speakers={workshop.speakers}
            linkClassName="text-brand-cloud-blue hover:underline"
          />
        </span>
      </div>
    </div>
  )
}

function SponsorTier({
  name,
  sponsors,
}: {
  name: string
  sponsors: { name: string; color: string }[]
}) {
  return (
    <div className="mb-8">
      <div className="mb-4 flex items-center gap-3">
        <div className="h-0.5 w-4 bg-brand-cloud-blue" />
        <h4 className="font-space-grotesk text-sm font-bold tracking-wider text-brand-cloud-blue uppercase">
          {name}
        </h4>
      </div>
      <div className="flex flex-wrap gap-4">
        {sponsors.map((sponsor) => (
          <div
            key={sponsor.name}
            className="flex h-16 items-center justify-center rounded-lg border border-dashed border-gray-300 bg-white px-6 dark:border-gray-600 dark:bg-gray-800"
          >
            <span
              className="font-inter font-semibold"
              style={{ color: sponsor.color }}
            >
              {sponsor.name}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

export const CompleteLandingPage: Story = {
  render: () => (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-brand-gradient py-20">
        <div className="absolute inset-0 bg-black/20" />
        <div className="relative z-10 mx-auto max-w-6xl px-4 text-center">
          <h1 className="font-jetbrains mb-4 text-5xl font-bold text-white md:text-6xl">
            Cloud Native Days Norway
          </h1>
          <p className="font-space-grotesk mb-6 text-2xl text-white/90">
            June 15-16, 2026 · Oslo Spektrum
          </p>
          <p className="font-inter mx-auto mb-8 max-w-2xl text-lg text-white/80">
            Join 1,500+ cloud native enthusiasts for two days of cutting-edge
            talks, hands-on workshops, and community networking.
          </p>

          <div className="mb-12 flex flex-wrap justify-center gap-6 text-white/90">
            <div className="flex items-center gap-2">
              <MicrophoneIcon className="h-5 w-5" />
              <span>40+ Talks</span>
            </div>
            <div className="flex items-center gap-2">
              <WrenchScrewdriverIcon className="h-5 w-5" />
              <span>8 Workshops</span>
            </div>
            <div className="flex items-center gap-2">
              <UserGroupIcon className="h-5 w-5" />
              <span>60+ Speakers</span>
            </div>
            <div className="flex items-center gap-2">
              <BuildingOfficeIcon className="h-5 w-5" />
              <span>30+ Sponsors</span>
            </div>
          </div>

          <div className="flex flex-wrap justify-center gap-4">
            <button className="inline-flex items-center justify-center rounded-2xl bg-white px-6 py-3 font-semibold text-brand-cloud-blue transition-all duration-200 hover:bg-gray-100 active:scale-95">
              Get Tickets
            </button>
            <button className="inline-flex items-center justify-center rounded-2xl border-2 border-white bg-transparent px-6 py-3 font-semibold text-white transition-all duration-200 hover:bg-white hover:text-brand-cloud-blue active:scale-95">
              Call for Papers
            </button>
          </div>
        </div>
      </section>

      {/* Featured Speakers Section */}
      <section className="py-16">
        <div className="mx-auto max-w-6xl px-4">
          <div className="mb-10 flex items-center justify-between">
            <div>
              <h2 className="font-space-grotesk text-3xl font-bold text-brand-slate-gray dark:text-white">
                Featured Speakers
              </h2>
              <p className="font-inter mt-2 text-gray-600 dark:text-gray-400">
                Industry leaders sharing their cloud native expertise
              </p>
            </div>
            <Link
              href="#"
              className="font-inter text-sm font-medium text-brand-cloud-blue hover:underline"
            >
              View all speakers →
            </Link>
          </div>

          <div className="mb-8">
            <SpeakerCard speaker={mockSpeakers[4]} featured={true} />
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {mockSpeakers.slice(0, 3).map((speaker) => (
              <SpeakerCard key={speaker._id} speaker={speaker} />
            ))}
          </div>
        </div>
      </section>

      {/* Schedule Preview Section */}
      <section className="bg-white py-16 dark:bg-gray-800">
        <div className="mx-auto max-w-6xl px-4">
          <div className="mb-10 flex items-center justify-between">
            <div>
              <h2 className="font-space-grotesk text-3xl font-bold text-brand-slate-gray dark:text-white">
                Program Highlights
              </h2>
              <p className="font-inter mt-2 text-gray-600 dark:text-gray-400">
                Keynotes, talks, and lightning sessions across 3 tracks
              </p>
            </div>
            <Link
              href="#"
              className="font-inter text-sm font-medium text-brand-cloud-blue hover:underline"
            >
              View full schedule →
            </Link>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {mockTalks.map((talk) => (
              <TalkCard key={talk.id} talk={talk} />
            ))}
          </div>
        </div>
      </section>

      {/* Workshops Section */}
      <section className="py-16">
        <div className="mx-auto max-w-6xl px-4">
          <div className="mb-10 flex items-center justify-between">
            <div>
              <h2 className="font-space-grotesk text-3xl font-bold text-brand-slate-gray dark:text-white">
                Hands-on Workshops
              </h2>
              <p className="font-inter mt-2 text-gray-600 dark:text-gray-400">
                Deep-dive sessions with limited capacity for personalized
                learning
              </p>
            </div>
            <Link
              href="#"
              className="font-inter text-sm font-medium text-brand-cloud-blue hover:underline"
            >
              View all workshops →
            </Link>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            {mockWorkshops.map((workshop) => (
              <WorkshopCard key={workshop.id} workshop={workshop} />
            ))}
          </div>
        </div>
      </section>

      {/* Sponsors Section */}
      <section className="bg-white py-16 dark:bg-gray-800">
        <div className="mx-auto max-w-6xl px-4">
          <div className="mb-10">
            <h2 className="font-space-grotesk text-3xl font-bold text-brand-slate-gray dark:text-white">
              Our Sponsors
            </h2>
            <p className="font-inter mt-2 text-gray-600 dark:text-gray-400">
              Thank you to our amazing sponsors making this event possible
            </p>
          </div>

          <SponsorTier name="Platinum" sponsors={mockSponsors.platinum} />
          <SponsorTier name="Gold" sponsors={mockSponsors.gold} />
          <SponsorTier name="Silver" sponsors={mockSponsors.silver} />

          <div className="mt-12 rounded-xl bg-brand-sky-mist p-8 text-center dark:bg-gray-700">
            <h3 className="font-space-grotesk mb-2 text-xl font-bold text-brand-slate-gray dark:text-white">
              Become a Sponsor
            </h3>
            <p className="font-inter mb-4 text-gray-600 dark:text-gray-300">
              Join our community of sponsors and connect with cloud native
              professionals
            </p>
            <Button variant="primary">View Sponsorship Packages</Button>
          </div>
        </div>
      </section>

      {/* Quick Stats Footer */}
      <section className="bg-brand-slate-gray py-12">
        <div className="mx-auto max-w-6xl px-4">
          <div className="grid grid-cols-2 gap-8 text-center md:grid-cols-4">
            <div>
              <p className="font-jetbrains text-4xl font-bold text-brand-cloud-blue">
                1,500+
              </p>
              <p className="font-inter text-sm text-gray-300">Attendees</p>
            </div>
            <div>
              <p className="font-jetbrains text-4xl font-bold text-brand-fresh-green">
                60+
              </p>
              <p className="font-inter text-sm text-gray-300">Speakers</p>
            </div>
            <div>
              <p className="font-jetbrains text-4xl font-bold text-brand-nordic-purple">
                40+
              </p>
              <p className="font-inter text-sm text-gray-300">Sessions</p>
            </div>
            <div>
              <p className="font-jetbrains text-4xl font-bold text-accent-yellow">
                2
              </p>
              <p className="font-inter text-sm text-gray-300">Days</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  ),
}

export const SpeakersAndTalksSection: Story = {
  name: 'Speakers & Talks Combined',
  render: () => (
    <div className="min-h-screen bg-white p-8 dark:bg-gray-900">
      <div className="mx-auto max-w-5xl">
        <h1 className="font-space-grotesk mb-4 text-4xl font-bold text-brand-cloud-blue dark:text-blue-400">
          Speakers &amp; Talks Integration
        </h1>
        <p className="font-inter mb-12 text-lg text-brand-slate-gray dark:text-gray-300">
          Demonstrating how speaker components and talk cards work together.
        </p>

        {/* Speaker with Their Talks */}
        <section className="mb-16">
          <h2 className="font-space-grotesk mb-6 text-2xl font-semibold text-brand-slate-gray dark:text-white">
            Speaker Profile with Talks
          </h2>

          <div className="rounded-xl border border-gray-200 bg-gray-50 p-6 dark:border-gray-700 dark:bg-gray-800">
            <div className="mb-6 flex items-start gap-6">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-brand-gradient text-2xl text-white">
                LR
              </div>
              <div className="flex-1">
                <h3 className="font-space-grotesk text-xl font-bold text-brand-slate-gray dark:text-white">
                  {mockSpeakers[1].name}
                </h3>
                <p className="font-inter text-gray-600 dark:text-gray-400">
                  {mockSpeakers[1].title}
                </p>
                <p className="font-inter mt-2 text-sm text-gray-500 dark:text-gray-300">
                  {mockSpeakers[1].bio}
                </p>
              </div>
            </div>

            <div>
              <h4 className="font-space-grotesk mb-3 text-lg font-semibold text-brand-slate-gray dark:text-white">
                Sessions
              </h4>
              <div className="space-y-3">
                <TalkCard talk={mockTalks[1]} />
                <WorkshopCard workshop={mockWorkshops[0]} />
              </div>
            </div>
          </div>
        </section>

        {/* Multi-Speaker Talk */}
        <section className="mb-16">
          <h2 className="font-space-grotesk mb-6 text-2xl font-semibold text-brand-slate-gray dark:text-white">
            Multi-Speaker Session Display
          </h2>

          <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
            <div className="mb-4 flex items-center gap-2">
              <span className="rounded-full bg-brand-nordic-purple px-3 py-1 text-xs font-medium text-white">
                Panel Discussion
              </span>
              <span className="text-sm text-gray-500">90 min · Main Stage</span>
            </div>

            <h4 className="font-space-grotesk mb-2 text-xl font-semibold text-brand-slate-gray dark:text-white">
              The State of Cloud Native Security
            </h4>

            <p className="font-inter mb-4 text-gray-600 dark:text-gray-300">
              Join our panel of security experts as they discuss emerging
              threats, best practices, and the future of cloud native security.
            </p>

            <div className="border-t border-gray-100 pt-4 dark:border-gray-700">
              <p className="mb-2 text-sm font-medium text-gray-500 dark:text-gray-400">
                Panelists
              </p>
              <div className="flex items-center gap-4">
                <SpeakerAvatars
                  speakers={mockSpeakers.slice(0, 4)}
                  size="md"
                  maxVisible={4}
                />
                <span className="text-sm text-gray-600 dark:text-gray-300">
                  <ClickableSpeakerNames
                    speakers={mockSpeakers.slice(0, 4)}
                    linkClassName="text-brand-cloud-blue hover:underline"
                  />
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Schedule Timeline */}
        <section>
          <h2 className="font-space-grotesk mb-6 text-2xl font-semibold text-brand-slate-gray dark:text-white">
            Schedule Timeline View
          </h2>

          <div className="space-y-4">
            {mockTalks.map((talk) => (
              <div
                key={talk.id}
                className="flex gap-4 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800"
              >
                <div className="w-20 shrink-0 text-center">
                  <p className="font-jetbrains text-lg font-bold text-brand-cloud-blue">
                    {talk.time}
                  </p>
                  <p className="text-xs text-gray-500">{talk.duration}min</p>
                </div>
                <div className="flex-1">
                  <div className="mb-1 flex items-center gap-2">
                    <span
                      className={`rounded px-2 py-0.5 text-xs font-medium ${
                        talk.format === 'Keynote'
                          ? 'bg-brand-nordic-purple/10 text-brand-nordic-purple'
                          : talk.format === 'Lightning Talk'
                            ? 'bg-brand-fresh-green/10 text-brand-fresh-green'
                            : 'bg-brand-cloud-blue/10 text-brand-cloud-blue'
                      }`}
                    >
                      {talk.format}
                    </span>
                    <span className="text-xs text-gray-400">{talk.track}</span>
                  </div>
                  <h4 className="font-space-grotesk font-semibold text-brand-slate-gray dark:text-white">
                    {talk.title}
                  </h4>
                  <div className="mt-1 flex items-center gap-2">
                    <SpeakerAvatarsWithNames
                      speakers={talk.speakers}
                      size="sm"
                      maxVisible={3}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  ),
}

export const SponsorsAndCTAs: Story = {
  name: 'Sponsors & CTAs Integration',
  render: () => (
    <div className="min-h-screen bg-white p-8 dark:bg-gray-900">
      <div className="mx-auto max-w-5xl">
        <h1 className="font-space-grotesk mb-4 text-4xl font-bold text-brand-cloud-blue dark:text-blue-400">
          Sponsors &amp; Call-to-Actions
        </h1>
        <p className="font-inter mb-12 text-lg text-brand-slate-gray dark:text-gray-300">
          Sponsor display patterns and effective call-to-action sections.
        </p>

        {/* Compact Sponsor Strip */}
        <section className="mb-16">
          <h2 className="font-space-grotesk mb-6 text-2xl font-semibold text-brand-slate-gray dark:text-white">
            Compact Sponsor Strip
          </h2>
          <p className="font-inter mb-4 text-gray-600 dark:text-gray-400">
            Ideal for headers, footers, or inline content areas.
          </p>

          <div className="overflow-hidden rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800">
            <p className="mb-3 text-center text-xs font-medium text-gray-500 uppercase dark:text-gray-400">
              Sponsored by
            </p>
            <div className="flex flex-wrap items-center justify-center gap-6">
              {[...mockSponsors.platinum, ...mockSponsors.gold.slice(0, 2)].map(
                (sponsor) => (
                  <span
                    key={sponsor.name}
                    className="font-inter text-sm font-semibold"
                    style={{ color: sponsor.color }}
                  >
                    {sponsor.name}
                  </span>
                ),
              )}
            </div>
          </div>
        </section>

        {/* CTA with Sponsor Mention */}
        <section className="mb-16">
          <h2 className="font-space-grotesk mb-6 text-2xl font-semibold text-brand-slate-gray dark:text-white">
            Conference CTA with Sponsors
          </h2>

          <div className="overflow-hidden rounded-xl bg-brand-gradient p-8 text-center">
            <h3 className="font-jetbrains mb-2 text-3xl font-bold text-white">
              Register Now
            </h3>
            <p className="font-inter mb-6 text-white/90">
              Early bird tickets available until March 31st
            </p>
            <button className="mb-8 inline-flex items-center justify-center rounded-2xl bg-white px-6 py-3 font-semibold text-brand-cloud-blue transition-all duration-200 hover:bg-gray-100 active:scale-95">
              Get Your Ticket
            </button>
            <div className="border-t border-white/20 pt-6">
              <p className="mb-3 text-xs text-white/70 uppercase">
                Presented by
              </p>
              <div className="flex flex-wrap justify-center gap-4">
                {mockSponsors.platinum.map((sponsor) => (
                  <span
                    key={sponsor.name}
                    className="rounded bg-white/10 px-3 py-1 text-sm font-medium text-white"
                  >
                    {sponsor.name}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Sponsor Benefit Highlight */}
        <section>
          <h2 className="font-space-grotesk mb-6 text-2xl font-semibold text-brand-slate-gray dark:text-white">
            Sponsor Benefits Section
          </h2>

          <div className="grid gap-6 md:grid-cols-3">
            <div className="rounded-xl border-2 border-brand-cloud-blue bg-brand-cloud-blue/5 p-6">
              <span className="mb-3 inline-block rounded bg-brand-cloud-blue px-2 py-1 text-xs font-bold text-white">
                PLATINUM
              </span>
              <h4 className="font-space-grotesk mb-2 text-lg font-semibold text-brand-slate-gray dark:text-white">
                Premier Visibility
              </h4>
              <ul className="font-inter space-y-2 text-sm text-gray-600 dark:text-gray-400">
                <li>✓ Logo on all materials</li>
                <li>✓ Keynote mention</li>
                <li>✓ Premium booth location</li>
                <li>✓ 10 conference passes</li>
              </ul>
            </div>

            <div className="rounded-xl border border-accent-yellow bg-accent-yellow/5 p-6">
              <span className="mb-3 inline-block rounded bg-accent-yellow px-2 py-1 text-xs font-bold text-gray-900">
                GOLD
              </span>
              <h4 className="font-space-grotesk mb-2 text-lg font-semibold text-brand-slate-gray dark:text-white">
                Strong Presence
              </h4>
              <ul className="font-inter space-y-2 text-sm text-gray-600 dark:text-gray-400">
                <li>✓ Logo on website</li>
                <li>✓ Social media promotion</li>
                <li>✓ Standard booth</li>
                <li>✓ 5 conference passes</li>
              </ul>
            </div>

            <div className="rounded-xl border border-gray-300 bg-gray-50 p-6 dark:border-gray-600 dark:bg-gray-800">
              <span className="mb-3 inline-block rounded bg-gray-400 px-2 py-1 text-xs font-bold text-white">
                SILVER
              </span>
              <h4 className="font-space-grotesk mb-2 text-lg font-semibold text-brand-slate-gray dark:text-white">
                Community Support
              </h4>
              <ul className="font-inter space-y-2 text-sm text-gray-600 dark:text-gray-400">
                <li>✓ Logo on website</li>
                <li>✓ Newsletter mention</li>
                <li>✓ Table space</li>
                <li>✓ 2 conference passes</li>
              </ul>
            </div>
          </div>
        </section>
      </div>
    </div>
  ),
}
