'use client'

import { useRef, useState } from 'react'
import { api } from '@/lib/trpc/client'
import type { SpeakerInfoRoute } from '@/lib/conference/types'
import { dinnerChoiceOptions } from '@/lib/speaker/dinnerChoice'

/**
 * "How are you getting there?" (#1592, phase 5). Saves on change. `choice` is
 * the stored choice already checked against the current routes, so a removed
 * route arrives as `null` and the speaker is asked again.
 */
export function DinnerRouteChoice({
  routes,
  choice,
}: {
  routes: SpeakerInfoRoute[]
  choice: string | null
}) {
  const [value, setValue] = useState(choice)
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>(
    choice ? 'saved' : 'idle',
  )
  const { mutateAsync } = api.speaker.setDinnerChoice.useMutation()
  // One save at a time; changes made meanwhile collapse to the latest value,
  // so arrowing through the radios sends only where the speaker stops.
  const saved = useRef(choice)
  const inFlight = useRef(false)
  const queued = useRef<string | null>(null)

  const send = async (next: string) => {
    inFlight.current = true
    setStatus('saving')
    let ok = true
    try {
      await mutateAsync({ choice: next })
      saved.current = next
    } catch {
      ok = false
    }
    inFlight.current = false
    const latest = queued.current
    queued.current = null
    if (latest && latest !== next) return send(latest)
    if (ok) {
      setStatus('saved')
    } else {
      setValue(saved.current)
      setStatus('error')
    }
  }

  const onChange = (next: string) => {
    setValue(next)
    if (inFlight.current) queued.current = next
    else void send(next)
  }

  return (
    <fieldset className="mt-3" aria-busy={status === 'saving'}>
      <legend className="font-medium">How are you getting there?</legend>
      <div className="mt-1 space-y-1">
        {dinnerChoiceOptions(routes).map((o) => (
          <label key={o.value} className="flex items-center gap-2">
            <input
              type="radio"
              name="dinner-route"
              value={o.value}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
            />
            {o.label}
          </label>
        ))}
      </div>
      <p role="status" aria-live="polite" className="mt-1 text-sm">
        {status === 'saving'
          ? 'Saving…'
          : status === 'saved'
            ? 'Saved.'
            : status === 'idle'
              ? 'Not answered yet.'
              : ''}
      </p>
      {status === 'error' && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          Your choice was not saved. Try again.
        </p>
      )}
    </fieldset>
  )
}
