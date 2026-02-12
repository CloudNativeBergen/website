import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { SpeakerAvatars, SpeakerAvatarsWithNames } from '@/components/SpeakerAvatars'
import { ClickableSpeakerNames } from '@/components/ClickableSpeakerNames'
import { Speaker, Flags } from '@/lib/speaker/types'

const mockSpeakers: Speaker[] = [
  {
    _id: 'speaker-1',
    _rev: '1',
    _createdAt: '2024-01-01T00:00:00Z',
    _updatedAt: '2024-01-01T00:00:00Z',
    name: 'Alice Johnson',
    email: 'alice@example.com',
    slug: 'alice-johnson',
    title: 'Senior Engineer at Google',
    flags: [Flags.localSpeaker],
  },
  {
    _id: 'speaker-2',
    _rev: '1',
    _createdAt: '2024-01-01T00:00:00Z',
    _updatedAt: '2024-01-01T00:00:00Z',
    name: 'Bob Smith',
    email: 'bob@example.com',
    slug: 'bob-smith',
    title: 'DevOps Lead at Microsoft',
    flags: [Flags.firstTimeSpeaker],
  },
  {
    _id: 'speaker-3',
    _rev: '1',
    _createdAt: '2024-01-01T00:00:00Z',
    _updatedAt: '2024-01-01T00:00:00Z',
    name: 'Carol Williams',
    email: 'carol@example.com',
    slug: 'carol-williams',
    title: 'Platform Architect at AWS',
    flags: [],
  },
  {
    _id: 'speaker-4',
    _rev: '1',
    _createdAt: '2024-01-01T00:00:00Z',
    _updatedAt: '2024-01-01T00:00:00Z',
    name: 'David Chen',
    email: 'david@example.com',
    slug: 'david-chen',
    title: 'CTO at Startup Inc',
    flags: [Flags.diverseSpeaker],
  },
  {
    _id: 'speaker-5',
    _rev: '1',
    _createdAt: '2024-01-01T00:00:00Z',
    _updatedAt: '2024-01-01T00:00:00Z',
    name: 'Eva Martinez',
    email: 'eva@example.com',
    slug: 'eva-martinez',
    title: 'Principal Engineer at Netflix',
    flags: [],
  },
]

const meta = {
  title: 'Systems/Speakers/Overview',
  parameters: {
    layout: 'fullscreen',
    options: {
      showPanel: false,
    },
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const SpeakerSystem: Story = {
  render: () => (
    <div className="min-h-screen bg-white p-8 dark:bg-gray-900">
      <div className="mx-auto max-w-5xl">
        <h1 className="mb-4 font-space-grotesk text-4xl font-bold text-brand-cloud-blue dark:text-blue-400">
          Speaker Component System
        </h1>
        <p className="mb-12 font-inter text-lg text-brand-slate-gray dark:text-gray-300">
          A comprehensive system for displaying conference speakers with
          flexible layouts and brand-consistent styling.
        </p>

        {/* Live SpeakerAvatars Demo */}
        <section className="mb-16">
          <h2 className="mb-6 font-space-grotesk text-2xl font-semibold text-brand-slate-gray dark:text-white">
            SpeakerAvatars
          </h2>
          <p className="mb-6 font-inter text-gray-600 dark:text-gray-400">
            Stacked avatar display with hover animation. Hover to see them spread apart.
          </p>

          <div className="space-y-8 rounded-xl border border-gray-200 bg-gray-50 p-8 dark:border-gray-700 dark:bg-gray-800">
            <div>
              <p className="mb-3 text-sm font-medium text-gray-500 dark:text-gray-400">Small size (sm)</p>
              <SpeakerAvatars speakers={mockSpeakers.slice(0, 4)} size="sm" maxVisible={3} showTooltip={true} />
            </div>

            <div>
              <p className="mb-3 text-sm font-medium text-gray-500 dark:text-gray-400">Medium size (md) - Default</p>
              <SpeakerAvatars speakers={mockSpeakers.slice(0, 4)} size="md" maxVisible={3} showTooltip={true} />
            </div>

            <div>
              <p className="mb-3 text-sm font-medium text-gray-500 dark:text-gray-400">Large size (lg)</p>
              <SpeakerAvatars speakers={mockSpeakers.slice(0, 4)} size="lg" maxVisible={3} showTooltip={true} />
            </div>

            <div>
              <p className="mb-3 text-sm font-medium text-gray-500 dark:text-gray-400">All 5 speakers (maxVisible: 3, shows +2)</p>
              <SpeakerAvatars speakers={mockSpeakers} size="md" maxVisible={3} showTooltip={true} />
            </div>
          </div>

          <div className="mt-4 rounded-lg bg-gray-100 p-4 dark:bg-gray-800">
            <pre className="overflow-x-auto font-jetbrains text-sm text-gray-700 dark:text-gray-300">
              {`<SpeakerAvatars
  speakers={speakers}
  size="md"
  maxVisible={3}
  showTooltip={true}
/>`}
            </pre>
          </div>
        </section>

        {/* Live SpeakerAvatarsWithNames Demo */}
        <section className="mb-16">
          <h2 className="mb-6 font-space-grotesk text-2xl font-semibold text-brand-slate-gray dark:text-white">
            SpeakerAvatarsWithNames
          </h2>
          <p className="mb-6 font-inter text-gray-600 dark:text-gray-400">
            Avatar stack with formatted speaker names alongside.
          </p>

          <div className="max-w-md space-y-6 rounded-xl border border-gray-200 bg-gray-50 p-8 dark:border-gray-700 dark:bg-gray-800">
            <div>
              <p className="mb-3 text-sm font-medium text-gray-500 dark:text-gray-400">Single speaker</p>
              <SpeakerAvatarsWithNames speakers={[mockSpeakers[0]]} size="md" maxVisible={3} />
            </div>

            <div>
              <p className="mb-3 text-sm font-medium text-gray-500 dark:text-gray-400">Two speakers</p>
              <SpeakerAvatarsWithNames speakers={mockSpeakers.slice(0, 2)} size="md" maxVisible={3} />
            </div>

            <div>
              <p className="mb-3 text-sm font-medium text-gray-500 dark:text-gray-400">Three speakers</p>
              <SpeakerAvatarsWithNames speakers={mockSpeakers.slice(0, 3)} size="md" maxVisible={3} />
            </div>
          </div>
        </section>

        {/* Live ClickableSpeakerNames Demo */}
        <section className="mb-16">
          <h2 className="mb-6 font-space-grotesk text-2xl font-semibold text-brand-slate-gray dark:text-white">
            ClickableSpeakerNames
          </h2>
          <p className="mb-6 font-inter text-gray-600 dark:text-gray-400">
            Linked speaker names with proper separators (commas and &amp;).
          </p>

          <div className="space-y-4 rounded-xl border border-gray-200 bg-gray-50 p-8 dark:border-gray-700 dark:bg-gray-800">
            <div className="flex items-center gap-4">
              <span className="w-24 text-sm font-medium text-gray-500 dark:text-gray-400">1 speaker:</span>
              <span className="text-brand-slate-gray dark:text-white">
                <ClickableSpeakerNames speakers={[mockSpeakers[0]]} linkClassName="text-brand-cloud-blue hover:underline" />
              </span>
            </div>

            <div className="flex items-center gap-4">
              <span className="w-24 text-sm font-medium text-gray-500 dark:text-gray-400">2 speakers:</span>
              <span className="text-brand-slate-gray dark:text-white">
                <ClickableSpeakerNames speakers={mockSpeakers.slice(0, 2)} linkClassName="text-brand-cloud-blue hover:underline" />
              </span>
            </div>

            <div className="flex items-center gap-4">
              <span className="w-24 text-sm font-medium text-gray-500 dark:text-gray-400">3 speakers:</span>
              <span className="text-brand-slate-gray dark:text-white">
                <ClickableSpeakerNames speakers={mockSpeakers.slice(0, 3)} linkClassName="text-brand-cloud-blue hover:underline" />
              </span>
            </div>

            <div className="flex items-center gap-4">
              <span className="w-24 text-sm font-medium text-gray-500 dark:text-gray-400">First names:</span>
              <span className="text-brand-slate-gray dark:text-white">
                <ClickableSpeakerNames speakers={mockSpeakers.slice(0, 3)} showFirstNameOnly={true} linkClassName="text-brand-cloud-blue hover:underline" />
              </span>
            </div>
          </div>
        </section>

        {/* Component Overview */}
        <section className="mb-16">
          <h2 className="mb-6 font-space-grotesk text-2xl font-semibold text-brand-slate-gray dark:text-white">
            Additional Components
          </h2>
          <div className="grid gap-6 md:grid-cols-2">
            <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
              <h3 className="mb-3 font-space-grotesk text-lg font-semibold text-brand-cloud-blue">
                SpeakerPromotionCard
              </h3>
              <p className="mb-4 font-inter text-sm text-gray-600 dark:text-gray-400">
                Primary speaker display component with multiple variants for
                different use cases. Uses CloudNativePattern background.
              </p>
              <code className="block rounded bg-gray-50 p-2 font-jetbrains text-xs text-gray-700 dark:bg-gray-700 dark:text-gray-300">
                import {'{'}SpeakerPromotionCard{'}'} from
                &apos;@/components/SpeakerPromotionCard&apos;
              </code>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
              <h3 className="mb-3 font-space-grotesk text-lg font-semibold text-brand-fresh-green">
                SpeakerShare
              </h3>
              <p className="mb-4 font-inter text-sm text-gray-600 dark:text-gray-400">
                Social media cards for speakers to share their participation
                with QR codes.
              </p>
              <code className="block rounded bg-gray-50 p-2 font-jetbrains text-xs text-gray-700 dark:bg-gray-700 dark:text-gray-300">
                import {'{'} SpeakerShare {'}'} from
                &apos;@/components/SpeakerShare&apos;
              </code>
            </div>
          </div>
        </section>

        {/* SpeakerPromotionCard Variants */}
        <section className="mb-16">
          <h2 className="mb-6 font-space-grotesk text-2xl font-semibold text-brand-slate-gray dark:text-white">
            SpeakerPromotionCard Variants
          </h2>

          <div className="space-y-8">
            {/* Default Variant */}
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-6 dark:border-gray-700 dark:bg-gray-800">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="font-space-grotesk font-semibold text-brand-slate-gray dark:text-white">
                  Default Variant
                </h3>
                <code className="rounded bg-white px-2 py-1 font-jetbrains text-xs text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                  variant=&quot;default&quot;
                </code>
              </div>
              <p className="mb-4 font-inter text-sm text-gray-600 dark:text-gray-400">
                Standard speaker card with centered layout. Best for speaker
                grids and general listings.
              </p>
              <ul className="space-y-1 font-inter text-sm text-gray-600 dark:text-gray-400">
                <li>• Centered avatar and text alignment</li>
                <li>• Shows bio excerpt (3 lines)</li>
                <li>• Displays talk format badges</li>
                <li>• Company derived from title</li>
              </ul>
            </div>

            {/* Featured Variant */}
            <div className="rounded-xl border-2 border-brand-cloud-blue bg-linear-to-br from-brand-cloud-blue/10 to-brand-fresh-green/10 p-6 dark:from-brand-cloud-blue/20 dark:to-brand-fresh-green/20">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="font-space-grotesk font-semibold text-brand-slate-gray dark:text-white">
                  Featured Variant
                </h3>
                <code className="rounded bg-white px-2 py-1 font-jetbrains text-xs text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                  variant=&quot;featured&quot;
                </code>
              </div>
              <p className="mb-4 font-inter text-sm text-gray-600 dark:text-gray-400">
                Premium layout for keynote and featured speakers with horizontal
                design.
              </p>
              <ul className="space-y-1 font-inter text-sm text-gray-600 dark:text-gray-400">
                <li>• Horizontal layout with large avatar</li>
                <li>• Cloud native pattern background</li>
                <li>• Featured badge with trophy icon</li>
                <li>• Local speaker and first-timer flags</li>
                <li>• Talk count and expertise badges in footer</li>
              </ul>
            </div>

            {/* Compact Variant */}
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-6 dark:border-gray-700 dark:bg-gray-800">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="font-space-grotesk font-semibold text-brand-slate-gray dark:text-white">
                  Compact Variant
                </h3>
                <code className="rounded bg-white px-2 py-1 font-jetbrains text-xs text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                  variant=&quot;compact&quot;
                </code>
              </div>
              <p className="mb-4 font-inter text-sm text-gray-600 dark:text-gray-400">
                Space-efficient format for agenda pages and speaker directories.
              </p>
              <ul className="space-y-1 font-inter text-sm text-gray-600 dark:text-gray-400">
                <li>• Minimal height with essential info only</li>
                <li>• Smaller avatar (60px)</li>
                <li>• No bio or expertise badges</li>
                <li>• Best for dense grids (4-5 columns)</li>
              </ul>
            </div>

            {/* Organizer Variant */}
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-6 dark:border-gray-700 dark:bg-gray-800">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="font-space-grotesk font-semibold text-brand-slate-gray dark:text-white">
                  Organizer Variant
                </h3>
                <code className="rounded bg-white px-2 py-1 font-jetbrains text-xs text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                  variant=&quot;organizer&quot;
                </code>
              </div>
              <p className="mb-4 font-inter text-sm text-gray-600 dark:text-gray-400">
                Displays conference organizers with &quot;Organizer&quot; badge
                instead of &quot;Speaker&quot;.
              </p>
              <ul className="space-y-1 font-inter text-sm text-gray-600 dark:text-gray-400">
                <li>• Large circular avatar (140px)</li>
                <li>• &quot;Organizer&quot; role badge</li>
                <li>• No footer/CTA section</li>
              </ul>
            </div>
          </div>
        </section>

        {/* SpeakerShare Component */}
        <section className="mb-16">
          <h2 className="mb-6 font-space-grotesk text-2xl font-semibold text-brand-slate-gray dark:text-white">
            SpeakerShare Component
          </h2>

          <div className="grid gap-6 md:grid-cols-2">
            <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
              <h3 className="mb-3 font-space-grotesk font-semibold text-brand-cloud-blue">
                speaker-share Variant
              </h3>
              <p className="mb-4 font-inter text-sm text-gray-600 dark:text-gray-400">
                For speakers to promote themselves with &quot;I&apos;m speaking
                at&quot; messaging.
              </p>
              <pre className="overflow-x-auto rounded bg-gray-50 p-3 font-jetbrains text-xs text-gray-700 dark:bg-gray-700 dark:text-gray-300">
                {`<SpeakerShare
  speaker={speaker}
  variant="speaker-share"
  eventName={conference.title}
  className="h-80 w-80"
/>`}
              </pre>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
              <h3 className="mb-3 font-space-grotesk font-semibold text-brand-fresh-green">
                speaker-spotlight Variant
              </h3>
              <p className="mb-4 font-inter text-sm text-gray-600 dark:text-gray-400">
                For conference organizers with &quot;Featured Speaker&quot;
                messaging.
              </p>
              <pre className="overflow-x-auto rounded bg-gray-50 p-3 font-jetbrains text-xs text-gray-700 dark:bg-gray-700 dark:text-gray-300">
                {`<SpeakerShare
  speaker={speaker}
  variant="speaker-spotlight"
  isFeatured={true}
  eventName={conference.title}
  showCloudNativePattern={true}
  className="h-80 w-80"
/>`}
              </pre>
            </div>
          </div>

          <div className="mt-6 rounded-xl border border-brand-cloud-blue/20 bg-brand-sky-mist p-6">
            <h4 className="mb-3 font-space-grotesk font-semibold text-brand-cloud-blue">
              QR Code Integration
            </h4>
            <ul className="grid gap-4 font-inter text-sm text-brand-slate-gray md:grid-cols-2">
              <li>• Automatically generated for social images</li>
              <li>• Links to full speaker profile</li>
              <li>• High contrast for reliable scanning</li>
              <li>• Optimized for mobile cameras</li>
            </ul>
          </div>
        </section>

        {/* Layout Patterns */}
        <section className="mb-16">
          <h2 className="mb-6 font-space-grotesk text-2xl font-semibold text-brand-slate-gray dark:text-white">
            Recommended Layout Patterns
          </h2>

          <div className="space-y-6">
            <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
              <div>
                <h3 className="font-space-grotesk font-semibold text-brand-slate-gray dark:text-white">
                  Featured Speaker (Single)
                </h3>
                <p className="font-inter text-sm text-gray-600 dark:text-gray-400">
                  Full-width for keynote announcements
                </p>
              </div>
              <code className="rounded bg-gray-100 px-3 py-1 font-jetbrains text-xs text-gray-700 dark:bg-gray-700 dark:text-gray-300">
                variant=&quot;featured&quot; isFeatured={'{'}true{'}'}
              </code>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
              <div>
                <h3 className="font-space-grotesk font-semibold text-brand-slate-gray dark:text-white">
                  3-Speaker Grid
                </h3>
                <p className="font-inter text-sm text-gray-600 dark:text-gray-400">
                  Homepage highlights and announcements
                </p>
              </div>
              <code className="rounded bg-gray-100 px-3 py-1 font-jetbrains text-xs text-gray-700 dark:bg-gray-700 dark:text-gray-300">
                grid-cols-3 variant=&quot;default&quot;
              </code>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
              <div>
                <h3 className="font-space-grotesk font-semibold text-brand-slate-gray dark:text-white">
                  Speaker Directory (5-col)
                </h3>
                <p className="font-inter text-sm text-gray-600 dark:text-gray-400">
                  Dense listings and full lineup
                </p>
              </div>
              <code className="rounded bg-gray-100 px-3 py-1 font-jetbrains text-xs text-gray-700 dark:bg-gray-700 dark:text-gray-300">
                grid-cols-5 variant=&quot;compact&quot;
              </code>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
              <div>
                <h3 className="font-space-grotesk font-semibold text-brand-slate-gray dark:text-white">
                  Mixed Layout
                </h3>
                <p className="font-inter text-sm text-gray-600 dark:text-gray-400">
                  Featured + default + compact combined
                </p>
              </div>
              <code className="rounded bg-gray-100 px-3 py-1 font-jetbrains text-xs text-gray-700 dark:bg-gray-700 dark:text-gray-300">
                Stack with space-y-8
              </code>
            </div>
          </div>
        </section>

        {/* Props Reference */}
        <section>
          <h2 className="mb-6 font-space-grotesk text-2xl font-semibold text-brand-slate-gray dark:text-white">
            Props Reference
          </h2>
          <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
            <table className="w-full font-inter text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-brand-slate-gray dark:text-white">
                    Prop
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-brand-slate-gray dark:text-white">
                    Type
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-brand-slate-gray dark:text-white">
                    Default
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-brand-slate-gray dark:text-white">
                    Description
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-900">
                <tr>
                  <td className="px-4 py-3 font-jetbrains text-brand-cloud-blue">
                    speaker
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                    SpeakerWithTalks
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                    required
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                    Speaker data with talks array
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-jetbrains text-brand-cloud-blue">
                    variant
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                    string
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                    &quot;default&quot;
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                    default | featured | compact | organizer
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-jetbrains text-brand-cloud-blue">
                    isFeatured
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                    boolean
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                    false
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                    Shows trophy icon and featured badge
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-jetbrains text-brand-cloud-blue">
                    ctaText
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                    string
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                    &quot;View Profile&quot;
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                    Footer call-to-action text
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-jetbrains text-brand-cloud-blue">
                    ctaUrl
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                    string
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                    /speaker/{'{'}slug{'}'}
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                    Custom link destination
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  ),
}
