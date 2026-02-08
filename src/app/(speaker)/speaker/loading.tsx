import { Container } from '@/components/Container'

export default function CFPLoading() {
  return (
    <Container className="py-20">
      <div className="mx-auto max-w-4xl">
        <div className="animate-pulse space-y-8">
          {/* Header */}
          <div className="text-center">
            <div className="mx-auto mb-4 h-12 w-2/3 rounded bg-gray-200 dark:bg-gray-700" />
            <div className="mx-auto h-6 w-1/2 rounded bg-gray-200 dark:bg-gray-700" />
          </div>

          {/* Main content card */}
          <div className="rounded-lg bg-white p-8 shadow dark:bg-gray-800">
            <div className="space-y-6">
              <div className="h-8 w-1/3 rounded bg-gray-200 dark:bg-gray-700" />
              <div className="h-4 w-full rounded bg-gray-200 dark:bg-gray-700" />
              <div className="h-4 w-5/6 rounded bg-gray-200 dark:bg-gray-700" />
              <div className="h-4 w-4/5 rounded bg-gray-200 dark:bg-gray-700" />

              <div className="pt-4">
                <div className="h-10 w-full rounded-lg bg-gray-200 dark:bg-gray-700" />
              </div>
            </div>
          </div>

          {/* Proposals list */}
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="rounded-lg bg-white p-6 shadow dark:bg-gray-800"
              >
                <div className="h-6 w-3/4 rounded bg-gray-200 dark:bg-gray-700" />
                <div className="mt-3 h-4 w-1/4 rounded bg-gray-200 dark:bg-gray-700" />
                <div className="mt-4 space-y-2">
                  <div className="h-4 w-full rounded bg-gray-200 dark:bg-gray-700" />
                  <div className="h-4 w-5/6 rounded bg-gray-200 dark:bg-gray-700" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Container>
  )
}
