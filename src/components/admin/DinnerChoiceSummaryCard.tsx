'use client'

import { api } from '@/lib/trpc/client'

/** "Dinner: who is going how" on /admin/speakers/info (#1592, phase 5). */
export function DinnerChoiceSummaryCard() {
  const { data, isPending, isError } =
    api.conference.dinnerChoiceSummary.useQuery()

  return (
    <div className="rounded-lg border border-gray-200 p-4 text-sm dark:border-gray-700">
      <h2 className="font-medium text-gray-900 dark:text-white">
        Dinner: who is going how
      </h2>
      <p className="mt-1 text-gray-600 dark:text-gray-400">
        Confirmed speakers. The RSVP itself is on the speaker ticket.
      </p>
      {isPending ? (
        <p className="mt-2 text-gray-600 dark:text-gray-400">Loading…</p>
      ) : isError || !data ? (
        <p role="alert" className="mt-2 text-red-700 dark:text-red-400">
          Could not load the dinner choices.
        </p>
      ) : (
        <ul className="mt-2 space-y-1">
          {data.map((row) => (
            <li key={row.value ?? 'none'}>
              {row.speakers.length > 0 ? (
                <details>
                  <summary className="cursor-pointer">
                    {row.label}: {row.speakers.length}
                  </summary>
                  <ul className="mt-1 list-disc pl-8 text-gray-600 dark:text-gray-400">
                    {row.speakers.map((s, i) => (
                      <li key={i}>
                        {s.email ? (
                          <a
                            href={`mailto:${s.email}`}
                            className="text-brand-cloud-blue underline hover:no-underline dark:text-blue-400"
                          >
                            {s.name}
                          </a>
                        ) : (
                          s.name
                        )}
                      </li>
                    ))}
                  </ul>
                </details>
              ) : (
                <span className="pl-4">{row.label}: 0</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
