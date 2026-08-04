import { ErrorDisplay } from '@/components/admin'
import { HomepageComposer } from '@/components/admin/composer'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { resolveHomepageSections } from '@/lib/homepage'

export const metadata = { title: 'Homepage composer' }

/**
 * `/admin/settings/appearance/composer` — the full-page composition workspace.
 *
 * THE ONE APPEARANCE SURFACE THAT EARNS A ROUTE. Every other appearance control
 * is an inline editor on the appearance page itself, because a modal is cheaper
 * than a navigation for a field you change and dismiss. This one is a place an
 * organizer stays: a section rail beside a desktop-true render of their front
 * page does not fit in a dialog, and the whole point of the tool is that they
 * no longer leave it to see what they did.
 *
 * The server's job here is small — deliver the composition to seed the editor
 * with, and say whether it is the stored one or the computed default. The
 * tenant CONTENT behind the preview is fetched client-side by the workspace and
 * by the frame (`conference.homepagePreviewData`), uncached, because a preview
 * showing hour-old speakers is worse than a preview that took a moment.
 */
export default async function HomepageComposerPage({
  searchParams,
}: {
  searchParams: Promise<{ section?: string }>
}) {
  const { section } = await searchParams
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

  // When nothing is stored the public page renders the phase-aware default;
  // seed the workspace with that same default so organizers start from what is
  // actually on the page today.
  const usingDefault =
    !conference.homepageSections || conference.homepageSections.length === 0

  return (
    <HomepageComposer
      initialSections={resolveHomepageSections(conference)}
      usingDefault={usingDefault}
      initialSectionKey={section}
    />
  )
}
