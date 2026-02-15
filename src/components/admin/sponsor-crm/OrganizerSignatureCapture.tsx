'use client'

import { useState, useEffect, useCallback, useSyncExternalStore } from 'react'
import { SignaturePadCanvas } from '@/components/sponsor/SignaturePadCanvas'
import { PencilSquareIcon, TrashIcon } from '@heroicons/react/24/outline'

const STORAGE_KEY_PREFIX = 'organizer-signature-'

function useLocalStorageSignature(storageKey: string) {
  const subscribe = useCallback(
    (callback: () => void) => {
      const handler = (e: StorageEvent) => {
        if (e.key === storageKey) callback()
      }
      window.addEventListener('storage', handler)
      return () => window.removeEventListener('storage', handler)
    },
    [storageKey],
  )

  const getSnapshot = useCallback(() => {
    try {
      return localStorage.getItem(storageKey)
    } catch {
      return null
    }
  }, [storageKey])

  const getServerSnapshot = useCallback(() => null, [])

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

interface OrganizerSignatureCaptureProps {
  organizerId: string
  organizerName: string
  onSignatureReady: (dataUrl: string | null) => void
  disabled?: boolean
}

export function OrganizerSignatureCapture({
  organizerId,
  organizerName,
  onSignatureReady,
  disabled = false,
}: OrganizerSignatureCaptureProps) {
  const storageKey = `${STORAGE_KEY_PREFIX}${organizerId}`
  const savedSignature = useLocalStorageSignature(storageKey)
  const [isDrawing, setIsDrawing] = useState(false)

  useEffect(() => {
    onSignatureReady(savedSignature)
  }, [savedSignature]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSignatureChange = useCallback(
    (dataUrl: string | null) => {
      if (dataUrl) {
        try {
          localStorage.setItem(storageKey, dataUrl)
        } catch {
          // localStorage full or unavailable
        }
        setIsDrawing(false)
        onSignatureReady(dataUrl)
      } else {
        onSignatureReady(null)
      }
    },
    [storageKey, onSignatureReady],
  )

  const handleClear = useCallback(() => {
    try {
      localStorage.removeItem(storageKey)
    } catch {
      // localStorage unavailable
    }
    setIsDrawing(false)
    onSignatureReady(null)
  }, [storageKey, onSignatureReady])

  if (disabled) {
    return savedSignature ? (
      <SavedSignaturePreview
        dataUrl={savedSignature}
        organizerName={organizerName}
      />
    ) : (
      <p className="text-xs text-gray-400 italic dark:text-gray-500">
        No counter-signature saved for {organizerName}.
      </p>
    )
  }

  if (savedSignature && !isDrawing) {
    return (
      <div className="space-y-2">
        <p className="text-xs font-medium text-gray-700 dark:text-gray-300">
          Counter-signature ({organizerName})
        </p>
        <SavedSignaturePreview
          dataUrl={savedSignature}
          organizerName={organizerName}
        />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setIsDrawing(true)}
            className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300"
          >
            <PencilSquareIcon className="h-3.5 w-3.5" />
            Redraw
          </button>
          <button
            type="button"
            onClick={handleClear}
            className="inline-flex items-center gap-1 text-xs font-medium text-red-600 hover:text-red-500 dark:text-red-400 dark:hover:text-red-300"
          >
            <TrashIcon className="h-3.5 w-3.5" />
            Remove
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-gray-700 dark:text-gray-300">
        Counter-signature ({organizerName})
      </p>
      <p className="text-xs text-gray-500 dark:text-gray-400">
        Your signature will be embedded in the contract PDF before it is sent.
        It is saved locally and never uploaded to the server.
      </p>
      <SignaturePadCanvas
        onSignatureChange={handleSignatureChange}
        height={150}
      />
      {savedSignature && (
        <button
          type="button"
          onClick={() => setIsDrawing(false)}
          className="text-xs font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
        >
          Cancel
        </button>
      )}
    </div>
  )
}

function SavedSignaturePreview({
  dataUrl,
  organizerName,
}: {
  dataUrl: string
  organizerName: string
}) {
  return (
    <div className="inline-flex flex-col items-start rounded-md border border-gray-200 bg-white p-2 dark:border-gray-700 dark:bg-gray-800">
      <img
        src={dataUrl}
        alt={`${organizerName}'s signature`}
        className="h-12 object-contain"
      />
      <span className="mt-0.5 text-[10px] text-gray-400 dark:text-gray-500">
        {organizerName}
      </span>
    </div>
  )
}
