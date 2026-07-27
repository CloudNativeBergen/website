import { SparklesIcon } from '@heroicons/react/24/outline'
import { StatusBadge, type BadgeColor } from '@/components/StatusBadge'
import type { OrganizationPlan } from '@/lib/organization/types'
import type { FeatureId, FeatureReadiness } from '@/lib/features/registry'
import { InfoCard } from './settingsLayout'

/**
 * Read-only "Plan & Features" card for the CURRENT organization: the org's
 * plan as a badge plus the features it is entitled to (title + readiness
 * chip), per the resolver in `src/lib/features/entitlements.ts`. Presentational
 * — the server settings page resolves the entitlements and passes rows in, so
 * the card is renderable in Storybook for visual QA. There is deliberately no
 * edit affordance: plans and overrides are managed by the platform org (the
 * `PlatformOrgManager` card / `platform` router), not by the tenant itself.
 */

export interface PlanFeatureRow {
  id: FeatureId
  title: string
  description: string
  readiness: FeatureReadiness
  /** Entitled through an explicit override rather than the plan. */
  viaOverride: boolean
}

export interface PlanFeaturesCardProps {
  plan: OrganizationPlan
  features: PlanFeatureRow[]
}

const PLAN_BADGES: Record<
  OrganizationPlan,
  { label: string; color: BadgeColor }
> = {
  community: { label: 'Community', color: 'gray' },
  pro: { label: 'Pro', color: 'blue' },
  enterprise: { label: 'Enterprise', color: 'purple' },
}

const READINESS_BADGES: Record<
  FeatureReadiness,
  { label: string; color: BadgeColor }
> = {
  ga: { label: 'GA', color: 'green' },
  beta: { label: 'Beta', color: 'yellow' },
  internal: { label: 'Internal', color: 'gray' },
}

export function PlanFeaturesCard({ plan, features }: PlanFeaturesCardProps) {
  const planBadge = PLAN_BADGES[plan]
  return (
    <InfoCard title="Plan & Features" icon={SparklesIcon}>
      <div
        id="plan-features"
        className="flex scroll-mt-24 items-center justify-between gap-3 border-b border-gray-200 py-2 dark:border-gray-700"
      >
        {/* Plain span/div, not dt/dd (same fix as the shared FieldRow): dt/dd
            without an enclosing dl is invalid HTML. FieldRow itself is not
            reusable here — its value prop takes primitives/arrays, not a
            ReactNode badge, and this row also carries the #plan-features
            anchor. */}
        <span className="shrink-0 text-sm font-medium text-gray-500 dark:text-gray-400">
          Plan
        </span>
        <div className="min-w-0 text-right text-sm">
          <StatusBadge label={planBadge.label} color={planBadge.color} />
        </div>
      </div>

      {features.length === 0 ? (
        <p className="pt-1 text-sm text-gray-500 dark:text-gray-400">
          No optional features are enabled for this organization.
        </p>
      ) : (
        <ul className="divide-y divide-gray-200 dark:divide-gray-700">
          {features.map((feature) => {
            const readiness = READINESS_BADGES[feature.readiness]
            return (
              <li key={feature.id} className="py-2">
                {/* Badges share the TITLE row only; the description spans the
                    full card width below so a wide badge stack cannot squeeze
                    it into a one-word-per-line column. */}
                <div className="flex items-center justify-between gap-3">
                  <p className="min-w-0 text-sm font-medium text-gray-900 dark:text-white">
                    {feature.title}
                  </p>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {feature.viaOverride ? (
                      <StatusBadge label="Override" color="orange" />
                    ) : null}
                    <StatusBadge
                      label={readiness.label}
                      color={readiness.color}
                    />
                  </div>
                </div>
                <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
                  {feature.description}
                </p>
              </li>
            )
          })}
        </ul>
      )}
    </InfoCard>
  )
}
