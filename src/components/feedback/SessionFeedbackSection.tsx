'use client'

import { useEffect, useRef, useState } from 'react'
import { Tab, TabGroup, TabList, TabPanel, TabPanels } from '@headlessui/react'
import { ChartBarIcon, QrCodeIcon } from '@heroicons/react/24/outline'
import { api } from '@/lib/trpc/client'
import { FeedbackCodePanel } from './FeedbackCodePanel'
import { SessionFeedbackResults } from './SessionFeedbackResults'
import { useWindowOnTheClock } from './useWindowOnTheClock'

const TAB_BASE =
  '-mb-px inline-flex items-center gap-1.5 border-b-2 px-1 pb-2 text-sm font-medium'
const SELECTED =
  'border-brand-cloud-blue text-brand-cloud-blue dark:border-blue-400 dark:text-blue-400'
// Literal class names: Tailwind only generates what it can read here.
const TAB = `${TAB_BASE} border-transparent text-gray-600 hover:border-gray-300 hover:text-gray-800 focus:outline-none data-focus:outline-2 data-focus:outline-offset-2 data-focus:outline-brand-cloud-blue data-selected:border-brand-cloud-blue data-selected:text-brand-cloud-blue dark:text-gray-400 dark:hover:border-gray-500 dark:hover:text-gray-200 dark:data-selected:border-blue-400 dark:data-selected:text-blue-400`

/** The section's anchor, which the dashboard chip links to (§9.4). */
export const SESSION_FEEDBACK_ANCHOR = 'session-feedback'

/**
 * The speaker's Session Feedback section (speaker feedback spec §9.1), shown
 * at the top of `/cfp/proposal/[id]` for a confirmed talk. Its code is minted
 * on mount by `sessionFeedback.ensureCode`, never during render.
 *
 * Two tabs, **Session Feedback** and **Feedback Code**; it opens on the code
 * until feedback is visible (§6), then on the results, and never switches
 * by itself after that: a speaker may be showing the QR on the lectern. A
 * talk the server gives no code (its window closed before it ever had one,
 * like every talk of an edition that ended before launch) shows the results
 * only (§9.5).
 */
export function SessionFeedbackSection({
  talkId,
  title,
}: {
  talkId: string
  /** The talk's title, for the print sheet and the download file names. */
  title: string
}) {
  const { mutate, data, error, isPending, isIdle } =
    api.sessionFeedback.ensureCode.useMutation()

  // Once per talk, also under Strict Mode's double effect run. A second call
  // would only return the same code, but costs a request.
  const requested = useRef<string | null>(null)
  useEffect(() => {
    if (requested.current === talkId) return
    requested.current = talkId
    mutate({ talkId })
  }, [mutate, talkId])

  const shownWindow = useWindowOnTheClock(data?.window)
  // Chosen by the speaker; until then the tab the answer opened on.
  const [chosenTab, setChosenTab] = useState<number | null>(null)

  if (error?.data?.code === 'NOT_FOUND') return null

  // A talk with no code: the results only, under a plain heading (§9.5).
  if (data && shownWindow && (!data.code || !data.url))
    return (
      <SectionShell>
        <SectionHeading />
        <SessionFeedbackResults talkId={talkId} window={shownWindow} />
      </SectionShell>
    )

  if (data?.code && data.url && shownWindow)
    return (
      <SectionShell>
        <TabGroup
          // Index 0 is the results. The server's answer fixes the opening tab.
          selectedIndex={chosenTab ?? (data.window.feedbackVisible ? 0 : 1)}
          onChange={setChosenTab}
        >
          <TabList className="mb-5 flex gap-6 border-b border-gray-200 dark:border-gray-700">
            <Tab className={TAB}>
              <ChartBarIcon className="size-4" aria-hidden="true" />
              Session Feedback
            </Tab>
            <Tab className={TAB}>
              <QrCodeIcon className="size-4" aria-hidden="true" />
              Feedback Code
            </Tab>
          </TabList>
          <TabPanels>
            {/* Both stay mounted: switching tabs never redraws the QR or
                drops the results already loaded. */}
            <TabPanel unmount={false} className="focus:outline-none">
              <SessionFeedbackResults talkId={talkId} window={shownWindow} />
            </TabPanel>
            <TabPanel unmount={false} className="focus:outline-none">
              <FeedbackCodePanel
                url={data.url}
                title={title}
                window={shownWindow}
              />
            </TabPanel>
          </TabPanels>
        </TabGroup>
      </SectionShell>
    )

  return (
    <SectionShell>
      <SectionHeading />
      {error ? (
        <div className="space-y-3">
          <p role="alert" className="text-sm text-red-700 dark:text-red-400">
            Your Session Feedback could not be loaded.
          </p>
          <button
            type="button"
            onClick={() => mutate({ talkId })}
            disabled={isPending}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
          >
            Try again
          </button>
        </div>
      ) : (
        (isPending || isIdle) && <FeedbackCodeSkeleton />
      )}
    </SectionShell>
  )
}

function SectionShell({ children }: { children: React.ReactNode }) {
  return (
    <section
      id={SESSION_FEEDBACK_ANCHOR}
      aria-label="Session Feedback"
      className="scroll-mt-6 rounded-lg border border-gray-200 bg-white p-4 shadow-sm sm:p-6 dark:border-gray-700 dark:bg-gray-800"
    >
      {children}
    </section>
  )
}

function SectionHeading() {
  return (
    <div className="mb-5 flex border-b border-gray-200 dark:border-gray-700">
      <h2 className={`${TAB_BASE} ${SELECTED}`}>
        <ChartBarIcon className="size-4" aria-hidden="true" />
        Session Feedback
      </h2>
    </div>
  )
}

function FeedbackCodeSkeleton() {
  const bar = 'animate-pulse rounded bg-gray-100 dark:bg-gray-700'
  // The panel's shape, laid out by the same container width, so the form
  // below does not jump when the code arrives.
  return (
    <div className="@container">
      <div
        role="status"
        className="flex flex-col gap-5 @md:flex-row @md:items-center"
      >
        <span className="sr-only">Loading your Feedback Code</span>
        <div className={`size-44 shrink-0 rounded-md ${bar}`} />
        <div className="w-full max-w-xl space-y-3">
          <div className={`h-5 w-3/4 ${bar}`} />
          <div className={`h-10 w-full ${bar}`} />
          <div className={`h-5 w-2/3 ${bar}`} />
          <div className={`h-8 w-28 ${bar}`} />
        </div>
      </div>
    </div>
  )
}
