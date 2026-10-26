'use client'

import { useState, useSyncExternalStore } from 'react'
import { XMarkIcon } from '@heroicons/react/24/outline'

const STORAGE_KEY = 'dismissed-announcement'

/**
 * A banner the viewer can close. It stays closed in this browser until
 * `version` changes, so a new announcement always shows. It renders open on
 * the server and closes after mount, so a viewer without storage never loses it.
 */
export function DismissibleBanner({
  version,
  className,
  children,
}: {
  version: string
  className: string
  children: React.ReactNode
}) {
  // Closed in this visit; storage only says whether it was closed before.
  const [closedNow, setClosedNow] = useState(false)
  const closedBefore = useSyncExternalStore(
    noSubscribe,
    () => readDismissed() === version,
    () => false,
  )
  const dismissed = closedNow || closedBefore

  if (dismissed) return null

  return (
    <div className={`relative ${className}`}>
      {children}
      <button
        type="button"
        onClick={() => {
          setClosedNow(true)
          try {
            localStorage.setItem(STORAGE_KEY, version)
          } catch {}
        }}
        className="absolute top-2 right-2 rounded-md p-1 text-brand-slate-gray hover:bg-black/5 focus-visible:outline-2 focus-visible:outline-brand-cloud-blue dark:text-white dark:hover:bg-white/10"
        aria-label="Hide announcement"
      >
        <XMarkIcon className="h-5 w-5" aria-hidden="true" />
      </button>
    </div>
  )
}

const noSubscribe = () => () => {}

function readDismissed(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}
