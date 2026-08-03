import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { screen, userEvent } from 'storybook/test'
import { http, HttpResponse } from 'msw'
import { ThemeProvider } from 'next-themes'
import { HomepageSectionsEditor } from './HomepageSectionsEditor'
import { NotificationProvider } from './NotificationProvider'
import type { HomepageSection } from '@/lib/homepage'

const handlers = [
  http.post('/api/trpc/conference.updateHomepageSections', () =>
    HttpResponse.json({ result: { data: { success: true, updated: {} } } }),
  ),
]

// Mirrors getDefaultSections() with a published schedule: the middle slot is the
// phase-dependent Program Highlights, which the preview badges as auto-swapping.
const defaultSections: HomepageSection[] = [
  { _key: 'default-hero', _type: 'homepageHero' },
  { _key: 'default-gallery', _type: 'homepageGallery' },
  { _key: 'default-program', _type: 'homepageProgramHighlights' },
  { _key: 'default-sponsors', _type: 'homepageSponsors' },
]

const customSections: HomepageSection[] = [
  {
    _key: 'hero',
    _type: 'homepageHero',
    heroHeadline: 'Real Cloud Native',
    ctaOverrides: [{ _key: 'c1', label: 'Get tickets', href: '/tickets' }],
  },
  {
    _key: 'cta',
    _type: 'homepageCtaBanner',
    heading: 'Call for Papers is open',
    buttonLabel: 'Submit a talk',
    buttonHref: '/cfp',
  },
  { _key: 'metrics', _type: 'homepageMetrics', heading: 'By the numbers' },
  { _key: 'gallery', _type: 'homepageGallery', hidden: true },
  { _key: 'sponsors', _type: 'homepageSponsors' },
]

// The three F4 blocks (FAQ / Countdown / Venue), each carrying inline config.
const f4Sections: HomepageSection[] = [
  { _key: 'hero', _type: 'homepageHero' },
  {
    _key: 'faq',
    _type: 'homepageFaq',
    heading: 'Frequently asked questions',
    source: 'own',
    items: [
      {
        _key: 'q1',
        question: 'Where is the venue?',
        answer: 'At Grieghallen in central Bergen.',
      },
      {
        _key: 'q2',
        question: 'Is lunch included?',
        answer: 'Yes — lunch and coffee are included with every ticket.',
      },
    ],
  },
  {
    _key: 'countdown',
    _type: 'homepageCountdown',
    heading: 'Doors open in',
    targetOverride: '2099-09-15T09:00:00.000Z',
    liveMessage: 'We are live — welcome!',
  },
  {
    _key: 'venue',
    _type: 'homepageVenue',
    heading: 'The venue',
    description: 'A landmark concert hall in the heart of Bergen.',
  },
]

// A stored Rich Text block, used to exercise the save-time content check.
const richTextSections: HomepageSection[] = [
  { _key: 'hero', _type: 'homepageHero' },
  {
    _key: 'rich',
    _type: 'homepageRichText',
    heading: 'Getting here',
    content: [
      {
        _type: 'block',
        _key: 'b1',
        style: 'normal',
        markDefs: [],
        children: [
          {
            _type: 'span',
            _key: 's1',
            text: 'Grieghallen is a ten minute walk from Bergen station.',
            marks: [],
          },
        ],
      },
    ],
  },
]

// The content bands, whose config is COPY ONLY (headings/sub-headings, plus the
// sponsors CTA card and its on/off toggle) — the content itself still comes from
// the conference.
const copySections: HomepageSection[] = [
  {
    _key: 'gallery',
    _type: 'homepageGallery',
    heading: 'Photos from 2025',
    description: 'Talks, hallway track and the after-party, in pictures.',
  },
  { _key: 'featured', _type: 'homepageFeaturedSpeakers' },
  {
    _key: 'sponsors',
    _type: 'homepageSponsors',
    heading: 'Our partners',
    ctaHeading: 'Partner with us',
    ctaDescription: 'Reach the people who build and run these systems.',
  },
]

const meta = {
  title: 'Systems/Settings/Admin/HomepageSectionsEditor',
  component: HomepageSectionsEditor,
  parameters: {
    layout: 'fullscreen',
    msw: { handlers },
    docs: {
      description: {
        component:
          'Front-page builder (F3) admin editor — a drag-and-drop composition builder with a live structural preview. Drag a card by its grab handle (pointer + keyboard) or use the up/down buttons (mobile + a11y fallback) to reorder; toggle per-section visibility; open per-type config inline as an accordion. The preview panel maps the composition to labeled bands in order (hidden ones ghosted, the default phase-dependent middle slot badged) and updates live while dragging. "Revert to default" (confirmed) clears the stored list so the page falls back to the phase-aware default layout.',
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
          <NotificationProvider>
            <div className={dark ? 'dark' : ''}>
              <div className="min-h-screen bg-white p-6 dark:bg-gray-950">
                <Story />
              </div>
            </div>
          </NotificationProvider>
        </ThemeProvider>
      )
    },
  ],
  tags: ['autodocs'],
} satisfies Meta<typeof HomepageSectionsEditor>

export default meta
type Story = StoryObj<typeof meta>

/** Editing a conference that is still on the default (automatic) layout. */
export const DefaultLayout: Story = {
  args: {
    initialSections: defaultSections,
    usingDefault: true,
    defaultOpen: true,
  },
}

/** Editing a conference with a stored custom composition (hidden + inserted blocks). */
export const CustomComposition: Story = {
  args: {
    initialSections: customSections,
    usingDefault: false,
    defaultOpen: true,
  },
}

/** The empty state after every section has been removed. */
export const EmptyComposition: Story = {
  args: {
    initialSections: [],
    usingDefault: false,
    defaultOpen: true,
  },
}

/** Mobile (393px): drag handles fall back to up/down buttons; preview stacks under the list. */
export const Mobile: Story = {
  args: {
    initialSections: customSections,
    usingDefault: false,
    defaultOpen: true,
  },
  parameters: {
    viewport: { defaultViewport: 'mobile1' },
  },
}

export const Dark: Story = {
  args: {
    initialSections: customSections,
    usingDefault: false,
    defaultOpen: true,
  },
  parameters: { theme: 'dark', backgrounds: { default: 'dark' } },
}

/**
 * The three F4 blocks (FAQ / Countdown / Venue) with the FAQ block's inline
 * config accordion expanded — verifies the new per-type config forms render.
 */
export const F4ConfigForms: Story = {
  args: {
    initialSections: f4Sections,
    usingDefault: false,
    defaultOpen: true,
  },
  play: async () => {
    const configureFaq = await screen.findByRole('button', {
      name: 'Configure FAQ',
    })
    await userEvent.click(configureFaq)
  },
}

/**
 * Save with a half-finished Rich Text card. The editor saves the SANITIZED
 * content — which is what the server stores — so a card the sanitizer would drop
 * is named and the save is blocked, rather than the card silently disappearing
 * from a homepage the editor just reported as saved (or the mutation rejecting
 * a payload the editor had already declared valid).
 */
export const UnfinishedRichTextCard: Story = {
  args: {
    initialSections: richTextSections,
    usingDefault: false,
    defaultOpen: true,
  },
  play: async () => {
    await userEvent.click(
      await screen.findByRole('button', { name: 'Configure Rich Text' }),
    )
    await userEvent.click(
      await screen.findByRole('button', { name: '+ Code / preformatted' }),
    )
    await userEvent.click(await screen.findByRole('button', { name: 'Save' }))
  },
}

/** F4 config forms in dark mode, FAQ accordion expanded. */
export const F4ConfigFormsDark: Story = {
  args: {
    initialSections: f4Sections,
    usingDefault: false,
    defaultOpen: true,
  },
  parameters: { theme: 'dark', backgrounds: { default: 'dark' } },
  play: F4ConfigForms.play,
}

/**
 * The content bands' copy config, with the Sponsors accordion expanded — band
 * heading/sub-heading, the "Become a Sponsor" on/off toggle and its copy. Every
 * field is optional: blank means "use the house default".
 */
export const ContentBandCopyConfig: Story = {
  args: {
    initialSections: copySections,
    usingDefault: false,
    defaultOpen: true,
  },
  play: async () => {
    const configure = await screen.findByRole('button', {
      name: 'Configure Sponsors',
    })
    await userEvent.click(configure)
  },
}

/** The content bands' copy config in dark mode, Sponsors accordion expanded. */
export const ContentBandCopyConfigDark: Story = {
  args: {
    initialSections: copySections,
    usingDefault: false,
    defaultOpen: true,
  },
  parameters: { theme: 'dark', backgrounds: { default: 'dark' } },
  play: ContentBandCopyConfig.play,
}
