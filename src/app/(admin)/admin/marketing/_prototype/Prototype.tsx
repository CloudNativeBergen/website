'use client'
/**
 * PROTOTYPE — throwaway. Three variants of the Marketing Plan board on the
 * existing /admin/marketing route, switchable with `?variant=A|B|C`.
 *
 * Question: can a 9-Campaign / 94-Task plan be made workable without a
 * 4000px scroll? Issues #1085 (list + filters) and #1086 (board density).
 */
import type { PlanView } from '@/lib/marketing/types'
import { PrototypeSwitcher } from './PrototypeSwitcher'
import { VariantA, NAME as NAME_A } from './VariantA'
import { VariantB, NAME as NAME_B } from './VariantB'
import { VariantC, NAME as NAME_C } from './VariantC'

const VARIANTS = ['A', 'B', 'C'] as const
export type VariantKey = (typeof VARIANTS)[number]
const NAMES: Record<VariantKey, string> = { A: NAME_A, B: NAME_B, C: NAME_C }

export function MarketingPlanPrototype({
  view,
  variant,
  onVariant,
}: {
  view: PlanView
  variant: VariantKey
  onVariant: (v: string) => void
}) {
  return (
    <div className="pb-20">
      {variant === 'A' && <VariantA view={view} />}
      {variant === 'B' && <VariantB view={view} />}
      {variant === 'C' && <VariantC view={view} />}
      <PrototypeSwitcher
        variants={[...VARIANTS]}
        current={variant}
        name={NAMES[variant]}
        onChange={onVariant}
      />
    </div>
  )
}
