'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  BuildingOffice2Icon,
  PlusIcon,
  TrashIcon,
} from '@heroicons/react/24/outline'
import { ModalShell } from '@/components/ModalShell'
import { AdminButton } from '@/components/admin/AdminButton'
import { useNotification } from '@/components/admin/NotificationProvider'
import { StatusBadge, type BadgeColor } from '@/components/StatusBadge'
import { api } from '@/lib/trpc/client'
import { generateKey } from '@/lib/sanity/helpers'
import { instantToOsloLocalInput, osloLocalInputToIso } from '@/lib/time'
import {
  FEATURE_LIST,
  FEATURES,
  effectivePlan,
  isFeatureId,
  type FeatureId,
} from '@/lib/features/registry'
import {
  ORGANIZATION_PLANS,
  type OrganizationFeatureOverride,
  type OrganizationPlan,
} from '@/lib/organization/types'
import { InfoCard } from './settingsLayout'

/**
 * PLATFORM-ONLY organization management card (feature entitlements
 * foundation): every organization with its plan, plus a per-org editor for the
 * plan and the feature-override rows. The server settings page renders this
 * card only for the platform org (`PLATFORM_ORG_ID` contract — see
 * `src/lib/features/platform.ts`), and the `platform` tRPC router re-enforces
 * that same check server-side, so hiding the card is presentation, not
 * security.
 *
 * The org list arrives as props from the server page (uncached read) and a
 * successful save refreshes the route, so the card always shows what is
 * stored. The editor follows the house modal conventions: the dirty baseline
 * is captured ONCE when the modal opens, and cancel/backdrop/Escape are
 * guarded by ModalShell's dirty-close confirm.
 */

export interface PlatformOrganizationRow {
  _id: string
  name: string
  slug: string
  plan?: OrganizationPlan
  featureOverrides?: OrganizationFeatureOverride[]
}

export interface PlatformOrgManagerProps {
  organizations: PlatformOrganizationRow[]
  /** Storybook/test hook: open the editor for this org id on mount. */
  defaultOpenOrgId?: string
}

const PLAN_BADGES: Record<
  OrganizationPlan,
  { label: string; color: BadgeColor }
> = {
  community: { label: 'Community', color: 'gray' },
  pro: { label: 'Pro', color: 'blue' },
  enterprise: { label: 'Enterprise', color: 'purple' },
}

/**
 * Registry title for a feature id, falling back to the raw id for anything
 * outside the closed registry — never an unchecked `FEATURES[...]` dereference.
 */
function featureTitle(id: string): string {
  return isFeatureId(id) ? FEATURES[id].title : id
}

/** Editable override row: keyed for React identity, expiry as Oslo wall-clock. */
interface DraftOverride {
  _key: string
  feature: FeatureId
  enabled: boolean
  note: string
  expiresAtLocal: string
}

/**
 * Stored overrides → editable drafts. Rows whose feature id is no longer in
 * the registry are dropped (the resolver already ignores them) and counted as
 * a pending change via {@link staleBaseline}, so the editor opens dirty and
 * one Save persists the cleaned set — same posture as the FormatsEditor's
 * stale-key handling.
 */
function toDrafts(overrides: OrganizationFeatureOverride[] | undefined) {
  return (overrides ?? [])
    .filter((o) => isFeatureId(o.feature))
    .map((o) => ({
      _key: o._key || generateKey('override'),
      feature: o.feature as FeatureId,
      enabled: o.enabled,
      note: o.note ?? '',
      expiresAtLocal: instantToOsloLocalInput(o.expiresAt),
    }))
}

/**
 * Baseline for an org's stored state. When a stored row was dropped as stale
 * the baseline is prefixed so it can never equal a serialized draft state —
 * the editor opens dirty and Save is offered.
 */
function staleBaseline(
  org: PlatformOrganizationRow,
  plan: OrganizationPlan,
  drafts: DraftOverride[],
): string {
  const stored = org.featureOverrides ?? []
  const hasStale = stored.some((o) => !isFeatureId(o.feature))
  const serialized = serialize(plan, drafts)
  return hasStale ? `stale:${serialized}` : serialized
}

/** Stable serialization of the editor state for dirty comparison. */
function serialize(plan: OrganizationPlan, drafts: DraftOverride[]): string {
  return JSON.stringify({
    plan,
    overrides: drafts.map((d) => ({
      feature: d.feature,
      enabled: d.enabled,
      note: d.note.trim(),
      expiresAtLocal: d.expiresAtLocal,
    })),
  })
}

export function PlatformOrgManager({
  organizations,
  defaultOpenOrgId,
}: PlatformOrgManagerProps) {
  const router = useRouter()
  const utils = api.useUtils()
  const { showNotification } = useNotification()

  const defaultOrg = defaultOpenOrgId
    ? organizations.find((o) => o._id === defaultOpenOrgId)
    : undefined

  const [editing, setEditing] = useState<PlatformOrganizationRow | null>(
    defaultOrg ?? null,
  )
  const [plan, setPlan] = useState<OrganizationPlan>(
    effectivePlan(defaultOrg?.plan),
  )
  const [drafts, setDrafts] = useState<DraftOverride[]>(
    toDrafts(defaultOrg?.featureOverrides),
  )
  // Captured once per open — edits compare against the state the modal opened
  // with, not against re-rendered props.
  const [baseline, setBaseline] = useState<string>(
    defaultOrg
      ? staleBaseline(
          defaultOrg,
          effectivePlan(defaultOrg.plan),
          toDrafts(defaultOrg.featureOverrides),
        )
      : '',
  )
  const [submitError, setSubmitError] = useState<string | null>(null)

  const isDirty = editing !== null && serialize(plan, drafts) !== baseline

  const saveMutation = api.platform.updateEntitlements.useMutation({
    onSuccess: () => {
      void utils.platform.listOrganizations.invalidate()
      router.refresh()
      showNotification({
        type: 'success',
        title: 'Entitlements updated',
        message: `Saved plan and feature overrides for ${editing?.name ?? 'the organization'}.`,
      })
      setEditing(null)
    },
    onError: (err) => {
      setSubmitError(err.message || 'Failed to save entitlements.')
    },
  })

  const openEditor = (org: PlatformOrganizationRow) => {
    // effectivePlan, not a plain `?? 'community'` default: a malformed/legacy
    // stored plan must normalize exactly as the server resolver does.
    const initialPlan = effectivePlan(org.plan)
    const initialDrafts = toDrafts(org.featureOverrides)
    setPlan(initialPlan)
    setDrafts(initialDrafts)
    setBaseline(staleBaseline(org, initialPlan, initialDrafts))
    setSubmitError(null)
    setEditing(org)
  }

  const closeEditor = () => {
    setEditing(null)
    setSubmitError(null)
  }

  const updateDraft = (key: string, patch: Partial<DraftOverride>) => {
    setDrafts((prev) =>
      prev.map((d) => (d._key === key ? { ...d, ...patch } : d)),
    )
  }

  const addDraft = () => {
    setDrafts((prev) => [
      ...prev,
      {
        _key: generateKey('override'),
        feature: FEATURE_LIST[0].id,
        enabled: true,
        note: '',
        expiresAtLocal: '',
      },
    ])
  }

  const removeDraft = (key: string) => {
    setDrafts((prev) => prev.filter((d) => d._key !== key))
  }

  const handleSave = () => {
    if (!editing) return
    setSubmitError(null)
    saveMutation.mutate({
      organizationId: editing._id,
      plan,
      overrides: drafts.map((d) => {
        const note = d.note.trim()
        const expiresAt = osloLocalInputToIso(d.expiresAtLocal)
        return {
          _key: d._key,
          feature: d.feature,
          enabled: d.enabled,
          ...(note ? { note } : {}),
          ...(expiresAt ? { expiresAt } : {}),
        }
      }),
    })
  }

  return (
    <>
      <InfoCard title="Organizations" icon={BuildingOffice2Icon}>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Platform management: every organization on this deployment, with its
          plan and feature overrides.
        </p>
        <ul className="divide-y divide-gray-200 dark:divide-gray-700">
          {organizations.map((org) => {
            // Route through effectivePlan (same normalization as the server
            // resolver) so a malformed/legacy stored plan renders as Community
            // instead of crashing the badge lookup.
            const badge = PLAN_BADGES[effectivePlan(org.plan)]
            const overrideCount = (org.featureOverrides ?? []).length
            return (
              <li
                key={org._id}
                className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 py-2.5"
              >
                {/* `basis-48` + wrap: on narrow viewports the badge/button
                    group drops to its own line instead of truncating the org
                    name to a few characters. */}
                <div className="min-w-0 flex-1 basis-48">
                  <p className="truncate text-sm font-medium text-gray-900 dark:text-white">
                    {org.name}
                  </p>
                  <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                    {org.slug}
                    {overrideCount > 0
                      ? ` · ${overrideCount} override${overrideCount === 1 ? '' : 's'}`
                      : ''}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <StatusBadge label={badge.label} color={badge.color} />
                  <AdminButton
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => openEditor(org)}
                    className="min-h-[44px]"
                  >
                    Manage
                  </AdminButton>
                </div>
              </li>
            )
          })}
        </ul>
        {organizations.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No organizations found.
          </p>
        ) : null}
      </InfoCard>

      <ModalShell
        isOpen={editing !== null}
        onClose={closeEditor}
        size="2xl"
        title={editing ? `Manage ${editing.name}` : 'Manage organization'}
        subtitle="Plan and per-feature entitlement overrides"
        icon={<BuildingOffice2Icon className="h-5 w-5" />}
        confirmOnDirtyClose
        // The guard must stay ARMED while the save is in flight: backdrop /
        // Escape / header-close then hit ModalShell's discard confirm instead
        // of silently closing mid-save (Cancel is likewise disabled during
        // pending). ModalShell has no harder prevent-close affordance.
        isDirty={isDirty || saveMutation.isPending}
      >
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            handleSave()
          }}
          className="space-y-5"
        >
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
              Plan
            </legend>
            <div className="flex flex-col gap-1 sm:flex-row sm:gap-2">
              {ORGANIZATION_PLANS.map((value) => (
                <label
                  key={value}
                  className={`flex min-h-[44px] flex-1 cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm ${
                    plan === value
                      ? 'border-brand-cloud-blue bg-blue-50 text-gray-900 dark:bg-blue-900/20 dark:text-white'
                      : 'border-gray-200 text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800'
                  }`}
                >
                  <input
                    type="radio"
                    name="plan"
                    value={value}
                    checked={plan === value}
                    onChange={() => setPlan(value)}
                    className="h-4 w-4 border-gray-300 text-brand-cloud-blue focus:ring-brand-cloud-blue"
                  />
                  <span className="capitalize">{value}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="mb-1 text-sm font-medium text-gray-700 dark:text-gray-300">
              Feature overrides
            </legend>
            <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">
              Overrides win over the plan in both directions. Beta and internal
              features are only ever enabled through an override; expired
              overrides are ignored.
            </p>
            {drafts.length === 0 ? (
              <p className="rounded-lg border border-dashed border-gray-300 px-3 py-3 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
                No overrides — this organization gets exactly its plan&apos;s
                features.
              </p>
            ) : (
              <ul className="space-y-3">
                {drafts.map((draft) => (
                  <li
                    key={draft._key}
                    className="rounded-lg border border-gray-200 p-3 dark:border-gray-700"
                  >
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">
                        Feature
                        <select
                          value={draft.feature}
                          onChange={(e) => {
                            // Guard, not cast: only registry ids may enter the
                            // draft — anything else (tampered/stale DOM value)
                            // is ignored.
                            const value = e.target.value
                            if (isFeatureId(value)) {
                              updateDraft(draft._key, { feature: value })
                            }
                          }}
                          className="mt-1 block min-h-[44px] w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-base text-gray-900 shadow-sm transition-colors focus:border-brand-cloud-blue focus:ring-1 focus:ring-brand-cloud-blue focus:outline-none sm:text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                        >
                          {FEATURE_LIST.map((feature) => (
                            <option key={feature.id} value={feature.id}>
                              {feature.title} ({feature.readiness})
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">
                        Expires (optional, Oslo time)
                        <input
                          type="datetime-local"
                          value={draft.expiresAtLocal}
                          onChange={(e) =>
                            updateDraft(draft._key, {
                              expiresAtLocal: e.target.value,
                            })
                          }
                          className="mt-1 block min-h-[44px] w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-base text-gray-900 shadow-sm transition-colors focus:border-brand-cloud-blue focus:ring-1 focus:ring-brand-cloud-blue focus:outline-none sm:text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                        />
                      </label>
                    </div>
                    <label className="mt-3 block text-xs font-medium text-gray-500 dark:text-gray-400">
                      Note (optional)
                      <input
                        type="text"
                        value={draft.note}
                        maxLength={500}
                        onChange={(e) =>
                          updateDraft(draft._key, { note: e.target.value })
                        }
                        placeholder="Why this override exists"
                        className="mt-1 block min-h-[44px] w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-base text-gray-900 shadow-sm transition-colors focus:border-brand-cloud-blue focus:ring-1 focus:ring-brand-cloud-blue focus:outline-none sm:text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                      />
                    </label>
                    <div className="mt-3 flex items-center justify-between">
                      <label className="flex min-h-[44px] cursor-pointer items-center gap-2 text-sm text-gray-800 dark:text-gray-200">
                        <input
                          type="checkbox"
                          checked={draft.enabled}
                          onChange={(e) =>
                            updateDraft(draft._key, {
                              enabled: e.target.checked,
                            })
                          }
                          className="h-5 w-5 rounded border-gray-300 text-brand-cloud-blue focus:ring-brand-cloud-blue"
                        />
                        {draft.enabled
                          ? 'Enabled (grant)'
                          : 'Disabled (revoke)'}
                      </label>
                      <button
                        type="button"
                        onClick={() => removeDraft(draft._key)}
                        aria-label={`Remove override for ${featureTitle(draft.feature)}`}
                        className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-gray-500 hover:bg-red-50 hover:text-red-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 dark:text-gray-400 dark:hover:bg-red-900/20 dark:hover:text-red-400"
                      >
                        <TrashIcon className="h-5 w-5" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <AdminButton
              type="button"
              variant="secondary"
              size="sm"
              onClick={addDraft}
              className="mt-3 min-h-[44px]"
            >
              <PlusIcon className="mr-1 h-4 w-4" />
              Add override
            </AdminButton>
          </fieldset>

          {submitError ? (
            <p
              role="alert"
              className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300"
            >
              {submitError}
            </p>
          ) : null}

          <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:justify-end">
            <AdminButton
              type="button"
              variant="secondary"
              size="md"
              onClick={closeEditor}
              disabled={saveMutation.isPending}
              className="min-h-[44px]"
            >
              Cancel
            </AdminButton>
            <AdminButton
              type="submit"
              color="blue"
              size="md"
              disabled={saveMutation.isPending || !isDirty}
              className="min-h-[44px]"
            >
              {saveMutation.isPending ? 'Saving…' : 'Save entitlements'}
            </AdminButton>
          </div>
        </form>
      </ModalShell>
    </>
  )
}
