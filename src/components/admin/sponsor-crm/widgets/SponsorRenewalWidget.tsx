'use client'

import { ArrowPathIcon } from '@heroicons/react/24/outline'
import { api } from '@/lib/trpc/client'

function recordUrl(id: string, domain: string | null) {
  return `${domain ? `https://${domain}` : ''}/admin/sponsors/${id}`
}

export interface SponsorRenewalActionProps {
  nextEdition: { title: string; domain: string | null } | null
  existingId: string | null
  isPending?: boolean
  error?: string
  onCopy: () => void
}

/** "Copy to next year" (R1, #1687), shown once the event has ended. */
export function SponsorRenewalAction({
  nextEdition,
  existingId,
  isPending,
  error,
  onCopy,
}: SponsorRenewalActionProps) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-800">
      <ArrowPathIcon className="h-5 w-5 text-gray-400" aria-hidden="true" />
      <p className="flex-1 text-sm text-gray-700 dark:text-gray-300">
        {!nextEdition
          ? "Create next year's conference first"
          : existingId
            ? `Already in the pipeline for ${nextEdition.title}`
            : `Add this sponsor as a prospect for ${nextEdition.title}`}
      </p>
      {nextEdition && existingId ? (
        <a
          href={recordUrl(existingId, nextEdition.domain)}
          className="text-sm font-semibold text-indigo-600 hover:text-indigo-500 dark:text-indigo-400"
        >
          Open next year&apos;s deal
        </a>
      ) : (
        <button
          type="button"
          onClick={onCopy}
          disabled={!nextEdition || isPending}
          className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? 'Copying…' : 'Copy to next year'}
        </button>
      )}
      {error && (
        <p role="alert" className="w-full text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  )
}

export function SponsorRenewalWidget({ sponsorId }: { sponsorId: string }) {
  const utils = api.useUtils()
  const { data } = api.sponsor.crm.renewal.useQuery({ id: sponsorId })
  const copy = api.sponsor.crm.copyToNextYear.useMutation({
    onSuccess: () => utils.sponsor.crm.renewal.invalidate({ id: sponsorId }),
  })
  if (!data?.eventEnded) return null
  return (
    <SponsorRenewalAction
      nextEdition={data.nextEdition}
      existingId={data.existingId}
      isPending={copy.isPending}
      error={copy.error?.message}
      onCopy={() => copy.mutate({ id: sponsorId })}
    />
  )
}
