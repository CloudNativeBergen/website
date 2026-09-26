'use client'

import { useId } from 'react'
import {
  MARKETING_ASSET_MAX_TAGS,
  MARKETING_ASSET_MAX_TAG_LENGTH,
  normalizeTags,
  type MarketingAssetDetails,
  type MarketingAssetRow,
  type MarketingAssetEditionChoice,
  type MarketingAssetSubject,
} from '@/lib/marketing-asset'
import { SubjectCombobox } from './SubjectCombobox'

export const LABEL =
  'block text-sm font-medium text-gray-900 dark:text-gray-100'
export const HINT = 'mt-1 text-xs text-gray-500 dark:text-gray-400'
export const INPUT =
  'mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-xs focus:border-brand-cloud-blue focus:outline-none focus:ring-1 focus:ring-brand-cloud-blue dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100'

/** This edition, as the request host names it. */
export interface CurrentEdition {
  _id: string
  title: string
}

/** The edition an existing asset is marked with, as it was opened. */
export interface OriginalMark {
  conferenceId: string
  title: string
}

/** The describing fields while they are being edited. */
export interface DetailsDraft {
  edition: MarketingAssetEditionChoice
  subject: MarketingAssetSubject | null
  /** As typed: comma-separated. */
  tags: string
  credit: string
}

export const EMPTY_DRAFT: DetailsDraft = {
  edition: 'none',
  subject: null,
  tags: '',
  credit: '',
}

/** An existing asset's details; its edition mark is kept unless changed. */
export function draftFromRow(row: MarketingAssetRow): DetailsDraft {
  return {
    edition: row.scope === 'edition' && row.conferenceId ? 'keep' : 'none',
    subject: row.subject,
    tags: row.tags.join(', '),
    credit: row.credit ?? '',
  }
}

export function originalMark(row: MarketingAssetRow): OriginalMark | null {
  return row.scope === 'edition' && row.conferenceId
    ? { conferenceId: row.conferenceId, title: row.edition ?? 'Its edition' }
    : null
}

export function parseTags(typed: string): string[] {
  return normalizeTags(typed.split(','))
}

export function detailsFromDraft(
  title: string,
  alt: string,
  draft: DetailsDraft,
): MarketingAssetDetails {
  return {
    title: title.trim(),
    // Empty only for an audio track, which has none.
    alt: alt.trim() || undefined,
    edition: draft.edition,
    subject: draft.subject
      ? { type: draft.subject._type, id: draft.subject._id }
      : null,
    tags: parseTags(draft.tags),
    ...(draft.credit.trim() ? { credit: draft.credit.trim() } : {}),
  }
}

/** Why a draft cannot be saved yet, or null. */
export function draftIssue(draft: DetailsDraft): string | null {
  const tags = parseTags(draft.tags)
  if (tags.length > MARKETING_ASSET_MAX_TAGS)
    return `At most ${MARKETING_ASSET_MAX_TAGS} tags.`
  if (tags.some((tag) => tag.length > MARKETING_ASSET_MAX_TAG_LENGTH))
    return `A tag can be at most ${MARKETING_ASSET_MAX_TAG_LENGTH} characters.`
  return null
}

/**
 * Scope and edition mark, subject, tags and credit (spec §3), shared by the
 * upload form and the edit dialog.
 */
export function AssetDetailsFields({
  draft,
  onChange,
  edition,
  original = null,
  disabled = false,
  kind = 'image',
}: {
  draft: DetailsDraft
  onChange: (draft: DetailsDraft) => void
  /** This edition; null while it loads. */
  edition: CurrentEdition | null
  /**
   * The mark an existing asset was opened with. Offered as it is, however the
   * draft changes, so opening the dialog never re-marks an asset by itself
   * and the organizer can always go back to it.
   */
  original?: OriginalMark | null
  disabled?: boolean
  /** What the fields describe, for their hints: an image or an audio track. */
  kind?: 'image' | 'audio'
}) {
  const id = useId()
  const set = (change: Partial<DetailsDraft>) =>
    onChange({ ...draft, ...change })
  const originalIsCurrent = original?.conferenceId === edition?._id
  const radio = (
    value: MarketingAssetEditionChoice,
    label: string,
    hint: string,
    pick: () => void,
  ) => (
    <label className="flex cursor-pointer items-start gap-2 rounded-md border border-gray-200 p-2.5 text-sm has-[:checked]:border-brand-cloud-blue has-[:checked]:bg-blue-50 dark:border-gray-700 dark:has-[:checked]:border-blue-400 dark:has-[:checked]:bg-blue-950/40">
      <input
        type="radio"
        name={`${id}-scope`}
        value={value}
        checked={draft.edition === value}
        onChange={pick}
        disabled={disabled}
        className="mt-0.5 size-4 text-brand-cloud-blue focus:ring-brand-cloud-blue"
      />
      <span className="min-w-0">
        <span className="block font-medium break-words text-gray-900 dark:text-gray-100">
          {label}
        </span>
        <span className="block text-xs text-gray-500 dark:text-gray-400">
          {hint}
        </span>
      </span>
    </label>
  )

  return (
    <div className="space-y-4">
      <fieldset>
        <legend className={LABEL}>Belongs to</legend>
        <div className="mt-1 grid gap-2 sm:grid-cols-2">
          {radio(
            'none',
            'The whole organization',
            'Shown for every edition, like the logo.',
            () => set({ edition: 'none' }),
          )}
          {original &&
            radio(
              'keep',
              original.title,
              originalIsCurrent
                ? 'This edition only, like its speaker cards.'
                : 'The edition it is marked with now.',
              () => set({ edition: 'keep' }),
            )}
          {edition &&
            !originalIsCurrent &&
            radio(
              'current',
              edition.title,
              'This edition only, like its speaker cards.',
              () => set({ edition: 'current' }),
            )}
        </div>
      </fieldset>
      <div>
        <label htmlFor={`${id}-subject`} className={LABEL}>
          Subject <span className="font-normal text-gray-500">(optional)</span>
        </label>
        <SubjectCombobox
          id={`${id}-subject`}
          value={draft.subject}
          onChange={(subject) => set({ subject })}
          disabled={disabled}
          describedBy={`${id}-subject-hint`}
        />
        <p id={`${id}-subject-hint`} className={HINT}>
          {kind === 'audio'
            ? 'Who or what the track is for, such as a talk or a sponsor.'
            : 'Who the image is about. An image with no subject cannot be found when a speaker asks to be erased.'}
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={`${id}-tags`} className={LABEL}>
            Tags <span className="font-normal text-gray-500">(optional)</span>
          </label>
          <input
            id={`${id}-tags`}
            value={draft.tags}
            readOnly={disabled}
            onChange={(event) => set({ tags: event.target.value })}
            placeholder={kind === 'audio' ? 'music, intro' : 'brand, logo'}
            aria-describedby={`${id}-tags-hint`}
            className={INPUT}
          />
          <p id={`${id}-tags-hint`} className={HINT}>
            Separate with commas.
          </p>
        </div>
        <div>
          <label htmlFor={`${id}-credit`} className={LABEL}>
            Credit <span className="font-normal text-gray-500">(optional)</span>
          </label>
          <input
            id={`${id}-credit`}
            value={draft.credit}
            maxLength={200}
            readOnly={disabled}
            onChange={(event) => set({ credit: event.target.value })}
            aria-describedby={`${id}-credit-hint`}
            className={INPUT}
          />
          <p id={`${id}-credit-hint`} className={HINT}>
            Who made it.
          </p>
        </div>
      </div>
    </div>
  )
}
