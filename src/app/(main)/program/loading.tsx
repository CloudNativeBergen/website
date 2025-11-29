import { Container } from '@/components/Container'
import { BackgroundImage } from '@/components/BackgroundImage'

export default function ProgramLoading() {
  return (
    <div className="relative py-20 sm:pt-36 sm:pb-24">
      <BackgroundImage className="-top-40 -bottom-32" />
      <Container className="relative">
        <div className="animate-pulse">
          {/* Header */}
          <div className="mb-12 text-center">
            <div className="mx-auto mb-6 h-12 w-2/3 rounded bg-gray-200 dark:bg-gray-700" />
            <div className="mx-auto h-6 w-1/2 rounded bg-gray-200 dark:bg-gray-700" />
          </div>

          {/* Filters */}
          <div className="mb-8 flex flex-wrap gap-4">
            <div className="h-10 w-32 rounded-lg bg-gray-200 dark:bg-gray-700" />
            <div className="h-10 w-40 rounded-lg bg-gray-200 dark:bg-gray-700" />
            <div className="h-10 w-36 rounded-lg bg-gray-200 dark:bg-gray-700" />
          </div>

          {/* Schedule skeleton */}
          <div className="space-y-8">
            {[1, 2, 3].map((day) => (
              <div key={day} className="space-y-4">
                <div className="h-8 w-48 rounded bg-gray-200 dark:bg-gray-700" />
                <div className="space-y-3">
                  {[1, 2, 3, 4].map((slot) => (
                    <div
                      key={slot}
                      className="rounded-lg bg-white p-4 shadow dark:bg-gray-800"
                    >
                      <div className="h-6 w-3/4 rounded bg-gray-200 dark:bg-gray-700" />
                      <div className="mt-2 h-4 w-1/4 rounded bg-gray-200 dark:bg-gray-700" />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </Container>
    </div>
  )
}
