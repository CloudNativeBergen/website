'use client'

import { useState } from 'react'
import { MILESTONES, type Milestone } from '@/lib/marketing/milestones'
import { MILESTONE_LABELS } from '../timeline-model'

const inputClass =
  'mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-white'

/**
 * A Milestone plus a signed offset in days — the anchor a Campaign window edge
 * and a manual Task share. Renders the two fields only; the parent owns the
 * grid and the legend.
 */
export function MilestoneAnchorFields({
  milestone,
  offsetDays,
  onMilestoneChange,
  onOffsetDaysChange,
}: {
  milestone: Milestone
  offsetDays: number
  onMilestoneChange: (milestone: Milestone) => void
  onOffsetDaysChange: (offsetDays: number) => void
}) {
  return (
    <>
      <label className="block text-sm">
        Milestone
        <select
          className={inputClass}
          value={milestone}
          onChange={(event) =>
            onMilestoneChange(event.target.value as Milestone)
          }
        >
          {MILESTONES.map((value) => (
            <option key={value} value={value}>
              {MILESTONE_LABELS[value]}
            </option>
          ))}
        </select>
      </label>
      <NumberField
        label="Days from Milestone"
        required
        min={-365}
        max={365}
        step={1}
        value={offsetDays}
        onChange={(days) => onOffsetDaysChange(days ?? 0)}
      />
    </>
  )
}

/**
 * A controlled number input that can actually be typed into.
 *
 * `<input type="number">` reports an EMPTY string while its value is a partial
 * number, so a plain `Number(event.target.value)` turns the first `-` into 0
 * (or NaN) and the field fights back. Campaign offsets are usually negative —
 * "14 days BEFORE the Milestone" — so that made the common case untypeable.
 * Keeping the raw draft here lets the intermediate states exist; the numeric
 * value only travels up when it parses.
 */
export function NumberField({
  label,
  value,
  onChange,
  allowEmpty = false,
  ...rest
}: {
  label: string
  value: number | null
  onChange: (value: number | null) => void
  allowEmpty?: boolean
} & Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'value' | 'onChange' | 'type'
>) {
  const [draft, setDraft] = useState<string | null>(null)
  const shown = draft ?? (value === null ? '' : String(value))
  return (
    <label className="block text-sm">
      {label}
      <input
        {...rest}
        className={inputClass}
        type="number"
        value={shown}
        onChange={(event) => {
          const raw = event.target.value
          setDraft(raw)
          if (raw === '') {
            if (allowEmpty) onChange(null)
            return
          }
          const parsed = Number(raw)
          if (Number.isFinite(parsed)) onChange(parsed)
        }}
        onBlur={() => setDraft(null)}
      />
    </label>
  )
}
