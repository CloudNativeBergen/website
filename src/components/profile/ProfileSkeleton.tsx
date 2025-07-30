export function ProfileSkeleton() {
  return (
    <div className="animate-pulse space-y-8">
      {/* Header Skeleton */}
      <div className="rounded-lg bg-white p-6 shadow">
        <div className="mb-4 flex items-center justify-between">
          <div className="h-8 w-48 rounded bg-gray-200"></div>
          <div className="h-10 w-32 rounded bg-gray-200"></div>
        </div>
        <div className="h-4 w-64 rounded bg-gray-200"></div>
      </div>

      {/* Profile Form Skeleton */}
      <div className="rounded-lg bg-white p-6 shadow">
        <div className="mb-6 h-6 w-32 rounded bg-gray-200"></div>
        <div className="space-y-4">
          <div>
            <div className="mb-2 h-4 w-16 rounded bg-gray-200"></div>
            <div className="h-10 w-full rounded bg-gray-200"></div>
          </div>
          <div>
            <div className="mb-2 h-4 w-16 rounded bg-gray-200"></div>
            <div className="h-10 w-full rounded bg-gray-200"></div>
          </div>
          <div>
            <div className="mb-2 h-4 w-16 rounded bg-gray-200"></div>
            <div className="h-32 w-full rounded bg-gray-200"></div>
          </div>
        </div>
      </div>

      {/* Image Upload Skeleton */}
      <div className="rounded-lg bg-white p-6 shadow">
        <div className="mb-6 h-6 w-40 rounded bg-gray-200"></div>
        <div className="flex items-center space-x-4">
          <div className="h-24 w-24 rounded-full bg-gray-200"></div>
          <div className="h-10 w-32 rounded bg-gray-200"></div>
        </div>
      </div>

      {/* Links Manager Skeleton */}
      <div className="rounded-lg bg-white p-6 shadow">
        <div className="mb-6 h-6 w-36 rounded bg-gray-200"></div>
        <div className="space-y-3">
          <div className="h-10 w-full rounded bg-gray-200"></div>
          <div className="h-10 w-full rounded bg-gray-200"></div>
        </div>
      </div>
    </div>
  )
}
