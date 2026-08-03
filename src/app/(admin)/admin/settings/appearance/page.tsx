import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { ErrorDisplay, AdminPageHeader } from '@/components/admin'
import { BrandingPreviewGrid } from '@/components/admin/BrandingEditor'
import { ThemeSwatchRow } from '@/components/admin/ThemeEditor'
import { normalizeBackgroundPattern } from '@/lib/conference/backgroundPattern'
import { resolveHomepageSections } from '@/lib/homepage'
import { APPEARANCE_SECTION } from '@/lib/settings/appearance'
import { InfoCard, FieldRow } from '../settingsLayout'
import {
  AppearanceNav,
  BACKGROUND_PATTERN_LABELS,
  HomepageCompositionList,
  HomepageLayoutRow,
} from './appearanceLayout'
import {
  PaintBrushIcon,
  PhotoIcon,
  SwatchIcon,
  Squares2X2Icon,
} from '@heroicons/react/24/outline'

export const metadata = { title: 'Appearance' }

/**
 * The Appearance section hub — a read-only summary of the three sub-sections,
 * each card linking to the sub-page that edits it. No editors live here: the hub
 * answers "what does my site look like right now?", the sub-pages change it.
 */
export default async function AppearanceOverviewPage() {
  const { conference, error } = await getConferenceForCurrentDomain({
    organizers: true,
    schedule: true,
    featuredSpeakers: true,
  })

  if (error) {
    return (
      <ErrorDisplay title="Error Loading Conference" message={error.message} />
    )
  }
  if (!conference) {
    return (
      <ErrorDisplay
        title="No Conference Found"
        message="No conference configuration found for the current domain."
      />
    )
  }

  const section = APPEARANCE_SECTION.overview
  const usingDefaultHomepage =
    !conference.homepageSections || conference.homepageSections.length === 0
  const homepageSections = resolveHomepageSections(conference)

  return (
    <div className="space-y-6">
      <AdminPageHeader
        icon={<SwatchIcon />}
        title={section.title}
        description={section.description}
        backLink={{ href: '/admin/settings', label: 'Back to settings' }}
      />

      <AppearanceNav current="overview" />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <InfoCard
          title="Theme"
          icon={PaintBrushIcon}
          manageLink={{
            href: APPEARANCE_SECTION.theme.href,
            label: 'Edit theme',
          }}
        >
          <ThemeSwatchRow theme={conference.theme} />
          <FieldRow
            label="Background Pattern"
            value={
              BACKGROUND_PATTERN_LABELS[
                normalizeBackgroundPattern(conference.backgroundPattern)
              ]
            }
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
            values={{
              logoBright: conference.logoBright,
              logoDark: conference.logoDark,
              logomarkBright: conference.logomarkBright,
              logomarkDark: conference.logomarkDark,
            }}
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
          <HomepageLayoutRow usingDefault={usingDefaultHomepage} />
          <HomepageCompositionList sections={homepageSections} />
        </InfoCard>
      </div>
    </div>
  )
}
