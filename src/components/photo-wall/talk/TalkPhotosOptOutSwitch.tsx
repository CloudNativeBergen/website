'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Checkbox, HelpText } from '@/components/Form'
import { api } from '@/lib/trpc/client'

/**
 * "Hide photos of my talks" (talk photos spec §7.4). Self: autosaves through
 * `speaker.setTalkPhotosOptOut`, which writes just that field, then refreshes
 * the page so the dashboard's hidden lines follow. Organizer (`onChange`):
 * reports `true` or `undefined` into the admin save, and once the opt-out is
 * stored it is locked, because only the speaker may clear it.
 */
export function TalkPhotosOptOutSwitch({
  stored,
  onChange,
}: {
  stored?: boolean
  /** Organizer mode: the value for the admin save, `undefined` for no change. */
  onChange?: (next: true | undefined) => void
}) {
  const router = useRouter()
  const [value, setValue] = useState(stored === true)
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>(
    'idle',
  )
  const mutation = api.speaker.setTalkPhotosOptOut.useMutation()
  const organizer = onChange !== undefined
  const locked = organizer && stored === true

  async function change(next: boolean) {
    setValue(next)
    if (organizer) {
      onChange(next ? true : undefined)
      return
    }
    setState('saving')
    try {
      await mutation.mutateAsync({ talkPhotosOptOut: next })
    } catch {
      // The stored value did not change, so neither does the box.
      setValue(!next)
      setState('error')
      return
    }
    setState('saved')
    router.refresh()
  }

  return (
    <Checkbox
      name="talk-photos-opt-out"
      label="Hide photos of my talks from public pages"
      value={value}
      setValue={change}
      disabled={locked || state === 'saving'}
    >
      <HelpText>
        Attendees can tag a Photo Wall photo with the talk it shows. Tick this
        box and photos of your talks are not shown on the program or on speaker
        pages. Photos of a talk you share with other speakers are hidden from
        their pages too. The photos stay on the Photo Wall; to have one removed,
        ask the organizers.
      </HelpText>
      {locked && (
        <HelpText>
          This speaker asked to hide photos of their talks. You can set this on
          someone&rsquo;s behalf, but only they can undo it.
        </HelpText>
      )}
      {!organizer && (
        <div role="status" aria-live="polite">
          {state === 'saving' && <HelpText>Saving…</HelpText>}
          {state === 'saved' && <HelpText>Saved.</HelpText>}
          {state === 'error' && (
            <HelpText>
              <span className="text-red-600 dark:text-red-400">
                Could not save that just now &mdash; nothing changed. Please try
                again.
              </span>
            </HelpText>
          )}
        </div>
      )}
    </Checkbox>
  )
}
