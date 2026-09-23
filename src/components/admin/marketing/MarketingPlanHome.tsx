'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  CalendarDaysIcon,
  PresentationChartBarIcon,
  MegaphoneIcon,
  PaintBrushIcon,
  PhotoIcon,
  PlusIcon,
} from '@heroicons/react/24/outline'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { AdminButton } from '@/components/admin/AdminButton'
import { EmptyState } from '@/components/EmptyState'
import { api } from '@/lib/trpc/client'
import { MILESTONES } from '@/lib/marketing/milestones'
import type { PlanView } from '@/lib/marketing/types'
import { MarketingPlanTimeline } from './MarketingPlanTimeline'
import { CreatePlanDialog } from './CreatePlanDialog'
import { PlanOwnerControl } from './PlanOwnerControl'
import { defaultExpanded, tasksInAxisWindow } from './timeline-model'
import {
  filterTasks,
  sortTasks,
  reconcilePlanFilters,
  hasActivePlanFilters,
  NO_FILTERS,
  selectPlanFlag,
  summarizeTaskFlags,
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
const GALLERY_ACTION = {
  label: 'Gallery',
  href: '/admin/marketing/gallery',
  // The same glyph the admin registry gives the Gallery.
  icon: <PhotoIcon className="size-4" />,
  variant: 'secondary' as const,
}
const REPORT_ACTION = {
  label: 'Marketing report',
  href: '/admin/marketing/report',
  // The same glyph the admin registry gives the Marketing Report.
  icon: <PresentationChartBarIcon className="size-4" />,
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
 * Milestone timeline, or the create call-to-action before one exists. The
 * promo studio, the gallery and the posts table stay one click away in the
 * header.
 */
export function MarketingPlanHome({
  conferenceTitle,
}: {
  conferenceTitle: string
}) {
  const { filters: urlFilters, update } = usePlanFilters()
  const [creating, setCreating] = useState(false)
  const plan = api.marketing.plan.get.useQuery(undefined, {
    refetchOnWindowFocus: false,
  })

  // A bookmarked URL can name a Campaign or an organizer the plan no longer
  // has. Reconciling once the data is in keeps those filters from matching
  // nothing with no checkbox to clear.
  const filters = useMemo(
    () =>
      plan.data ? reconcilePlanFilters(urlFilters, plan.data) : urlFilters,
    [urlFilters, plan.data],
  )
  const stats = useMemo(() => summarize(plan.data ?? null), [plan.data])
  // The flag travels WITH the stat rather than being looked up from its
  // display copy: keying on the label meant rewording "Tasks done" silently
  // unwired the card from its filter, with no test to notice.
  const clickableStats = stats?.map(({ flag, ...stat }) =>
    flag
      ? {
          ...stat,
          onClick: () => update(selectPlanFlag(filters, flag)),
          pressed: filters.flag === flag,
        }
      : stat,
  )
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
                GALLERY_ACTION,
                POSTS_ACTION,
              ]
            : [
                {
                  label: 'Create plan',
                  onClick: () => setCreating(true),
                  icon: <PlusIcon className="size-4" />,
                  variant: 'primary' as const,
                },
                REPORT_ACTION,
                STUDIO_ACTION,
                GALLERY_ACTION,
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
            description="Start blank and build it yourself, seed a Template — the built-in one or one your organization saved — against this edition's milestones, or copy a previous edition's plan."
            action={
              <AdminButton color="brand" onClick={() => setCreating(true)}>
                <PlusIcon className="mr-1.5 size-4" />
                Create plan
              </AdminButton>
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
            /* A plan whose Tasks were all deleted is not a filtered-out plan:
               offering "Clear all filters" to someone who set none sends them
               looking for a control that would change nothing. */
            <div className="rounded-xl border border-dashed border-gray-300 p-8 text-center dark:border-gray-700">
              <p className="text-gray-700 dark:text-gray-200">
                {hasActivePlanFilters(filters)
                  ? 'No tasks match these filters'
                  : 'This plan has no tasks yet'}
              </p>
              {hasActivePlanFilters(filters) ? (
                <button
                  type="button"
                  onClick={clear}
                  className="mt-3 text-sm font-medium text-brand-cloud-blue dark:text-blue-300"
                >
                  Clear all filters
                </button>
              ) : (
                plan.data.campaigns.length === 0 && (
                  <Link
                    href="/admin/marketing/settings"
                    className="mt-3 inline-block text-sm font-medium text-brand-cloud-blue dark:text-blue-300"
                  >
                    Add the first Campaign in Plan settings
                  </Link>
                )
              )}
            </div>
          ) : filters.view === 'list' ? (
            <PlanTaskList view={plan.data} tasks={tasks} />
          ) : (
            <>
              {/* `today` is always an axis point, so a narrowed window never
                  draws an empty board — it draws one column with nothing in
                  it, while the filter bar still says "Showing 94 of 94". Say
                  which control is hiding the work, and offer the way out. */}
              {filters.axis !== 'plan' &&
                tasksInAxisWindow(plan.data, tasks, filters.axis) === 0 && (
                  <div className="rounded-lg border border-dashed border-gray-300 p-4 text-center text-sm dark:border-gray-700">
                    <p className="text-gray-700 dark:text-gray-200">
                      None of these {tasks.length} tasks fall in the selected
                      time window.
                    </p>
                    <button
                      type="button"
                      onClick={() => update({ axis: 'plan' })}
                      className="mt-2 font-medium text-brand-cloud-blue dark:text-blue-300"
                    >
                      Show the whole plan
                    </button>
                  </div>
                )}
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
            </>
          )}
        </>
      )}

      <CreatePlanDialog isOpen={creating} onClose={() => setCreating(false)} />
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
      flag: 'done' as const,
    },
    {
      value: overdue,
      label: 'Overdue',
      color: overdue ? ('red' as const) : ('slate' as const),
      flag: 'overdue' as const,
    },
    {
      value: waiting,
      label: 'Waiting',
      color: 'slate' as const,
      flag: 'waiting' as const,
    },
    {
      value: provisional,
      label: 'Provisional milestones',
      color: provisional ? ('yellow' as const) : ('slate' as const),
    },
  ]
}
