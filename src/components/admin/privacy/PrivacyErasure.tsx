'use client'

import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Button } from '@/components/Button'
import { api } from '@/lib/trpc/client'
import type { OrgErasureResult } from '@/lib/privacy/org-erasure'
import { ErasurePreview } from './ErasurePreview'

async function postErase(body: {
  email: string
  confirmEmail: string
}): Promise<OrgErasureResult> {
  const response = await fetch('/api/admin/privacy/erase', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error ?? 'Erasure failed')
  return data as OrgErasureResult
}

/**
 * Search by email → preview → typed confirmation → erase → verification.
 * Both steps POST, so the address never goes in a URL.
 */
export function PrivacyErasure() {
  const [input, setInput] = useState('')
  const preview = api.privacy.preview.useMutation()
  const erase = useMutation({ mutationFn: postErase })
  const email = preview.variables?.email

  return (
    <div className="space-y-6">
      <form
        className="flex max-w-xl gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          erase.reset()
          preview.mutate({ email: input.trim() })
        }}
      >
        <label htmlFor="erasure-email" className="sr-only">
          Email address
        </label>
        <input
          id="erasure-email"
          type="email"
          required
          placeholder="person@example.com"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800"
        />
        <Button type="submit" size="sm" disabled={preview.isPending}>
          Preview
        </Button>
      </form>

      {preview.isPending && <p className="text-sm">Checking…</p>}
      {preview.error && (
        <p role="alert" className="text-sm text-red-700">
          {preview.error.message}
        </p>
      )}
      {preview.data && !preview.isPending && email && (
        <ErasurePreview
          preview={preview.data}
          isErasing={erase.isPending}
          result={erase.data ?? null}
          error={erase.error?.message ?? null}
          onErase={(confirmEmail) => erase.mutate({ email, confirmEmail })}
        />
      )}
    </div>
  )
}
