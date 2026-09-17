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
import { defaultExpanded } from './timeline-model'
import {
  filterTasks,
  sortTasks,
  NO_FILTERS,
  selectPlanFlag,
  summarizeTaskFlags,
  type PlanFilters,
} from './plan-filters'
import { usePlanFilters } from './usePlanFilters'
import { PlanFiltersBar } from './PlanFiltersBar'
import { PlanTaskList } from './PlanTaskList'

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
  const { filters, update } = usePlanFilters()
  const [seeding, setSeeding] = useState(false)
  const [copying, setCopying] = useState(false)
  const plan = api.marketing.plan.get.useQuery(undefined, {
    refetchOnWindowFocus: false,
  })

  const stats = useMemo(() => summarize(plan.data ?? null), [plan.data])
  const flagForLabel: Record<string, PlanFilters['flag']> = {
    'Tasks done': 'done',
    Overdue: 'overdue',
    Waiting: 'waiting',
  }
  const clickableStats = stats?.map((stat) => {
    const flag = flagForLabel[stat.label]
    return flag
      ? {
          ...stat,
          onClick: () => update(selectPlanFlag(filters, flag)),
          pressed: filters.flag === flag,
        }
      : stat
  })
  const byId = new Map((plan.data?.tasks ?? []).map((task) => [task._id, task]))
  const tasks = plan.data
    ? sortTasks(
        filterTasks(plan.data.tasks, filters, {
          today: plan.data.today,
          byId,
          viewerId: plan.data.viewerId,
        }),
        plan.data.today,
        byId,
        filters.sort,
      )
    : []
  const clear = () =>
    update({
      ...NO_FILTERS,
      view: filters.view,
      axis: filters.axis,
      expand: filters.expand,
    })

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
            ? [
                {
                  label: 'Plan settings',
                  href: '/admin/marketing/settings',
                  variant: 'secondary' as const,
                },
                REPORT_ACTION,
                STUDIO_ACTION,
                POSTS_ACTION,
              ]
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
        stats={clickableStats}
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
          <PlanFiltersBar
            view={plan.data}
            filters={filters}
            update={update}
            count={tasks.length}
            clear={clear}
          />
          {tasks.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-300 p-8 text-center dark:border-gray-700">
              <p className="text-gray-700 dark:text-gray-200">
                No tasks match these filters
              </p>
              <button
                type="button"
                onClick={clear}
                className="mt-3 text-sm font-medium text-brand-cloud-blue dark:text-blue-300"
              >
                Clear all filters
              </button>
            </div>
          ) : filters.view === 'list' ? (
            <PlanTaskList view={plan.data} tasks={tasks} />
          ) : (
            <MarketingPlanTimeline
              view={plan.data}
              tasks={tasks}
              axis={filters.axis}
              expanded={
                filters.expand === null
                  ? defaultExpanded(plan.data.campaigns, plan.data.today)
                  : new Set(filters.expand)
              }
              onExpandedChange={(ids) => update({ expand: [...ids] })}
            />
          )}
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
  const {
    overdue,
    waiting,
    done: complete,
  } = summarizeTaskFlags(view.tasks, {
    today: view.today,
    byId,
    viewerId: view.viewerId,
  })
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
