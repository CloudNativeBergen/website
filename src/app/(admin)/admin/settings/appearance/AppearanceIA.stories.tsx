import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { ThemeProvider } from 'next-themes'
import {
  ChartPieIcon,
  PaintBrushIcon,
  PencilSquareIcon,
  PhotoIcon,
  Squares2X2Icon,
  SwatchIcon,
} from '@heroicons/react/24/outline'
import { FieldRow, SectionHeading } from '../settingsLayout'
import { AppearanceNav } from './appearanceLayout'
import { CollapsibleSection } from '@/components/admin/CollapsibleSection'
import {
  HomepageCard,
  LogosCard,
  PatternCard,
  ThemeCard,
} from '@/components/admin/appearance'
import { APPEARANCE_PAGE, APPEARANCE_SECTION } from '@/lib/settings/appearance'
import type { ConferenceTheme } from '@/lib/branding/theme'
import type { BackgroundPattern } from '@/lib/conference/backgroundPattern'
import type { HomepageSection } from '@/lib/homepage'

/**
 * Visual-QA harness for the ONE Appearance page: sticky anchor chips over three
 * anchored sections (Theme, Logos, Homepage).
 *
 * Rendered with static mock data and non-functional edit affordances (the real
 * page mounts tRPC-backed editor islands) so the layout — and especially the
 * card bodies at 393px — is inspectable without providers or a live tenant.
 * The point of the redesign is that every card shows the VALUE, so these
 * stories exist mainly to prove the swatches, hex values, gradient bar and
 * pattern thumbnails actually render.
 */

const THEME: ConferenceTheme = {
  primaryColor: '#7C3AED',
  accentColor: '#22D3EE',
}

/** A tiny valid SVG so the logo previews render something real. */
const SAMPLE_LOGO =
  '<svg width="160" height="40" viewBox="0 0 160 40" xmlns="http://www.w3.org/2000/svg"><rect width="160" height="40" rx="6" fill="#1D4ED8"/><text x="80" y="26" font-family="sans-serif" font-size="16" fill="#fff" text-anchor="middle">KONF</text></svg>'
const SAMPLE_MARK =
  '<svg width="40" height="40" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg"><circle cx="20" cy="20" r="18" fill="#7C3AED"/></svg>'

const SECTIONS: HomepageSection[] = [
  { _key: 's1', _type: 'homepageHero' },
  { _key: 's2', _type: 'homepageGallery' },
  { _key: 's3', _type: 'homepageFeaturedSpeakers' },
  { _key: 's4', _type: 'homepageMetrics', hidden: true },
  { _key: 's5', _type: 'homepageSponsors' },
]

/** Non-functional stand-in for an editor-island trigger. */
function EditPencil() {
  return (
    <span className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-gray-500 dark:text-gray-400">
      <PencilSquareIcon className="h-5 w-5" />
    </span>
  )
}

function AppearancePageDemo({
  theme,
  pattern = 'cloud-native',
}: {
  theme?: ConferenceTheme | null
  pattern?: BackgroundPattern
}) {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 pb-4">
        <SwatchIcon className="h-8 w-8 shrink-0 text-brand-cloud-blue dark:text-blue-300" />
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-gray-900 sm:text-2xl dark:text-white">
            {APPEARANCE_PAGE.title}
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {APPEARANCE_PAGE.description}
          </p>
        </div>
      </div>

      <AppearanceNav />

      <section className="space-y-4">
        <SectionHeading
          id="theme"
          level={3}
          icon={PaintBrushIcon}
          title={APPEARANCE_SECTION.theme.title}
          description={APPEARANCE_SECTION.theme.description}
        />
        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
          <ThemeCard theme={theme} action={<EditPencil />} />
          <PatternCard
            pattern={pattern}
            primaryColor={theme?.primaryColor}
            accentColor={theme?.accentColor}
            action={<EditPencil />}
          />
        </div>
      </section>

      <section className="space-y-4">
        <SectionHeading
          id="logos"
          level={3}
          icon={PhotoIcon}
          title={APPEARANCE_SECTION.logos.title}
          description={APPEARANCE_SECTION.logos.description}
        />
        <LogosCard
          values={{
            logoBright: SAMPLE_LOGO,
            logoDark: SAMPLE_LOGO,
            logomarkBright: SAMPLE_MARK,
            logomarkDark: SAMPLE_MARK,
          }}
          action={<EditPencil />}
        />
      </section>

      <section className="space-y-4">
        <SectionHeading
          id="homepage"
          level={3}
          icon={Squares2X2Icon}
          title={APPEARANCE_SECTION.homepage.title}
          description={APPEARANCE_SECTION.homepage.description}
        />
        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
          <HomepageCard
            sections={SECTIONS}
            usingDefault={false}
            action={<EditPencil />}
          />
          <CollapsibleSection
            headingLevel={3}
            title="Homepage stats"
            icon={<ChartPieIcon />}
            action={<EditPencil />}
          >
            <div className="space-y-3 px-6 py-4">
              <FieldRow label="Attendees" value="500+" />
              <FieldRow label="Speakers" value="60" />
            </div>
          </CollapsibleSection>
        </div>
      </section>
    </div>
  )
}

const meta = {
  title: 'Systems/Admin/AppearanceIA',
  component: AppearancePageDemo,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story: React.ComponentType, ctx) => {
      const dark = ctx.parameters.theme === 'dark'
      return (
        <ThemeProvider
          attribute="class"
          forcedTheme={dark ? 'dark' : 'light'}
          enableSystem={false}
        >
          <div className={dark ? 'dark' : ''}>
            {/* min-h-[100dvh]: the marker `scripts/shoot-story.mjs` walks up
                from to flatten Storybook's decorator insets, so a capture maps
                1:1 to the app. */}
            <div className="min-h-[100dvh] bg-gray-50 p-4 sm:p-6 dark:bg-gray-950">
              <div className="mx-auto max-w-5xl">
                <Story />
              </div>
            </div>
          </div>
        </ThemeProvider>
      )
    },
  ],
} satisfies Meta<typeof AppearancePageDemo>

export default meta
type Story = StoryObj<typeof meta>

/** The whole page for a conference with a custom palette. */
export const Page: Story = { args: { theme: THEME } }

export const PageDark: Story = {
  args: { theme: THEME },
  parameters: { theme: 'dark' },
}

/**
 * No stored theme — the reported bug. The Brand colours card must still show
 * the real (house-default) palette and gradient, badged "Konf default", never
 * the sentence "Using the default Konf palette".
 */
export const PageDefaultTheme: Story = {
  args: { theme: null, pattern: 'subtle' },
}

export const PageDefaultThemeDark: Story = {
  args: { theme: null, pattern: 'subtle' },
  parameters: { theme: 'dark' },
}
