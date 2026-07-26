import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { http, HttpResponse } from 'msw'
import { ThemeProvider } from 'next-themes'
import { HomepageSectionsEditor } from './HomepageSectionsEditor'
import { NotificationProvider } from './NotificationProvider'
import type { HomepageSection } from '@/lib/homepage/sections'

const handlers = [
  http.post('/api/trpc/conference.updateHomepageSections', () =>
    HttpResponse.json({ result: { data: { success: true, updated: {} } } }),
  ),
]

const defaultSections: HomepageSection[] = [
  { _key: 'hero', _type: 'homepageHero' },
  { _key: 'gallery', _type: 'homepageGallery' },
  { _key: 'featured', _type: 'homepageFeaturedSpeakers' },
  { _key: 'sponsors', _type: 'homepageSponsors' },
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
          'Front-page builder (F2) admin editor — plain-form editing of the homepage section composition (F3 adds drag-and-drop). Reorder with up/down, toggle per-section visibility, and edit per-type config (hero copy + CTA overrides, CTA banner, rich text, metrics heading). "Reset to default" clears the stored list so the page falls back to the phase-aware default layout.',
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

export const Dark: Story = {
  args: {
    initialSections: customSections,
    usingDefault: false,
    defaultOpen: true,
  },
  parameters: { theme: 'dark', backgrounds: { default: 'dark' } },
}
