'use client'

import { useMemo, useState } from 'react'
import {
  CalendarDaysIcon,
  DocumentDuplicateIcon,
  MegaphoneIcon,
  PaintBrushIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { AdminButton } from '@/components/admin/AdminButton'
import { EmptyState } from '@/components/EmptyState'
import { api } from '@/lib/trpc/client'
import { MILESTONES } from '@/lib/marketing/milestones'
import type { PlanView } from '@/lib/marketing/types'
import { MarketingPlanTimeline } from './MarketingPlanTimeline'
import { CopyPlanDialog } from './CopyPlanDialog'
import { PlanOwnerControl } from './PlanOwnerControl'
import { SeedPlanDialog } from './SeedPlanDialog'
import { chipTone, isWaiting } from './timeline-model'

const STUDIO_ACTION = {
  label: 'Promo studio',
  href: '/admin/marketing/studio',
  icon: <PaintBrushIcon className="size-4" />,
  variant: 'secondary' as const,
}
const REPORT_ACTION = {
  label: 'Marketing report',
  href: '/admin/marketing/report',
  icon: <DocumentDuplicateIcon className="size-4" />,
  variant: 'secondary' as const,
}
const POSTS_ACTION = {
  label: 'Social posts',
  href: '/admin/marketing/posts',
  icon: <MegaphoneIcon className="size-4" />,
  variant: 'secondary' as const,
}

/**
 * The home of the marketing admin page (spec §7): the edition's plan on its
 * Milestone timeline, or the seed call-to-action before one exists. The
 * promo studio and the posts table stay one click away in the header.
 */
export function MarketingPlanHome({
  conferenceTitle,
}: {
  conferenceTitle: string
}) {
  const [seeding, setSeeding] = useState(false)
  const [copying, setCopying] = useState(false)
  const plan = api.marketing.plan.get.useQuery(undefined, {
    refetchOnWindowFocus: false,
  })

  const stats = useMemo(() => summarize(plan.data ?? null), [plan.data])

  const description = (
    <>
      Every campaign for{' '}
      <span className="font-medium text-brand-cloud-blue dark:text-blue-300">
        {conferenceTitle}
      </span>
      , laid against the conference milestones.
    </>
  )

  return (
    <div className="space-y-6">
      <AdminPageHeader
        icon={<CalendarDaysIcon />}
        title="Marketing plan"
        description={description}
        actionItems={
          plan.data !== null
            ? [REPORT_ACTION, STUDIO_ACTION, POSTS_ACTION]
            : [
                {
                  label: 'Create from template',
                  onClick: () => setSeeding(true),
                  icon: <SparklesIcon className="size-4" />,
                  variant: 'primary' as const,
                },
                {
                  label: 'Copy previous edition',
                  onClick: () => setCopying(true),
                  icon: <DocumentDuplicateIcon className="size-4" />,
                  variant: 'secondary' as const,
                },
                REPORT_ACTION,
                STUDIO_ACTION,
                POSTS_ACTION,
              ]
        }
        stats={stats}
      />

      {plan.isPending && (
        <div className="h-96 animate-pulse rounded-xl border border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900" />
      )}

      {plan.error && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-800 dark:bg-red-900/30 dark:text-red-200"
        >
          <p className="font-medium">The plan cannot be shown.</p>
          <p className="mt-1">{plan.error.message}</p>
        </div>
      )}

      {plan.data === null && (
        <div className="rounded-xl border border-dashed border-gray-300 py-16 dark:border-gray-700">
          <EmptyState
            icon={CalendarDaysIcon}
            title="No marketing plan yet"
            description="Seed one from the built-in template: ten campaigns of posts, renders and checklists, scheduled against this edition's milestones. Or start from last edition's plan."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <AdminButton color="brand" onClick={() => setSeeding(true)}>
                  <SparklesIcon className="mr-1.5 size-4" />
                  Create from template
                </AdminButton>
                <AdminButton
                  variant="secondary"
                  onClick={() => setCopying(true)}
                >
                  <DocumentDuplicateIcon className="mr-1.5 size-4" />
                  Copy previous edition
                </AdminButton>
              </div>
            }
          />
        </div>
      )}

      {plan.data && (
        <>
          <PlanOwnerControl view={plan.data} />
          <MarketingPlanTimeline view={plan.data} />
        </>
      )}

      <SeedPlanDialog isOpen={seeding} onClose={() => setSeeding(false)} />
      <CopyPlanDialog isOpen={copying} onClose={() => setCopying(false)} />
    </div>
  )
}

function summarize(view: PlanView | null) {
  if (!view) return undefined
  const byId = new Map(view.tasks.map((t) => [t._id, t]))
  let overdue = 0
  let waiting = 0
  let complete = 0
  for (const task of view.tasks) {
    const w = isWaiting(task, byId)
    const tone = chipTone(task, w, view.today)
    if (tone === 'overdue') overdue += 1
    if (w) waiting += 1
    if (task.complete) complete += 1
  }
  const provisional = MILESTONES.filter(
    (m) => view.milestones[m]?.provisional,
  ).length
  return [
    {
      value: view.campaigns.length,
      label: 'Campaigns',
      color: 'slate' as const,
    },
    {
      value: `${complete}/${view.tasks.length}`,
      label: 'Tasks done',
      color: 'green' as const,
    },
    {
      value: overdue,
      label: 'Overdue',
      color: overdue ? ('red' as const) : ('slate' as const),
    },
    { value: waiting, label: 'Waiting', color: 'slate' as const },
    {
      value: provisional,
      label: 'Provisional milestones',
      color: provisional ? ('yellow' as const) : ('slate' as const),
    },
  ]
}
