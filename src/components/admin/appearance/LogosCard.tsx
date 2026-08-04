import type { ReactNode } from 'react'
import { PhotoIcon } from '@heroicons/react/24/outline'
import { InfoCard } from '@/app/(admin)/admin/settings/settingsLayout'
import {
  BrandingPreviewGrid,
  type BrandingValues,
} from '@/components/admin/BrandingEditor'

/**
 * Appearance → Logos & marks. `BrandingPreviewGrid` already renders the real
 * SVGs on tone-correct checkerboards — the model the other cards now follow —
 * so this card only gives it a home, a caption explaining where the slots are
 * used, and the page's edit affordance.
 */
export function LogosCard({
  values,
  action,
}: {
  values: BrandingValues
  action?: ReactNode
}) {
  return (
    <InfoCard title="Logos &amp; marks" icon={PhotoIcon} action={action}>
      <p className="text-xs text-gray-500 dark:text-gray-400">
        Shown in the site header and footer, and on badges and emails. An unset
        slot falls back to a mark generated from the conference name.
      </p>
      <BrandingPreviewGrid values={values} />
    </InfoCard>
  )
}
