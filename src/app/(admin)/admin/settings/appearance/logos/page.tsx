import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { ErrorDisplay, AdminPageHeader } from '@/components/admin'
import {
  BrandingEditor,
  BrandingPreviewGrid,
} from '@/components/admin/BrandingEditor'
import { APPEARANCE_SECTION } from '@/lib/settings/appearance'
import { InfoCard } from '../../settingsLayout'
import { AppearanceNav } from '../appearanceLayout'
import { PhotoIcon } from '@heroicons/react/24/outline'

export const metadata = { title: 'Appearance — Logos & marks' }

/**
 * Appearance → Logos & marks: the four stored SVG brand slots (horizontal logo
 * and icon-only mark, each in a light- and dark-background variant). An unset
 * slot falls back to a generated mark derived from the conference name.
 */
export default async function AppearanceLogosPage() {
  const { conference, error } = await getConferenceForCurrentDomain({})

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

  const section = APPEARANCE_SECTION.logos
  const values = {
    logoBright: conference.logoBright,
    logoDark: conference.logoDark,
    logomarkBright: conference.logomarkBright,
    logomarkDark: conference.logomarkDark,
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        icon={<PhotoIcon />}
        title={section.title}
        description={section.description}
        backLink={{
          href: APPEARANCE_SECTION.overview.href,
          label: 'Back to appearance',
        }}
      />

      <AppearanceNav current="logos" />

      <div className="grid grid-cols-1 gap-6">
        <InfoCard
          title="Logos &amp; marks"
          icon={PhotoIcon}
          action={<BrandingEditor initialValues={values} />}
        >
          <BrandingPreviewGrid values={values} />
        </InfoCard>
      </div>
    </div>
  )
}
