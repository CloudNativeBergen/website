import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { ThemeProvider } from 'next-themes'
import { BadgeDisplay } from './badge/BadgeDisplay'
import NextTalkDisplay from './stream/NextTalkDisplay'
import { ThemeStyle } from './ThemeStyle'
import { type ConferenceTheme } from '@/lib/branding/theme'
import type { BadgeRecord } from '@/lib/badge/types'
import type { Conference, ConferenceSchedule } from '@/lib/conference/types'
import type { Speaker } from '@/lib/speaker/types'

/**
 * ROUTE-LEVEL PROOF for the theme-coverage fix.
 *
 * `(public)` (the shareable badge page) and `(stream)` (venue screens) render
 * WITHOUT the shared `Layout`, and so used to receive no tenant theme at all —
 * `(public)` had no group layout, and `(stream)`'s resolved the background
 * pattern but never the theme. Both are now covered by `TenantThemeStyle`.
 *
 * These stories render the REAL components those two routes mount, under the
 * REAL `ThemeStyle` the layouts now inject. Both surfaces are built from
 * `brand-cloud-blue` tokens, which resolve through `--brand-primary` — so the
 * Themed captures must differ in colour from the Default ones. That difference
 * IS the fix; before it, these two surfaces stayed house-blue on every tenant.
 */

const PURPLE: ConferenceTheme = {
  primaryColor: '#7C3AED',
  accentColor: '#F59E0B',
}

// Only the fields these two surfaces read; cast through `unknown` because a
// full Conference fixture would be a page of irrelevant dates and flags.
const conference = {
  _id: 'conf-1',
  title: 'Cloud Native Day Bergen',
  organizer: 'Cloud Native Bergen',
  city: 'Bergen',
  country: 'Norway',
  startDate: '2026-10-28',
} as unknown as Conference

const speaker = {
  _id: 'speaker-1',
  name: 'Ada Lovelace',
  title: 'Principal Engineer, Analytical Engines',
  slug: 'ada-lovelace',
} as Speaker

const badge = {
  _id: 'badge-1',
  _createdAt: '2026-10-28T09:00:00.000Z',
  _updatedAt: '2026-10-28T09:00:00.000Z',
  badgeId: 'badge-1',
  speaker,
  conference,
  badgeType: 'speaker',
  issuedAt: '2026-10-28T09:00:00.000Z',
  badgeJson: '{}',
} as BadgeRecord

// A day whose talks have all finished. This is the venue-screen state that
// paints with the brand token (`text-brand-cloud-blue`); the "no talks
// scheduled at all" state is deliberately grey and proves nothing.
const schedules = [
  {
    _id: 'schedule-1',
    date: '2020-01-01',
    tracks: [
      {
        trackTitle: 'Main Stage',
        trackDescription: 'The big room',
        talks: [
          { startTime: '09:00', endTime: '09:45', placeholder: 'Opening' },
        ],
      },
    ],
  },
] as ConferenceSchedule[]

function PublicSurfaces({ theme }: { theme?: ConferenceTheme | null }) {
  return (
    <div className="space-y-10 p-6">
      <ThemeStyle theme={theme} />
      <p className="text-xs font-semibold tracking-wide text-gray-500 uppercase dark:text-gray-400">
        {theme ? 'Themed tenant' : 'Default (house palette)'}
      </p>

      <section>
        <p className="mb-3 font-mono text-[11px] text-gray-400">
          (stream) — venue screen
        </p>
        <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
          <NextTalkDisplay schedules={schedules} roomTrackTitle="Main Stage" />
        </div>
      </section>

      <section>
        <p className="mb-3 font-mono text-[11px] text-gray-400">
          (public) — shareable badge page
        </p>
        <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
          <BadgeDisplay
            badge={badge}
            speaker={speaker}
            conference={conference}
            badgeId="badge-1"
            domain="cloudnativebergen.dev"
          />
        </div>
      </section>
    </div>
  )
}

const meta = {
  title: 'Systems/Branding/PublicSurfaceTheming',
  component: PublicSurfaces,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'The (stream) and (public) surfaces, which had no tenant theme before this change, rendered under the theme their route-group layouts now inject.',
      },
    },
  },
  decorators: [
    (Story, ctx) => {
      const dark = ctx.parameters.theme === 'dark'
      return (
        <ThemeProvider
          attribute="class"
          forcedTheme={dark ? 'dark' : 'light'}
          enableSystem={false}
        >
          <div className={dark ? 'dark' : ''}>
            <div className="min-h-screen bg-white dark:bg-gray-950">
              <Story />
            </div>
          </div>
        </ThemeProvider>
      )
    },
  ],
  tags: ['autodocs'],
} satisfies Meta<typeof PublicSurfaces>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = { args: { theme: null } }
export const Themed: Story = { args: { theme: PURPLE } }
export const ThemedDark: Story = {
  args: { theme: PURPLE },
  parameters: { theme: 'dark' },
}
