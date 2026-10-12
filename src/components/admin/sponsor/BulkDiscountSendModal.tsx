'use client'

import React, { useState, useMemo, useCallback } from 'react'
import {
  TicketIcon,
  EnvelopeIcon,
  CheckCircleIcon,
  XCircleIcon,
  ArrowPathIcon,
  ExclamationTriangleIcon,
  ChevronDownIcon,
} from '@heroicons/react/24/outline'
import { ModalShell } from '@/components/ModalShell'
import { AdminButton } from '@/components/admin/AdminButton'
import { useNotification } from '@/components/admin/NotificationProvider'
import { api } from '@/lib/trpc/client'
import {
  buildTemplateVariables,
  processTemplateVariables,
} from '@/lib/sponsor/templates'
import { convertStringToPortableTextBlocks } from '@/lib/proposal'
import { sponsorOwningCode } from '@/lib/discounts'
import type { ConferenceTheme } from '@/lib/branding/theme'
import type { EventDiscountWithUsage } from '@/lib/discounts/types'

export interface BulkSendSponsorInfo {
  id: string
  name: string
  website?: string
  tier: {
    title: string
    tagline: string
    tierType: 'standard' | 'special'
  }
  ticketEntitlement: number
  sponsorForConferenceId?: string
  linkedCodes?: string[]
}

export interface BulkSendOtherHolder {
  id: string
  name: string
  linkedCodes: string[]
}

export interface BulkDiscountSendModalProps {
  isOpen: boolean
  onClose: () => void
  conference: {
    title: string
    city: string
    country: string
    startDate: string
    domains: string[]
    contactEmail: string
    domain: string
    organizer?: string
    theme?: ConferenceTheme | null
    sponsorRegistrationLink?: string | null
    registrationLink?: string | null
    sponsorEmail?: string
  }
  sponsors: BulkSendSponsorInfo[]
  existingDiscounts: EventDiscountWithUsage[]
  otherCodeHolders?: readonly BulkSendOtherHolder[]
  onSent?: () => void
}

interface SponsorSendTarget {
  id: string
  name: string
  tierTitle: string
  sponsorForConferenceId: string
  codes: string[]
  recipientKey: string
  recipientName: string
  recipientEmail: string
}

interface SkippedSponsorInfo {
  id: string
  name: string
  reason: string
}

type SendingState = 'idle' | 'sending' | 'completed'

interface SponsorSendResult {
  status: 'pending' | 'sending' | 'success' | 'error'
  error?: string
}

const NO_OTHER_HOLDERS: readonly BulkSendOtherHolder[] = []

export function BulkDiscountSendModal({
  isOpen,
  onClose,
  conference,
  sponsors,
  existingDiscounts,
  otherCodeHolders = NO_OTHER_HOLDERS,
  onSent,
}: BulkDiscountSendModalProps) {
  const { showNotification } = useNotification()
  const utils = api.useUtils()
  const sendMutation = api.sponsor.crm.sendCommunication.useMutation()

  const crmListQuery = api.sponsor.crm.list.useQuery(
    {},
    {
      enabled: isOpen,
      staleTime: 30000,
    },
  )

  const claimants = useMemo(
    () => [...sponsors, ...otherCodeHolders],
    [sponsors, otherCodeHolders],
  )

  const { eligibleSponsors, skippedSponsors } = useMemo(() => {
    const crmSponsors = crmListQuery.data ?? []
    const eligible: SponsorSendTarget[] = []
    const skipped: SkippedSponsorInfo[] = []

    for (const sponsor of sponsors) {
      const crmRecord = crmSponsors.find(
        (sfc) =>
          sfc._id === sponsor.sponsorForConferenceId ||
          sfc.sponsor._id === sponsor.id,
      )

      // Codes owned or attributed that exist in the ticketing provider
      const existingCodeSet = new Set(
        existingDiscounts
          .map((d) => d.triggerValue?.trim().toUpperCase())
          .filter(Boolean),
      )

      const ownedCodes = existingDiscounts
        .filter(
          (d) =>
            sponsorOwningCode(d.triggerValue, claimants)?.id === sponsor.id,
        )
        .map((d) => d.triggerValue)
        .filter((c): c is string => Boolean(c))

      // Only include codes that exist upstream in the event's discounts when existingDiscounts is populated;
      // deleted codes that remain in Sanity's linkedCodes array must not be submitted
      const validLinkedCodes =
        existingDiscounts.length > 0
          ? (sponsor.linkedCodes ?? []).filter((c) =>
              existingCodeSet.has(c.trim().toUpperCase()),
            )
          : (sponsor.linkedCodes ?? [])

      const allCodes = Array.from(new Set([...ownedCodes, ...validLinkedCodes]))

      const sfcId = sponsor.sponsorForConferenceId || crmRecord?._id

      if (!sfcId) {
        skipped.push({
          id: sponsor.id,
          name: sponsor.name,
          reason: 'No CRM record found',
        })
        continue
      }

      if (allCodes.length === 0) {
        skipped.push({
          id: sponsor.id,
          name: sponsor.name,
          reason: 'No discount codes created',
        })
        continue
      }

      const validContacts = (crmRecord?.contactPersons ?? []).filter((c) =>
        Boolean(c.email),
      )

      if (validContacts.length === 0) {
        skipped.push({
          id: sponsor.id,
          name: sponsor.name,
          reason: 'No contact email on file',
        })
        continue
      }

      const primaryContact =
        validContacts.find((c) => c.isPrimary) || validContacts[0]

      eligible.push({
        id: sponsor.id,
        name: sponsor.name,
        tierTitle: sponsor.tier.title,
        sponsorForConferenceId: sfcId,
        codes: allCodes,
        recipientKey: primaryContact._key,
        recipientName: primaryContact.name,
        recipientEmail: primaryContact.email,
      })
    }

    return { eligibleSponsors: eligible, skippedSponsors: skipped }
  }, [sponsors, crmListQuery.data, existingDiscounts, claimants])

  const [subject, setSubject] = useState(`Discount codes: ${conference.title}`)
  const [messageText, setMessageText] = useState(
    `Hi {{{SPONSOR_NAME}}},\n\nHere are your complimentary ticket discount codes for {{{CONFERENCE_TITLE}}}.\n\nPlease find your codes and registration link below:`,
  )
  const [showSkipped, setShowSkipped] = useState(false)
  const [sendingState, setSendingState] = useState<SendingState>('idle')
  const [results, setResults] = useState<Record<string, SponsorSendResult>>({})
  const [currentSendingIndex, setCurrentSendingIndex] = useState(0)

  // Guard against navigating or closing tab while sending is actively in-flight
  React.useEffect(() => {
    if (sendingState !== 'sending') return
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [sendingState])

  const handleSend = useCallback(
    async (targetsOverride?: SponsorSendTarget[]) => {
      const targets = Array.isArray(targetsOverride)
        ? targetsOverride
        : eligibleSponsors
      if (targets.length === 0) return

      setSendingState('sending')
      setCurrentSendingIndex(0)

      setResults((prev) => {
        const next = { ...prev }
        targets.forEach((s) => {
          next[s.id] = { status: 'pending' }
        })
        return next
      })

      let successCount = 0
      let failCount = 0

      for (let i = 0; i < targets.length; i++) {
        const target = targets[i]
        setCurrentSendingIndex(i)

        setResults((prev) => ({
          ...prev,
          [target.id]: { status: 'sending' },
        }))

        try {
          const vars = buildTemplateVariables({
            sponsorName: target.name,
            contactNames: target.recipientName || target.name,
            tierName: target.tierTitle,
            conference: {
              title: conference.title,
              startDate: conference.startDate,
              city: conference.city,
              organizer: conference.organizer,
              domains: conference.domains,
              sponsorRegistrationLink:
                conference.sponsorRegistrationLink ?? undefined,
            },
          })

          const personalizedSubject = processTemplateVariables(subject, vars)
          const personalizedBodyText = processTemplateVariables(
            messageText,
            vars,
          )
          const portableBlocks =
            convertStringToPortableTextBlocks(personalizedBodyText)

          await sendMutation.mutateAsync({
            sponsorForConferenceId: target.sponsorForConferenceId,
            kind: 'discount',
            recipientKeys: [target.recipientKey],
            subject: personalizedSubject,
            message: JSON.stringify(portableBlocks),
            discountCodes: target.codes,
          })

          setResults((prev) => ({
            ...prev,
            [target.id]: { status: 'success' },
          }))
          successCount++
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : 'Failed to send'
          setResults((prev) => ({
            ...prev,
            [target.id]: { status: 'error', error: errorMsg },
          }))
          failCount++
        }

        // Small pacing delay to prevent hitting Resend burst rate limits
        if (i < targets.length - 1) {
          await new Promise((r) => setTimeout(r, 200))
        }
      }

      setSendingState('completed')

      // Invalidate activity, communications, and discount usage
      utils.sponsor.crm.activities.list.invalidate()
      utils.sponsor.crm.activities.listCommunications.invalidate()
      utils.tickets.admin.getDiscountCodesWithUsage.invalidate()

      if (failCount === 0) {
        showNotification({
          type: 'success',
          title: 'Discount codes sent',
          message: `Successfully sent discount codes to ${successCount} sponsors.`,
        })
      } else {
        showNotification({
          type: 'warning',
          title: 'Sending complete with errors',
          message: `Sent to ${successCount} sponsors. ${failCount} failed.`,
        })
      }
    },
    [
      eligibleSponsors,
      conference,
      subject,
      messageText,
      sendMutation,
      utils,
      showNotification,
    ],
  )

  const handleRetryFailed = useCallback(() => {
    const failedTargets = eligibleSponsors.filter(
      (s) => results[s.id]?.status === 'error',
    )
    if (failedTargets.length > 0) {
      handleSend(failedTargets)
    }
  }, [eligibleSponsors, results, handleSend])

  const handleDone = () => {
    onSent?.()
    onClose()
  }

  const successCount = Object.values(results).filter(
    (r) => r.status === 'success',
  ).length
  const errorCount = Object.values(results).filter(
    (r) => r.status === 'error',
  ).length

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={() => {
        if (sendingState !== 'sending') {
          onClose()
        }
      }}
      size="2xl"
      title="Send discount codes to sponsors"
      subtitle={conference.title}
      icon={<TicketIcon />}
    >
      <div className="space-y-6">
        {/* Conference Invite Link Alert if missing */}
        {!conference.sponsorRegistrationLink && (
          <div
            role="alert"
            className="flex items-start gap-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-200"
          >
            <ExclamationTriangleIcon className="mt-0.5 size-5 shrink-0 text-amber-600 dark:text-amber-400" />
            <div className="text-xs leading-relaxed">
              <span className="font-semibold">Notice:</span> This conference has
              no sponsor ticket invite link set. The emails will link to the
              public ticket store (
              {conference.registrationLink || conference.domain}).
            </div>
          </div>
        )}

        {crmListQuery.isError && (
          <div
            role="alert"
            className="flex items-start gap-3 rounded-md border border-red-300 bg-red-50 p-3 text-red-900 dark:border-red-700/60 dark:bg-red-950/40 dark:text-red-200"
          >
            <ExclamationTriangleIcon className="mt-0.5 size-5 shrink-0 text-red-600 dark:text-red-400" />
            <div className="text-xs leading-relaxed">
              <span className="font-semibold">Error:</span> Failed to load
              sponsor CRM contacts: {crmListQuery.error?.message}. Please try
              again.
            </div>
          </div>
        )}

        {crmListQuery.isLoading && (
          <div className="rounded-lg border border-gray-200 bg-gray-50/50 p-4 text-center text-xs text-gray-500 dark:border-gray-700 dark:bg-gray-800/50 dark:text-gray-400">
            Loading sponsor CRM contacts…
          </div>
        )}

        {/* Recipients Summary */}
        <div className="rounded-lg border border-gray-200 bg-gray-50/50 p-4 dark:border-gray-700 dark:bg-gray-800/50">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="inline-flex size-2 rounded-full bg-emerald-500" />
              <span className="text-sm font-medium text-gray-900 dark:text-white">
                {eligibleSponsors.length} eligible sponsor
                {eligibleSponsors.length === 1 ? '' : 's'}
              </span>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                (has discount code &amp; contact email)
              </span>
            </div>

            {skippedSponsors.length > 0 && (
              <button
                type="button"
                onClick={() => setShowSkipped(!showSkipped)}
                className="inline-flex items-center gap-1 text-xs font-medium text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200"
              >
                <span>{skippedSponsors.length} skipped</span>
                <ChevronDownIcon
                  className={`size-3.5 transition-transform ${showSkipped ? 'rotate-180' : ''}`}
                />
              </button>
            )}
          </div>

          {/* Skipped Details Accordion */}
          {showSkipped && skippedSponsors.length > 0 && (
            <div className="mt-3 border-t border-gray-200 pt-3 dark:border-gray-700">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
                Skipped sponsors (no codes created or missing contact email):
              </p>
              <ul className="mt-1.5 max-h-36 divide-y divide-gray-100 overflow-y-auto text-xs dark:divide-gray-700/50">
                {skippedSponsors.map((s) => (
                  <li
                    key={s.id}
                    className="flex items-center justify-between py-1 text-gray-600 dark:text-gray-300"
                  >
                    <span className="font-medium">{s.name}</span>
                    <span className="text-gray-400 dark:text-gray-500">
                      {s.reason}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Sending / Complete View */}
        {sendingState !== 'idle' ? (
          <div className="space-y-4 py-2">
            <div
              className="flex items-center justify-between"
              role="status"
              aria-live="polite"
            >
              <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
                {sendingState === 'sending'
                  ? `Sending ${currentSendingIndex + 1} of ${eligibleSponsors.length}…`
                  : 'Sending finished'}
              </h4>
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                {successCount} sent
                {errorCount > 0 ? `, ${errorCount} failed` : ''}
              </span>
            </div>

            {/* Progress Bar */}
            <div
              role="progressbar"
              aria-valuenow={successCount + errorCount}
              aria-valuemin={0}
              aria-valuemax={eligibleSponsors.length}
              aria-label="Email sending progress"
              className="h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700"
            >
              <div
                className="h-full bg-indigo-600 transition-all duration-300 dark:bg-indigo-500"
                style={{
                  width: `${eligibleSponsors.length > 0 ? ((successCount + errorCount) / eligibleSponsors.length) * 100 : 0}%`,
                }}
              />
            </div>

            {/* Per-Sponsor Status List */}
            <div className="max-h-64 divide-y divide-gray-100 overflow-y-auto rounded-md border border-gray-200 p-2 text-sm dark:divide-gray-700 dark:border-gray-700">
              {eligibleSponsors.map((sponsor) => {
                const res = results[sponsor.id]
                return (
                  <div
                    key={sponsor.id}
                    className="flex items-center justify-between py-2 text-xs"
                  >
                    <div className="min-w-0">
                      <div className="font-medium text-gray-900 dark:text-white">
                        {sponsor.name}
                      </div>
                      <div className="text-gray-500 dark:text-gray-400">
                        {sponsor.recipientName} ({sponsor.recipientEmail}) ·
                        Codes: {sponsor.codes.join(', ')}
                      </div>
                    </div>

                    <div className="ml-3 shrink-0">
                      {res?.status === 'pending' && (
                        <span className="text-gray-400 dark:text-gray-500">
                          Waiting…
                        </span>
                      )}
                      {res?.status === 'sending' && (
                        <span className="inline-flex items-center gap-1 text-indigo-600 dark:text-indigo-400">
                          <ArrowPathIcon className="size-3.5 animate-spin" />
                          Sending
                        </span>
                      )}
                      {res?.status === 'success' && (
                        <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                          <CheckCircleIcon className="size-4" />
                          Sent
                        </span>
                      )}
                      {res?.status === 'error' && (
                        <span
                          className="inline-flex items-center gap-1 text-rose-600 dark:text-rose-400"
                          title={res.error}
                        >
                          <XCircleIcon className="size-4" />
                          Failed
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            {sendingState === 'completed' && (
              <div className="flex items-center justify-between border-t border-gray-200 pt-2 dark:border-gray-700">
                {errorCount > 0 ? (
                  <button
                    type="button"
                    onClick={handleRetryFailed}
                    className="inline-flex items-center gap-1.5 rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-100 dark:border-rose-700 dark:bg-rose-950/40 dark:text-rose-300 dark:hover:bg-rose-900/50"
                  >
                    <ArrowPathIcon className="size-4" />
                    Retry failed ({errorCount})
                  </button>
                ) : (
                  <div />
                )}
                <AdminButton variant="primary" onClick={handleDone}>
                  Done
                </AdminButton>
              </div>
            )}
          </div>
        ) : (
          /* Composer View */
          <div className="space-y-4">
            <div>
              <label
                htmlFor="bulk-discount-subject"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                Subject
              </label>
              <input
                id="bulk-discount-subject"
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="mt-1 block min-h-11 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-xs focus:border-brand-cloud-blue focus:ring-1 focus:ring-brand-cloud-blue focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-white"
              />
            </div>

            <div>
              <label
                htmlFor="bulk-discount-message"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                Message
              </label>
              <textarea
                id="bulk-discount-message"
                rows={5}
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-xs focus:border-brand-cloud-blue focus:ring-1 focus:ring-brand-cloud-blue focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-white"
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Variables like{' '}
                <code className="font-mono">{'{{{SPONSOR_NAME}}}'}</code> and{' '}
                <code className="font-mono">{'{{{CONFERENCE_TITLE}}}'}</code>{' '}
                are supported. Each email will automatically include a formatted
                discount code card with the sponsor&apos;s assigned codes and
                ticket registration link.
              </p>
            </div>

            {/* Target Sponsors Preview */}
            <div>
              <h4 className="text-xs font-semibold tracking-wider text-gray-700 uppercase dark:text-gray-300">
                Sponsors to receive codes ({eligibleSponsors.length})
              </h4>
              <div className="mt-2 max-h-40 divide-y divide-gray-100 overflow-y-auto rounded-md border border-gray-200 p-2 text-xs dark:divide-gray-700 dark:border-gray-700">
                {eligibleSponsors.length === 0 ? (
                  <p className="py-2 text-center text-gray-500 dark:text-gray-400">
                    No eligible sponsors. Make sure discount codes are created
                    for sponsors and contacts have valid emails.
                  </p>
                ) : (
                  eligibleSponsors.map((s) => (
                    <div
                      key={s.id}
                      className="flex items-center justify-between py-1.5"
                    >
                      <div>
                        <span className="font-medium text-gray-900 dark:text-white">
                          {s.name}
                        </span>{' '}
                        <span className="text-gray-500 dark:text-gray-400">
                          → {s.recipientName} ({s.recipientEmail})
                        </span>
                      </div>
                      <div className="font-mono text-gray-600 dark:text-gray-300">
                        {s.codes.join(', ')}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 border-t border-gray-200 pt-4 dark:border-gray-700">
              <button
                type="button"
                onClick={onClose}
                className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-xs hover:bg-gray-50 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
              >
                Cancel
              </button>
              <AdminButton
                variant="primary"
                onClick={() => handleSend()}
                disabled={eligibleSponsors.length === 0 || !subject.trim()}
              >
                <EnvelopeIcon className="mr-1.5 size-4" />
                Send to {eligibleSponsors.length} sponsor
                {eligibleSponsors.length === 1 ? '' : 's'}
              </AdminButton>
            </div>
          </div>
        )}
      </div>
    </ModalShell>
  )
}
