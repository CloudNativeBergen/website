'use client'

import { useState } from 'react'
import { Button } from '@/components/Button'
import { api } from '@/lib/trpc/client'
import { ErasurePreview } from './ErasurePreview'

/** Search by email → preview → typed confirmation → erase → verification. */
export function PrivacyErasure() {
  const [input, setInput] = useState('')
  const [email, setEmail] = useState<string | null>(null)
  const preview = api.privacy.preview.useQuery(
    { email: email ?? '' },
    { enabled: email !== null, retry: false, refetchOnWindowFocus: false },
  )
  const erase = api.privacy.erase.useMutation()

  return (
    <div className="space-y-6">
      <form
        className="flex max-w-xl gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          erase.reset()
          setEmail(input.trim())
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
        <Button type="submit" size="sm">
          Preview
        </Button>
      </form>

      {preview.isFetching && <p className="text-sm">Checking…</p>}
      {preview.error && (
        <p role="alert" className="text-sm text-red-700">
          {preview.error.message}
        </p>
      )}
      {preview.data && !preview.isFetching && email && (
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
