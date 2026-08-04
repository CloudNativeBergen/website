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
 * renders, in what order. The composition editor itself stays the existing
 * modal island (it is the one appearance surface that is genuinely a
 * workspace); this card is its at-rest display.
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
