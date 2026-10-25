/**
 * THROWAWAY PROTOTYPE — wayfinder ticket #1571.
 *
 * QUESTION: How does a Message Category (Jev's one-off topic Judgement on a
 * Conversation) look and behave in the organizer inbox — on the row, as a
 * filter, as a sort/group, and when an organizer changes it?
 *
 * THREE VARIANTS (separate stories, different structure):
 *   A · Chip on row + filter bar — a category chip leads each row's snippet
 *       line; a horizontal chip bar with counts filters; a sort select orders
 *       (Newest / Unsure first / By category); change from the chip in the
 *       thread header.
 *   B · Folders — email-label folders in a left rail (desktop) / a select
 *       (phone), with counts and an "Unsure" smart folder; inside a folder the
 *       row carries no chip; change via "Move to…" in the thread header.
 *   C · Grouped list — the list itself is grouped under collapsible, sticky
 *       category headers with counts; rows carry no chip; change via a
 *       "Move to…" button on the row; the thread header is read-only.
 *
 * Dark mode is resolved by THIS file's decorator from `parameters.dark` (the
 * MessagesWorkspace.stories convention), not the toolbar global.
 */
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { useState } from 'react'
import { expect, userEvent, waitFor, within, screen } from 'storybook/test'
import {
  ChevronDownIcon,
  ChevronRightIcon,
  FolderArrowDownIcon,
  QuestionMarkCircleIcon,
} from '@heroicons/react/24/outline'
import { CheckIcon } from '@heroicons/react/20/solid'
import clsx from 'clsx'
import { mockDateBeforeEach } from '@/lib/storybook'
import {
  CATEGORY_LABEL,
  CATEGORY_ORDER,
  Caret,
  CategoryChip,
  CategoryMenu,
  FolderIcon,
  HEADER_BUTTON_CLASS,
  PortalDark,
  ProtoRow,
  ProtoThreadPane,
  ProtoWorkspace,
  StaticViewTabs,
  countByCategory,
  isUncertain,
  provenanceText,
  useProtoInbox,
  type MessageCategory,
  type ProtoConversation,
} from './MessageCategory.prototype'

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------

const UNCERTAIN_ID = 'c-slot'

/** Provenance beside the time when the row has no chip (variants B and C). */
function ProvenanceMark({ item }: { item: ProtoConversation }) {
  if (item.conversationType === 'sponsor') return null
  if (!item.judgement) {
    return (
      <span
        title={provenanceText(null)}
        className="rounded-full border border-dashed border-gray-300 px-1.5 text-[10px] text-gray-400 italic dark:border-gray-600 dark:text-gray-500"
      >
        none
      </span>
    )
  }
  if (isUncertain(item.judgement)) {
    return (
      <span
        title={provenanceText(item.judgement)}
        aria-label="Category uncertain"
        className="inline-flex h-4 min-w-4 items-center justify-center rounded-full border border-dashed border-gray-400 px-1 text-[10px] font-semibold text-gray-500 dark:border-gray-500 dark:text-gray-400"
      >
        ?
      </span>
    )
  }
  if (item.judgement.source === 'organizer') {
    return (
      <CheckIcon
        title={provenanceText(item.judgement)}
        aria-label="Category set by an organizer"
        className="h-3.5 w-3.5 text-gray-400 dark:text-gray-500"
      />
    )
  }
  return null
}

const SELECT_CLASS =
  'min-h-[36px] rounded-md border border-gray-300 bg-white px-2 pr-7 text-xs font-medium text-gray-700 focus:border-brand-cloud-blue focus:outline-none focus-visible:ring-1 focus-visible:ring-brand-cloud-blue dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200'

// ---------------------------------------------------------------------------
// VARIANT A — chip on row + filter-chip bar + sort select; change in header
// ---------------------------------------------------------------------------

type FilterA = 'all' | MessageCategory | 'none'
type SortA = 'newest' | 'unsure' | 'category'

function VariantA({
  initialSelected,
  initialStep,
}: {
  initialSelected?: string
  initialStep?: 'list' | 'thread'
}) {
  const inbox = useProtoInbox(initialSelected, initialStep)
  const [filter, setFilter] = useState<FilterA>('all')
  const [sort, setSort] = useState<SortA>('newest')
  const tally = countByCategory(inbox.items)

  const visible = inbox.items
    .filter((it) => {
      if (filter === 'all') return true
      if (it.conversationType === 'sponsor') return false
      if (filter === 'none') return it.judgement === null
      return it.judgement?.category === filter
    })
    .sort((a, b) => {
      if (sort === 'unsure') {
        const ua = a.judgement === null || isUncertain(a.judgement) ? 0 : 1
        const ub = b.judgement === null || isUncertain(b.judgement) ? 0 : 1
        if (ua !== ub) return ua - ub
      }
      if (sort === 'category') {
        const ia = a.judgement
          ? CATEGORY_ORDER.indexOf(a.judgement.category)
          : 99
        const ib = b.judgement
          ? CATEGORY_ORDER.indexOf(b.judgement.category)
          : 99
        if (ia !== ib) return ia - ib
      }
      return a.lastMessageAt < b.lastMessageAt ? 1 : -1
    })

  const chips: { key: FilterA; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: tally.all },
    ...CATEGORY_ORDER.map((c) => ({
      key: c as FilterA,
      label: CATEGORY_LABEL[c],
      count: tally.counts[c],
    })),
    { key: 'none', label: 'No category', count: tally.none },
  ]

  const selected = inbox.selected
  const headerControl =
    selected && selected.conversationType !== 'sponsor' ? (
      <CategoryMenu
        judgement={selected.judgement}
        onChange={(c) => inbox.setCategory(selected._id, c)}
        button={
          selected.judgement ? (
            <span className="inline-flex items-center gap-1">
              <CategoryChip judgement={selected.judgement} size="md" />
              <Caret />
            </span>
          ) : (
            <span className={clsx(HEADER_BUTTON_CLASS, 'min-h-0 py-1.5')}>
              Set category
              <Caret />
            </span>
          )
        }
      />
    ) : null

  return (
    <ProtoWorkspace
      step={inbox.step}
      onBack={inbox.back}
      list={
        <>
          <div className="flex shrink-0 items-center gap-2 px-2 pt-1">
            <StaticViewTabs activeCount={inbox.items.length} />
          </div>
          {/* The category filter bar: one scrolling row of chips with counts,
              and the sort select pinned at its end. */}
          <div className="flex shrink-0 items-center gap-2 px-2">
            <div
              role="group"
              aria-label="Filter by category"
              className="no-scrollbar flex min-w-0 flex-1 gap-1 overflow-x-auto py-0.5"
            >
              {chips.map((chip) => {
                const active = chip.key === filter
                return (
                  <button
                    key={chip.key}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setFilter(chip.key)}
                    className={clsx(
                      'inline-flex min-h-[32px] shrink-0 items-center gap-1 rounded-full border px-2.5 text-xs font-medium whitespace-nowrap transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cloud-blue',
                      active
                        ? 'border-gray-900 bg-gray-900 text-white dark:border-white dark:bg-white dark:text-gray-900'
                        : 'border-gray-200 text-gray-600 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800',
                      chip.key === 'none' && !active && 'italic',
                    )}
                  >
                    {chip.label}
                    <span
                      className={clsx(
                        'text-[10px] tabular-nums',
                        active
                          ? 'text-white/70 dark:text-gray-900/60'
                          : 'text-gray-400 dark:text-gray-500',
                      )}
                    >
                      {chip.count}
                    </span>
                  </button>
                )
              })}
            </div>
            <label className="sr-only" htmlFor="proto-a-sort">
              Sort
            </label>
            <select
              id="proto-a-sort"
              value={sort}
              onChange={(e) => setSort(e.target.value as SortA)}
              className={clsx(SELECT_CLASS, 'shrink-0')}
            >
              <option value="newest">Newest</option>
              <option value="unsure">Unsure first</option>
              <option value="category">By category</option>
            </select>
          </div>
          <div
            role="region"
            aria-label="Conversations"
            className="min-h-0 flex-1 divide-y divide-gray-100 overflow-y-auto pb-[env(safe-area-inset-bottom)] dark:divide-gray-800"
          >
            {visible.map((item) => (
              <ProtoRow
                key={item._id}
                item={item}
                selected={item._id === inbox.selectedId}
                onSelect={() => inbox.select(item._id)}
              />
            ))}
          </div>
        </>
      }
      thread={
        selected ? (
          <ProtoThreadPane
            item={selected}
            // The real header already holds Resolve + Mute + "…"; at 393px a
            // chip beside them squeezed the subject to "Kan jeg by…", so below
            // `lg` the chip drops to its own line under the subject.
            headerControl={
              headerControl && (
                <span className="hidden lg:inline-flex">{headerControl}</span>
              )
            }
            subheader={
              headerControl && (
                <div className="flex shrink-0 items-center gap-2 border-b border-gray-100 py-1.5 lg:hidden dark:border-gray-800">
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    Category
                  </span>
                  {headerControl}
                </div>
              )
            }
          />
        ) : null
      }
    />
  )
}

// ---------------------------------------------------------------------------
// VARIANT B — folders (rail on desktop / select on phone); change via Move to…
// ---------------------------------------------------------------------------

type FolderB = 'all' | 'unsure' | MessageCategory | 'none' | 'sponsors'

function VariantB({
  initialSelected,
  initialStep,
}: {
  initialSelected?: string
  initialStep?: 'list' | 'thread'
}) {
  const inbox = useProtoInbox(initialSelected, initialStep)
  const [folder, setFolder] = useState<FolderB>('all')
  const tally = countByCategory(inbox.items)

  const inFolder = (it: ProtoConversation): boolean => {
    switch (folder) {
      case 'all':
        return true
      case 'sponsors':
        return it.conversationType === 'sponsor'
      case 'unsure':
        return (
          it.conversationType !== 'sponsor' &&
          (it.judgement === null || isUncertain(it.judgement))
        )
      case 'none':
        return it.conversationType !== 'sponsor' && it.judgement === null
      default:
        return it.judgement?.category === folder
    }
  }
  const visible = inbox.items.filter(inFolder)

  const folders: {
    key: FolderB
    label: string
    count: number
    tone?: 'smart' | 'muted'
  }[] = [
    { key: 'all', label: 'All conversations', count: tally.all },
    { key: 'unsure', label: 'Unsure', count: tally.unsure, tone: 'smart' },
    ...CATEGORY_ORDER.map((c) => ({
      key: c as FolderB,
      label: CATEGORY_LABEL[c],
      count: tally.counts[c],
    })),
    { key: 'none', label: 'No category yet', count: tally.none, tone: 'muted' },
    { key: 'sponsors', label: 'Sponsors', count: tally.sponsor, tone: 'muted' },
  ]
  const folderLabel = folders.find((f) => f.key === folder)?.label ?? ''
  // Inside a category folder the folder IS the category, so the row drops the
  // chip and keeps only a provenance mark. "All" and "Unsure" mix categories,
  // so there the chip stays.
  const chipOnRow = folder === 'all' || folder === 'unsure'

  const selected = inbox.selected
  const subheader =
    selected && selected.conversationType !== 'sponsor' ? (
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-gray-100 py-1.5 dark:border-gray-800">
        <span className="flex min-w-0 items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
          <FolderIcon
            className="h-4 w-4 shrink-0 text-gray-400 dark:text-gray-500"
            aria-hidden="true"
          />
          {selected.judgement ? (
            <span className="truncate">
              In{' '}
              <span className="font-semibold text-gray-900 dark:text-white">
                {CATEGORY_LABEL[selected.judgement.category]}
              </span>{' '}
              <span className="text-gray-400 dark:text-gray-500">
                · {provenanceText(selected.judgement)}
              </span>
            </span>
          ) : (
            <span className="truncate text-gray-400 italic dark:text-gray-500">
              Not in a folder yet
            </span>
          )}
        </span>
        <CategoryMenu
          judgement={selected.judgement}
          onChange={(c) => inbox.setCategory(selected._id, c)}
          buttonLabel="Move to folder"
          menuLabel="Move to"
          buttonClassName="shrink-0"
          button={
            <span className="inline-flex min-h-[36px] shrink-0 items-center gap-1 rounded-md px-2 text-xs font-semibold whitespace-nowrap text-brand-cloud-blue hover:bg-brand-cloud-blue/10 dark:text-blue-300 dark:hover:bg-blue-400/10">
              <FolderArrowDownIcon className="h-4 w-4" aria-hidden="true" />
              Move to
              <Caret />
            </span>
          }
        />
      </div>
    ) : null

  return (
    <ProtoWorkspace
      step={inbox.step}
      onBack={inbox.back}
      rail={
        <nav aria-label="Folders" className="flex flex-col gap-0.5 p-2">
          {folders.map((f, i) => {
            const active = f.key === folder
            const divider = f.key === 'talk_details' || f.key === 'none'
            return (
              <div key={f.key}>
                {divider && i > 0 && (
                  <div className="mx-2 my-1.5 h-px bg-gray-100 dark:bg-gray-800" />
                )}
                <button
                  type="button"
                  aria-current={active ? 'true' : undefined}
                  onClick={() => setFolder(f.key)}
                  className={clsx(
                    'flex min-h-[36px] w-full items-center gap-2 rounded-md px-2 text-left text-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cloud-blue',
                    active
                      ? 'bg-brand-cloud-blue/10 font-semibold text-brand-cloud-blue dark:bg-blue-400/10 dark:text-blue-300'
                      : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800',
                    f.tone === 'muted' && !active && 'text-gray-500 italic',
                  )}
                >
                  {f.tone === 'smart' ? (
                    <QuestionMarkCircleIcon
                      className="h-4 w-4 shrink-0 text-gray-400 dark:text-gray-500"
                      aria-hidden="true"
                    />
                  ) : (
                    <FolderIcon
                      className="h-4 w-4 shrink-0 text-gray-400 dark:text-gray-500"
                      aria-hidden="true"
                    />
                  )}
                  <span className="min-w-0 flex-1 truncate">{f.label}</span>
                  {f.count > 0 && (
                    <span className="text-xs text-gray-400 tabular-nums dark:text-gray-500">
                      {f.count}
                    </span>
                  )}
                </button>
              </div>
            )
          })}
        </nav>
      }
      list={
        <>
          <div className="flex shrink-0 items-center gap-2 px-2 pt-1">
            <StaticViewTabs activeCount={inbox.items.length} />
          </div>
          {/* Phone: the folder rail collapses into a select. */}
          <div className="flex shrink-0 items-center gap-2 px-2 lg:hidden">
            <FolderIcon
              className="h-4 w-4 shrink-0 text-gray-400 dark:text-gray-500"
              aria-hidden="true"
            />
            <label htmlFor="proto-b-folder" className="sr-only">
              Folder
            </label>
            <select
              id="proto-b-folder"
              value={folder}
              onChange={(e) => setFolder(e.target.value as FolderB)}
              className={clsx(SELECT_CLASS, 'min-w-0 flex-1 text-sm')}
            >
              {folders.map((f) => (
                <option key={f.key} value={f.key}>
                  {f.label} ({f.count})
                </option>
              ))}
            </select>
          </div>
          {/* Desktop: the folder name heads the list so the rail and list agree. */}
          <p className="hidden shrink-0 px-4 text-xs font-semibold tracking-wide text-gray-500 uppercase lg:block dark:text-gray-400">
            {folderLabel}{' '}
            <span className="font-normal text-gray-400 normal-case dark:text-gray-500">
              · {visible.length}
            </span>
          </p>
          <div
            role="region"
            aria-label="Conversations"
            className="min-h-0 flex-1 divide-y divide-gray-100 overflow-y-auto pb-[env(safe-area-inset-bottom)] dark:divide-gray-800"
          >
            {visible.map((item) => (
              <ProtoRow
                key={item._id}
                item={item}
                selected={item._id === inbox.selectedId}
                onSelect={() => inbox.select(item._id)}
                categoryOnRow={chipOnRow ? 'snippet' : 'none'}
                provenanceMark={
                  chipOnRow ? undefined : <ProvenanceMark item={item} />
                }
              />
            ))}
            {visible.length === 0 && (
              <p className="px-6 py-12 text-center text-sm text-gray-500 dark:text-gray-400">
                Nothing in {folderLabel}
              </p>
            )}
          </div>
        </>
      }
      thread={
        selected ? (
          <ProtoThreadPane item={selected} subheader={subheader} />
        ) : null
      }
    />
  )
}

// ---------------------------------------------------------------------------
// VARIANT C — grouped under collapsible headers; change via Move to… on the row
// ---------------------------------------------------------------------------

type GroupKey = MessageCategory | 'none' | 'sponsors'

function VariantC({
  initialSelected,
  initialStep,
}: {
  initialSelected?: string
  initialStep?: 'list' | 'thread'
}) {
  const inbox = useProtoInbox(initialSelected, initialStep)
  const [collapsed, setCollapsed] = useState<Set<GroupKey>>(() => new Set())
  const toggle = (k: GroupKey) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(k)) next.delete(k)
      else next.add(k)
      return next
    })

  type Group = { key: GroupKey; label: string; items: ProtoConversation[] }
  const groups: Group[] = (
    [
      ...CATEGORY_ORDER.map((c): Group => ({
        key: c,
        label: CATEGORY_LABEL[c],
        items: inbox.items.filter((it) => it.judgement?.category === c),
      })),
      {
        key: 'none',
        label: 'No category yet',
        items: inbox.items.filter(
          (it) => it.conversationType !== 'sponsor' && it.judgement === null,
        ),
      },
      {
        key: 'sponsors',
        label: 'Sponsors',
        items: inbox.items.filter((it) => it.conversationType === 'sponsor'),
      },
    ] satisfies Group[]
  ).filter((g) => g.items.length > 0)

  const allKeys = groups.map((g) => g.key)
  const allCollapsed = allKeys.every((k) => collapsed.has(k))

  const selected = inbox.selected
  return (
    <ProtoWorkspace
      step={inbox.step}
      onBack={inbox.back}
      list={
        <>
          <div className="flex shrink-0 items-center gap-2 px-2 pt-1">
            <StaticViewTabs activeCount={inbox.items.length} />
          </div>
          <div className="flex shrink-0 items-center justify-between gap-2 px-4">
            <span className="text-xs text-gray-500 dark:text-gray-400">
              Grouped by category, newest first
            </span>
            <button
              type="button"
              onClick={() =>
                setCollapsed(allCollapsed ? new Set() : new Set(allKeys))
              }
              className="min-h-[32px] shrink-0 rounded-md px-2 text-xs font-medium text-brand-cloud-blue hover:bg-brand-cloud-blue/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cloud-blue dark:text-blue-300 dark:hover:bg-blue-400/10"
            >
              {allCollapsed ? 'Expand all' : 'Collapse all'}
            </button>
          </div>
          <div
            role="region"
            aria-label="Conversations"
            className="min-h-0 flex-1 overflow-y-auto pb-[env(safe-area-inset-bottom)]"
          >
            {groups.map((g) => {
              const open = !collapsed.has(g.key)
              const unsure = g.items.filter(
                (it) => it.judgement && isUncertain(it.judgement),
              ).length
              const unread = g.items.reduce((n, it) => n + it.unreadCount, 0)
              return (
                <section key={g.key} aria-label={g.label}>
                  <button
                    type="button"
                    aria-expanded={open}
                    onClick={() => toggle(g.key)}
                    className="sticky top-0 z-10 flex min-h-[40px] w-full items-center gap-1.5 border-y border-gray-100 bg-gray-50 px-3 text-left text-xs font-semibold tracking-wide text-gray-600 uppercase transition hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cloud-blue focus-visible:ring-inset dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
                  >
                    {open ? (
                      <ChevronDownIcon
                        className="h-3.5 w-3.5"
                        aria-hidden="true"
                      />
                    ) : (
                      <ChevronRightIcon
                        className="h-3.5 w-3.5"
                        aria-hidden="true"
                      />
                    )}
                    <span
                      className={clsx(
                        'flex-1 truncate',
                        (g.key === 'none' || g.key === 'sponsors') &&
                          'font-medium text-gray-500 normal-case italic dark:text-gray-400',
                      )}
                    >
                      {g.label}
                    </span>
                    {unsure > 0 && (
                      <span className="rounded-full border border-dashed border-gray-400 px-1.5 text-[10px] font-medium text-gray-500 normal-case dark:border-gray-500 dark:text-gray-400">
                        {unsure} unsure
                      </span>
                    )}
                    {unread > 0 && (
                      <span
                        aria-label={`${unread} unread`}
                        className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-cloud-blue px-1 text-[10px] leading-none font-semibold text-white dark:bg-blue-600"
                      >
                        {unread}
                      </span>
                    )}
                    <span className="text-[11px] font-normal text-gray-400 normal-case tabular-nums dark:text-gray-500">
                      {g.items.length}
                    </span>
                  </button>
                  {open && (
                    <div className="divide-y divide-gray-100 dark:divide-gray-800">
                      {g.items.map((item) => (
                        <ProtoRow
                          key={item._id}
                          item={item}
                          selected={item._id === inbox.selectedId}
                          onSelect={() => inbox.select(item._id)}
                          categoryOnRow="none"
                          provenanceMark={<ProvenanceMark item={item} />}
                          trailing={
                            item.conversationType !== 'sponsor' ? (
                              <CategoryMenu
                                judgement={item.judgement}
                                onChange={(c) => inbox.setCategory(item._id, c)}
                                buttonLabel={`Move "${item.subject}" to…`}
                                menuLabel="Move to"
                                buttonClassName="h-9 w-9 justify-center text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:text-gray-500 dark:hover:bg-gray-800 dark:hover:text-gray-300"
                                button={
                                  <FolderArrowDownIcon
                                    className="h-5 w-5"
                                    aria-hidden="true"
                                  />
                                }
                              />
                            ) : null
                          }
                        />
                      ))}
                    </div>
                  )}
                </section>
              )
            })}
          </div>
        </>
      }
      thread={
        selected ? (
          <ProtoThreadPane
            item={selected}
            headerControl={
              selected.conversationType !== 'sponsor' ? (
                <CategoryChip judgement={selected.judgement} size="md" />
              ) : null
            }
          />
        ) : null
      }
    />
  )
}

// ---------------------------------------------------------------------------
// Stories
// ---------------------------------------------------------------------------

type Args = {
  variant: 'A' | 'B' | 'C'
  initialSelected?: string
  initialStep?: 'list' | 'thread'
}

function Prototype({ variant, ...rest }: Args) {
  if (variant === 'A') return <VariantA {...rest} />
  if (variant === 'B') return <VariantB {...rest} />
  return <VariantC {...rest} />
}

const meta = {
  title: 'Prototypes/Content Judgement/Inbox Message Category',
  component: Prototype,
  beforeEach: mockDateBeforeEach(new Date('2026-07-18T12:00:00Z')),
  parameters: { layout: 'fullscreen' },
  decorators: [
    // The admin shell's content box, copied from MessagesWorkspace.stories so
    // the capture gives the panes the width the real page does.
    (Story, ctx) => (
      <PortalDark dark={!!ctx.parameters.dark}>
        <div className={ctx.parameters.dark ? 'dark' : ''}>
          <div
            data-shell-fit="viewport"
            className="flex h-dvh flex-col overflow-hidden bg-white dark:bg-gray-950"
          >
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden py-3 lg:py-4 lg:pl-20">
              <div className="flex min-h-0 flex-1 flex-col px-2 sm:px-4 lg:px-8">
                <Story />
              </div>
            </div>
          </div>
        </div>
      </PortalDark>
    ),
  ],
} satisfies Meta<typeof Prototype>

export default meta
type Story = StoryObj<typeof meta>

/** Opens the category picker so the capture shows the change affordance. */
const openMenu =
  (name: RegExp): Story['play'] =>
  async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const buttons = await canvas.findAllByRole('button', { name })
    await userEvent.click(buttons[0])
    await waitFor(() => expect(screen.getByRole('menu')).toBeInTheDocument())
  }

// --- A -------------------------------------------------------------------

export const A: Story = {
  name: 'A · Chip on row + filter bar',
  args: { variant: 'A', initialSelected: UNCERTAIN_ID, initialStep: 'list' },
}
export const ADark: Story = {
  name: 'A · Chip on row + filter bar (dark)',
  args: A.args,
  parameters: { dark: true },
}
export const AThreadMenu: Story = {
  name: 'A · Change from the thread header (menu open)',
  args: { variant: 'A', initialSelected: UNCERTAIN_ID, initialStep: 'thread' },
  play: openMenu(/change category/i),
}
export const AThreadMenuDark: Story = {
  name: 'A · Change from the thread header (menu open, dark)',
  args: AThreadMenu.args,
  parameters: { dark: true },
  play: openMenu(/change category/i),
}

// --- B -------------------------------------------------------------------

export const B: Story = {
  name: 'B · Folders rail (desktop) / select (phone)',
  args: { variant: 'B', initialSelected: UNCERTAIN_ID, initialStep: 'list' },
}
export const BDark: Story = {
  name: 'B · Folders rail / select (dark)',
  args: B.args,
  parameters: { dark: true },
}
export const BThreadMenu: Story = {
  name: 'B · Move to… from the thread header (menu open)',
  args: { variant: 'B', initialSelected: UNCERTAIN_ID, initialStep: 'thread' },
  play: openMenu(/move to folder/i),
}
export const BThreadMenuDark: Story = {
  name: 'B · Move to… from the thread header (menu open, dark)',
  args: BThreadMenu.args,
  parameters: { dark: true },
  play: openMenu(/move to folder/i),
}

// --- C -------------------------------------------------------------------

export const C: Story = {
  name: 'C · Grouped under category headers',
  args: { variant: 'C', initialSelected: UNCERTAIN_ID, initialStep: 'list' },
}
export const CDark: Story = {
  name: 'C · Grouped under category headers (dark)',
  args: C.args,
  parameters: { dark: true },
}
export const CRowMenu: Story = {
  name: 'C · Move to… on the row (menu open)',
  args: { variant: 'C', initialSelected: UNCERTAIN_ID, initialStep: 'list' },
  play: openMenu(/move "kan jeg bytte slot/i),
}
export const CRowMenuDark: Story = {
  name: 'C · Move to… on the row (menu open, dark)',
  args: CRowMenu.args,
  parameters: { dark: true },
  play: openMenu(/move "kan jeg bytte slot/i),
}
