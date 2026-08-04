import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { http, HttpResponse } from 'msw'
import { ThemeProvider } from 'next-themes'
import { screen, userEvent, within } from 'storybook/test'
import { HomepagePreview } from '@/components/admin/preview'
import { NotificationProvider } from '@/components/admin/NotificationProvider'
import { mockFeaturedSpeakers } from '@/components/featuredSpeakers.mocks'
import type { Conference } from '@/lib/conference/types'
import type { HomepageSection } from '@/lib/homepage/sections'
import {
  HomepageComposer,
  type HomepageComposerProps,
} from './HomepageComposer'

/**
 * The homepage composer workspace — the rail on the left, the organizer's real
 * front page on the right.
 *
 * THE IFRAME IS THE ONE THING STORYBOOK CANNOT RUN: it loads an app route. So
 * these stories hand the pane a `renderInline` that mounts the very same
 * `HomepagePreview` tree the frame renders, at the same device width and the
 * same scale. Everything else is the production component — the rail, the
 * toolbar, the mode/scheme/device toggles, the locate loop, the dirty state.
 *
 * THE ONE THING THE SEAM CANNOT REPRODUCE is the property the iframe exists
 * for: a layout viewport of its own. Inline, the previewed page reads the
 * STORY's viewport, so the `Desktop | Mobile` device toggle changes the frame's
 * width without changing which Tailwind breakpoints apply. That is why there is
 * no "mobile frame on a desktop screen" story here — it would capture a
 * squeezed desktop layout that the shipped iframe never produces. The mobile
 * stories below shoot the whole workspace at 393px instead, where the frame's
 * width and the document's width agree and the capture is truthful.
 *
 * WHAT TO LOOK FOR:
 *  - **The two panes.** Section cards with a content-status line each, beside a
 *    page that is actually rendered rather than diagrammed.
 *  - **Click a band, land on its card.** `BandSelectedFromPreview` does exactly
 *    that in its play function: the band rings blue, the rail card rings blue
 *    and its config opens.
 *  - **Design vs Live.** The same conference as an aspirational page (sample
 *    content, amber chips, rail cards tagged "Sample data") and as the truthful
 *    near-blank page a visitor gets today.
 *  - **Mobile.** One pane at a time behind a `[Compose | Preview]` toggle; the
 *    preview is a real 390px frame, not a squeezed desktop.
 */

/** Fixed reference time so dates, countdowns and samples never thrash. */
const NOW = Date.parse('2026-03-01T12:00:00Z')

/** A portrait that renders offline, so captures never show a broken image. */
const portrait = (label: string) =>
  new HttpResponse(
    `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="800" viewBox="0 0 640 800">` +
      `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
      `<stop offset="0%" stop-color="#1d4ed8"/><stop offset="100%" stop-color="#06b6d4"/>` +
      `</linearGradient></defs>` +
      `<rect width="640" height="800" fill="url(#g)"/>` +
      `<circle cx="320" cy="330" r="130" fill="#ffffff" opacity="0.85"/>` +
      `<rect x="150" y="500" width="340" height="220" rx="170" fill="#ffffff" opacity="0.85"/>` +
      `<text x="320" y="770" fill="#ffffff" font-family="sans-serif" font-size="42" font-weight="600" text-anchor="middle">${label}</text>` +
      `</svg>`,
    { headers: { 'Content-Type': 'image/svg+xml' } },
  )

const imageHandlers = [
  http.get('https://placehold.co/*', () => portrait('Speaker')),
  http.get('https://cdn.sanity.io/images/*', () => portrait('Photo')),
]

/**
 * A conference a year into its life: real speakers, real dates, real venue,
 * real numbers. This is what the workspace looks like for an organizer who has
 * something to compose.
 */
const conference = {
  _id: 'conf-1',
  title: 'Nordic Platform Days',
  organizer: 'Nordic Platform Community',
  tagline: 'The conference for the people who run the platform',
  description:
    'A community conference for platform engineers, SREs and everyone who keeps production up. Two tracks, one day, in the heart of Bergen.',
  city: 'Bergen',
  country: 'Norway',
  domains: ['2026.nordicplatformdays.no'],
  startDate: '2026-09-15',
  endDate: '2026-09-15',
  venueName: 'Grieghallen',
  venueAddress: 'Edvard Griegs plass 1\n5015 Bergen\nNorway',
  registrationEnabled: true,
  registrationLink: 'https://tickets.example.com',
  cfpStartDate: '2026-01-01',
  cfpEndDate: '2026-06-01',
  cfpNotifyDate: '2026-06-15',
  cfpEmail: 'cfp@example.com',
  contactEmail: 'hello@example.com',
  sponsorEmail: 'sponsors@example.com',
  formats: [],
  topics: [],
  organizers: [],
  socialLinks: [],
  featuredSpeakers: mockFeaturedSpeakers,
  vanityMetrics: [
    { label: 'Attendees', value: '450+' },
    { label: 'Speakers', value: '40' },
    { label: 'Tracks', value: '2' },
  ],
  ticketFaqs: [
    {
      _key: 't1',
      question: 'Can I get a refund?',
      answer: 'Tickets are refundable up to 14 days before the event.',
    },
  ],
  theme: { primaryColor: '#1D4ED8', accentColor: '#06B6D4' },
} as unknown as Conference

/**
 * DAY ONE: an identity and nothing else. The state in which the old editor
 * previewed as a hero on top of a sponsor pitch — and the state the whole
 * Design/Live pair exists for.
 */
const newConference = {
  ...conference,
  startDate: undefined,
  endDate: undefined,
  venueName: undefined,
  venueAddress: undefined,
  featuredSpeakers: [],
  vanityMetrics: [],
  ticketFaqs: [],
} as unknown as Conference

/** A composition worth looking at: nine bands, one of them switched off. */
const sections: HomepageSection[] = [
  { _key: 'hero', _type: 'homepageHero' },
  {
    _key: 'countdown',
    _type: 'homepageCountdown',
    heading: 'Doors open in',
  },
  {
    _key: 'speakers',
    _type: 'homepageFeaturedSpeakers',
    heading: 'Who you will hear',
    description: 'Forty talks across two tracks, chosen by the programme team.',
  },
  { _key: 'program', _type: 'homepageProgramHighlights' },
  { _key: 'metrics', _type: 'homepageMetrics', heading: 'By the numbers' },
  {
    _key: 'gallery',
    _type: 'homepageGallery',
    heading: 'Moments from last year',
  },
  { _key: 'faq', _type: 'homepageFaq', source: 'own', items: [] },
  { _key: 'venue', _type: 'homepageVenue', heading: 'Where to find us' },
  {
    _key: 'organizers',
    _type: 'homepageOrganizers',
    hidden: true,
    heading: 'Meet the crew',
  },
  { _key: 'sponsors', _type: 'homepageSponsors' },
]

function previewHandlers(forConference: Conference) {
  return [
    http.get('/api/trpc/conference.homepagePreviewData', () =>
      HttpResponse.json({
        result: {
          data: {
            conference: forConference,
            ticketsFromPrice: '3 490',
            ticketAvailability: null,
          },
        },
      }),
    ),
    http.post('/api/trpc/conference.updateHomepageSections', () =>
      HttpResponse.json({ result: { data: { success: true, updated: {} } } }),
    ),
    ...imageHandlers,
  ]
}

function inlinePreview(
  forConference: Conference,
): HomepageComposerProps['renderInlinePreview'] {
  return ({ sections: previewSections, ui, onSelect, onHover }) => (
    <HomepagePreview
      conference={forConference}
      sections={previewSections}
      mode={ui.mode}
      scheme={ui.scheme}
      focusKey={ui.focusKey}
      hoverKey={ui.hoverKey}
      ticketsFromPrice="3 490"
      now={NOW}
      onSelect={onSelect}
      onHover={onHover}
    />
  )
}

/** Switch the preview's own colour scheme, the way an organizer would. */
async function switchPreviewToDark() {
  await userEvent.click(await screen.findByRole('button', { name: 'Dark' }))
}

const meta = {
  beforeEach: () => {
    // Pin the clock (house pattern — see Countdown.stories): the preview takes
    // `now` for its own date maths, but the lifecycle resolver and the
    // countdown's tick read the real clock, and leaving those unpinned makes a
    // future conference capture as a past one.
    const OriginalDate = globalThis.Date
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const MockDate: any = function (...args: any[]) {
      if (args.length === 0) return new OriginalDate(NOW)
      return new (
        Function.prototype.bind.apply(OriginalDate, [
          null,
          ...args,
        ]) as typeof OriginalDate
      )()
    }
    Object.setPrototypeOf(MockDate, OriginalDate)
    MockDate.prototype = Object.create(OriginalDate.prototype)
    MockDate.now = () => NOW
    MockDate.parse = OriginalDate.parse.bind(OriginalDate)
    MockDate.UTC = OriginalDate.UTC.bind(OriginalDate)
    globalThis.Date = MockDate
    return () => {
      globalThis.Date = OriginalDate
    }
  },

  title: 'Systems/Settings/Admin/HomepageComposer',
  component: HomepageComposer,
  parameters: {
    layout: 'fullscreen',
    msw: { handlers: previewHandlers(conference) },
  },
  args: {
    initialSections: sections,
    usingDefault: false,
    renderInlinePreview: inlinePreview(conference),
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
          <NotificationProvider>
            <div className={dark ? 'dark' : ''}>
              <div className="min-h-screen bg-white p-4 dark:bg-gray-950">
                <Story />
              </div>
            </div>
          </NotificationProvider>
        </ThemeProvider>
      )
    },
  ],
  tags: ['autodocs'],
} satisfies Meta<typeof HomepageComposer>

export default meta
type Story = StoryObj<typeof meta>

/**
 * The workspace at rest: section cards and their content-status lines on the
 * left, the rendered page on the right at desktop width, scaled to the pane.
 */
export const Workspace: Story = {}

export const WorkspaceDark: Story = {
  parameters: { theme: 'dark', backgrounds: { default: 'dark' } },
  play: switchPreviewToDark,
}

/**
 * THE LOCATE LOOP. The play function clicks the Featured Speakers band in the
 * preview — nothing else — and the workspace responds: the band keeps a blue
 * ring, the matching rail card rings and scrolls into view, and its config
 * panel opens. This is how thirteen abstract labels become "that thing, there".
 */
export const BandSelectedFromPreview: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const band = canvasElement.querySelector('[data-preview-band="speakers"]')
    await userEvent.click(band as Element)
    await canvas.findByRole('button', { name: 'Collapse Featured Speakers' })
  },
}

export const BandSelectedFromPreviewDark: Story = {
  parameters: { theme: 'dark', backgrounds: { default: 'dark' } },
  play: async (context) => {
    await switchPreviewToDark()
    await BandSelectedFromPreview.play?.(context)
  },
}

/**
 * DESIGN MODE on a conference with nothing in it yet. Every empty collection is
 * backed by obviously-synthetic sample content, each such band carries an amber
 * "Sample content" chip naming where the real thing is edited, and the matching
 * rail cards are tagged "Sample data" so the panel and the canvas never
 * disagree about what is real.
 */
export const DesignModeSampleContent: Story = {
  args: { renderInlinePreview: inlinePreview(newConference) },
  parameters: { msw: { handlers: previewHandlers(newConference) } },
  // Select the speakers card so the canvas scrolls to the band it names — the
  // amber chip and the dashed outline are the thing to look at here.
  play: async ({ canvasElement }) => {
    const card = canvasElement.querySelector('[data-composer-card="speakers"]')
    await userEvent.click(card as Element)
  },
}

export const DesignModeSampleContentDark: Story = {
  args: DesignModeSampleContent.args,
  parameters: {
    msw: { handlers: previewHandlers(newConference) },
    theme: 'dark',
    backgrounds: { default: 'dark' },
  },
  play: async (context) => {
    await switchPreviewToDark()
    await DesignModeSampleContent.play?.(context)
  },
}

/**
 * LIVE MODE, the same brand-new conference: what a visitor actually gets today.
 * The hero, and then almost nothing — while every rail card still names the
 * reason and links to the fix. One toggle between the aspirational page and the
 * truthful one is the honesty mechanism; nobody ships thinking they have twelve
 * speakers.
 */
export const LiveMode: Story = {
  args: { renderInlinePreview: inlinePreview(newConference) },
  parameters: { msw: { handlers: previewHandlers(newConference) } },
  play: async () => {
    await userEvent.click(await screen.findByRole('button', { name: 'Live' }))
  },
}

export const LiveModeDark: Story = {
  args: LiveMode.args,
  parameters: {
    msw: { handlers: previewHandlers(newConference) },
    theme: 'dark',
    backgrounds: { default: 'dark' },
  },
  play: async (context) => {
    await switchPreviewToDark()
    await LiveMode.play?.(context)
  },
}

/**
 * The workspace ON a phone (393px): no squeezed two-pane, a `[Compose |
 * Preview]` toggle instead. Compose is today's card list at full width, with
 * the up/down buttons as the reorder path.
 */
export const Mobile: Story = {
  parameters: { viewport: { defaultViewport: 'mobile1' } },
}

/** The Preview half of the phone workspace: a real 390px frame, full-bleed. */
export const MobilePreviewPane: Story = {
  parameters: { viewport: { defaultViewport: 'mobile1' } },
  play: async () => {
    await userEvent.click(
      await screen.findByRole('button', { name: 'Preview' }),
    )
  },
}

export const MobilePreviewPaneDark: Story = {
  parameters: {
    viewport: { defaultViewport: 'mobile1' },
    theme: 'dark',
    backgrounds: { default: 'dark' },
  },
  play: async (context) => {
    await MobilePreviewPane.play?.(context)
    await switchPreviewToDark()
  },
}

/**
 * A conference still on the automatic layout — the banner explains that
 * customizing overrides it, and "Revert to default" brings it back.
 */
export const UsingDefaultLayout: Story = {
  args: {
    usingDefault: true,
    initialSections: [
      { _key: 'default-hero', _type: 'homepageHero' },
      { _key: 'default-featured-speakers', _type: 'homepageFeaturedSpeakers' },
      { _key: 'default-sponsors', _type: 'homepageSponsors' },
    ],
  },
}
