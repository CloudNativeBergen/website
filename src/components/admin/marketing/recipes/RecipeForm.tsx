'use client'

import { useRef, useState } from 'react'
import { DialogTitle } from '@headlessui/react'
import { ModalShell } from '@/components/ModalShell'
import { AdminButton } from '@/components/admin/AdminButton'
import {
  editIssues,
  entryCeilingNotes,
  libraryEntry,
  type RecipeEdits,
  COUNTDOWN_MAX_DAYS,
} from '@/lib/marketing/library'
import { MARKETING_CHANNEL_LABELS } from '@/lib/marketing/types'
import { MilestoneAnchorFields, NumberField } from '../anchor'
import {
  hasBlankSkeleton,
  patchChannel,
  toggleChannel,
  type LibraryEntryView,
} from './recipe-model'

const inputClass =
  'mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-xs dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100'
const labelClass = 'block text-sm font-medium text-gray-700 dark:text-gray-200'

/** The accepted `{placeholders}`, as chips beside the copy fields. */
function Placeholders({ names }: { names: string[] }) {
  return (
    <p className="flex flex-wrap gap-1">
      <span className="text-xs text-gray-500 dark:text-gray-400">
        Placeholders:
      </span>
      {names.map((name) => (
        <code
          key={name}
          className="rounded bg-gray-100 px-1 text-xs text-gray-700 dark:bg-gray-800 dark:text-gray-200"
        >
          {`{${name}}`}
        </code>
      ))}
    </p>
  )
}

/**
 * Attaching or editing one Library Recipe on a Campaign (Templates spec §5.2).
 * The entry fixes the event, the subject list and the Kinds; only what §5.2
 * allows is on this form. Self-contained: it owns its modal, and the container
 * shows either the Recipe list or this.
 */
export function RecipeForm({
  entry,
  initial,
  attached,
  pending = false,
  error,
  onSubmit,
  onCancel,
}: {
  entry: LibraryEntryView
  initial: RecipeEdits
  /** Editing an attached Recipe rather than attaching it. */
  attached: boolean
  pending?: boolean
  /** The server's refusal, with whatever way out the container offers. */
  error?: React.ReactNode
  onSubmit: (edits: RecipeEdits) => void
  onCancel: () => void
}) {
  const countdown = entry.id === 'countdown'
  const [edits, setEdits] = useState(initial)
  const parked = useRef<RecipeEdits['channels']>({})
  const issues = editIssues(libraryEntry(entry.id), edits)
  const notes = entryCeilingNotes(edits)
  const blocked = pending || issues.length > 0 || hasBlankSkeleton(edits)
  return (
    <ModalShell isOpen onClose={pending ? () => {} : onCancel} size="lg">
      <DialogTitle className="text-lg font-semibold text-gray-900 dark:text-white">
        {attached ? 'Edit Recipe' : 'Attach Recipe'}
      </DialogTitle>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
        {entry.description}
      </p>
      <form
        className="mt-4 space-y-4"
        onSubmit={(event) => {
          event.preventDefault()
          if (!blocked) onSubmit(edits)
        }}
      >
        <label className={labelClass}>
          Title
          <input
            className={inputClass}
            required
            maxLength={200}
            value={edits.title}
            onChange={(event) =>
              setEdits({ ...edits, title: event.target.value })
            }
          />
        </label>
        <fieldset className="space-y-3">
          <legend className={labelClass}>Channels</legend>
          {entry.channels.map((channel) => {
            const chosen = edits.channels[channel]
            const label = MARKETING_CHANNEL_LABELS[channel]
            return (
              <div
                key={channel}
                className="rounded-md border border-gray-200 p-3 dark:border-gray-700"
              >
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-200">
                  <input
                    type="checkbox"
                    checked={!!chosen}
                    onChange={(event) => {
                      // Switched off and on again, a Channel comes back with
                      // what was typed, not with the Library's copy over it.
                      if (chosen) parked.current[channel] = chosen
                      setEdits(
                        toggleChannel(edits, channel, event.target.checked, {
                          ...entry.defaults,
                          channels: {
                            ...entry.defaults.channels,
                            ...parked.current,
                          },
                        }),
                      )
                    }}
                  />
                  {label}
                </label>
                {chosen && (
                  <div className="mt-2 space-y-2">
                    <label className="block text-sm text-gray-700 dark:text-gray-200">
                      {label} copy
                      <textarea
                        className={inputClass}
                        rows={5}
                        required
                        maxLength={3000}
                        value={chosen.skeleton}
                        onChange={(event) =>
                          setEdits(
                            patchChannel(edits, channel, {
                              skeleton: event.target.value,
                            }),
                          )
                        }
                      />
                    </label>
                    {entry.recurring && (
                      <div className="text-gray-700 dark:text-gray-200">
                        <NumberField
                          label={`${label} posts per week`}
                          required
                          min={1}
                          max={countdown ? 7 : 21}
                          step={1}
                          value={chosen.perWeek ?? null}
                          onChange={(perWeek) =>
                            setEdits(
                              patchChannel(edits, channel, {
                                perWeek:
                                  perWeek === null
                                    ? undefined
                                    : Math.trunc(perWeek),
                              }),
                            )
                          }
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
          <Placeholders names={entry.placeholders} />
        </fieldset>
        {edits.window && countdown && (
          // The countdown counts the days to the conference, so its window is
          // set in days before it — there is no other Milestone to choose.
          <fieldset className="grid gap-3 text-gray-700 sm:grid-cols-2 dark:text-gray-200">
            <legend className={labelClass}>
              Window, in days before the conference
            </legend>
            {(
              [
                ['from', 'First post, days before'],
                ['to', 'Last post, days before'],
              ] as const
            ).map(([edge, label]) => (
              <NumberField
                key={edge}
                label={label}
                required
                min={1}
                max={COUNTDOWN_MAX_DAYS}
                step={1}
                value={-edits.window![edge].offsetDays}
                onChange={(days) =>
                  setEdits({
                    ...edits,
                    window: {
                      ...edits.window!,
                      [edge]: {
                        milestone: 'CONFERENCE_START',
                        offsetDays: -Math.trunc(days ?? 1),
                      },
                    },
                  })
                }
              />
            ))}
          </fieldset>
        )}
        {edits.window &&
          !countdown &&
          (['from', 'to'] as const).map((edge) => {
            const anchor = edits.window![edge]
            return (
              <fieldset
                key={edge}
                className="grid gap-3 text-gray-700 sm:grid-cols-2 dark:text-gray-200"
              >
                <legend className={`${labelClass} capitalize`}>{edge}</legend>
                <MilestoneAnchorFields
                  milestone={anchor.milestone}
                  offsetDays={anchor.offsetDays}
                  onMilestoneChange={(milestone) =>
                    setEdits({
                      ...edits,
                      window: {
                        ...edits.window!,
                        [edge]: { ...anchor, milestone },
                      },
                    })
                  }
                  onOffsetDaysChange={(offsetDays) =>
                    setEdits({
                      ...edits,
                      window: {
                        ...edits.window!,
                        [edge]: { ...anchor, offsetDays },
                      },
                    })
                  }
                />
              </fieldset>
            )
          })}
        {entry.hasImage && (
          <label className={labelClass}>
            Alt text
            <textarea
              className={inputClass}
              rows={2}
              maxLength={1000}
              required
              aria-required
              value={edits.alt ?? ''}
              onChange={(event) =>
                setEdits({ ...edits, alt: event.target.value })
              }
            />
          </label>
        )}
        <label className={labelClass}>
          Instructions
          <textarea
            className={inputClass}
            rows={2}
            maxLength={5000}
            value={edits.instructions ?? ''}
            onChange={(event) =>
              setEdits({ ...edits, instructions: event.target.value })
            }
            aria-describedby="recipe-instructions-note"
          />
          <span
            id="recipe-instructions-note"
            className="mt-1 block text-xs font-normal text-gray-500 dark:text-gray-400"
          >
            Shown on each Task exactly as written: placeholders are not filled
            in here.
          </span>
        </label>
        {/* ONE always-present live region. It always has content (the sentence
            below), so it is never hidden or empty: a region that arrives WITH
            its first message is skipped by most screen readers. Polite, not
            `alert`: issues stand while the organizer types, and an alert would
            be read out again on every keystroke. */}
        <div aria-live="polite" className="space-y-2">
          {issues.length > 0 && (
            <ul
              aria-label="What needs fixing before this can be saved"
              className="space-y-1 text-sm text-red-700 dark:text-red-300"
            >
              {issues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          )}
          {notes.length > 0 && (
            <ul className="space-y-1 text-sm text-amber-700 dark:text-amber-300">
              {notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          )}
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Changes apply to Tasks created from now on; existing Tasks are never
            rewritten.
            {attached && entry.id === 'countdown' && (
              <>
                {' '}
                The countdown&apos;s posts already exist, so an edit here
                changes none of them.
              </>
            )}
          </p>
        </div>
        {error && (
          <p role="alert" className="text-sm text-red-700 dark:text-red-300">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <AdminButton
            type="button"
            variant="secondary"
            disabled={pending}
            onClick={onCancel}
          >
            Cancel
          </AdminButton>
          <AdminButton type="submit" disabled={blocked}>
            {pending ? 'Saving…' : attached ? 'Save Recipe' : 'Attach Recipe'}
          </AdminButton>
        </div>
      </form>
    </ModalShell>
  )
}
