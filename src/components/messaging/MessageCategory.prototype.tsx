'use client'

/**
 * THROWAWAY PROTOTYPE — wayfinder ticket #1571, surface "organizer messages
 * inbox — Message Category". Never merged. No tRPC, no mutations: static
 * fixtures and local React state.
 *
 * Shared pieces for the three variants in `MessageCategory.prototype.stories`:
 * the domain shape of a category Judgement, the fixture inbox, a row that
 * mirrors the real `ConversationList` row with a slot for the category, a
 * lightweight thread pane whose header mirrors `ConversationThread`'s organizer
 * header, and the three-pane frame copied from `MessagesWorkspace`.
 *
 * Provenance is shown the same way in every variant so the three can be
 * compared on structure alone:
 *   - set by Jev, confident      → dashed outline chip
 *   - set by Jev, confidence<0.7 → dashed outline chip + trailing "?"
 *   - set by an organizer        → solid chip + tiny check
 *   - set by the system (event)  → solid chip (tooltip names the event)
 *   - not judged                 → faint "No category" ghost (or a group/folder)
 */

import { useEffect, useState, type ReactNode } from 'react'
import {
  Menu,
  MenuButton,
  MenuItem,
  MenuItems,
  MenuSeparator,
} from '@headlessui/react'
import {
  ArrowLeftIcon,
  ChatBubbleLeftRightIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  EllipsisHorizontalIcon,
  FolderIcon,
  PaperAirplaneIcon,
  PlusIcon,
} from '@heroicons/react/24/outline'
import { CheckIcon } from '@heroicons/react/20/solid'
import clsx from 'clsx'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { MissingAvatar } from '@/components/common/MissingAvatar'
import { SpeakerAvatarImage } from '@/components/common/SpeakerAvatarImage'
import { formatRelativeTime } from '@/lib/notification/format'
import type { ConversationListItem } from '@/lib/messaging/types'

// ---------------------------------------------------------------------------
// Domain
// ---------------------------------------------------------------------------

export type MessageCategory =
  | 'talk_details'
  | 'proposal_status'
  | 'account_site'
  | 'schedule'
  | 'travel_visa'
  | 'tickets'
  | 'other'

export const CATEGORY_ORDER: MessageCategory[] = [
  'talk_details',
  'proposal_status',
  'account_site',
  'schedule',
  'travel_visa',
  'tickets',
  'other',
]

export const CATEGORY_LABEL: Record<MessageCategory, string> = {
  talk_details: 'Talk details',
  proposal_status: 'Proposal status',
  account_site: 'Account and site',
  schedule: 'Schedule',
  travel_visa: 'Travel and visa',
  tickets: 'Tickets',
  other: 'Other',
}

/** A small hue per category so a chip is scannable before it is read. */
const CATEGORY_DOT: Record<MessageCategory, string> = {
  talk_details: 'bg-sky-500',
  proposal_status: 'bg-violet-500',
  account_site: 'bg-slate-500',
  schedule: 'bg-emerald-500',
  travel_visa: 'bg-orange-500',
  tickets: 'bg-pink-500',
  other: 'bg-gray-400',
}

export const UNCERTAIN_BELOW = 0.7

export type CategorySource = 'jev' | 'organizer' | 'system'

export interface CategoryJudgement {
  category: MessageCategory
  /** 0–1. Only meaningful for `source: 'jev'`; 1 for the others. */
  confidence: number
  source: CategorySource
  /** The organizer's name (`organizer`) or the event (`system`). */
  by?: string
}

export function isUncertain(j: CategoryJudgement | null): boolean {
  return j !== null && j.source === 'jev' && j.confidence < UNCERTAIN_BELOW
}

/** One line of provenance, used by tooltips and the thread header. */
export function provenanceText(j: CategoryJudgement | null): string {
  if (!j) return 'No category yet — Jev did not judge this conversation.'
  switch (j.source) {
    case 'organizer':
      return `Set by ${j.by ?? 'an organizer'}.`
    case 'system':
      return `Set from the ${j.by ?? 'event'} that opened this conversation.`
    case 'jev':
      return isUncertain(j)
        ? `Best guess (${Math.round(j.confidence * 100)}%) — confirm or change it.`
        : `Suggested (${Math.round(j.confidence * 100)}%).`
  }
}

export interface ProtoMessage {
  authorName: string
  isOwn: boolean
  isOrganizer?: boolean
  isSystem?: boolean
  createdAt: string
  body: string
}

export interface ProtoConversation extends ConversationListItem {
  /** `null` = not judged. Sponsor conversations are always `null`. */
  judgement: CategoryJudgement | null
  messages: ProtoMessage[]
}

// ---------------------------------------------------------------------------
// Fixtures — 13 conversations, Norwegian + English subjects
// ---------------------------------------------------------------------------

const minutesAgo = (m: number) =>
  new Date(Date.now() - m * 60_000).toISOString()

export const ME = { _id: 'organizer-me', name: 'Ola Organizer' }
const OTHER_ORGANIZER = { _id: 'organizer-2', name: 'Grace Hopper' }

type Seed = {
  id: string
  type: ProtoConversation['conversationType']
  subject: string
  proposalTitle?: string
  name: string
  image?: string
  ago: number
  unread?: number
  needsReply?: boolean
  resolved?: boolean
  assigned?: { _id: string; name: string } | null
  direct?: boolean
  judgement: CategoryJudgement | null
  opening: string
  reply?: string
  openingIsSystem?: boolean
}

const SEEDS: Seed[] = [
  {
    id: 'c-visa',
    type: 'general',
    subject: 'Visa invitation letter',
    name: 'Priya Raman',
    ago: 35,
    unread: 3,
    needsReply: true,
    judgement: { category: 'travel_visa', confidence: 0.96, source: 'jev' },
    opening:
      'Hi! The embassy needs an invitation letter on conference letterhead with my passport number. Could you send one this week?',
  },
  {
    id: 'c-slot',
    type: 'general',
    subject: 'Kan jeg bytte slot til torsdag?',
    name: 'Henrik Dahl',
    ago: 70,
    unread: 1,
    needsReply: true,
    // UNCERTAIN: Jev read the mention of the talk and guessed Talk details.
    judgement: { category: 'talk_details', confidence: 0.55, source: 'jev' },
    opening:
      'Hei! Foredraget mitt er satt opp onsdag kl. 09, men jeg lander ikke før onsdag kveld. Kan jeg bytte til torsdag?',
  },
  {
    id: 'conversation.proposal.talk-1',
    type: 'proposal',
    subject: 'Scaling Kubernetes to 10,000 nodes',
    proposalTitle: 'Scaling Kubernetes to 10,000 nodes',
    name: 'Kari Nordmann',
    ago: 60 * 3,
    unread: 1,
    needsReply: true,
    assigned: ME,
    direct: true,
    judgement: { category: 'talk_details', confidence: 0.93, source: 'jev' },
    opening:
      'Kan jeg få 40 minutter i stedet for 30? Demoen trenger litt mer tid enn jeg trodde.',
  },
  {
    id: 'c-login',
    type: 'general',
    subject: "Login link doesn't work",
    name: 'Sofia Alvarez',
    ago: 60 * 5,
    unread: 2,
    needsReply: true,
    judgement: { category: 'account_site', confidence: 0.91, source: 'jev' },
    opening:
      'The magic link in the email says it has expired even when I click it straight away. Tried Safari and Chrome.',
  },
  {
    id: 'conversation.proposal.talk-4',
    type: 'proposal',
    subject: 'Platform engineering uten plattformteam',
    proposalTitle: 'Platform engineering uten plattformteam',
    name: 'Mats Lie',
    ago: 60 * 7,
    // SYSTEM-OPENED: the withdrawal event set the category, not Jev.
    judgement: {
      category: 'proposal_status',
      confidence: 1,
      source: 'system',
      by: 'withdrawal',
    },
    openingIsSystem: true,
    opening:
      'Mats Lie withdrew this proposal. Reason: new job, no travel budget.',
  },
  {
    id: 'c-coticket',
    type: 'general',
    subject: 'Extra ticket for my co-speaker',
    name: 'Amina Yusuf',
    ago: 60 * 9,
    assigned: ME,
    direct: true,
    // ORGANIZER-CHANGED: Jev said Talk details; Ola moved it to Tickets.
    judgement: {
      category: 'tickets',
      confidence: 1,
      source: 'organizer',
      by: 'Ola Organizer',
    },
    opening:
      'My co-speaker Lars is not registered as a speaker in the system. Does he get a ticket too, or should he buy one?',
    reply:
      'He does — I have added him as a co-speaker, so a ticket is on its way.',
  },
  {
    id: 'conversation.proposal.talk-9',
    type: 'proposal',
    subject: 'Observability on a budget',
    proposalTitle: 'Observability on a budget',
    name: 'Tom Eriksen',
    ago: 60 * 12,
    needsReply: true,
    // NOT JUDGED: Jev was off when this one opened.
    judgement: null,
    opening:
      "Here's the updated abstract — let me know if the length works for the programme page.",
  },
  {
    id: 'c-sponsor',
    type: 'sponsor',
    subject: 'Stand placement and logo files',
    name: 'Nordic Cloud AS',
    ago: 60 * 14,
    assigned: OTHER_ORGANIZER,
    judgement: null,
    opening:
      'Sending the SVG logo files today. Is stand 4 still available, next to the coffee station?',
  },
  {
    id: 'c-gitops',
    type: 'proposal',
    subject: 'GitOps at the edge',
    proposalTitle: 'GitOps at the edge',
    name: 'Yuki Tanaka',
    ago: 60 * 20,
    unread: 1,
    needsReply: true,
    judgement: {
      category: 'proposal_status',
      confidence: 0.9,
      source: 'jev',
    },
    opening:
      'When will I hear back about my talk? I need to book flights before the prices go up.',
  },
  {
    id: 'c-lightning',
    type: 'general',
    subject: 'Rekkefølge på lyntalene onsdag',
    name: 'Ingrid Haugen',
    ago: 60 * 26,
    judgement: { category: 'schedule', confidence: 0.84, source: 'jev' },
    opening:
      'Er rekkefølgen på lyntalene onsdag ettermiddag satt? Jeg vil helst ikke gå rett etter lunsj.',
    reply: 'Ikke satt ennå — vi publiserer rekkefølgen fredag.',
  },
  {
    id: 'c-hotel',
    type: 'general',
    subject: 'Reiseregning og hotell',
    name: 'Jonas Berg',
    ago: 60 * 30,
    assigned: OTHER_ORGANIZER,
    judgement: { category: 'travel_visa', confidence: 0.88, source: 'jev' },
    opening: 'Hei! Dekker dere hotell for to netter eller bare én?',
    reply: 'To netter for foredragsholdere som reiser fra utlandet.',
  },
  {
    id: 'c-parking',
    type: 'general',
    subject: 'Parking near the venue',
    name: 'Erik Solheim',
    ago: 60 * 40,
    judgement: { category: 'other', confidence: 0.77, source: 'jev' },
    opening:
      'Is there speaker parking at the venue, or should I use the public garage on Strandgaten?',
  },
  {
    id: 'c-tickets-no',
    type: 'general',
    subject: 'Spørsmål om billetter til kolleger',
    name: 'Lena Strand',
    ago: 60 * 52,
    resolved: true,
    judgement: { category: 'tickets', confidence: 0.9, source: 'jev' },
    opening: 'Får kolleger av foredragsholdere rabatt på billetter?',
    reply:
      'Ja — 20 % med koden i bekreftelses-e-posten. Si fra om den mangler.',
  },
]

export function makeConversations(): ProtoConversation[] {
  return SEEDS.map((s) => {
    const messages: ProtoMessage[] = [
      {
        authorName: s.openingIsSystem ? 'System' : s.name,
        isOwn: false,
        isSystem: s.openingIsSystem,
        createdAt: minutesAgo(s.ago + (s.reply ? 90 : 0)),
        body: s.opening,
      },
    ]
    if (s.reply) {
      messages.push({
        authorName: ME.name,
        isOwn: true,
        isOrganizer: true,
        createdAt: minutesAgo(s.ago),
        body: s.reply,
      })
    }
    const last = messages[messages.length - 1]
    return {
      _id: s.id,
      conversationType: s.type,
      subject: s.subject,
      proposalTitle: s.proposalTitle,
      proposalId: s.proposalTitle ? s.id.replace(/^.*\./, '') : undefined,
      createdAt: minutesAgo(s.ago + 120),
      lastMessageAt: minutesAgo(s.ago),
      unreadCount: s.unread ?? 0,
      lastMessage: {
        authorId: last.isOwn ? ME._id : `speaker-${s.id}`,
        authorName: last.authorName,
        excerpt: last.body,
      },
      counterpart: { name: s.name, image: s.image },
      status: s.resolved ? 'resolved' : 'open',
      assignedTo: s.assigned ?? null,
      needsReply: s.needsReply ?? false,
      direct: s.direct,
      judgement: s.judgement,
      messages,
    }
  })
}

/** Count rows per category for filter chips / folders / group headers. */
export function countByCategory(items: ProtoConversation[]) {
  const counts = Object.fromEntries(
    CATEGORY_ORDER.map((c) => [c, 0]),
  ) as Record<MessageCategory, number>
  let none = 0
  let unsure = 0
  let sponsor = 0
  for (const item of items) {
    if (item.conversationType === 'sponsor') {
      sponsor += 1
      continue
    }
    if (!item.judgement) {
      none += 1
      unsure += 1
      continue
    }
    counts[item.judgement.category] += 1
    if (isUncertain(item.judgement)) unsure += 1
  }
  return { counts, none, unsure, sponsor, all: items.length }
}

// ---------------------------------------------------------------------------
// Category chip + menu
// ---------------------------------------------------------------------------

/**
 * The category as a chip. Provenance is carried by the OUTLINE: dashed = Jev's
 * suggestion (plus "?" when uncertain), solid = a person or the system set it
 * (a tiny check marks the person). The tooltip spells it out.
 */
export function CategoryChip({
  judgement,
  size = 'sm',
  className,
}: {
  judgement: CategoryJudgement | null
  size?: 'sm' | 'md'
  className?: string
}) {
  const base = clsx(
    'inline-flex shrink-0 items-center gap-1 rounded-full font-medium whitespace-nowrap',
    size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs',
    className,
  )
  if (!judgement) {
    return (
      <span
        title={provenanceText(null)}
        className={clsx(
          base,
          'border border-dashed border-gray-300 text-gray-400 italic dark:border-gray-600 dark:text-gray-500',
        )}
      >
        No category
      </span>
    )
  }
  const uncertain = isUncertain(judgement)
  const fromJev = judgement.source === 'jev'
  return (
    <span
      title={provenanceText(judgement)}
      className={clsx(
        base,
        fromJev
          ? 'border border-dashed border-gray-400 text-gray-600 dark:border-gray-500 dark:text-gray-300'
          : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200',
      )}
    >
      <span
        aria-hidden="true"
        className={clsx(
          'h-1.5 w-1.5 shrink-0 rounded-full',
          CATEGORY_DOT[judgement.category],
        )}
      />
      {CATEGORY_LABEL[judgement.category]}
      {uncertain && (
        <span aria-label="uncertain" className="font-semibold">
          ?
        </span>
      )}
      {judgement.source === 'organizer' && (
        <CheckIcon
          aria-label="set by an organizer"
          className="h-3 w-3 text-gray-500 dark:text-gray-400"
        />
      )}
    </span>
  )
}

const MENU_PANEL_CLASS =
  'z-50 w-60 origin-top-right rounded-xl bg-white p-1.5 text-sm shadow-lg ring-1 ring-gray-900/5 transition [--anchor-gap:0.375rem] focus:outline-none data-closed:translate-y-1 data-closed:opacity-0 data-enter:duration-150 data-enter:ease-out data-leave:duration-100 data-leave:ease-in dark:bg-gray-800 dark:ring-white/10'

/**
 * The one way an organizer changes a category, shared by every variant so the
 * variants differ in WHERE it is reached from, not in the picker itself. The
 * current value is checked; a footer line names who set it. Choosing an option
 * records the viewer as the source (an organizer's change always wins).
 */
export function CategoryMenu({
  judgement,
  onChange,
  button,
  buttonClassName,
  buttonLabel = 'Change category',
  anchor = 'bottom end',
  menuLabel = 'Category',
}: {
  judgement: CategoryJudgement | null
  onChange: (category: MessageCategory) => void
  /** The trigger's content (the MenuButton itself is a real <button>). */
  button: ReactNode
  buttonClassName?: string
  buttonLabel?: string
  anchor?: 'bottom end' | 'bottom start'
  menuLabel?: string
}) {
  return (
    <Menu as="div" className="relative inline-flex">
      <MenuButton
        aria-label={buttonLabel}
        title={buttonLabel}
        className={clsx(
          'inline-flex items-center rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cloud-blue',
          buttonClassName,
        )}
      >
        {button}
      </MenuButton>
      <MenuItems anchor={anchor} className={MENU_PANEL_CLASS}>
        <p className="px-2.5 pt-1 pb-1.5 text-[11px] font-semibold tracking-wide text-gray-500 uppercase dark:text-gray-400">
          {menuLabel}
        </p>
        {CATEGORY_ORDER.map((c) => {
          const selected = judgement?.category === c
          return (
            <MenuItem key={c}>
              <button
                type="button"
                onClick={() => onChange(c)}
                className={clsx(
                  'flex min-h-[40px] w-full items-center gap-2 rounded-lg px-2.5 text-left transition data-focus:bg-gray-100 dark:data-focus:bg-gray-700',
                  selected
                    ? 'font-semibold text-gray-900 dark:text-white'
                    : 'text-gray-700 dark:text-gray-200',
                )}
              >
                <span
                  aria-hidden="true"
                  className={clsx(
                    'h-2 w-2 shrink-0 rounded-full',
                    CATEGORY_DOT[c],
                  )}
                />
                <span className="flex-1">{CATEGORY_LABEL[c]}</span>
                {selected && (
                  <CheckIcon
                    className="h-4 w-4 text-brand-cloud-blue dark:text-blue-300"
                    aria-hidden="true"
                  />
                )}
              </button>
            </MenuItem>
          )
        })}
        <MenuSeparator className="my-1 h-px bg-gray-100 dark:bg-gray-700" />
        <p className="px-2.5 py-1.5 text-xs text-gray-500 dark:text-gray-400">
          {provenanceText(judgement)}
        </p>
      </MenuItems>
    </Menu>
  )
}

// ---------------------------------------------------------------------------
// Row — mirrors the real ConversationList organizer row
// ---------------------------------------------------------------------------

function RowAvatar({ item }: { item: ProtoConversation }) {
  const { name, image } = item.counterpart
  return (
    <span
      aria-hidden="true"
      className="mt-0.5 h-10 w-10 shrink-0 overflow-hidden rounded-full"
    >
      {image ? (
        <SpeakerAvatarImage src={image} name={name} size={40} />
      ) : (
        <MissingAvatar name={name} size={40} />
      )}
    </span>
  )
}

function AssigneeBadge({ name }: { name: string }) {
  const initial = name.trim().charAt(0).toUpperCase() || '?'
  return (
    <span
      title={name}
      aria-label={`Assigned to ${name}`}
      className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-cloud-blue/10 text-[11px] font-semibold text-brand-cloud-blue dark:bg-blue-400/10 dark:text-blue-300"
    >
      {initial}
    </span>
  )
}

export function ProtoRow({
  item,
  selected,
  onSelect,
  /** Where the category reads on the row: leading the snippet line, or nowhere. */
  categoryOnRow = 'snippet',
  /** Extra trailing control, a SIBLING of the row button (never nested). */
  trailing,
  /** A tiny provenance marker beside the time (variant C, no chip on the row). */
  provenanceMark,
}: {
  item: ProtoConversation
  selected: boolean
  onSelect: () => void
  categoryOnRow?: 'snippet' | 'none'
  trailing?: ReactNode
  provenanceMark?: ReactNode
}) {
  const isUnread = item.unreadCount > 0
  const isOwnLast = item.lastMessage?.authorId === ME._id
  const isResolved = item.status === 'resolved'
  const showCategory =
    categoryOnRow === 'snippet' && item.conversationType !== 'sponsor'
  const hasTrailing = !!item.assignedTo || !!trailing
  return (
    <div
      className={clsx(
        'relative border-l-2',
        selected
          ? 'border-l-brand-cloud-blue bg-brand-cloud-blue/5 dark:border-l-blue-500 dark:bg-blue-500/15'
          : item.direct
            ? 'border-l-brand-cloud-blue dark:border-l-blue-500'
            : 'border-l-transparent',
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-current={selected ? 'page' : undefined}
        className={clsx(
          'flex w-full gap-3 py-3 pl-4 text-left transition hover:bg-gray-50 focus:outline-none focus-visible:bg-gray-50 focus-visible:ring-2 focus-visible:ring-brand-cloud-blue focus-visible:ring-inset dark:hover:bg-white/10 dark:focus-visible:bg-white/10',
          hasTrailing ? 'pr-14' : 'pr-4',
        )}
      >
        <RowAvatar item={item} />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className="truncate text-sm font-medium text-gray-900 dark:text-white">
              {item.counterpart.name}
            </span>
            <span className="flex shrink-0 items-center gap-2">
              {provenanceMark}
              {isUnread && (
                <span
                  aria-label={`${item.unreadCount} unread messages`}
                  className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-cloud-blue px-1.5 text-[11px] leading-none font-semibold text-white dark:bg-blue-600"
                >
                  {item.unreadCount}
                </span>
              )}
              <span className="text-xs text-gray-400 dark:text-gray-500">
                {formatRelativeTime(item.lastMessageAt)}
              </span>
            </span>
          </span>
          <span className="mt-0.5 flex items-center gap-2">
            {item.direct && (
              <span className="shrink-0 rounded-full bg-brand-cloud-blue/10 px-2 py-0.5 text-[10px] font-semibold text-brand-cloud-blue dark:bg-blue-400/10 dark:text-blue-300">
                Direct
              </span>
            )}
            {item.needsReply && (
              <span
                title="Needs reply"
                aria-label="Needs reply"
                className="h-2 w-2 shrink-0 rounded-full bg-amber-500 dark:bg-amber-400"
              />
            )}
            <span
              className={clsx(
                'truncate text-sm text-gray-900 dark:text-white',
                isUnread ? 'font-bold' : 'font-semibold',
              )}
            >
              {item.subject}
            </span>
            {item.conversationType === 'proposal' && (
              <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500 dark:bg-gray-700 dark:text-gray-400">
                Proposal
              </span>
            )}
            {item.conversationType === 'sponsor' && (
              <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
                Sponsor
              </span>
            )}
            {isResolved && (
              <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500 dark:bg-gray-700 dark:text-gray-400">
                Resolved
              </span>
            )}
          </span>
          {item.lastMessage && (
            <span className="mt-1 flex items-center gap-2">
              {showCategory && <CategoryChip judgement={item.judgement} />}
              <span className="min-w-0 flex-1 truncate text-sm text-gray-500 dark:text-gray-400">
                {isOwnLast && (
                  <span className="font-medium text-gray-600 dark:text-gray-300">
                    You:{' '}
                  </span>
                )}
                {item.lastMessage.excerpt}
              </span>
            </span>
          )}
        </span>
      </button>
      {hasTrailing && (
        <span className="absolute inset-y-0 right-1 flex flex-col items-end justify-center gap-1">
          {item.assignedTo && <AssigneeBadge name={item.assignedTo.name} />}
          {trailing}
        </span>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// View tabs (static mimic of MessagesInbox's organizer tab bar, `Active` on)
// ---------------------------------------------------------------------------

export function StaticViewTabs({ activeCount }: { activeCount: number }) {
  const tabs: { label: string; count?: number }[] = [
    { label: 'Needs reply', count: 6 },
    { label: 'Active', count: activeCount },
    { label: 'Unassigned', count: 8 },
    { label: 'Mine', count: 2 },
    { label: 'Resolved', count: 1 },
    { label: 'Archived' },
  ]
  return (
    <div
      role="tablist"
      aria-label="Filter conversations"
      className="no-scrollbar flex flex-1 gap-1 overflow-x-auto"
    >
      {tabs.map((tab) => {
        const active = tab.label === 'Active'
        return (
          <button
            key={tab.label}
            type="button"
            role="tab"
            aria-selected={active}
            className={clsx(
              'inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-lg px-3 text-sm font-medium whitespace-nowrap transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cloud-blue',
              active
                ? 'bg-brand-cloud-blue text-white dark:bg-blue-600'
                : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800',
            )}
          >
            {tab.label}
            {tab.count ? (
              <span
                aria-hidden="true"
                className={clsx(
                  'inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] leading-none font-semibold',
                  active
                    ? 'bg-white/25 text-white'
                    : 'bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
                )}
              >
                {tab.count}
              </span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Thread pane — mirrors ConversationThread's organizer header + bubbles
// ---------------------------------------------------------------------------

export const HEADER_BUTTON_CLASS =
  'inline-flex min-h-[44px] items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-gray-600 transition hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cloud-blue dark:text-gray-300 dark:hover:bg-gray-800'

function Bubble({ message }: { message: ProtoMessage }) {
  if (message.isSystem) {
    return (
      <div className="flex justify-center">
        <p className="max-w-[90%] rounded-lg bg-gray-50 px-3 py-1.5 text-center text-xs text-gray-500 dark:bg-gray-800/60 dark:text-gray-400">
          {message.body} · {formatRelativeTime(message.createdAt)}
        </p>
      </div>
    )
  }
  return (
    <div className={message.isOwn ? 'flex justify-end' : 'flex justify-start'}>
      <div className="max-w-[80%]">
        <div
          className={clsx(
            'flex items-baseline gap-2',
            message.isOwn ? 'justify-end' : 'justify-start',
          )}
        >
          <span className="text-xs font-semibold text-gray-700 dark:text-gray-200">
            {message.authorName}
          </span>
          {message.isOrganizer && (
            <span className="rounded-full bg-brand-cloud-blue/10 px-1.5 py-0.5 text-[10px] font-medium text-brand-cloud-blue dark:bg-blue-400/10 dark:text-blue-300">
              Organizer
            </span>
          )}
          <span className="text-xs text-gray-400 dark:text-gray-500">
            {formatRelativeTime(message.createdAt)}
          </span>
        </div>
        <div
          className={clsx(
            'mt-1 rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap',
            message.isOwn
              ? 'bg-brand-cloud-blue text-white dark:bg-blue-600'
              : 'bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-100',
          )}
        >
          {message.body}
        </div>
      </div>
    </div>
  )
}

export function ProtoThreadPane({
  item,
  /** Rendered in the header control cluster, before Resolve. */
  headerControl,
  /** Rendered as a strip under the header (variant B's folder line). */
  subheader,
}: {
  item: ProtoConversation
  headerControl?: ReactNode
  subheader?: ReactNode
}) {
  const resolved = item.status === 'resolved'
  return (
    <div
      role="region"
      aria-label={`Conversation: ${item.subject}`}
      className="flex min-h-0 flex-1 flex-col"
    >
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-gray-200 pb-3 dark:border-gray-700">
        <h2 className="min-w-0 truncate text-sm font-semibold text-gray-900 dark:text-white">
          {item.subject}
        </h2>
        <div className="flex shrink-0 items-center gap-2">
          {headerControl}
          <button
            type="button"
            aria-pressed={resolved}
            className={clsx(
              'inline-flex min-h-[44px] items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cloud-blue',
              resolved
                ? 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'
                : 'bg-green-600 text-white hover:bg-green-500',
            )}
          >
            <CheckCircleIcon className="h-4 w-4" aria-hidden="true" />
            {resolved ? 'Reopen' : 'Resolve'}
          </button>
          <button
            type="button"
            aria-label="More conversation actions"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-gray-600 transition hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cloud-blue dark:text-gray-300 dark:hover:bg-gray-800"
          >
            <EllipsisHorizontalIcon className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
      </div>
      {subheader}
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto py-4">
        {item.messages.map((m, i) => (
          <Bubble key={i} message={m} />
        ))}
      </div>
      <div className="shrink-0 border-t border-gray-200 pt-3 dark:border-gray-700">
        <div className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-400 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-500">
          Write a message…
          <div className="h-10" />
        </div>
        <div className="mt-2 flex items-center justify-between">
          <span className="text-xs text-gray-400 dark:text-gray-500">
            0/4000 · ⌘/Ctrl+Enter to send
          </span>
          <button
            type="button"
            disabled
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-cloud-blue px-4 py-2 text-sm font-semibold text-white opacity-50 shadow-sm dark:bg-blue-600"
          >
            <PaperAirplaneIcon className="h-4 w-4" aria-hidden="true" />
            Send
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Three-pane frame — copied from MessagesWorkspace (list | thread), plus an
// optional leading rail for variant B's folders.
// ---------------------------------------------------------------------------

export function ProtoWorkspace({
  step,
  onBack,
  rail,
  list,
  thread,
}: {
  step: 'list' | 'thread'
  onBack: () => void
  /** Variant B: a folder rail left of the list, `lg`-only. */
  rail?: ReactNode
  list: ReactNode
  thread: ReactNode | null
}) {
  return (
    <div
      data-shell-fit="viewport"
      data-pane={step}
      className="flex min-h-0 flex-1 flex-col"
    >
      <div className="shrink-0">
        <AdminPageHeader
          icon={<ChatBubbleLeftRightIcon aria-hidden="true" />}
          title="Messages"
          description="Conversations with speakers and sponsors."
          actionItems={[
            {
              label: 'New conversation',
              icon: <PlusIcon aria-hidden="true" />,
              onClick: () => {},
            },
          ]}
        />
      </div>
      <div className="-mx-2 -mb-3 flex min-h-0 flex-1 overflow-hidden sm:-mx-4 lg:mx-0 lg:mb-0 lg:rounded-lg lg:border lg:border-gray-200 lg:shadow-sm dark:lg:border-gray-700">
        {rail && (
          <div
            data-pane-name="folders"
            className="hidden min-w-0 flex-col border-r border-gray-200 lg:flex lg:w-52 lg:flex-none dark:border-gray-700"
          >
            {rail}
          </div>
        )}
        <div
          data-pane-name="list"
          className={clsx(
            'min-w-0 flex-col border-gray-200 lg:flex lg:w-72 lg:flex-none lg:border-r xl:w-80 dark:border-gray-700',
            step === 'list' ? 'flex flex-1' : 'hidden',
          )}
        >
          <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
            {list}
          </div>
        </div>
        <div
          data-pane-name="thread"
          className={clsx(
            'min-w-0 flex-1 flex-col lg:flex',
            step === 'thread' ? 'flex' : 'hidden',
          )}
        >
          {thread ? (
            <>
              <div className="flex shrink-0 items-center justify-between gap-2 border-b border-gray-200 px-2 py-1 lg:hidden dark:border-gray-700">
                <button
                  type="button"
                  onClick={onBack}
                  className="inline-flex min-h-[44px] items-center gap-1 rounded-lg px-2 text-sm font-medium text-gray-500 transition hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cloud-blue dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
                >
                  <ArrowLeftIcon className="h-4 w-4" aria-hidden="true" />
                  Messages
                </button>
              </div>
              <div className="flex min-h-0 flex-1 flex-col p-3">{thread}</div>
            </>
          ) : (
            <div className="hidden flex-1 flex-col items-center justify-center gap-2 p-8 text-center lg:flex">
              <ChatBubbleLeftRightIcon
                aria-hidden="true"
                className="h-10 w-10 text-gray-400 dark:text-gray-500"
              />
              <p className="text-sm font-medium text-gray-900 dark:text-white">
                Select a conversation
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/** Shared local state for the three variants: rows, selection, step. */
export function useProtoInbox(
  initialSelected?: string,
  initialStep: 'list' | 'thread' = 'list',
) {
  const [items, setItems] = useState<ProtoConversation[]>(() =>
    makeConversations(),
  )
  const [selectedId, setSelectedId] = useState<string | undefined>(
    initialSelected,
  )
  const [step, setStep] = useState<'list' | 'thread'>(initialStep)
  const setCategory = (id: string, category: MessageCategory) =>
    setItems((prev) =>
      prev.map((it) =>
        it._id === id
          ? {
              ...it,
              judgement: {
                category,
                confidence: 1,
                source: 'organizer',
                by: ME.name,
              },
            }
          : it,
      ),
    )
  const select = (id: string) => {
    setSelectedId(id)
    setStep('thread')
  }
  const selected = items.find((it) => it._id === selectedId) ?? null
  return {
    items,
    selected,
    selectedId,
    step,
    select,
    back: () => setStep('list'),
    setCategory,
  }
}

/** Tiny inline chevron for menu triggers. */
export function Caret() {
  return (
    <ChevronDownIcon
      className="h-3.5 w-3.5 text-gray-400 dark:text-gray-500"
      aria-hidden="true"
    />
  )
}

/** Mirrors `withPortalTheme`: Headless UI menus portal past the `.dark` wrapper. */
export function PortalDark({
  dark,
  children,
}: {
  dark: boolean
  children: ReactNode
}) {
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    return () => document.documentElement.classList.remove('dark')
  }, [dark])
  return <>{children}</>
}

export { FolderIcon }
