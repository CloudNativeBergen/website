'use client'

import { useState } from 'react'
import { api } from '@/lib/trpc/client'

/**
 * Organizer tool for #249: mint a signed, time-limited link that lets a
 * speaker submit after the CFP has closed. Shown only once the CFP is closed.
 */
export function LateSubmissionLink() {
  const [email, setEmail] = useState('')
  const [days, setDays] = useState(3)
  const create = api.proposal.admin.createLateSubmissionLink.useMutation()

  return (
    <details className="mb-6 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
      <summary className="cursor-pointer text-sm font-medium text-gray-900 dark:text-white">
        Late submission link
      </summary>
      <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
        The CFP is closed. Create a link that lets a speaker submit anyway.
        Anyone with the link can use it until it expires, unless you bind it to
        an email. It cannot be revoked.
      </p>
      <form
        className="mt-3 flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          create.mutate({
            email: email.trim() || undefined,
            expiresInDays: days,
          })
        }}
      >
        <label className="text-sm text-gray-700 dark:text-gray-300">
          Speaker email (optional)
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 block rounded-md border-gray-300 text-sm dark:border-gray-600 dark:bg-gray-900"
          />
        </label>
        <label className="text-sm text-gray-700 dark:text-gray-300">
          Valid for (days)
          <input
            type="number"
            min={1}
            max={30}
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="mt-1 block w-24 rounded-md border-gray-300 text-sm dark:border-gray-600 dark:bg-gray-900"
          />
        </label>
        <button
          type="submit"
          disabled={create.isPending}
          className="rounded-md bg-brand-cloud-blue px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          Create link
        </button>
      </form>
      {create.error && (
        <p className="mt-2 text-sm text-red-600">{create.error.message}</p>
      )}
      {create.data && (
        <div className="mt-3 text-sm">
          <input
            readOnly
            aria-label="Late submission link"
            value={create.data.url}
            onFocus={(e) => e.target.select()}
            className="block w-full rounded-md border-gray-300 font-mono text-xs dark:border-gray-600 dark:bg-gray-900"
          />
          <p className="mt-1 text-gray-600 dark:text-gray-400">
            Expires {new Date(create.data.expiresAt).toLocaleString()}
          </p>
        </div>
      )}
    </details>
  )
}
