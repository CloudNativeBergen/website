'use client'

import {
  useState,
  useEffect,
  useCallback,
  useRef,
  useSyncExternalStore,
} from 'react'
import { SignaturePadCanvas } from '@/components/sponsor/SignaturePadCanvas'
import {
  CheckIcon,
  PencilSquareIcon,
  TrashIcon,
} from '@heroicons/react/24/outline'

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
  /**
   * What this signature is called in the surrounding flow. Defaults to the
   * contract wording, which is where the component started; invitation letters
   * pass their own so the copy matches the document being signed.
   */
  label?: string
  /** Explains where the signature ends up. Defaults to the contract wording. */
  description?: string
}

export function OrganizerSignatureCapture({
  organizerId,
  organizerName,
  onSignatureReady,
  disabled = false,
  label = 'Counter-signature',
  description = 'Your signature will be embedded in the contract PDF before it is sent. It is saved locally and never uploaded to the server.',
}: OrganizerSignatureCaptureProps) {
  const storageKey = `${STORAGE_KEY_PREFIX}${organizerId}`
  const savedSignature = useLocalStorageSignature(storageKey)
  const [isDrawing, setIsDrawing] = useState(false)
  const pendingSignatureRef = useRef<string | null>(null)
  // Lifted out of SignaturePadCanvas: "Save for next time" has nothing to save
  // while the pad is blank, and used to just swallow the click.
  const [isPadEmpty, setIsPadEmpty] = useState(true)

  useEffect(() => {
    onSignatureReady(savedSignature)
  }, [savedSignature]) // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * What is on the pad is what gets signed.
   *
   * This used to hold the drawing back until "Done" was pressed, forwarding
   * only the cleared state. That silently dropped the signature of anyone who
   * drew it and went straight on to submit — the ink stayed on the pad, so the
   * document looked signed right up until the unsigned PDF came back. Publish
   * every stroke instead; "Done" is now only about remembering it for next
   * time.
   */
  const handleSignatureChange = useCallback(
    (dataUrl: string | null) => {
      pendingSignatureRef.current = dataUrl
      onSignatureReady(dataUrl)
    },
    [onSignatureReady],
  )

  const handleDone = useCallback(() => {
    const dataUrl = pendingSignatureRef.current
    // Belt and braces: the button is disabled while the pad is empty, so this
    // is now unreachable rather than the silent no-op it used to be.
    if (dataUrl) {
      try {
        localStorage.setItem(storageKey, dataUrl)
      } catch {
        // localStorage full or unavailable
      }
      setIsDrawing(false)
      onSignatureReady(dataUrl)
    }
  }, [storageKey, onSignatureReady])

  /** Abandoning a redraw must put the previously saved signature back. */
  const handleCancelRedraw = useCallback(() => {
    pendingSignatureRef.current = savedSignature
    setIsDrawing(false)
    onSignatureReady(savedSignature)
  }, [savedSignature, onSignatureReady])

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
        No {label.toLowerCase()} saved for {organizerName}.
      </p>
    )
  }

  if (savedSignature && !isDrawing) {
    return (
      <div className="space-y-2">
        <p className="text-xs font-medium text-gray-700 dark:text-gray-300">
          {label} ({organizerName})
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
        {label} ({organizerName})
      </p>
      <p className="text-xs text-gray-500 dark:text-gray-400">{description}</p>
      <SignaturePadCanvas
        onSignatureChange={handleSignatureChange}
        onEmptyChange={setIsPadEmpty}
        height={150}
      />
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleDone}
          disabled={isPadEmpty}
          className="inline-flex items-center gap-1 rounded bg-indigo-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500 dark:disabled:bg-gray-700 dark:disabled:text-gray-400"
        >
          <CheckIcon className="h-3.5 w-3.5" />
          Save for next time
        </button>
        {isPadEmpty && (
          <span className="text-xs text-gray-500 dark:text-gray-400">
            Draw a signature first
          </span>
        )}
        {savedSignature && (
          <button
            type="button"
            onClick={handleCancelRedraw}
            className="text-xs font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
          >
            Cancel
          </button>
        )}
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400">
        What you draw is used as soon as it is on the pad — saving only keeps it
        in this browser so you do not have to draw it again.
      </p>
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
