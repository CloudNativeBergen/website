'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Cog6ToothIcon } from '@heroicons/react/24/outline'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { AdminButton } from '@/components/admin/AdminButton'
import { api } from '@/lib/trpc/client'
import { OUTCOME_LABELS, type PlanView } from '@/lib/marketing/types'
import { formatDateSafe } from '@/lib/time'
import { PlanOwnerControl } from '../PlanOwnerControl'
import { CampaignEditor } from './CampaignEditor'
import { DeletePlanSection } from './DeletePlanSection'

export function PlanSettingsContent({
  view,
  onAdd,
  onEdit,
  children,
}: {
  view: PlanView
  onAdd: () => void
  onEdit: (id: string) => void
  children?: React.ReactNode
}) {
  return (
    <div className="space-y-6">
      <Link href="/admin/marketing" className="text-sm text-brand-cloud-blue">
        ← Marketing plan
      </Link>
      <AdminPageHeader
        icon={<Cog6ToothIcon />}
        title="Plan settings"
        description="Manage Campaigns and ownership for this edition."
      />
      <section className="space-y-3 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
        <PlanOwnerControl view={view} />
        <p className="text-sm text-gray-500">
          Template {view.plan.templateVersion} ·{' '}
          {view.plan.structurallyEdited
            ? 'Edited from template'
            : 'Template structure unchanged'}
        </p>
      </section>
      <section className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Campaigns</h2>
          <AdminButton onClick={onAdd}>Add Campaign</AdminButton>
        </div>
        <ul className="divide-y divide-gray-100 dark:divide-gray-800">
          {view.campaigns.map((campaign) => (
            <li
              key={campaign._id}
              className="flex flex-wrap items-center justify-between gap-3 py-4"
            >
              <div className="min-w-0">
                <Link
                  href={`/admin/marketing/campaigns/${campaign._id}`}
                  className="font-medium text-brand-cloud-blue dark:text-blue-300"
                >
                  {campaign.title}
                </Link>
                <p className="text-sm text-gray-500">
                  {OUTCOME_LABELS[campaign.primaryOutcome]} ·{' '}
                  {formatDateSafe(campaign.startDate)} –{' '}
                  {formatDateSafe(campaign.endDate)}
                </p>
              </div>
              <AdminButton
                variant="secondary"
                onClick={() => onEdit(campaign._id)}
                aria-label={`Edit ${campaign.title}`}
              >
                Edit
              </AdminButton>
            </li>
          ))}
        </ul>
        {!view.campaigns.length && (
          <p className="text-sm text-gray-500">
            No Campaigns yet. Add one to begin.
          </p>
        )}
      </section>
      {children}
    </div>
  )
}
export function PlanSettingsPage() {
  const query = api.marketing.plan.get.useQuery()
  const [editing, setEditing] = useState<string | null | undefined>(undefined)
  if (query.error) return <p role="alert">{query.error.message}</p>
  if (query.isPending) return <p>Loading plan settings…</p>
  if (!query.data)
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold">Plan settings</h1>
        <p>No marketing plan exists for this edition.</p>
        <Link className="text-brand-cloud-blue" href="/admin/marketing">
          Create a marketing plan
        </Link>
      </div>
    )
  return (
    <>
      <PlanSettingsContent
        view={query.data}
        onAdd={() => setEditing(null)}
        onEdit={setEditing}
      >
        <DeletePlanSection />
      </PlanSettingsContent>
      {editing !== undefined && (
        <CampaignEditor
          campaignId={editing ?? undefined}
          onClose={() => setEditing(undefined)}
        />
      )}
    </>
  )
}
