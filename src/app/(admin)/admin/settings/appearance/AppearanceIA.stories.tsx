import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import {
  PaintBrushIcon,
  PencilSquareIcon,
  PhotoIcon,
  Squares2X2Icon,
  SwatchIcon,
  ChartPieIcon,
} from '@heroicons/react/24/outline'
import { InfoCard, FieldRow } from '../settingsLayout'
import {
  AppearanceNav,
  BACKGROUND_PATTERN_LABELS,
  HomepageCompositionList,
  HomepageLayoutRow,
} from './appearanceLayout'
import { CollapsibleSection } from '@/components/admin/CollapsibleSection'
import { BrandingPreviewGrid } from '@/components/admin/BrandingEditor'
import { ThemeSwatchRow } from '@/components/admin/ThemeEditor'
import { APPEARANCE_SECTION } from '@/lib/settings/appearance'
import type { HomepageSection } from '@/lib/homepage'

/**
 * Visual-QA harness for the Appearance section's information architecture: the
 * section pill nav and the four pages it links (hub, theme, logos, homepage).
 *
 * Rendered with static mock data and non-functional edit affordances (the real
 * pages mount tRPC-backed editor islands) so the layout — and especially the
 * sub-navigation at 393px — is inspectable without providers or a live tenant.
 */

const THEME = { primaryColor: '#1D4ED8', accentColor: '#7C3AED' }

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

/** The shared page chrome: a heading block plus the section pill nav. */
function PageShell({
  id,
  icon: Icon,
  children,
}: {
  id: 'overview' | 'theme' | 'logos' | 'homepage'
  icon: React.ComponentType<{ className?: string }>
  children: React.ReactNode
}) {
  const section = APPEARANCE_SECTION[id]
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 pb-4">
        <Icon className="h-8 w-8 shrink-0 text-brand-cloud-blue dark:text-blue-300" />
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-gray-900 sm:text-2xl dark:text-white">
            {section.title}
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {section.description}
          </p>
        </div>
      </div>
      <AppearanceNav current={id} />
      {children}
    </div>
  )
}

function OverviewDemo() {
  return (
    <PageShell id="overview" icon={SwatchIcon}>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <InfoCard
          title="Theme"
          icon={PaintBrushIcon}
          manageLink={{
            href: APPEARANCE_SECTION.theme.href,
            label: 'Edit theme',
          }}
        >
          <ThemeSwatchRow theme={THEME} />
          <FieldRow
            label="Background Pattern"
            value={BACKGROUND_PATTERN_LABELS['cloud-native']}
          />
        </InfoCard>

        <InfoCard
          title="Logos &amp; marks"
          icon={PhotoIcon}
          manageLink={{
            href: APPEARANCE_SECTION.logos.href,
            label: 'Edit logos',
          }}
        >
          <BrandingPreviewGrid
            values={{ logoBright: SAMPLE_LOGO, logomarkDark: SAMPLE_MARK }}
          />
        </InfoCard>

        <InfoCard
          title="Homepage"
          icon={Squares2X2Icon}
          manageLink={{
            href: APPEARANCE_SECTION.homepage.href,
            label: 'Edit homepage',
          }}
        >
          <HomepageLayoutRow usingDefault={false} />
          <HomepageCompositionList sections={SECTIONS} />
        </InfoCard>
      </div>
    </PageShell>
  )
}

function ThemeDemo() {
  return (
    <PageShell id="theme" icon={PaintBrushIcon}>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <InfoCard
          title="Brand colours"
          icon={SwatchIcon}
          action={<EditPencil />}
        >
          <ThemeSwatchRow theme={THEME} />
        </InfoCard>
        <InfoCard
          title="Background pattern"
          icon={PaintBrushIcon}
          action={<EditPencil />}
        >
          <FieldRow
            label="Background Pattern"
            value={BACKGROUND_PATTERN_LABELS.subtle}
          />
        </InfoCard>
      </div>
    </PageShell>
  )
}

function LogosDemo() {
  return (
    <PageShell id="logos" icon={PhotoIcon}>
      <div className="grid grid-cols-1 gap-6">
        <InfoCard
          title="Logos &amp; marks"
          icon={PhotoIcon}
          action={<EditPencil />}
        >
          <BrandingPreviewGrid
            values={{
              logoBright: SAMPLE_LOGO,
              logoDark: SAMPLE_LOGO,
              logomarkBright: SAMPLE_MARK,
              logomarkDark: SAMPLE_MARK,
            }}
          />
        </InfoCard>
      </div>
    </PageShell>
  )
}

function HomepageDemo() {
  return (
    <PageShell id="homepage" icon={Squares2X2Icon}>
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
        <InfoCard
          title="Composition"
          icon={Squares2X2Icon}
          action={<EditPencil />}
        >
          <HomepageLayoutRow usingDefault={false} />
          <HomepageCompositionList sections={SECTIONS} />
        </InfoCard>

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
    </PageShell>
  )
}

function AppearanceIADemo() {
  return <OverviewDemo />
}

const meta = {
  title: 'Systems/Admin/AppearanceIA',
  component: AppearanceIADemo,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story: React.ComponentType) => (
      // min-h-[100dvh]: the marker `scripts/shoot-story.mjs` walks up from to
      // flatten Storybook's decorator insets, so a capture maps 1:1 to the app.
      <div className="min-h-[100dvh] bg-gray-50 p-4 sm:p-6 dark:bg-gray-950">
        <div className="mx-auto max-w-5xl">
          <Story />
        </div>
      </div>
    ),
  ],
} satisfies Meta<typeof AppearanceIADemo>

export default meta
type Story = StoryObj<typeof meta>

/** The section hub — a read-only summary of all three sub-sections. */
export const Overview: Story = {}

export const Theme: Story = { render: () => <ThemeDemo /> }

export const Logos: Story = { render: () => <LogosDemo /> }

export const Homepage: Story = { render: () => <HomepageDemo /> }
