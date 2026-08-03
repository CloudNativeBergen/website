import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { ErrorDisplay, AdminPageHeader } from '@/components/admin'
import { EditConferenceCard } from '@/components/admin/EditConferenceCard'
import { ThemeEditor, ThemeSwatchRow } from '@/components/admin/ThemeEditor'
import { normalizeBackgroundPattern } from '@/lib/conference/backgroundPattern'
import { APPEARANCE_SECTION } from '@/lib/settings/appearance'
import { InfoCard, FieldRow } from '../../settingsLayout'
import { AppearanceNav, BACKGROUND_PATTERN_LABELS } from '../appearanceLayout'
import { PaintBrushIcon, SwatchIcon } from '@heroicons/react/24/outline'

export const metadata = { title: 'Appearance — Theme' }

/**
 * Appearance → Theme: the tenant palette and the decorative page background.
 *
 * FUTURE: typography (font selection) belongs on this page — a font is a theme
 * token like a colour, and it should sit beside the palette rather than behind
 * its own nav entry.
 */
export default async function AppearanceThemePage() {
  const { conference, error } = await getConferenceForCurrentDomain({})

  if (error) {
    return (
      <ErrorDisplay title="Error Loading Conference" message={error.message} />
    )
  }
  const section = APPEARANCE_SECTION.theme

  return (
    <div className="space-y-6">
      <AdminPageHeader
        icon={<PaintBrushIcon />}
        title={section.title}
        description={section.description}
        backLink={{
          href: APPEARANCE_SECTION.overview.href,
          label: 'Back to appearance',
        }}
      />

      <AppearanceNav current="theme" />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <InfoCard
          title="Brand colours"
          icon={SwatchIcon}
          action={<ThemeEditor initialTheme={conference.theme} />}
        >
          <ThemeSwatchRow theme={conference.theme} />
        </InfoCard>

        <InfoCard
          title="Background pattern"
          icon={PaintBrushIcon}
          // No Studio deep-link: the fieldset editor covers this field in full,
          // and a third header affordance wrapped the title at 393px.
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
        >
          <FieldRow
            label="Background Pattern"
            value={
              BACKGROUND_PATTERN_LABELS[
                normalizeBackgroundPattern(conference.backgroundPattern)
              ]
            }
          />
        </InfoCard>
      </div>
    </div>
  )
}
