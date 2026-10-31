'use client'

import { useState } from 'react'
import { Button } from '@/components/Button'
import type {
  OrgErasurePreview,
  OrgErasureResult,
} from '@/lib/privacy/org-erasure'

interface ErasurePreviewProps {
  preview: OrgErasurePreview
  onErase: (confirmEmail: string) => void
  isErasing?: boolean
  result?: OrgErasureResult | null
  error?: string | null
}

/**
 * What an erasure would do, the typed-email confirmation and the verification
 * that follows. Presentational: the page wires it to `privacy.preview` and
 * `privacy.erase`.
 */
export function ErasurePreview({
  preview,
  onErase,
  isErasing = false,
  result,
  error,
}: ErasurePreviewProps) {
  const [confirm, setConfirm] = useState('')
  const matches = confirm.trim().toLowerCase() === preview.email
  const blocked = preview.refusals.length > 0 || preview.nothingFound

  if (result) {
    return (
      <section
        aria-label="Verification"
        className="space-y-2 rounded-lg border border-gray-200 p-4 dark:border-gray-700"
      >
        <h2 className="text-lg font-semibold">
          Verification: {result.clean ? 'CLEAN' : 'RESIDUAL DATA FOUND'}
        </h2>
        <ul className="font-mono text-sm">
          {result.verification.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        {!result.clean && (
          <p className="text-sm text-red-700 dark:text-red-400">
            Something is left. Run the preview again, or ask the platform
            operator to use the CLI.
          </p>
        )}
      </section>
    )
  }

  return (
    <div className="space-y-4">
      {preview.nothingFound && (
        <p className="text-sm">
          Nothing for {preview.email} at this organization.
        </p>
      )}

      {preview.groups.map((group) => (
        <section
          key={group.kind}
          aria-label={group.title}
          className="rounded-lg border border-gray-200 p-4 dark:border-gray-700"
        >
          <h3 className="font-semibold">
            {group.title} ({group.items.length}) —{' '}
            {group.action === 'erase' ? 'erased' : 'kept'}
          </h3>
          {group.note && (
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
              {group.note}
            </p>
          )}
          <ul className="mt-2 space-y-1 text-sm">
            {group.items.map((item) => (
              <li key={item.id + item.label}>
                {item.label}{' '}
                <span className="font-mono text-xs text-gray-500">
                  {item.id}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {preview.remains.length > 0 && (
        <section aria-label="What remains">
          <h3 className="font-semibold">What remains</h3>
          <ul className="mt-1 list-disc pl-5 text-sm">
            {preview.remains.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>
      )}

      {preview.refusals.length > 0 && (
        <section
          aria-label="Cannot erase here"
          className="rounded-lg bg-red-50 p-4 text-sm text-red-800 dark:bg-red-900/30 dark:text-red-200"
        >
          <h3 className="font-semibold">Cannot erase from this page</h3>
          <ul className="mt-1 list-disc pl-5">
            {preview.refusals.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>
      )}

      {!blocked && (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (matches) onErase(confirm)
          }}
        >
          <label htmlFor="erasure-confirm" className="block text-sm">
            This cannot be undone. Type <strong>{preview.email}</strong> to
            confirm.
          </label>
          <input
            id="erasure-confirm"
            type="email"
            autoComplete="off"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="block w-full max-w-md rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800"
          />
          {error && (
            <p role="alert" className="text-sm text-red-700 dark:text-red-400">
              {error}
            </p>
          )}
          <Button
            type="submit"
            variant="warning"
            size="sm"
            disabled={!matches || isErasing}
          >
            {isErasing ? 'Erasing…' : 'Erase'}
          </Button>
        </form>
      )}
    </div>
  )
}
