import { Container } from '@/components/Container'
import { BackgroundImage } from '@/components/BackgroundImage'

export default function SpeakersLoading() {
  return (
    <div className="relative py-20 sm:pt-36 sm:pb-24">
      <BackgroundImage className="-top-36 -bottom-14" />
      <Container className="relative">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          {/* Header */}
          <div className="mx-auto max-w-2xl lg:mx-0">
            <div className="mb-6 h-10 w-2/3 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
            <div className="h-6 w-full animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
            <div className="mt-2 h-6 w-4/5 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
          </div>

          {/* Speaker grid */}
          <div className="mx-auto mt-20 grid max-w-2xl auto-rows-fr grid-cols-1 gap-6 md:grid-cols-2 lg:mx-0 lg:max-w-none lg:grid-cols-3">
            {[...Array(9)].map((_, i) => (
              <div
                key={i}
                className="animate-pulse rounded-lg bg-white p-6 shadow dark:bg-gray-800"
              >
                <div className="flex items-start gap-4">
                  <div className="size-16 shrink-0 rounded-full bg-gray-200 dark:bg-gray-700" />
                  <div className="flex-1 space-y-3">
                    <div className="h-6 w-3/4 rounded bg-gray-200 dark:bg-gray-700" />
                    <div className="h-4 w-1/2 rounded bg-gray-200 dark:bg-gray-700" />
                    <div className="h-4 w-full rounded bg-gray-200 dark:bg-gray-700" />
                    <div className="h-4 w-2/3 rounded bg-gray-200 dark:bg-gray-700" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Container>
    </div>
  )
}
