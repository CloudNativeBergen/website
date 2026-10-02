'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import clsx from 'clsx'
import { CheckIcon } from '@heroicons/react/24/solid'
import type { PortableTextBlock } from '@portabletext/editor'
import type { PortableTextBlock as PortableTextBlockForHTML } from '@portabletext/types'
import { EmailModal } from '@/components/admin/EmailModal'
import { useNotification } from '@/components/admin/NotificationProvider'
import { BroadcastTemplate } from '@/components/email/BroadcastTemplate'
import { api } from '@/lib/trpc/client'
import type { ContactPerson, SponsorEmailTemplate } from '@/lib/sponsor/types'
import type {
  CommunicationKind,
  SponsorForConferenceExpanded,
} from '@/lib/sponsor-crm/types'
import {
  COMMUNICATION_KIND_LABELS,
  defaultRecipientKey,
} from '@/lib/sponsor-crm/communication'
import { formatConferenceDateLong } from '@/lib/time'
import { conferenceBaseUrl } from '@/lib/conference/baseUrl'
import { emailBrandColor, type ConferenceTheme } from '@/lib/branding/theme'
import { createLocalhostWarning } from '@/lib/localhost-warning'
import { SponsorTemplatePicker } from './SponsorTemplatePicker'

export interface SponsorSendModalProps {
  isOpen: boolean
  onClose: () => void
  onSent?: () => void
  sponsorForConference: SponsorForConferenceExpanded
  /** Which kind of email this is. Slice 1 (#1261) sends `information`. */
  kind?: CommunicationKind
  domain: string
  fromEmail: string
  senderName?: string
  conference: {
    title: string
    city: string
    country: string
    startDate: string
    organizer?: string
    domains: string[]
    socialLinks?: string[]
    prospectusUrl?: string
    theme?: ConferenceTheme | null
  }
}

/** Strip editor-assigned `_key`s so a re-keyed but unchanged body compares equal. */
function withoutKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutKeys)
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (k === '_key') continue
      out[k] = withoutKeys(v)
    }
    return out
  }
  return value
}

interface AppliedTemplate {
  id: string
  subject: string
  body: PortableTextBlock[]
}

/**
 * Whether the organizer changed what the template produced. Compared on the
 * normalized content, so merely re-keyed blocks do not read as an edit.
 */
export function isTemplateEdited(
  applied: AppliedTemplate,
  sent: { subject: string; message: PortableTextBlock[] },
): boolean {
  if (applied.subject !== sent.subject) return true
  return (
    JSON.stringify(withoutKeys(applied.body)) !==
    JSON.stringify(withoutKeys(sent.message))
  )
}

/**
 * The To: line of the Send modal — every contact on the sponsor as a toggle,
 * the primary contact preselected as the default recipient. A contact with no
 * email is shown, but cannot be chosen, so the organizer sees WHY someone is
 * missing instead of a shorter list.
 */
export function SponsorRecipientPicker({
  contacts,
  selectedKeys,
  defaultKey,
  onToggle,
}: {
  contacts: ContactPerson[]
  selectedKeys: ReadonlySet<string>
  defaultKey?: string
  onToggle: (key: string) => void
}) {
  if (contacts.length === 0) {
    return (
      <span className="font-inter text-sm text-red-600 dark:text-red-400">
        No contact persons on this sponsor — add one first.
      </span>
    )
  }
  return (
    <div
      role="group"
      aria-label="Recipients"
      className="flex flex-wrap items-center gap-2"
    >
      {contacts.map((contact) => {
        const selectable = !!contact.email
        const selected = selectedKeys.has(contact._key)
        return (
          <label
            key={contact._key}
            title={
              selectable
                ? contact.email
                : `${contact.name} has no email address`
            }
            className={clsx(
              'font-inter inline-flex min-h-8 max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-sm transition-colors select-none',
              selectable && 'cursor-pointer',
              selected
                ? 'border-brand-cloud-blue bg-brand-sky-mist text-brand-slate-gray dark:border-indigo-400 dark:bg-indigo-900/40 dark:text-indigo-100'
                : selectable
                  ? 'border-gray-300 bg-white text-gray-700 hover:border-gray-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:border-gray-500'
                  : 'cursor-not-allowed border-dashed border-gray-300 text-gray-400 dark:border-gray-600 dark:text-gray-500',
            )}
          >
            <input
              type="checkbox"
              className="sr-only"
              checked={selected}
              disabled={!selectable}
              onChange={() => onToggle(contact._key)}
              aria-label={`${contact.name}${selectable ? '' : ' (no email)'}`}
            />
            <span
              aria-hidden="true"
              className={clsx(
                'flex size-4 shrink-0 items-center justify-center rounded-full border',
                selected
                  ? 'border-brand-cloud-blue bg-brand-cloud-blue text-white dark:border-indigo-400 dark:bg-indigo-500'
                  : 'border-gray-300 dark:border-gray-500',
              )}
            >
              {selected && <CheckIcon className="size-3" />}
            </span>
            <span className="font-medium whitespace-nowrap">
              {contact.name}
            </span>
            {contact.role && (
              <span className="min-w-0 truncate text-xs text-gray-500 dark:text-gray-400">
                {contact.role}
              </span>
            )}
            {contact._key === defaultKey && (
              <span className="rounded-sm bg-white/70 px-1 text-[10px] font-semibold tracking-wide text-brand-cloud-blue uppercase dark:bg-indigo-950/60 dark:text-indigo-300">
                Default
              </span>
            )}
            {!selectable && <span className="text-xs italic">no email</span>}
          </label>
        )
      })}
    </div>
  )
}

/**
 * The one Send action for a sponsor (#1261, spec #1260): pick recipients,
 * start from a template, edit, preview, send. The server resolves the chosen
 * contact keys to addresses and records exactly what went out.
 */
export function SponsorSendModal({
  isOpen,
  onClose,
  onSent,
  sponsorForConference,
  kind = 'information',
  domain,
  fromEmail,
  senderName,
  conference,
}: SponsorSendModalProps) {
  const { showNotification } = useNotification()
  const sendMutation = api.sponsor.crm.sendCommunication.useMutation()
  const utils = api.useUtils()

  const contacts = useMemo(
    () => sponsorForConference.contactPersons ?? [],
    [sponsorForConference.contactPersons],
  )
  const defaultKey = useMemo(() => defaultRecipientKey(contacts), [contacts])

  const [selectedKeys, setSelectedKeys] = useState<ReadonlySet<string>>(
    () => new Set(defaultKey ? [defaultKey] : []),
  )
  // Re-seed the selection each time the modal opens (or opens for another
  // sponsor): the default recipient is a per-open starting point, not a
  // remembered preference.
  const seededForRef = useRef<string | null>(null)
  useEffect(() => {
    const seedKey = isOpen
      ? `${sponsorForConference._id}:${defaultKey ?? ''}`
      : null
    if (seedKey && seededForRef.current !== seedKey) {
      seededForRef.current = seedKey
      setSelectedKeys(new Set(defaultKey ? [defaultKey] : []))
    }
    if (!isOpen) seededForRef.current = null
  }, [isOpen, sponsorForConference._id, defaultKey])

  const appliedTemplateRef = useRef<AppliedTemplate | null>(null)
  useEffect(() => {
    if (!isOpen) appliedTemplateRef.current = null
  }, [isOpen])

  const toggleRecipient = (key: string) =>
    setSelectedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  const kindLabel = COMMUNICATION_KIND_LABELS[kind]
  const selectedCount = selectedKeys.size

  const handleSend = async ({
    subject,
    message,
  }: {
    subject: string
    message: PortableTextBlock[]
  }) => {
    if (selectedCount === 0) {
      throw new Error('Choose at least one recipient')
    }
    const applied = appliedTemplateRef.current
    const result = await sendMutation.mutateAsync({
      sponsorForConferenceId: sponsorForConference._id,
      kind: 'information',
      recipientKeys: Array.from(selectedKeys),
      subject,
      message: JSON.stringify(message as PortableTextBlockForHTML[]),
      ...(applied
        ? {
            template: {
              id: applied.id,
              edited: isTemplateEdited(applied, { subject, message }),
            },
          }
        : {}),
    })
    utils.sponsor.crm.activities.list.invalidate()
    utils.sponsor.crm.activities.listCommunications.invalidate()
    showNotification({
      type: 'success',
      title: `${kindLabel} sent`,
      message: `Sent to ${result.recipientCount} contact${result.recipientCount === 1 ? '' : 's'} at ${sponsorForConference.sponsor.name}.`,
    })
    onSent?.()
  }

  const createPreview = ({
    subject,
    messageHTML,
  }: {
    subject: string
    messageHTML: string
  }) => (
    <BroadcastTemplate
      subject={subject}
      eventName={conference.title}
      eventLocation={`${conference.city}, ${conference.country}`}
      eventDate={formatConferenceDateLong(conference.startDate)}
      eventUrl={conferenceBaseUrl(conference)}
      socialLinks={conference.socialLinks || []}
      brandColor={emailBrandColor(conference.theme)}
      content={<div dangerouslySetInnerHTML={{ __html: messageHTML }} />}
    />
  )

  const localhostWarning = createLocalhostWarning(domain, 'sponsors')
  const noRecipientHint =
    contacts.length > 0 && selectedCount === 0 ? (
      <p className="font-inter text-sm text-amber-700 dark:text-amber-300">
        Choose at least one recipient before sending.
      </p>
    ) : null

  const selectedNames = contacts
    .filter((c) => selectedKeys.has(c._key))
    .map((c) => c.name)

  return (
    <EmailModal
      isOpen={isOpen}
      onClose={onClose}
      title={`Send ${kindLabel.toLowerCase()}`}
      recipientInfo={
        <SponsorRecipientPicker
          contacts={contacts}
          selectedKeys={selectedKeys}
          defaultKey={defaultKey}
          onToggle={toggleRecipient}
        />
      }
      contextInfo={`Sponsor: ${sponsorForConference.sponsor.name}`}
      onSend={handleSend}
      submitButtonText={
        selectedCount > 1 ? `Send to ${selectedCount} contacts` : 'Send'
      }
      storageKey={`sponsor-send-${kind}-${sponsorForConference._id}`}
      previewComponent={createPreview}
      brandColor={emailBrandColor(conference.theme)}
      fromAddress={fromEmail}
      warningContent={
        (localhostWarning || noRecipientHint) && (
          <div className="space-y-3">
            {localhostWarning}
            {noRecipientHint}
          </div>
        )
      }
      templateSelector={({ setSubject, setMessage }) => (
        <SponsorTemplatePicker
          sponsorName={sponsorForConference.sponsor.name}
          contactNames={
            selectedNames.length > 0 ? selectedNames.join(' and ') : undefined
          }
          conference={conference}
          senderName={senderName}
          tierName={sponsorForConference.tier?.title}
          onApply={(subject, body, template: SponsorEmailTemplate) => {
            appliedTemplateRef.current = { id: template._id, subject, body }
            setSubject(subject)
            setMessage(body)
          }}
          crmContext={{
            tags: sponsorForConference.tags,
            status: sponsorForConference.status,
            currency: sponsorForConference.contractCurrency,
            orgNumber: sponsorForConference.sponsor.orgNumber,
            website: sponsorForConference.sponsor.website,
          }}
        />
      )}
      initialValues={{
        subject: `${kindLabel}: ${conference.title}`,
        message: [],
      }}
      placeholder={{
        subject: 'Enter email subject...',
        message: 'Write to the sponsor, or start from a template above...',
      }}
    />
  )
}
