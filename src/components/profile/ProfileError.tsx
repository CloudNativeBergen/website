import { ExclamationTriangleIcon } from '@heroicons/react/24/outline'

interface ProfileErrorProps {
  message: string
  onRetry?: () => void
}

export function ProfileError({ message, onRetry }: ProfileErrorProps) {
  return (
    <div className="flex min-h-[400px] items-center justify-center p-4">
      <div className="text-center">
        <ExclamationTriangleIcon className="mx-auto mb-4 h-12 w-12 text-red-500" />
        <h3 className="mb-2 text-lg font-medium text-gray-900">
          Error Loading Profile
        </h3>
        <p className="mb-4 text-gray-600">{message}</p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="inline-flex items-center rounded-md border border-transparent bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none"
          >
            Try Again
          </button>
        )}
      </div>
    </div>
  )
}
