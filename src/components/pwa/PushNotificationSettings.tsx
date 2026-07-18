'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  BellIcon,
  BellSlashIcon,
  ArrowDownTrayIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline'
import { api } from '@/lib/trpc/client'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import {
  DEFAULT_PUSH_PREFERENCES,
  PUSH_CATEGORIES,
  type PushCategory,
  type PushPreferences,
} from '@/lib/push/types'
import {
  getExistingSubscription,
  getNotificationPermission,
  iosNeedsInstall,
  isPushSupported,
  subscribeToPush,
  unsubscribeFromPush,
} from '@/lib/pwa/push-client'

/**
 * Presentational state of the push settings control.
 *
 * `unavailable` = push is not configured on the SERVER (no VAPID public key), so
 * the control is shown as unavailable rather than a toggle that would fail on
 * click. Distinct from `unsupported` (the browser lacks the push APIs).
 */
export type PushSettingsStatus =
  | 'loading'
  | 'unavailable'
  | 'unsupported'
  | 'ios-install'
  | 'denied'
  | 'disabled'
  | 'enabled'

const CATEGORY_LABELS: Record<
  PushCategory,
  { title: string; description: string }
> = {
  proposalDecisions: {
    title: 'Proposal decisions',
    description: 'When a talk is accepted, rejected, or waitlisted.',
  },
  talkConfirmed: {
    title: 'Talk confirmed',
    description: 'When your talk is confirmed for the programme.',
  },
  coSpeakerInvites: {
    title: 'Co-speaker activity',
    description:
      'When someone invites you to co-present, or responds to your invitation.',
  },
  otherUpdates: {
    title: 'Other updates',
    description:
      'New submissions, travel and sponsor updates, gallery tags, and other notifications.',
  },
}

interface ToggleProps {
  checked: boolean
  onChange: (next: boolean) => void
  disabled?: boolean
  label: string
  id: string
}

function Toggle({ checked, onChange, disabled, label, id }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      id={id}
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors focus:outline-2 focus:outline-offset-2 focus:outline-brand-cloud-blue disabled:cursor-not-allowed disabled:opacity-50 ${
        checked
          ? 'bg-brand-cloud-blue dark:bg-blue-600'
          : 'bg-gray-200 dark:bg-gray-600'
      }`}
    >
      <span
        aria-hidden="true"
        className={`pointer-events-none inline-block h-5 w-5 translate-y-0.5 rounded-full bg-white shadow-sm transition-transform ${
          checked ? 'translate-x-5' : 'translate-x-0.5'
        }`}
      />
    </button>
  )
}

export interface PushNotificationSettingsViewProps {
  status: PushSettingsStatus
  preferences: PushPreferences
  /** Master toggle busy (subscribing / unsubscribing). */
  busy?: boolean
  /** A per-category save is in flight. */
  savingPreferences?: boolean
  error?: string | null
  onToggleMaster: (enable: boolean) => void
  onToggleCategory: (category: PushCategory, next: boolean) => void
}

/**
 * Presentational notifications settings panel (issue #444). No browser or tRPC
 * access — everything arrives via props so it renders deterministically in
 * Storybook and tests. The container below wires it to real APIs.
 */
export function PushNotificationSettingsView({
  status,
  preferences,
  busy,
  savingPreferences,
  error,
  onToggleMaster,
  onToggleCategory,
}: PushNotificationSettingsViewProps) {
  const enabled = status === 'enabled'

  return (
    <section
      aria-labelledby="push-settings-heading"
      className="border-t border-gray-200 pt-6 dark:border-gray-600"
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 shrink-0">
          {enabled ? (
            <BellIcon
              className="h-6 w-6 text-brand-cloud-blue dark:text-blue-400"
              aria-hidden="true"
            />
          ) : (
            <BellSlashIcon
              className="h-6 w-6 text-gray-400 dark:text-gray-500"
              aria-hidden="true"
            />
          )}
        </div>
        <div className="flex-1">
          <h2
            id="push-settings-heading"
            className="font-space-grotesk text-lg font-semibold text-gray-900 dark:text-white"
          >
            Push notifications
          </h2>
          <p className="font-inter mt-1 text-sm text-gray-600 dark:text-gray-400">
            Get a browser notification about your proposals even when the site
            isn&apos;t open. You can turn this off at any time.
          </p>
        </div>
      </div>

      <div className="mt-4">
        {status === 'loading' && (
          <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <LoadingSpinner size="sm" />
            Checking notification status&hellip;
          </div>
        )}

        {status === 'unsupported' && (
          <p className="font-inter rounded-lg bg-gray-50 p-4 text-sm text-gray-600 dark:bg-gray-700/40 dark:text-gray-300">
            This browser doesn&apos;t support push notifications. You&apos;ll
            still receive email updates.
          </p>
        )}

        {status === 'unavailable' && (
          <p className="font-inter rounded-lg bg-gray-50 p-4 text-sm text-gray-600 dark:bg-gray-700/40 dark:text-gray-300">
            Push notifications aren&apos;t available right now. You&apos;ll
            still receive email updates.
          </p>
        )}

        {status === 'ios-install' && (
          <div className="flex items-start gap-3 rounded-lg bg-amber-50 p-4 ring-1 ring-amber-200 dark:bg-amber-900/20 dark:ring-amber-500/30">
            <ArrowDownTrayIcon
              className="mt-0.5 h-5 w-5 shrink-0 text-amber-500 dark:text-amber-400"
              aria-hidden="true"
            />
            <p className="font-inter text-sm text-amber-800 dark:text-amber-200">
              On iPhone and iPad, install this site to the Home Screen first
              (Share &rarr; Add to Home Screen), then open it from there to
              enable notifications.
            </p>
          </div>
        )}

        {status === 'denied' && (
          <div className="flex items-start gap-3 rounded-lg bg-amber-50 p-4 ring-1 ring-amber-200 dark:bg-amber-900/20 dark:ring-amber-500/30">
            <ExclamationTriangleIcon
              className="mt-0.5 h-5 w-5 shrink-0 text-amber-500 dark:text-amber-400"
              aria-hidden="true"
            />
            <p className="font-inter text-sm text-amber-800 dark:text-amber-200">
              Notifications are blocked for this site. Allow them in your
              browser&apos;s site settings, then reload to enable push.
            </p>
          </div>
        )}

        {(status === 'disabled' || status === 'enabled') && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <label
                htmlFor="push-master-toggle"
                className="font-inter text-sm font-medium text-gray-900 dark:text-white"
              >
                Enable push notifications
                {busy && (
                  <span className="ml-2 inline-flex align-middle">
                    <LoadingSpinner size="sm" />
                  </span>
                )}
              </label>
              <Toggle
                id="push-master-toggle"
                label="Enable push notifications"
                checked={enabled}
                disabled={busy}
                onChange={onToggleMaster}
              />
            </div>

            {enabled && (
              <fieldset className="space-y-3 rounded-lg bg-gray-50 p-4 dark:bg-gray-700/40">
                <legend className="font-inter text-xs font-semibold tracking-wide text-gray-500 uppercase dark:text-gray-400">
                  Notify me about
                </legend>
                {PUSH_CATEGORIES.map((category) => (
                  <div
                    key={category}
                    className="flex items-center justify-between gap-4"
                  >
                    <div>
                      <label
                        htmlFor={`push-cat-${category}`}
                        className="font-inter text-sm font-medium text-gray-900 dark:text-white"
                      >
                        {CATEGORY_LABELS[category].title}
                      </label>
                      <p className="font-inter text-xs text-gray-500 dark:text-gray-400">
                        {CATEGORY_LABELS[category].description}
                      </p>
                    </div>
                    <Toggle
                      id={`push-cat-${category}`}
                      label={CATEGORY_LABELS[category].title}
                      checked={preferences[category]}
                      disabled={savingPreferences}
                      onChange={(next) => onToggleCategory(category, next)}
                    />
                  </div>
                ))}
              </fieldset>
            )}
          </div>
        )}

        {error && (
          <p
            role="alert"
            className="font-inter mt-3 text-sm text-red-600 dark:text-red-400"
          >
            {error}
          </p>
        )}
      </div>
    </section>
  )
}

/**
 * Container that wires {@link PushNotificationSettingsView} to the browser push
 * APIs and the `push` tRPC router. Permission is only ever requested from the
 * master-toggle click handler — never on mount.
 */
export function PushNotificationSettings() {
  const [status, setStatus] = useState<PushSettingsStatus>('loading')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const utils = api.useUtils()
  const { data: vapid } = api.push.getVapidKey.useQuery(undefined, {
    staleTime: Infinity,
  })
  const { data: prefsData } = api.push.getPreferences.useQuery(undefined, {
    staleTime: 5000,
  })
  const preferences = prefsData ?? DEFAULT_PUSH_PREFERENCES

  const subscribeMutation = api.push.subscribe.useMutation()
  const unsubscribeMutation = api.push.unsubscribe.useMutation()
  const setPreferencesMutation = api.push.setPreferences.useMutation({
    onSuccess: () => utils.push.getPreferences.invalidate(),
  })

  // Server-side push availability: an empty VAPID public key means no keys are
  // configured in the environment, so subscribing can never work. Wait for the
  // query to resolve (`vapid === undefined`) before concluding it's missing.
  const pushConfigured = vapid ? Boolean(vapid.publicKey) : undefined

  // Determine the initial control state on mount. This ONLY inspects existing
  // state (permission + current subscription); it never requests permission.
  useEffect(() => {
    let cancelled = false
    async function detect() {
      if (!isPushSupported()) {
        if (!cancelled) setStatus('unsupported')
        return
      }
      if (iosNeedsInstall()) {
        if (!cancelled) setStatus('ios-install')
        return
      }
      const permission = getNotificationPermission()
      if (permission === 'denied') {
        if (!cancelled) setStatus('denied')
        return
      }
      const existing = await getExistingSubscription()
      if (!cancelled) setStatus(existing ? 'enabled' : 'disabled')
    }
    detect().catch(() => {
      if (!cancelled) setStatus('unsupported')
    })
    return () => {
      cancelled = true
    }
  }, [])

  const handleToggleMaster = useCallback(
    async (enable: boolean) => {
      setError(null)
      setBusy(true)
      try {
        if (enable) {
          const result = await subscribeToPush(vapid?.publicKey ?? '')
          if (!result.ok) {
            if (result.reason === 'denied') {
              setStatus('denied')
            } else {
              setError('Could not enable notifications. Please try again.')
            }
            return
          }
          await subscribeMutation.mutateAsync({
            endpoint: result.subscription.endpoint,
            keys: result.subscription.keys,
            userAgent:
              typeof navigator !== 'undefined'
                ? navigator.userAgent
                : undefined,
          })
          setStatus('enabled')
        } else {
          const endpoint = await unsubscribeFromPush()
          if (endpoint) {
            await unsubscribeMutation.mutateAsync({ endpoint })
          }
          setStatus('disabled')
        }
      } catch {
        setError('Something went wrong updating your notification settings.')
      } finally {
        setBusy(false)
      }
    },
    [vapid, subscribeMutation, unsubscribeMutation],
  )

  const handleToggleCategory = useCallback(
    (category: PushCategory, next: boolean) => {
      setError(null)
      setPreferencesMutation.mutate({ ...preferences, [category]: next })
    },
    [preferences, setPreferencesMutation],
  )

  // Surface the server-unconfigured state as `unavailable` instead of a toggle
  // that would fail on click. Browser-level blockers (unsupported / ios-install
  // / denied) are more specific and actionable, so they win.
  const effectiveStatus: PushSettingsStatus =
    pushConfigured === false && (status === 'disabled' || status === 'enabled')
      ? 'unavailable'
      : status

  return (
    <PushNotificationSettingsView
      status={effectiveStatus}
      preferences={preferences}
      busy={busy}
      savingPreferences={setPreferencesMutation.isPending}
      error={error}
      onToggleMaster={handleToggleMaster}
      onToggleCategory={handleToggleCategory}
    />
  )
}
