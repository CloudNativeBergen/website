'use client'

import { useEffect, useId, useMemo, useRef, useState } from 'react'
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
  TEMPLATE_NOT_FOUND_MESSAGE,
  TEMPLATE_WRONG_KIND_MESSAGE,
  defaultRecipientKey,
} from '@/lib/sponsor-crm/communication'
import { formatConferenceDateLong } from '@/lib/time'
import { conferenceBaseUrl } from '@/lib/conference/baseUrl'
import { emailBrandColor, type ConferenceTheme } from '@/lib/branding/theme'
import { createLocalhostWarning } from '@/lib/localhost-warning'
import { discountCodesCardHtml } from '@/lib/sponsor-crm/discount-email'
import { SponsorTemplatePicker } from './SponsorTemplatePicker'

export interface SponsorSendModalProps {
  isOpen: boolean
  onClose: () => void
  onSent?: () => void
  sponsorForConference: SponsorForConferenceExpanded
  /**
   * Which kind of email this is. Narrowed to what `sendCommunication`
   * accepts today (`information`, and `discount` since #1262); #1263–#1264
   * widen both this type and the Zod enum together, so a kind the server
   * would refuse can never be posted.
   */
  kind?: SendableKind
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
    /** Sponsor ticket-registration link; exposed as `SPONSOR_REGISTRATION_URL`. */
    sponsorRegistrationLink?: string
    theme?: ConferenceTheme | null
  }
}

/**
 * The From: line the modal shows — mirrors the server's
 * `resolveConferenceFrom(…, { field: 'sponsorEmail', localPart: 'sponsors' })`
 * fallback, in ONE place for every host of the modal.
 */
export function sponsorFromAddress(
  conference: { sponsorEmail?: string; domains?: string[] },
  domain: string,
): string {
  return (
    conference.sponsorEmail || `sponsors@${conference.domains?.[0] || domain}`
  )
}

/** The kinds the Send mutation accepts — mirrors `SendCommunicationSchema.kind`. */
export type SendableKind = Extract<
  CommunicationKind,
  'information' | 'discount'
>

/** One row of `crm.discountCodeOptions` (#1262). */
export interface DiscountCodeOption {
  code: string
  /** Attributed to this sponsor — preselected. */
  selected: boolean
  /** Already stored on this sponsor. */
  linked: boolean
  /** Stored on ANOTHER sponsor; the server refuses it, so it cannot be picked. */
  linkedTo?: string
  /**
   * Counted for ANOTHER sponsor by its name (nothing stored). Pickable — but
   * sending it moves it to this sponsor, so the picker says so.
   */
  attributedTo?: string
}

/**
 * Provenance of the template a draft started from — only what is persisted
 * (via EmailModal's `additionalFields`) and compared: the id, and which
 * recipients' names were merged into the greeting at apply time. The edited
 * baseline is NOT kept here; the server recomputes it from the template.
 */
interface AppliedTemplate {
  id: string
  recipientKeys?: string[]
}

/**
 * The template a send of this kind starts from (#1261 AC4): among the
 * templates flagged `isDefault` for the kind, the one in the sponsor's
 * suggested language and category wins. Nothing flagged default ⇒ nothing is
 * preselected; the organizer picks or writes. `information` draws on every
 * non-contract category; the contract kind (slice #1264) on `contract`;
 * `discount` preselects nothing.
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
  // No template category is FOR discount codes, so no default is: a booth or
  // outreach default would open a code send with the wrong copy (#1262). The
  // organizer can still pick one; the codes block is appended either way.
  if (kind === 'discount') return undefined
  const candidates = templates.filter(
    (t) =>
      t.isDefault &&
      (kind === 'contract'
        ? t.category === 'contract'
        : t.category !== 'contract'),
  )
  if (candidates.length === 0) return undefined
  const language: TemplateLanguage = suggestTemplateLanguage(crm)
  const category: TemplateCategory = suggestTemplateCategory(crm)
  const score = (t: SponsorEmailTemplate) =>
    (t.language === language ? 2 : 0) + (t.category === category ? 1 : 0)
  return [...candidates].sort(
    (a, b) => score(b) - score(a) || (a.sortOrder ?? 0) - (b.sortOrder ?? 0),
  )[0]
}

/** Every template category except `contract` — what a contract send must NOT start from. */
const NON_CONTRACT_CATEGORIES: readonly TemplateCategory[] = [
  'cold-outreach',
  'returning-sponsor',
  'international',
  'local-community',
  'follow-up',
  'custom',
]

/**
 * The starting body of a discount send with no default template: the codes
 * themselves are appended by the server, so the message only introduces them.
 */
function discountGreeting(conferenceTitle: string): PortableTextBlock[] {
  return [
    {
      _type: 'block',
      _key: 'discount-greeting',
      style: 'normal',
      markDefs: [],
      children: [
        {
          _type: 'span',
          _key: 'discount-greeting-text',
          text: `Here are your sponsor discount codes for ${conferenceTitle}.`,
          marks: [],
        },
      ],
    },
  ]
}

/** Read-only probe of EmailModal's draft slot (never written from here). */
function readStorage(key: string): string | null {
  try {
    return typeof window === 'undefined' ? null : localStorage.getItem(key)
  } catch {
    return null
  }
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
              'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-indigo-500 has-[:focus-visible]:ring-offset-1 dark:has-[:focus-visible]:ring-offset-gray-900',
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
 * No sponsor ticket invite link on the conference (#1262 review): the email
 * would point at a store where the sponsor ticket types are hidden. The
 * organizer can paste Checkin's invite link here and save it to the
 * conference — the affordance the old discount modal had — after which this
 * send, and every later one, uses it.
 */
export function SponsorInviteLinkPrompt({
  fallbackUrl,
  onSaved,
}: {
  fallbackUrl: string
  onSaved: () => void
}) {
  const inputId = useId()
  const { showNotification } = useNotification()
  const save = api.conference.updateSponsorRegistrationLink.useMutation()
  // A `type="url"` input strips surrounding whitespace itself.
  const [link, setLink] = useState('')
  const valid = /^https:\/\/\S+$/i.test(link)
  const handleSave = async () => {
    try {
      await save.mutateAsync({ sponsorRegistrationLink: link })
      showNotification({
        type: 'success',
        title: 'Sponsor invite link saved',
        message: 'This send and every later one now point sponsors to it.',
      })
      onSaved()
    } catch (error) {
      showNotification({
        type: 'error',
        title: 'Could not save the link',
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }
  return (
    <div
      role="alert"
      className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3 dark:border-amber-700 dark:bg-amber-900/20"
    >
      <p className="font-inter text-sm text-amber-800 dark:text-amber-200">
        This conference has no sponsor ticket invite link, so the email points
        to {fallbackUrl} — where sponsor ticket types are hidden. Paste
        Checkin&apos;s invite link for the sponsor ticket category to save it on
        the conference.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <label htmlFor={inputId} className="sr-only">
          Sponsor ticket invite link
        </label>
        <input
          id={inputId}
          type="url"
          inputMode="url"
          value={link}
          onChange={(e) => setLink(e.target.value)}
          placeholder="https://…"
          disabled={save.isPending}
          className="font-inter min-h-9 min-w-0 flex-1 rounded-md border border-amber-300 bg-white px-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-brand-cloud-blue focus:ring-1 focus:ring-brand-cloud-blue focus:outline-none dark:border-amber-700 dark:bg-gray-900 dark:text-white"
        />
        <button
          type="button"
          onClick={handleSave}
          disabled={!valid || save.isPending}
          className="font-space-grotesk min-h-9 cursor-pointer rounded-md border border-amber-400 px-3 text-sm font-medium text-amber-900 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-amber-600 dark:text-amber-100 dark:hover:bg-amber-900/40"
        >
          {save.isPending ? 'Saving…' : 'Save to conference'}
        </button>
      </div>
    </div>
  )
}

/** What a screen reader hears for a code chip: the code AND its state. */
function codeChipLabel(option: DiscountCodeOption): string {
  if (option.linkedTo) return `${option.code} (linked to ${option.linkedTo})`
  if (option.attributedTo)
    return `${option.code}, now counted for ${option.attributedTo}; sending moves it to this sponsor`
  if (option.linked) return `${option.code}, already linked to this sponsor`
  return option.code
}

/**
 * The Codes: line of a discount send (#1262) — the conference's discount
 * codes from the ticket provider as toggles, the sponsor's own preselected.
 * A code stored on another sponsor is shown but cannot be chosen, with the
 * reason, so the organizer is not left wondering where it went.
 */
export function SponsorDiscountCodePicker({
  options,
  selectedCodes,
  onToggle,
  state = 'ready',
}: {
  options: readonly DiscountCodeOption[]
  selectedCodes: ReadonlySet<string>
  onToggle: (code: string) => void
  state?: 'loading' | 'error' | 'ready'
}) {
  if (state === 'loading') {
    return (
      <span className="font-inter text-sm text-gray-500 dark:text-gray-400">
        Loading discount codes…
      </span>
    )
  }
  if (state === 'error') {
    return (
      <span
        role="alert"
        className="font-inter text-sm text-red-600 dark:text-red-400"
      >
        The discount codes could not be loaded from the ticket provider.
      </span>
    )
  }
  if (options.length === 0) {
    return (
      <span className="font-inter text-sm text-red-600 dark:text-red-400">
        This event has no discount codes yet — create one in Discount Codes
        first.
      </span>
    )
  }
  return (
    <div
      role="group"
      aria-label="Discount codes"
      className="flex flex-wrap items-center gap-2"
    >
      {options.map((option) => {
        const selectable = !option.linkedTo
        const selected = selectedCodes.has(option.code)
        // The "counted for X" hint wraps onto its own line rather than
        // truncating the code — the code is what the organizer must read.
        const hinted = selectable && !!option.attributedTo
        return (
          <label
            key={option.code}
            title={
              selectable
                ? option.code
                : `${option.code} is linked to ${option.linkedTo}`
            }
            className={clsx(
              'font-inter inline-flex min-h-8 max-w-full items-center gap-1.5 border px-2.5 py-1 text-sm transition-colors select-none',
              hinted ? 'flex-wrap rounded-2xl' : 'rounded-full',
              'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-indigo-500 has-[:focus-visible]:ring-offset-1 dark:has-[:focus-visible]:ring-offset-gray-900',
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
              onChange={() => onToggle(option.code)}
              aria-label={codeChipLabel(option)}
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
            <span className="truncate font-mono text-[13px] font-medium">
              {option.code}
            </span>
            {option.linked && (
              <span className="rounded-sm bg-white/70 px-1 text-[10px] font-semibold tracking-wide text-brand-cloud-blue uppercase dark:bg-indigo-950/60 dark:text-indigo-300">
                Linked
              </span>
            )}
            {option.linkedTo && (
              <span className="min-w-0 truncate text-xs italic">
                {option.linkedTo}
              </span>
            )}
            {hinted && (
              <span className="basis-full pl-5.5 text-xs text-amber-700 dark:text-amber-300">
                counted for {option.attributedTo} · sending moves it
              </span>
            )}
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

  // The template a send started from. It is PERSISTED THROUGH EmailModal's
  // `additionalFields`, which the composer saves in the SAME debounced write
  // as the subject and body — so a reopen can never restore one draft's text
  // with another template's provenance (a separate key could: applying a
  // template wrote its id at once while the text saved a second later).
  // The ref is what the send reads (always current, even mid-event); the
  // state mirror is what the RENDER reads (the picker's selected value, the
  // recipients-changed hint). Both are written only through rememberApplied.
  const appliedTemplateRef = useRef<AppliedTemplate | null>(null)
  const [appliedTemplate, setAppliedTemplate] =
    useState<AppliedTemplate | null>(null)
  const rememberApplied = (applied: AppliedTemplate | null) => {
    appliedTemplateRef.current = applied
    setAppliedTemplate(applied)
  }
  useEffect(() => {
    if (!isOpen) {
      appliedTemplateRef.current = null
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset per close
      setAppliedTemplate(null)
    }
  }, [isOpen])
  const provenanceFields: Record<string, string> = appliedTemplate
    ? {
        templateId: appliedTemplate.id,
        templateRecipientKeys: (appliedTemplate.recipientKeys ?? []).join(','),
      }
    : {}
  /** EmailModal restored a draft: adopt the provenance saved WITH it. */
  const restoreProvenance = (
    fields: Record<string, string | number | boolean>,
  ) => {
    const id = typeof fields.templateId === 'string' ? fields.templateId : ''
    if (!id) {
      rememberApplied(null)
      return
    }
    const keys =
      typeof fields.templateRecipientKeys === 'string' &&
      fields.templateRecipientKeys.length > 0
        ? fields.templateRecipientKeys.split(',')
        : []
    rememberApplied({ id, recipientKeys: keys })
  }

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
  // Whether a draft was waiting when the modal OPENED — sampled once per
  // open, not per render, so a later re-render (a recipient toggle after
  // "Clear draft") cannot flip it and attach a default the editor never
  // showed. `forOpen` ties the sample to THIS open, so a host that keeps the
  // modal mounted across opens cannot see a stale sample on its first render.
  const [draftProbe, setDraftProbe] = useState(() => ({
    forOpen: isOpen,
    hasDraft: isOpen && !!readStorage(draftKey),
  }))
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sampled once per open
    setDraftProbe({
      forOpen: isOpen,
      hasDraft: isOpen && !!readStorage(draftKey),
    })
  }, [isOpen, draftKey])
  const hasDraft = !draftProbe.forOpen || draftProbe.hasDraft
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
  // EmailModal hands its setters to the template slot; keeping them lets the
  // greeting be re-merged when the recipients change AFTER a template was
  // applied, instead of silently sending "Hi Kari" to Ola.
  const editorRef = useRef<{
    setSubject: (s: string) => void
    setMessage: (b: PortableTextBlock[]) => void
  } | null>(null)
  const applyTemplate = (template: SponsorEmailTemplate) => {
    const subject = processTemplateVariables(
      template.subject,
      templateVariables,
    )
    const body = (template.body
      ? processPortableTextVariables(
          template.body as TemplateBlock[],
          templateVariables,
        )
      : []) as unknown as PortableTextBlock[]
    rememberApplied({
      id: template._id,
      recipientKeys: Array.from(selectedKeys),
    })
    editorRef.current?.setSubject(subject)
    editorRef.current?.setMessage(body)
  }
  const appliedTemplateDoc = templatesQuery.data?.find(
    (t) => t._id === appliedTemplate?.id,
  )
  const appliedKeys = appliedTemplate?.recipientKeys
  const recipientsChangedSinceApply =
    !!appliedTemplateDoc &&
    !!appliedKeys &&
    (appliedKeys.length !== selectedKeys.size ||
      appliedKeys.some((k) => !selectedKeys.has(k)))

  const initialFromDefault = useMemo(() => {
    if (!defaultTemplate) return undefined
    return {
      id: defaultTemplate._id,
      recipientKeys: Array.from(selectedKeys),
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
  }, [isOpen, initialFromDefault])

  const toggleRecipient = (key: string) =>
    setSelectedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  // DISCOUNT KIND (#1262): which codes go out. Seeded once per open from
  // the server's attribution (the sponsor's stored codes, or by name while it
  // stores none), then the organizer's to change.
  const isDiscount = kind === 'discount'
  const codesQuery = api.sponsor.crm.discountCodeOptions.useQuery(
    { sponsorForConferenceId: sponsorForConference._id },
    {
      enabled: isOpen && isDiscount,
      refetchOnWindowFocus: false,
      // Never the app-wide 60 s cache: a code assigned on the discount page
      // a moment ago must be offered — and preselected — on this open.
      staleTime: 0,
    },
  )
  const codeOptions = useMemo(
    () => codesQuery.data?.codes ?? [],
    [codesQuery.data],
  )
  const [selectedCodes, setSelectedCodes] = useState<ReadonlySet<string>>(
    () => new Set(),
  )
  // Which open the selection was seeded for. STATE, not a ref: the picker
  // stays non-interactive until it is set, so a toggle can never be made in
  // the window before the seed lands and then be overwritten by it.
  const [codesSeededFor, setCodesSeededFor] = useState<string | null>(null)
  const codesSeeded = codesSeededFor === sponsorForConference._id
  useEffect(() => {
    if (!isOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset per close
      setCodesSeededFor(null)
      // Each open starts from its own seed; nothing chosen carries over.
      setSelectedCodes(new Set())
      return
    }
    // From SETTLED data only: on a reopen the cache answers first and a
    // refetch follows; seeding from the cache would miss a code assigned
    // since (#1262 review).
    if (
      !codesQuery.data ||
      codesQuery.isFetching ||
      codesQuery.isError ||
      codesSeeded
    )
      return
    setCodesSeededFor(sponsorForConference._id)
    setSelectedCodes(
      new Set(
        codesQuery.data.codes
          .filter((c) => c.selected && !c.linkedTo)
          .map((c) => c.code),
      ),
    )
  }, [
    isOpen,
    codesQuery.data,
    codesQuery.isFetching,
    codesQuery.isError,
    codesSeeded,
    sponsorForConference._id,
  ])
  const toggleCode = (code: string) =>
    setSelectedCodes((prev) => {
      const next = new Set(prev)
      if (next.has(code)) next.delete(code)
      else next.add(code)
      return next
    })
  // Option order, not click order: the email lists codes as the picker does.
  const chosenCodes = codeOptions
    .map((c) => c.code)
    .filter((code) => selectedCodes.has(code))

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
    // The picker shows an error instead of the codes: whatever is still
    // selected underneath is not something the organizer can see.
    if (isDiscount && codesQuery.isError) {
      throw new Error(
        'The discount codes could not be loaded. Close and try again.',
      )
    }
    // Empty until this open's seed lands (cleared on close), so this also
    // refuses a send made before the code list is ready.
    if (isDiscount && chosenCodes.length === 0) {
      throw new Error('Choose at least one discount code')
    }
    const applied = appliedTemplateRef.current
    const base = {
      sponsorForConferenceId: sponsorForConference._id,
      kind,
      recipientKeys: Array.from(selectedKeys),
      subject,
      message: JSON.stringify(message as PortableTextBlockForHTML[]),
      ...(isDiscount && { discountCodes: chosenCodes }),
    }
    // `edited` is computed on the server; only the id travels.
    const withProvenance = applied
      ? { ...base, template: { id: applied.id } }
      : base
    // A failed send is RECORDED on the server before the mutation rejects, so
    // the timeline and the Communications tab must refresh on either outcome.
    const invalidateRecords = () => {
      utils.sponsor.crm.activities.list.invalidate()
      utils.sponsor.crm.activities.listCommunications.invalidate()
      if (isDiscount) utils.sponsor.crm.discountCodeOptions.invalidate()
    }
    let result: Awaited<ReturnType<typeof sendMutation.mutateAsync>>
    try {
      result = await sendMutation.mutateAsync(withProvenance)
    } catch (error) {
      invalidateRecords()
      // The template this draft started from has since been deleted: the
      // content is still what the organizer wrote, so send it WITHOUT the
      // stale provenance instead of blocking every future send.
      if (
        applied &&
        error instanceof Error &&
        (error.message === TEMPLATE_NOT_FOUND_MESSAGE ||
          error.message === TEMPLATE_WRONG_KIND_MESSAGE)
      ) {
        rememberApplied(null)
        try {
          result = await sendMutation.mutateAsync(base)
        } finally {
          invalidateRecords()
        }
      } else {
        throw error
      }
    }
    rememberApplied(null)
    invalidateRecords()
    showNotification({
      type: 'success',
      title: `${kindLabel} sent`,
      message: `Sent to ${result.recipientCount} contact${result.recipientCount === 1 ? '' : 's'} at ${sponsorForConference.sponsor.name}.`,
    })
    if ('linkFailed' in result && result.linkFailed) {
      showNotification({
        type: 'warning',
        title: 'Codes not linked to the sponsor',
        message:
          'The email went out, but the codes could not be stored on the sponsor. A code that still matches the sponsor by name keeps counting for them and is stored on the next send; one that now shows as standalone in Discount Codes can be assigned there.',
      })
    }
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
      content={
        <div
          dangerouslySetInnerHTML={{
            // The SAME block the server appends, so the preview is the send.
            __html:
              isDiscount && codesQuery.data && chosenCodes.length > 0
                ? `${messageHTML}${discountCodesCardHtml({
                    codes: chosenCodes,
                    ticketUrl: codesQuery.data.ticketUrl,
                    theme: conference.theme,
                  })}`
                : messageHTML,
          }}
        />
      }
    />
  )

  const localhostWarning = createLocalhostWarning(domain, 'sponsors')
  const templatesFailedNotice = templatesQuery.isError ? (
    <p
      role="status"
      className="font-inter text-sm text-amber-700 dark:text-amber-300"
    >
      Templates could not be loaded, so none was applied. You can still write
      and send.
    </p>
  ) : null
  // Not offered with nobody selected: re-applying would merge a bare
  // `{{{CONTACT_NAMES}}}` placeholder into the body.
  const recipientsChangedHint =
    recipientsChangedSinceApply && appliedTemplateDoc && selectedCount > 0 ? (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <p className="font-inter text-sm text-amber-700 dark:text-amber-300">
          The recipients changed after the template was applied, so the greeting
          may name the wrong person.
        </p>
        <button
          type="button"
          onClick={() => applyTemplate(appliedTemplateDoc)}
          className="font-space-grotesk cursor-pointer rounded-md border border-amber-300 px-2.5 py-1 text-xs font-medium text-amber-800 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-200 dark:hover:bg-amber-900/30"
        >
          Re-apply template
        </button>
      </div>
    ) : null
  const noRecipientHint =
    contacts.length > 0 && selectedCount === 0 ? (
      <p className="font-inter text-sm text-amber-700 dark:text-amber-300">
        Choose at least one recipient before sending.
      </p>
    ) : null
  const noInviteLinkHint =
    isDiscount && codesQuery.data && !codesQuery.data.hasSponsorInviteLink ? (
      <SponsorInviteLinkPrompt
        fallbackUrl={codesQuery.data.ticketUrl}
        onSaved={() => utils.sponsor.crm.discountCodeOptions.invalidate()}
      />
    ) : null
  const noCodeHint =
    isDiscount && codeOptions.length > 0 && chosenCodes.length === 0 ? (
      <p className="font-inter text-sm text-amber-700 dark:text-amber-300">
        Choose at least one discount code before sending.
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
      additionalFields={provenanceFields}
      onAdditionalFieldsChange={restoreProvenance}
      onClearDraft={() => rememberApplied(initialFromDefault ?? null)}
      previewComponent={createPreview}
      brandColor={emailBrandColor(conference.theme)}
      fromAddress={fromEmail}
      warningContent={
        (localhostWarning ||
          noRecipientHint ||
          noCodeHint ||
          noInviteLinkHint ||
          recipientsChangedHint ||
          templatesFailedNotice) && (
          <div className="space-y-3">
            {localhostWarning}
            {templatesFailedNotice}
            {noRecipientHint}
            {noInviteLinkHint}
            {noCodeHint}
            {recipientsChangedHint}
          </div>
        )
      }
      extraField={
        isDiscount
          ? {
              label: 'Codes:',
              content: (
                <SponsorDiscountCodePicker
                  options={codeOptions}
                  selectedCodes={selectedCodes}
                  onToggle={toggleCode}
                  state={
                    codesQuery.isError
                      ? 'error'
                      : codesSeeded
                        ? 'ready'
                        : 'loading'
                  }
                />
              ),
            }
          : undefined
      }
      templateSelector={({ setSubject, setMessage }) => {
        editorRef.current = { setSubject, setMessage }
        return (
          <SponsorTemplatePicker
            sponsorName={sponsorForConference.sponsor.name}
            contactNames={
              selectedNames.length > 0 ? selectedNames.join(' and ') : undefined
            }
            conference={conference}
            senderName={senderName}
            tierName={sponsorForConference.tier?.title}
            selectedId={appliedTemplate?.id ?? ''}
            onApply={(_subject, _body, template: SponsorEmailTemplate) =>
              applyTemplate(template)
            }
            crmContext={crmContext}
            excludeCategories={
              (kind as CommunicationKind) === 'contract'
                ? NON_CONTRACT_CATEGORIES
                : ['contract']
            }
          />
        )
      }}
      initialValues={{
        subject:
          initialFromDefault?.subject ?? `${kindLabel}: ${conference.title}`,
        message:
          initialFromDefault?.body ??
          (isDiscount ? discountGreeting(conference.title) : []),
      }}
      placeholder={{
        subject: 'Enter email subject...',
        message: 'Write to the sponsor, or start from a template above...',
      }}
    />
  )
}
