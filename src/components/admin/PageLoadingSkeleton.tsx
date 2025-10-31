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
    <div className="mx-auto max-w-7xl">
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
    <div className="mx-auto max-w-7xl">
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
    <div className="mx-auto max-w-7xl">
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
