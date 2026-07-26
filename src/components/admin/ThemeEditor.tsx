'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { SwatchIcon, ArrowUturnLeftIcon } from '@heroicons/react/24/outline'
import { ModalShell } from '@/components/ModalShell'
import { AdminButton } from '@/components/admin/AdminButton'
import { api } from '@/lib/trpc/client'
import { useNotification } from './NotificationProvider'
import {
  DEFAULT_ACCENT_COLOR,
  DEFAULT_PRIMARY_COLOR,
  isHexColor,
  type ConferenceTheme,
} from '@/lib/branding/theme'

/**
 * THEMING L1 — the per-conference brand-colour editor island + read-only swatch
 * preview. Sits on the settings Branding card alongside the background-pattern
 * and logo editors, and patches the conference `theme` object through the shared
 * `conference.updateBranding` mutation (validated by `UpdateBrandingSchema`).
 *
 * L1 knobs: `primaryColor` (interactive colour + gradient start) and
 * `accentColor` (gradient endpoint). Colours are used verbatim — the live
 * preview shows a Button, heading and gradient in the chosen colours so the
 * editor can judge contrast themselves (L1 does not auto-derive or clamp).
 * "Reset to default" clears the override (sends `theme: null`).
 */

/** Normalise free text into a candidate hex string (adds a leading `#`). */
function normalizeHexInput(raw: string): string {
  const trimmed = raw.trim()
  if (trimmed === '') return ''
  return trimmed.startsWith('#') ? trimmed : `#${trimmed}`
}

export interface ThemeEditorProps {
  initialTheme?: ConferenceTheme | null
  /** Render the modal open on mount — for stories/tests only. */
  defaultOpen?: boolean
}

export function ThemeEditor({
  initialTheme,
  defaultOpen = false,
}: ThemeEditorProps) {
  const router = useRouter()
  const utils = api.useUtils()
  const { showNotification } = useNotification()

  const [isOpen, setIsOpen] = useState(defaultOpen)
  const [primary, setPrimary] = useState(
    initialTheme?.primaryColor ?? DEFAULT_PRIMARY_COLOR,
  )
  const [accent, setAccent] = useState(
    initialTheme?.accentColor ?? DEFAULT_ACCENT_COLOR,
  )
  const [submitError, setSubmitError] = useState<string | null>(null)

  const mutation = api.conference.updateBranding.useMutation({
    onSuccess: () => {
      void utils.invalidate()
      router.refresh()
      showNotification({
        type: 'success',
        title: 'Theme updated',
        message: 'Conference brand colors were saved.',
      })
      setIsOpen(false)
    },
    onError: (error) => {
      setSubmitError(error.message || 'Failed to save. Please try again.')
      showNotification({
        type: 'error',
        title: 'Could not save',
        message: error.message || 'Failed to save brand colors.',
      })
    },
  })

  const reset = () => {
    setPrimary(initialTheme?.primaryColor ?? DEFAULT_PRIMARY_COLOR)
    setAccent(initialTheme?.accentColor ?? DEFAULT_ACCENT_COLOR)
    setSubmitError(null)
  }
  const openModal = () => {
    reset()
    setIsOpen(true)
  }
  const closeModal = () => {
    setIsOpen(false)
    reset()
  }

  const primaryValid = isHexColor(primary)
  const accentValid = isHexColor(accent)
  const canSave = primaryValid && accentValid && !mutation.isPending

  const isOverridden = Boolean(
    initialTheme?.primaryColor || initialTheme?.accentColor,
  )

  const handleSave = () => {
    setSubmitError(null)
    if (!canSave) return
    mutation.mutate({
      theme: { primaryColor: primary.trim(), accentColor: accent.trim() },
    })
  }

  const handleResetToDefault = () => {
    setSubmitError(null)
    // An explicit null unsets the field → the conference reverts to the house
    // palette. Only meaningful when an override currently exists.
    mutation.mutate({ theme: null })
  }

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        aria-label="Edit Brand Colors"
        className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cloud-blue dark:text-gray-400 dark:hover:bg-gray-800"
      >
        <SwatchIcon className="h-5 w-5" />
      </button>

      <ModalShell
        isOpen={isOpen}
        onClose={closeModal}
        size="lg"
        title="Edit Brand Colors"
        subtitle="Primary interactive color and gradient accent for the public site"
        icon={<SwatchIcon className="h-5 w-5" />}
      >
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            handleSave()
          }}
          className="space-y-5"
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <ColorField
              id="theme-primary"
              label="Primary Color"
              hint="Buttons, links, focus rings and the gradient start."
              value={primary}
              valid={primaryValid}
              onChange={setPrimary}
            />
            <ColorField
              id="theme-accent"
              label="Accent Color"
              hint="The gradient endpoint that pairs with the primary."
              value={accent}
              valid={accentValid}
              onChange={setAccent}
            />
          </div>

          <ThemePreview primary={primary} accent={accent} />

          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
            Colors are applied exactly as entered — the preview above is what
            visitors see. Check that text stays readable on your primary color;
            it is not adjusted automatically.
          </p>

          {submitError ? (
            <p
              role="alert"
              className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300"
            >
              {submitError}
            </p>
          ) : null}

          <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:items-center sm:justify-between">
            {isOverridden ? (
              <AdminButton
                type="button"
                variant="secondary"
                size="md"
                onClick={handleResetToDefault}
                disabled={mutation.isPending}
                className="min-h-[44px] sm:mr-auto"
              >
                <ArrowUturnLeftIcon className="mr-1.5 h-4 w-4" />
                Reset to default
              </AdminButton>
            ) : (
              <span className="hidden sm:block" />
            )}
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <AdminButton
                type="button"
                variant="secondary"
                size="md"
                onClick={closeModal}
                disabled={mutation.isPending}
                className="min-h-[44px]"
              >
                Cancel
              </AdminButton>
              <AdminButton
                type="submit"
                color="blue"
                size="md"
                disabled={!canSave}
                className="min-h-[44px]"
              >
                {mutation.isPending ? 'Saving…' : 'Save colors'}
              </AdminButton>
            </div>
          </div>
        </form>
      </ModalShell>
    </>
  )
}

const inputClass =
  'block w-full min-h-[44px] rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm transition-colors focus:border-brand-cloud-blue focus:ring-1 focus:ring-brand-cloud-blue focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white'

/** A native colour picker + synced hex text field for one colour. */
function ColorField({
  id,
  label,
  hint,
  value,
  valid,
  onChange,
}: {
  id: string
  label: string
  hint: string
  value: string
  valid: boolean
  onChange: (value: string) => void
}) {
  // The native <input type="color"> needs a well-formed value; fall back to a
  // neutral swatch while the text field holds an invalid draft.
  const swatch = valid ? value : '#000000'
  return (
    <div>
      <label
        htmlFor={`${id}-hex`}
        className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
      >
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={`${label} picker`}
          value={swatch}
          onChange={(e) => onChange(e.target.value)}
          className="h-11 w-14 shrink-0 cursor-pointer rounded-lg border border-gray-300 bg-white p-1 dark:border-gray-600 dark:bg-gray-700"
        />
        <input
          id={`${id}-hex`}
          type="text"
          inputMode="text"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          value={value}
          aria-invalid={valid ? undefined : true}
          aria-describedby={valid ? `${id}-hint` : `${id}-error`}
          onChange={(e) => onChange(normalizeHexInput(e.target.value))}
          placeholder="#1D4ED8"
          className={`${inputClass} font-mono`}
        />
      </div>
      {valid ? (
        <p
          id={`${id}-hint`}
          className="mt-1 text-xs text-gray-500 dark:text-gray-400"
        >
          {hint}
        </p>
      ) : (
        <p
          id={`${id}-error`}
          role="alert"
          className="mt-1 text-xs text-red-600 dark:text-red-400"
        >
          Enter a 6-digit hex color, e.g. #1D4ED8
        </p>
      )}
    </div>
  )
}

/**
 * Live preview swatch row — a Button, a heading and the brand gradient rendered
 * in the chosen colours (applied inline so the sample is exact regardless of the
 * surrounding document theme).
 */
function ThemePreview({
  primary,
  accent,
}: {
  primary: string
  accent: string
}) {
  const p = isHexColor(primary) ? primary : DEFAULT_PRIMARY_COLOR
  const a = isHexColor(accent) ? accent : DEFAULT_ACCENT_COLOR
  return (
    <div className="space-y-3 rounded-lg border border-gray-200 p-4 dark:border-gray-700">
      <p className="text-xs font-medium tracking-wide text-gray-500 uppercase dark:text-gray-400">
        Preview
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <span
          className="inline-flex min-h-[40px] items-center rounded-full px-5 text-sm font-semibold text-white shadow-sm"
          style={{ backgroundColor: p }}
        >
          Primary button
        </span>
        <span className="text-lg font-semibold" style={{ color: p }}>
          Heading sample
        </span>
      </div>
      <div
        className="flex h-14 items-center justify-center rounded-lg text-sm font-semibold text-white"
        style={{ backgroundImage: `linear-gradient(135deg, ${p}, ${a})` }}
      >
        Brand gradient
      </div>
    </div>
  )
}

/**
 * Read-only theme summary for the settings card body: the two swatches + hex
 * values when a theme is set, or a "default palette" note when it is not.
 */
export function ThemeSwatchRow({ theme }: { theme?: ConferenceTheme | null }) {
  const overridden = Boolean(theme?.primaryColor || theme?.accentColor)
  if (!overridden) {
    return (
      <p className="text-sm text-gray-500 dark:text-gray-400">
        Using the default Cloud Native Days palette.
      </p>
    )
  }
  const primary = theme?.primaryColor ?? DEFAULT_PRIMARY_COLOR
  const accent = theme?.accentColor ?? DEFAULT_ACCENT_COLOR
  return (
    <div className="flex flex-wrap gap-4">
      <Swatch label="Primary" value={primary} />
      <Swatch label="Accent" value={accent} />
    </div>
  )
}

function Swatch({ label, value }: { label: string; value: string }) {
  const safe = isHexColor(value) ? value : '#000000'
  return (
    <div className="flex items-center gap-2">
      <span
        className="h-8 w-8 shrink-0 rounded-md border border-gray-200 dark:border-gray-700"
        style={{ backgroundColor: safe }}
        aria-hidden="true"
      />
      <div className="text-xs">
        <p className="font-medium text-gray-700 dark:text-gray-300">{label}</p>
        <p className="font-mono text-gray-500 dark:text-gray-400">{value}</p>
      </div>
    </div>
  )
}
