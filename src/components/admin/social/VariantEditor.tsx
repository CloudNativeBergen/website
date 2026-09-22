'use client'

import { useId, useMemo, useState } from 'react'
import clsx from 'clsx'
import { AdminButton } from '@/components/admin/AdminButton'
import { richTextImageUrl } from '@/lib/homepage/richTextImage'
import type {
  LinkPlacement,
  PlatformConstraints,
} from '@/lib/social/provider/types'
import { renditionRect } from '@/lib/social/rendition'
import {
  SOCIAL_PLATFORM_LABELS,
  type SocialPlatform,
  type SocialPostAttachment,
} from '@/lib/social/types'
import { formatDateTimeSafe } from '@/lib/time'
import { AttachmentSlot, type AttachmentSlotProps } from './AttachmentSlot'
import { CroppedImage } from './CroppedImage'
import {
  validateEditorValue,
  type VariantEditorValue,
} from './variant-editor-model'

export interface VariantEditorProps {
  platform: SocialPlatform
  /** The platform's rules; `null` when no adapter describes it yet. */
  constraints: PlatformConstraints | null
  /** The conference's own domains, for the rules that depend on them. */
  conferenceDomains?: readonly string[]
  postAttachments: SocialPostAttachment[]
  /** ISO instant the variant follows when timing is `default`. */
  postDefaultScheduledAt: string | null
  value: VariantEditorValue
  onChange: (value: VariantEditorValue) => void
  onSave: () => void
  onCancel?: () => void
  saving?: boolean
  /** A server-side refusal (validation, conflict) to show above the actions. */
  error?: string | null
  /** Source image URL; defaults to the CDN. Stories inject data URIs. */
  imageSrc?: (asset: SocialPostAttachment) => string
  /** Where new images come from; absent sources render no button. */
  sources?: Pick<
    AttachmentSlotProps,
    'onUpload' | 'gallery' | 'shareCards' | 'onAttachShareCard'
  >
  /** Shown in the preview card as the author. */
  authorName?: string
  /**
   * The link is derived elsewhere (a Marketing Task's tagged link, spec
   * §3.4): shown, never typed here.
   */
  linkLocked?: boolean
}

const defaultImageSrc = (asset: SocialPostAttachment) =>
  richTextImageUrl(asset.assetId, 1200)

/**
 * What the Link field says the platform does with it. Keyed by
 * {@link LinkPlacement} so nothing here branches on the platform name.
 */
const LINK_HINTS: Record<LinkPlacement, (platform: string) => string> = {
  body: () => 'Shown in the body text.',
  card: () => 'Shown as a link card; you may also mention it in the body.',
  comment: (platform) =>
    `Posted as the first comment on ${platform}, on its own — keep it out of the body.`,
}

/**
 * The single-variant editor (#1007): a split-pane composer with the
 * platform's rules applied live. The left pane edits, the right pane shows
 * the post the way the platform's feed card will — same body, same
 * rendition crop, same link — so the organizer sees exactly what goes out.
 * Which rules apply comes entirely from `constraints`; nothing here
 * branches on the platform name.
 */
export function VariantEditor({
  platform,
  constraints,
  conferenceDomains,
  postAttachments,
  postDefaultScheduledAt,
  value,
  onChange,
  onSave,
  onCancel,
  saving = false,
  error,
  imageSrc = defaultImageSrc,
  sources,
  authorName = 'Your conference',
  linkLocked = false,
}: VariantEditorProps) {
  const id = useId()
  const platformLabel = SOCIAL_PLATFORM_LABELS[platform]
  // Switching default → custom → default must not lose a typed time.
  const [lastCustom, setLastCustom] = useState(
    value.timing.mode === 'custom' ? value.timing.localInput : '',
  )
  // An upload / pick in flight: saving now would close the dialog under it.
  const [slotBusy, setSlotBusy] = useState(false)
  const validation = useMemo(
    () =>
      validateEditorValue(
        value,
        constraints,
        postAttachments,
        conferenceDomains,
      ),
    [value, constraints, postAttachments, conferenceDomains],
  )
  const overLimit =
    constraints !== null && validation.length > constraints.maxLength
  const blocked = validation.issues.length > 0 || validation.timeError !== null
  const set = (patch: Partial<VariantEditorValue>) =>
    onChange({ ...value, ...patch })

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        if (!blocked && !slotBusy) onSave()
      }}
      className="space-y-4"
      aria-label={`${SOCIAL_PLATFORM_LABELS[platform]} variant`}
    >
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="min-w-0 space-y-5">
          <RulesSummary constraints={constraints} />

          <div>
            <div className="mb-1 flex items-baseline justify-between">
              <label
                htmlFor={`${id}-body`}
                className="block text-sm font-medium text-gray-700 dark:text-gray-200"
              >
                Body
              </label>
              {constraints && (
                <span
                  data-testid="length-counter"
                  aria-live="polite"
                  className={clsx(
                    'text-xs tabular-nums',
                    overLimit
                      ? 'font-semibold text-red-600 dark:text-red-400'
                      : 'text-gray-500 dark:text-gray-400',
                  )}
                >
                  {validation.length} / {constraints.maxLength}
                </span>
              )}
            </div>
            <textarea
              id={`${id}-body`}
              rows={8}
              value={value.body}
              onChange={(e) => set({ body: e.target.value })}
              disabled={saving}
              aria-invalid={validation.byField.body.length > 0}
              aria-describedby={`${id}-body-issues`}
              className={clsx(
                inputClass,
                validation.byField.body.length > 0 &&
                  'border-red-400 focus:border-red-500 focus:ring-red-500',
              )}
            />
            <Issues
              id={`${id}-body-issues`}
              messages={validation.byField.body}
            />
          </div>

          <div>
            <label
              htmlFor={`${id}-link`}
              className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200"
            >
              Link
            </label>
            <input
              id={`${id}-link`}
              type="url"
              inputMode="url"
              placeholder={
                linkLocked ? 'Pick a target page above' : 'https://…'
              }
              value={value.link}
              onChange={(e) => set({ link: e.target.value })}
              disabled={saving}
              readOnly={linkLocked}
              aria-invalid={validation.byField.link.length > 0}
              aria-describedby={`${id}-link-issues`}
              className={clsx(
                inputClass,
                linkLocked && 'bg-gray-50 text-gray-600 dark:bg-gray-800/60',
              )}
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {linkLocked
                ? `Derived from the target page, the campaign and this task; it carries the tracking tags.${
                    constraints?.linkPlacement === 'comment'
                      ? ` It is posted as the first comment on ${platformLabel}, so keep it out of the body.`
                      : ''
                  }`
                : LINK_HINTS[constraints?.linkPlacement ?? 'card'](
                    platformLabel,
                  )}
            </p>
            <Issues
              id={`${id}-link-issues`}
              messages={validation.byField.link}
            />
          </div>

          <fieldset>
            <legend className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-200">
              Images
            </legend>
            <AttachmentSlot
              postAttachments={postAttachments}
              attachments={value.attachments}
              constraints={constraints}
              imageSrc={imageSrc}
              onChange={(attachments) => set({ attachments })}
              onBusyChange={setSlotBusy}
              disabled={saving}
              {...sources}
            />
            <Issues
              id={`${id}-media-issues`}
              messages={validation.byField.media}
            />
          </fieldset>

          <fieldset>
            <legend className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-200">
              Publish time (Oslo)
            </legend>
            <div className="space-y-2">
              <label className="flex min-h-[44px] cursor-pointer flex-wrap items-center gap-x-2 text-sm text-gray-700 dark:text-gray-200">
                <input
                  type="radio"
                  name={`${id}-timing`}
                  checked={value.timing.mode === 'default'}
                  onChange={() => set({ timing: { mode: 'default' } })}
                  disabled={saving}
                  className="size-4 border-gray-300"
                />
                Follow the post&apos;s default time
                {postDefaultScheduledAt ? (
                  <span className="text-gray-500">
                    ({formatDateTimeSafe(postDefaultScheduledAt)})
                  </span>
                ) : (
                  <span className="text-gray-500">(not set yet)</span>
                )}
              </label>
              <label className="flex min-h-[44px] cursor-pointer items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
                <input
                  type="radio"
                  name={`${id}-timing`}
                  checked={value.timing.mode === 'custom'}
                  onChange={() =>
                    set({
                      timing: {
                        mode: 'custom',
                        localInput: lastCustom,
                      },
                    })
                  }
                  disabled={saving}
                  className="size-4 border-gray-300"
                />
                Custom time for this variant
              </label>
              {value.timing.mode === 'custom' && (
                <input
                  type="datetime-local"
                  aria-label="Custom publish time (Oslo)"
                  value={value.timing.localInput}
                  onChange={(e) => {
                    setLastCustom(e.target.value)
                    set({
                      timing: { mode: 'custom', localInput: e.target.value },
                    })
                  }}
                  disabled={saving}
                  aria-invalid={validation.timeError !== null}
                  aria-describedby={`${id}-time-issues`}
                  className={inputClass}
                />
              )}
              <Issues
                id={`${id}-time-issues`}
                messages={validation.timeError ? [validation.timeError] : []}
              />
            </div>
          </fieldset>
        </div>

        <aside
          aria-label="Preview"
          className="min-w-0 lg:sticky lg:top-0 lg:self-start"
        >
          <p className="mb-2 text-xs font-medium tracking-wide text-gray-500 uppercase dark:text-gray-400">
            {SOCIAL_PLATFORM_LABELS[platform]} preview
          </p>
          <PreviewCard
            authorName={authorName}
            value={value}
            constraints={constraints}
            postAttachments={postAttachments}
            imageSrc={imageSrc}
          />
        </aside>
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
        {blocked && !saving && (
          <p className="mr-auto text-xs text-gray-500 dark:text-gray-400">
            Fix the issues above to save.
          </p>
        )}
        {onCancel && (
          <AdminButton type="button" variant="secondary" onClick={onCancel}>
            Cancel
          </AdminButton>
        )}
        <AdminButton
          type="submit"
          color="brand"
          disabled={saving || blocked || slotBusy}
        >
          {saving ? 'Saving…' : 'Save variant'}
        </AdminButton>
      </div>
    </form>
  )
}

function RulesSummary({
  constraints,
}: {
  constraints: PlatformConstraints | null
}) {
  if (!constraints) {
    return (
      <p className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-300">
        No platform rules are known for this platform yet; nothing is checked
        until it is connected.
      </p>
    )
  }
  const parts = [
    `${constraints.maxLength.toLocaleString('en')} characters`,
    constraints.maxImages === 1
      ? '1 image'
      : `up to ${constraints.maxImages} images`,
    constraints.requiresAlt ? 'alt text required' : null,
    constraints.requiresImage ? 'image required' : null,
    constraints.linkPlacement === 'comment'
      ? 'the link goes in the first comment'
      : 'links allowed in the body',
  ].filter((p): p is string => p !== null)
  return (
    <p className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-300">
      {parts.join(' · ')}
    </p>
  )
}

function Issues({ id, messages }: { id: string; messages: string[] }) {
  if (messages.length === 0) return <span id={id} />
  return (
    <ul id={id} aria-live="polite" className="mt-1 space-y-0.5">
      {messages.map((m) => (
        <li key={m} className="text-sm text-red-600 dark:text-red-400">
          {m}
        </li>
      ))}
    </ul>
  )
}

/**
 * The platform's feed card, approximated: author, body, images, and the link
 * WHERE THE PLATFORM PUTS IT — a card below the post, or, on a `comment`
 * platform, the first comment under it (spec §3.1, #1134). Showing a link
 * card for LinkedIn would preview something that never goes out.
 */
function PreviewCard({
  authorName,
  value,
  constraints,
  postAttachments,
  imageSrc,
}: {
  authorName: string
  value: VariantEditorValue
  constraints: PlatformConstraints | null
  postAttachments: SocialPostAttachment[]
  imageSrc: (asset: SocialPostAttachment) => string
}) {
  const byKey = new Map(postAttachments.map((a) => [a._key, a]))
  const aspect = constraints?.imageAspectRatio ?? null
  const images = value.attachments.flatMap((a) => {
    const source = byKey.get(a.source)
    if (!source) return []
    return [
      {
        key: a.source,
        src: imageSrc(source),
        alt: a.altOverride ?? source.alt,
        rect: renditionRect(source, aspect, a.crop),
        sourceAspect: source.width / source.height,
      },
    ]
  })
  const link = value.link.trim()
  let host: string | null = null
  try {
    host = link ? new URL(link).hostname : null
  } catch {
    host = null
  }
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-xs dark:border-gray-700 dark:bg-gray-900">
      <div className="mb-3 flex items-center gap-3">
        <div className="size-10 rounded-full bg-gradient-to-br from-brand-cloud-blue to-indigo-500" />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
            {authorName}
          </p>
          <p className="text-xs text-gray-500">Just now</p>
        </div>
      </div>
      {value.body.trim() ? (
        <p className="text-sm break-words whitespace-pre-wrap text-gray-900 dark:text-gray-100">
          {value.body}
        </p>
      ) : (
        <p className="text-sm text-gray-400 italic">Nothing written yet.</p>
      )}
      {images.length > 0 && (
        <div
          className={clsx(
            'mt-3 grid gap-1 overflow-hidden rounded-lg',
            images.length > 1 && 'grid-cols-2',
          )}
        >
          {images.map((image) => (
            <CroppedImage
              key={image.key}
              src={image.src}
              alt={image.alt}
              rect={image.rect}
              sourceAspect={image.sourceAspect}
              aspectRatio={images.length > 1 ? 1 : (aspect ?? undefined)}
              className="bg-gray-100 dark:bg-gray-800"
            />
          ))}
        </div>
      )}
      {host && constraints?.linkPlacement !== 'comment' && (
        <div className="mt-3 rounded-lg border border-gray-200 px-3 py-2 dark:border-gray-700">
          <p className="truncate text-xs text-gray-500 uppercase">{host}</p>
          <p className="truncate text-sm text-gray-800 dark:text-gray-200">
            {link}
          </p>
        </div>
      )}
      {host && constraints?.linkPlacement === 'comment' && (
        <div className="mt-3 border-t border-gray-200 pt-3 dark:border-gray-700">
          <p className="mb-1 text-xs font-medium tracking-wide text-gray-500 uppercase">
            First comment
          </p>
          <div className="flex items-start gap-2 rounded-lg bg-gray-50 px-3 py-2 dark:bg-gray-800">
            <div className="size-6 shrink-0 rounded-full bg-gradient-to-br from-brand-cloud-blue to-indigo-500" />
            <p className="min-w-0 truncate text-sm text-gray-800 dark:text-gray-200">
              {link}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

const inputClass =
  'block min-h-[44px] w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-xs focus:border-brand-cloud-blue focus:ring-1 focus:ring-brand-cloud-blue focus:outline-none disabled:opacity-60 dark:border-gray-600 dark:bg-gray-700 dark:text-white'
