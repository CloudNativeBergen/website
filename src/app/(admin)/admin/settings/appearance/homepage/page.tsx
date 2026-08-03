import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { ErrorDisplay, AdminPageHeader } from '@/components/admin'
import { EditConferenceCard } from '@/components/admin/EditConferenceCard'
import { CollapsibleSection } from '@/components/admin/CollapsibleSection'
import { HomepageSectionsEditor } from '@/components/admin/HomepageSectionsEditor'
import { resolveHomepageSections } from '@/lib/homepage'
import { APPEARANCE_SECTION } from '@/lib/settings/appearance'
import { InfoCard, FieldRow } from '../../settingsLayout'
import {
  AppearanceNav,
  HomepageCompositionList,
  HomepageLayoutRow,
} from '../appearanceLayout'
import { ChartPieIcon, Squares2X2Icon } from '@heroicons/react/24/outline'

export const metadata = { title: 'Appearance — Homepage' }

/**
 * Appearance → Homepage: which sections the public front page renders, in what
 * order, plus the conference-level content those sections display.
 *
 * The composition editor itself is still the existing modal island — this page
 * gives it a home in the IA without touching its ~1000 lines. Converting it to
 * an in-page editor is a worthwhile follow-up, but it is a rewrite rather than
 * an IA move, and it would collide with the per-section copy work in flight.
 */
export default async function AppearanceHomepagePage() {
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

  const section = APPEARANCE_SECTION.homepage
  // When nothing is stored the page renders the phase-aware default; seed the
  // editor with that same default so organizers start from what is actually on
  // the page.
  const usingDefaultHomepage =
    !conference.homepageSections || conference.homepageSections.length === 0
  const homepageSections = resolveHomepageSections(conference)

  return (
    <div className="space-y-6">
      <AdminPageHeader
        icon={<Squares2X2Icon />}
        title={section.title}
        description={section.description}
        backLink={{
          href: APPEARANCE_SECTION.overview.href,
          label: 'Back to appearance',
        }}
      />

      <AppearanceNav current="homepage" />

      {/* items-start: the collapsed "Homepage stats" disclosure must hug its
          header rather than stretch to the composition card's height. */}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
        <InfoCard
          title="Composition"
          icon={Squares2X2Icon}
          action={
            <HomepageSectionsEditor
              initialSections={homepageSections}
              usingDefault={usingDefaultHomepage}
            />
          }
        >
          <HomepageLayoutRow usingDefault={usingDefaultHomepage} />
          <HomepageCompositionList sections={homepageSections} />
        </InfoCard>

        {/* Set-once — collapsed by default. The numbers the "Vanity Metrics"
            band renders; it lives here rather than under Tickets because it is
            homepage content, not a registration setting. */}
        <CollapsibleSection
          headingLevel={3}
          title="Homepage stats"
          icon={<ChartPieIcon />}
          // No Studio deep-link: the fieldset editor covers this field in full,
          // and at 393px a third header affordance truncated the title.
          action={
            <EditConferenceCard
              fieldset="vanityMetrics"
              initialValues={{ vanityMetrics: conference.vanityMetrics }}
            />
          }
        >
          <div className="space-y-3 px-6 py-4">
            {conference.vanityMetrics && conference.vanityMetrics.length > 0 ? (
              conference.vanityMetrics.map((metric, idx) => (
                <FieldRow key={idx} label={metric.label} value={metric.value} />
              ))
            ) : (
              <span className="text-sm text-gray-500 dark:text-gray-400">
                None
              </span>
            )}
          </div>
        </CollapsibleSection>
      </div>
    </div>
  )
}
