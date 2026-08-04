import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { ErrorDisplay, AdminPageHeader } from '@/components/admin'
import { BrandingEditor } from '@/components/admin/BrandingEditor'
import { ThemeEditor } from '@/components/admin/ThemeEditor'
import { EditConferenceCard } from '@/components/admin/EditConferenceCard'
import { CollapsibleSection } from '@/components/admin/CollapsibleSection'
import { HomepageSectionsEditor } from '@/components/admin/HomepageSectionsEditor'
import {
  HomepageCard,
  LogosCard,
  PatternCard,
  ThemeCard,
} from '@/components/admin/appearance'
import { normalizeBackgroundPattern } from '@/lib/conference/backgroundPattern'
import { resolveHomepageSections } from '@/lib/homepage'
import { APPEARANCE_PAGE, APPEARANCE_SECTION } from '@/lib/settings/appearance'
import { FieldRow, SectionHeading } from '../settingsLayout'
import { AppearanceNav } from './appearanceLayout'
import {
  ChartPieIcon,
  PaintBrushIcon,
  PhotoIcon,
  SwatchIcon,
  Squares2X2Icon,
} from '@heroicons/react/24/outline'

export const metadata = { title: 'Appearance' }

/**
 * Appearance — brand colours, logos and the public homepage, on ONE page.
 *
 * It was a hub plus three sub-pages; each sub-page rendered the same card body
 * as the hub and existed only to host an edit affordance, so changing a brand
 * colour cost three navigations. The sub-sections are now anchored regions with
 * a sticky chip nav (the settings page's own pattern), and the old sub-page URLs
 * redirect to those anchors.
 *
 * Every card renders the VALUE — swatches with hex and the brand gradient, a
 * static render of each background pattern, the real logo SVGs — rather than a
 * sentence naming it. This is a look-and-feel surface; prose about colours is
 * not a preview of them.
 */
export default async function AppearancePage() {
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

  const logoValues = {
    logoBright: conference.logoBright,
    logoDark: conference.logoDark,
    logomarkBright: conference.logomarkBright,
    logomarkDark: conference.logomarkDark,
  }
  // When nothing is stored the public page renders the phase-aware default;
  // seed the editor with that same default so organizers start from what is
  // actually on the page.
  const usingDefaultHomepage =
    !conference.homepageSections || conference.homepageSections.length === 0
  const homepageSections = resolveHomepageSections(conference)

  return (
    <div className="space-y-6">
      <AdminPageHeader
        icon={<SwatchIcon />}
        title={APPEARANCE_PAGE.title}
        description={APPEARANCE_PAGE.description}
        backLink={{ href: '/admin/settings', label: 'Back to settings' }}
      />

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
          <ThemeCard
            theme={conference.theme}
            action={<ThemeEditor initialTheme={conference.theme} />}
          />
          <PatternCard
            pattern={normalizeBackgroundPattern(conference.backgroundPattern)}
            primaryColor={conference.theme?.primaryColor}
            accentColor={conference.theme?.accentColor}
            // No Studio deep-link: the fieldset editor covers this field in
            // full, and a third header affordance wrapped the title at 393px.
            action={
              <EditConferenceCard
                fieldset="branding"
                initialValues={{
                  // Normalize (not just null-coalesce) so an invalid stored
                  // value can't seed an enum-invalid submit.
                  backgroundPattern: normalizeBackgroundPattern(
                    conference.backgroundPattern,
                  ),
                }}
              />
            }
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
          values={logoValues}
          action={<BrandingEditor initialValues={logoValues} />}
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
        {/* items-start: the collapsed "Homepage stats" disclosure must hug its
            header rather than stretch to the composition card's height. */}
        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
          <HomepageCard
            sections={homepageSections}
            usingDefault={usingDefaultHomepage}
            action={
              <HomepageSectionsEditor
                initialSections={homepageSections}
                usingDefault={usingDefaultHomepage}
              />
            }
          />

          {/* Set-once — collapsed by default. The numbers the "Vanity Metrics"
              band renders; it lives here rather than under Tickets because it is
              homepage content, not a registration setting. */}
          <CollapsibleSection
            headingLevel={3}
            title="Homepage stats"
            icon={<ChartPieIcon />}
            // No Studio deep-link: the fieldset editor covers this field in
            // full, and at 393px a third header affordance truncated the title.
            action={
              <EditConferenceCard
                fieldset="vanityMetrics"
                initialValues={{ vanityMetrics: conference.vanityMetrics }}
              />
            }
          >
            <div className="space-y-3 px-6 py-4">
              {conference.vanityMetrics &&
              conference.vanityMetrics.length > 0 ? (
                conference.vanityMetrics.map((metric, idx) => (
                  <FieldRow
                    key={idx}
                    label={metric.label}
                    value={metric.value}
                  />
                ))
              ) : (
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  None
                </span>
              )}
            </div>
          </CollapsibleSection>
        </div>
      </section>
    </div>
  )
}
