import type { ReactNode } from 'react'
import { Squares2X2Icon } from '@heroicons/react/24/outline'
import { InfoCard } from '@/app/(admin)/admin/settings/settingsLayout'
import {
  HomepageCompositionList,
  HomepageLayoutRow,
} from '@/app/(admin)/admin/settings/appearance/appearanceLayout'
import type { HomepageSection } from '@/lib/homepage'

/**
 * Appearance → Homepage composition: which sections the public front page
 * renders, in what order. This card is the at-rest display; its action
 * navigates to `/admin/settings/appearance/composer`, the full-page workspace
 * where the composition is edited beside a live render of the page.
 */
export function HomepageCard({
  sections,
  usingDefault,
  action,
}: {
  sections: HomepageSection[]
  usingDefault: boolean
  action?: ReactNode
}) {
  return (
    <InfoCard title="Composition" icon={Squares2X2Icon} action={action}>
      <HomepageLayoutRow usingDefault={usingDefault} />
      <HomepageCompositionList sections={sections} />
    </InfoCard>
  )
}
