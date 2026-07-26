import type { Meta, StoryObj } from '@storybook/nextjs-vite'
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
