import {
  SkeletonCard,
  SkeletonTable,
  SkeletonGrid,
  SkeletonProposalDetail,
} from './LoadingSkeleton'
import { TicketPageLoadingSkeleton } from './TicketPageLoadingSkeleton'

export { TicketPageLoadingSkeleton }

export function AdminPageLoading() {
  return (
    <div className="space-y-6">
      <div className="pb-6">
        <div className="animate-pulse">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded bg-gray-200 dark:bg-gray-700" />
            <div>
              <div className="h-8 w-64 rounded bg-gray-200 dark:bg-gray-700" />
              <div className="mt-2 h-4 w-96 rounded bg-gray-200 dark:bg-gray-700" />
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        <SkeletonCard rows={4} />
        <SkeletonCard rows={3} />
      </div>
    </div>
  )
}

export function AdminTablePageLoading() {
  return (
    <div className="space-y-6">
      <div className="pb-6">
        <div className="animate-pulse">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded bg-gray-200 dark:bg-gray-700" />
              <div>
                <div className="h-8 w-48 rounded bg-gray-200 dark:bg-gray-700" />
                <div className="mt-2 h-4 w-80 rounded bg-gray-200 dark:bg-gray-700" />
              </div>
            </div>
            <div className="h-10 w-32 rounded bg-gray-200 dark:bg-gray-700" />
          </div>
        </div>
      </div>

      <div className="mb-6">
        <SkeletonGrid items={4} columns={4} cardHeight="h-24" />
      </div>

      <div className="rounded-lg bg-white shadow dark:bg-gray-800">
        <div className="p-6">
          <SkeletonTable rows={8} columns={5} />
        </div>
      </div>
    </div>
  )
}

export function AdminDashboardLoading() {
  return (
    <div className="space-y-6">
      <div className="pb-6">
        <div className="animate-pulse">
          <div className="h-8 w-48 rounded bg-gray-200 dark:bg-gray-700" />
          <div className="mt-2 h-4 w-96 rounded bg-gray-200 dark:bg-gray-700" />
        </div>
      </div>

      <div className="mb-8">
        <SkeletonGrid items={6} columns={3} cardHeight="h-32" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SkeletonCard rows={5} />
        <SkeletonCard rows={5} />
      </div>
    </div>
  )
}

export function AdminFormPageLoading() {
  return (
    <div className="mx-auto max-w-4xl">
      <div className="pb-6">
        <div className="animate-pulse">
          <div className="h-8 w-64 rounded bg-gray-200 dark:bg-gray-700" />
          <div className="mt-2 h-4 w-80 rounded bg-gray-200 dark:bg-gray-700" />
        </div>
      </div>

      <div className="space-y-8">
        {[...Array(3)].map((_, i) => (
          <div
            key={i}
            className="rounded-lg bg-white p-6 shadow dark:bg-gray-800"
          >
            <div className="animate-pulse">
              <div className="mb-4 h-6 w-1/3 rounded bg-gray-200 dark:bg-gray-700" />
              <div className="space-y-4">
                {[...Array(3)].map((_, j) => (
                  <div key={j} className="space-y-2">
                    <div className="h-4 w-1/4 rounded bg-gray-200 dark:bg-gray-700" />
                    <div className="h-10 rounded bg-gray-200 dark:bg-gray-700" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function AdminDetailPageLoading() {
  return <SkeletonProposalDetail />
}

export function AdminScheduleLoading() {
  return (
    <div className="-mx-2 -my-8 sm:-mx-4 lg:-mx-8">
      <div className="flex h-[calc(100vh-5rem)]">
        {/* Sidebar skeleton */}
        <div className="w-64 shrink-0 border-r border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800">
          <div className="animate-pulse space-y-3 p-4">
            <div className="h-5 w-32 rounded bg-gray-200 dark:bg-gray-700" />
            {[...Array(6)].map((_, i) => (
              <div key={i} className="rounded-lg bg-white p-3 dark:bg-gray-700">
                <div className="h-4 w-3/4 rounded bg-gray-200 dark:bg-gray-600" />
                <div className="mt-2 h-3 w-1/2 rounded bg-gray-200 dark:bg-gray-600" />
              </div>
            ))}
          </div>
        </div>

        {/* Main area */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {/* Header toolbar */}
          <div className="shrink-0 border-b border-gray-200 bg-white px-4 py-2 dark:border-gray-700 dark:bg-gray-900">
            <div className="flex animate-pulse items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-8 w-24 rounded bg-gray-200 dark:bg-gray-700" />
                <div className="h-4 w-40 rounded bg-gray-200 dark:bg-gray-700" />
              </div>
              <div className="flex items-center gap-2">
                <div className="h-9 w-28 rounded-md bg-gray-200 dark:bg-gray-700" />
                <div className="h-9 w-20 rounded-md bg-gray-200 dark:bg-gray-700" />
              </div>
            </div>
          </div>

          {/* Track columns */}
          <div className="min-h-0 flex-1 overflow-hidden px-2 pt-4">
            <div className="flex h-full gap-4">
              {[...Array(3)].map((_, i) => (
                <div
                  key={i}
                  className="min-w-62.5 flex-1 animate-pulse space-y-2"
                >
                  <div className="h-8 w-full rounded bg-gray-200 dark:bg-gray-700" />
                  {[...Array(4 + i)].map((_, j) => (
                    <div
                      key={j}
                      className="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800"
                      style={{ height: `${60 + (j % 3) * 30}px` }}
                    >
                      <div className="h-4 w-3/4 rounded bg-gray-200 dark:bg-gray-700" />
                      <div className="mt-2 h-3 w-1/2 rounded bg-gray-200 dark:bg-gray-700" />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
