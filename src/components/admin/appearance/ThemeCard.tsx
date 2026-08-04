import type { ReactNode } from 'react'
import { SwatchIcon } from '@heroicons/react/24/outline'
import { InfoCard } from '@/app/(admin)/admin/settings/settingsLayout'
import { ThemeSwatchRow } from '@/components/admin/ThemeEditor'
import type { ConferenceTheme } from '@/lib/branding/theme'

/**
 * Appearance → Brand colours. Presentational: the body is the palette itself
 * (swatches, hex, gradient bar) and the edit affordance is injected by the page,
 * so the card renders in Storybook without tRPC or a tenant.
 */
export function ThemeCard({
  theme,
  action,
}: {
  theme?: ConferenceTheme | null
  /** The editor island (or a stand-in in stories). */
  action?: ReactNode
}) {
  return (
    <InfoCard title="Brand colours" icon={SwatchIcon} action={action}>
      <ThemeSwatchRow theme={theme} />
      <p className="text-xs text-gray-500 dark:text-gray-400">
        Buttons, links and every brand gradient on the public site.
      </p>
    </InfoCard>
  )
}
