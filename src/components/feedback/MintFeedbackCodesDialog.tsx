'use client'

import Link from 'next/link'
import { DialogTitle } from '@headlessui/react'
import { QrCodeIcon } from '@heroicons/react/24/outline'
import { ModalShell } from '@/components/ModalShell'
import { api } from '@/lib/trpc/client'
import type { MintAllReport } from '@/lib/feedback/mint-all'

const SKIP_REASON: Record<MintAllReport['skipped'][number]['reason'], string> =
  {
    closed: 'Feedback window has closed',
    release: 'Waits in a scheduled release',
    changed: 'No longer a confirmed talk',
  }

const SECONDARY =
  'font-space-grotesk w-full justify-center rounded-xl border border-brand-frosted-steel px-4 py-3 text-sm font-semibold text-brand-slate-gray hover:bg-brand-sky-mist disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800'
const PRIMARY =
  'font-space-grotesk inline-flex w-full items-center justify-center rounded-xl bg-brand-cloud-blue px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-primary-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-cloud-blue disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto dark:bg-indigo-600 dark:hover:bg-indigo-500'

const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`

function TalkList({
  heading,
  talks,
}: {
  heading: string
  talks: { talkId: string; title: string; note?: string }[]
}) {
  if (talks.length === 0) return null
  return (
    <div>
      <h3 className="text-sm font-semibold text-brand-slate-gray dark:text-white">
        {heading}
      </h3>
      <ul className="mt-1 max-h-40 space-y-1 overflow-y-auto text-sm">
        {talks.map((t) => (
          <li key={t.talkId} className="min-w-0">
            <Link
              href={`/admin/proposals/${t.talkId}`}
              className="text-brand-cloud-blue hover:underline dark:text-indigo-400"
            >
              {t.title}
            </Link>
            {t.note && (
              <span className="text-brand-slate-gray/70 dark:text-gray-400">
                {' '}
                &middot; {t.note}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * Mint a Feedback Code for every confirmed talk that has none (#1459): asks
 * first with the count, then reports what it minted, skipped and failed.
 */
export function MintFeedbackCodesDialog({
  isOpen,
  onClose,
}: {
  isOpen: boolean
  onClose: () => void
}) {
  const utils = api.useUtils()
  const preview = api.sessionFeedback.mintPreview.useQuery(undefined, {
    enabled: isOpen,
  })
  const mintAll = api.sessionFeedback.mintAll.useMutation({
    onSettled: () => {
      void utils.sessionFeedback.mintPreview.invalidate()
      void utils.sessionFeedback.adminCode.invalidate()
    },
  })
  const report = mintAll.data

  // The batch keeps writing whether or not the dialog is open; closing it
  // mid-run would only hide the report.
  const close = () => {
    if (mintAll.isPending) return
    onClose()
  }

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={close}
      afterLeave={() => mintAll.reset()}
      size="md"
      className="border border-brand-frosted-steel bg-brand-glacier-white dark:border-gray-700"
    >
      <div className="flex">
        <div className="mx-auto flex size-12 shrink-0 items-center justify-center rounded-full bg-brand-sky-mist dark:bg-indigo-900/30">
          <QrCodeIcon
            className="size-6 text-brand-cloud-blue dark:text-indigo-400"
            aria-hidden="true"
          />
        </div>
      </div>
      <DialogTitle className="font-space-grotesk mt-4 text-center text-lg font-semibold text-brand-slate-gray dark:text-white">
        {report ? 'Feedback Codes minted' : 'Mint Feedback Codes'}
      </DialogTitle>

      <div
        className="font-inter mt-2 space-y-4 text-sm text-brand-slate-gray/80 dark:text-gray-400"
        aria-live="polite"
      >
        {report ? (
          <>
            <p className="text-center">
              Minted {plural(report.minted.length, 'code', 'codes')}.{' '}
              {plural(report.alreadyHad, 'talk', 'talks')} already had one.
            </p>
            <TalkList
              heading="Not minted"
              talks={report.skipped.map((t) => ({
                ...t,
                note: SKIP_REASON[t.reason],
              }))}
            />
            <TalkList heading="Failed" talks={report.failed} />
          </>
        ) : preview.data ? (
          <p className="text-center">
            {preview.data.withoutCode === 0
              ? `All ${plural(preview.data.confirmed, 'confirmed talk', 'confirmed talks')} already have a Feedback Code.`
              : `${preview.data.withoutCode} of ${plural(preview.data.confirmed, 'confirmed talk', 'confirmed talks')} have no Feedback Code yet. Mint one for each, so every room’s sheet can be printed. Talks with a code keep it.`}
          </p>
        ) : preview.error ? (
          <p
            role="alert"
            className="text-center text-red-700 dark:text-red-400"
          >
            The talks could not be counted.
          </p>
        ) : (
          <div
            role="status"
            aria-label="Counting talks"
            className="mx-auto h-10 w-3/4 animate-pulse rounded bg-brand-sky-mist dark:bg-gray-700"
          />
        )}
        {mintAll.error && (
          <p
            role="alert"
            className="text-center text-red-700 dark:text-red-400"
          >
            Minting stopped before it finished. Run it again to mint the rest.
          </p>
        )}
      </div>

      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end sm:gap-4">
        {report ? (
          <>
            <button type="button" onClick={close} className={SECONDARY}>
              Close
            </button>
            {report.failed.length > 0 && (
              <button
                type="button"
                onClick={() => mintAll.mutate()}
                disabled={mintAll.isPending}
                className={PRIMARY}
              >
                {mintAll.isPending ? 'Minting…' : 'Try the failed again'}
              </button>
            )}
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={close}
              disabled={mintAll.isPending}
              className={SECONDARY}
            >
              {preview.data?.withoutCode === 0 ? 'Close' : 'Cancel'}
            </button>
            {preview.data && preview.data.withoutCode > 0 && (
              <button
                type="button"
                onClick={() => mintAll.mutate()}
                disabled={mintAll.isPending}
                className={PRIMARY}
              >
                {mintAll.isPending
                  ? 'Minting…'
                  : `Mint ${plural(preview.data.withoutCode, 'code', 'codes')}`}
              </button>
            )}
          </>
        )}
      </div>
    </ModalShell>
  )
}
