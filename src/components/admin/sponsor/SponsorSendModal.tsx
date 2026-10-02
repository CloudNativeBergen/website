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
import type {
  ContactPerson,
  SponsorEmailTemplate,
  TemplateCategory,
  TemplateLanguage,
  PortableTextBlock as TemplateBlock,
} from '@/lib/sponsor/types'
import {
  buildTemplateVariables,
  processPortableTextVariables,
  processTemplateVariables,
  suggestTemplateCategory,
  suggestTemplateLanguage,
} from '@/lib/sponsor/templates'
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
 * The template a send of this kind starts from (#1261 AC4): a default of the
 * kind's category in the sponsor's suggested language, else any default of
 * the kind, else the best-scoring candidate — `undefined` only when the
 * conference has no template for the kind at all. `information` draws on every
 * non-contract category; the contract kind (slice #1264) on `contract`.
 */
export function pickDefaultTemplate(
  templates: readonly SponsorEmailTemplate[] | undefined,
  kind: CommunicationKind,
  crm: {
    tags?: string[]
    status?: string
    currency?: string
    orgNumber?: string
    website?: string
  },
): SponsorEmailTemplate | undefined {
  if (!templates?.length) return undefined
  const forKind = templates.filter((t) =>
    kind === 'contract' ? t.category === 'contract' : t.category !== 'contract',
  )
  if (forKind.length === 0) return undefined
  const language: TemplateLanguage = suggestTemplateLanguage(crm)
  const category: TemplateCategory = suggestTemplateCategory(crm)
  const score = (t: SponsorEmailTemplate) =>
    (t.isDefault ? 8 : 0) +
    (t.language === language ? 2 : 0) +
    (t.category === category ? 1 : 0)
  return [...forKind].sort(
    (a, b) => score(b) - score(a) || (a.sortOrder ?? 0) - (b.sortOrder ?? 0),
  )[0]
}

/** Where the applied template's provenance rides alongside EmailModal's draft. */
function provenanceKey(draftKey: string) {
  return `${draftKey}:template`
}

function readStorage(key: string): string | null {
  try {
    return typeof window === 'undefined' ? null : localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeStorage(key: string, value: string | null) {
  try {
    if (typeof window === 'undefined') return
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    // Storage is a convenience; a blocked store must not block sending.
  }
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

  const draftKey = `sponsor-send-${kind}-${sponsorForConference._id}`

  // The template a send started from. Persisted next to EmailModal's draft so
  // a draft restored on reopen keeps its provenance (and its edited baseline).
  const appliedTemplateRef = useRef<AppliedTemplate | null>(null)
  const rememberApplied = (applied: AppliedTemplate | null) => {
    appliedTemplateRef.current = applied
    writeStorage(
      provenanceKey(draftKey),
      applied ? JSON.stringify(applied) : null,
    )
  }
  useEffect(() => {
    if (!isOpen) {
      appliedTemplateRef.current = null
      return
    }
    const stored = readStorage(provenanceKey(draftKey))
    if (stored) {
      try {
        appliedTemplateRef.current = JSON.parse(stored) as AppliedTemplate
      } catch {
        appliedTemplateRef.current = null
      }
    }
  }, [isOpen, draftKey])

  const crmContext = {
    tags: sponsorForConference.tags,
    status: sponsorForConference.status,
    currency: sponsorForConference.contractCurrency,
    orgNumber: sponsorForConference.sponsor.orgNumber,
    website: sponsorForConference.sponsor.website,
  }

  // AC4: the kind's default template is preselected. EmailModal reads
  // `initialValues` once per open, so the modal waits for the template list
  // and the default is only applied when no draft is waiting in storage.
  const templatesQuery = api.sponsor.emailTemplates.list.useQuery(undefined, {
    enabled: isOpen,
  })
  const templatesSettled = !templatesQuery.isLoading
  const hasDraft = isOpen && !!readStorage(draftKey)
  const defaultTemplate = useMemo(
    () =>
      hasDraft
        ? undefined
        : pickDefaultTemplate(templatesQuery.data, kind, crmContext),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- crmContext is derived from the sponsor
    [hasDraft, templatesQuery.data, kind, sponsorForConference._id],
  )
  const selectedNames = contacts
    .filter((c) => selectedKeys.has(c._key))
    .map((c) => c.name)
  const templateVariables = buildTemplateVariables({
    sponsorName: sponsorForConference.sponsor.name,
    contactNames:
      selectedNames.length > 0 ? selectedNames.join(' and ') : undefined,
    conference,
    senderName,
    tierName: sponsorForConference.tier?.title,
  })
  const initialFromDefault = useMemo(() => {
    if (!defaultTemplate) return undefined
    return {
      id: defaultTemplate._id,
      subject: processTemplateVariables(
        defaultTemplate.subject,
        templateVariables,
      ),
      body: (defaultTemplate.body
        ? processPortableTextVariables(
            defaultTemplate.body as TemplateBlock[],
            templateVariables,
          )
        : []) as unknown as PortableTextBlock[],
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- recomputed per open, not per keystroke
  }, [defaultTemplate?._id, isOpen])
  useEffect(() => {
    if (isOpen && initialFromDefault && !appliedTemplateRef.current) {
      rememberApplied(initialFromDefault)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rememberApplied is stable per draftKey
  }, [isOpen, initialFromDefault])

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
    rememberApplied(null)
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

  return (
    <EmailModal
      isOpen={isOpen && templatesSettled}
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
      storageKey={draftKey}
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
            rememberApplied({ id: template._id, subject, body })
            setSubject(subject)
            setMessage(body)
          }}
          crmContext={crmContext}
        />
      )}
      initialValues={{
        subject:
          initialFromDefault?.subject ?? `${kindLabel}: ${conference.title}`,
        message: initialFromDefault?.body ?? [],
      }}
      placeholder={{
        subject: 'Enter email subject...',
        message: 'Write to the sponsor, or start from a template above...',
      }}
    />
  )
}
