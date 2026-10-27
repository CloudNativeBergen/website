'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Checkbox, HelpText } from '@/components/Form'
import { api } from '@/lib/trpc/client'

/**
 * The speaker's own switch: autosaves through `speaker.setTalkPhotosOptOut`,
 * which writes just that field. `onSaved` runs after a committed save.
 */
export function SelfTalkPhotosOptOutSwitch({
  stored,
  onSaved,
}: {
  stored?: boolean
  onSaved?: () => void
}) {
  const mutation = api.speaker.setTalkPhotosOptOut.useMutation()
  return (
    <TalkPhotosOptOutSwitch
      stored={stored}
      save={async (next) => {
        await mutation.mutateAsync({ talkPhotosOptOut: next })
        onSaved?.()
      }}
    />
  )
}

/** On the dashboard: refresh after a save so the hidden lines follow. */
export function DashboardTalkPhotosOptOutSwitch({
  stored,
}: {
  stored?: boolean
}) {
  const router = useRouter()
  return (
    <SelfTalkPhotosOptOutSwitch
      stored={stored}
      onSaved={() => router.refresh()}
    />
  )
}

/**
 * "Hide photos of my talks" (talk photos spec §7.4). Self (`save`): autosaves.
 * Organizer (`onChange`): reports `true` or `undefined` into the admin save,
 * and once the opt-out is stored it is locked, because only the speaker may
 * clear it. No hooks of its own beyond state, so the admin modal pulls in no
 * mutation.
 */
export function TalkPhotosOptOutSwitch({
  stored,
  onChange,
  save,
}: {
  stored?: boolean
  /** Organizer mode: the value for the admin save, `undefined` for no change. */
  onChange?: (next: true | undefined) => void
  /** Self mode: persist the value; throws when nothing was saved. */
  save?: (next: boolean) => Promise<void>
}) {
  const [value, setValue] = useState(stored === true)
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>(
    'idle',
  )
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
      await save?.(next)
    } catch {
      // The stored value did not change, so neither does the box.
      setValue(!next)
      setState('error')
      return
    }
    setState('saved')
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
